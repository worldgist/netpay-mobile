import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Headphones, Loader2, MessageSquare, Send, ShieldCheck, Wifi } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import { supabase } from "@/integrations/supabase/client";
import { ensureProfileExists } from "@/utils/profile";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type SupportMessage = Database["public"]["Tables"]["support_messages"]["Row"];
type BusinessHour = { day: string; time: string };

const SUBJECT_PRESETS = [
  {
    subject: "General enquiry",
    description: "Ask a quick question or get guided support",
  },
  {
    subject: "Wallet & transactions",
    description: "Issues with funding, transfers or bill payments",
  },
  {
    subject: "Technical support",
    description: "Report bugs, downtime or feature requests",
  },
] as const;

const DEFAULT_BUSINESS_HOURS: BusinessHour[] = [
  { day: "Monday - Friday", time: "9:00 AM - 6:00 PM" },
  { day: "Saturday", time: "10:00 AM - 4:00 PM" },
  { day: "Sunday", time: "Closed" },
];

const sortMessages = (items: SupportMessage[]) =>
  [...items].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

const formatTimestamp = (iso: string | null | undefined) => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-NG", {
      hour: "2-digit",
      minute: "2-digit",
      day: "numeric",
      month: "short",
    });
  } catch {
    return iso;
  }
};

const extractSupportReplies = (
  metadata: SupportMessage["metadata"],
  fallbackDate: string
) => {
  const replies: {
    id: string;
    sender: string;
    content: string;
    timestamp: string;
  }[] = [];

  if (!metadata) return replies;
  const meta = metadata as any;

  const pushReply = (reply: any, index: number) => {
    if (!reply) return;
    const content =
      reply.message ??
      reply.content ??
      reply.note ??
      reply.body ??
      reply.response ??
      "";
    if (!content) return;

    const timestamp =
      reply.created_at ?? reply.timestamp ?? reply.date ?? fallbackDate;

    replies.push({
      id: `${fallbackDate}-${index}`,
      sender: reply.sender ?? reply.agent ?? "Support",
      content,
      timestamp,
    });
  };

  if (Array.isArray(meta.replies)) {
    meta.replies.forEach((reply: any, index: number) =>
      pushReply(reply, index)
    );
  }

  if (meta.last_reply) {
    pushReply(meta.last_reply, (meta.replies?.length ?? 0) + 1);
  }

  if (typeof meta.response === "string") {
    replies.push({
      id: `${fallbackDate}-response`,
      sender: "Support",
      content: meta.response,
      timestamp: fallbackDate,
    });
  }

  if (typeof meta.support_note === "string") {
    replies.push({
      id: `${fallbackDate}-note`,
      sender: "Support",
      content: meta.support_note,
      timestamp: fallbackDate,
    });
  }

  return replies;
};

export default function SupportChat() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string>(
    SUBJECT_PRESETS[0].subject
  );
  const [inputMessage, setInputMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("NetPay User");
  const [userEmail, setUserEmail] = useState<string>("");
  const [supportEmail, setSupportEmail] = useState("support@netpayy.ng");
  const [supportPhone, setSupportPhone] = useState("07067398399");
  const [supportPhoneDisplay, setSupportPhoneDisplay] = useState("+234 706 739 8399");
  const [businessHours, setBusinessHours] = useState<BusinessHour[]>(
    DEFAULT_BUSINESS_HOURS
  );

  const loadMessages = useCallback(async (uid: string) => {
    const { data, error } = await supabase
      .from("support_messages")
      .select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: true });

    if (error) {
      throw error;
    }

    setMessages(sortMessages(data ?? []));
  }, []);

  const bootstrap = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        navigate("/user/auth?mode=signin");
        return;
      }

      setUserId(session.user.id);
      setUserEmail(session.user.email ?? "");

      const profile = await ensureProfileExists(session.user);
      const fallbackName = session.user.email?.split("@")[0] ?? "NetPay User";
      setDisplayName(profile?.full_name || fallbackName);

      await Promise.all([
        loadMessages(session.user.id),
        (async () => {
          try {
            const { data: settingsRow, error: settingsError } = await supabase
              .from("contact_settings")
              .select(
                "support_email, support_phone, support_phone_display, address_line, city, state, country, business_hours"
              )
              .eq("is_active", true)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            const recoverableCodes = new Set([
              "PGRST116",
              "PGRST205",
              "42P01",
            ]);
            if (settingsError && !recoverableCodes.has(settingsError.code ?? "")) {
              throw settingsError;
            }

            if (settingsRow) {
              if (settingsRow.support_email)
                setSupportEmail(settingsRow.support_email);
              if (settingsRow.support_phone)
                setSupportPhone(settingsRow.support_phone);
              if (settingsRow.support_phone_display)
                setSupportPhoneDisplay(settingsRow.support_phone_display);

              if (
                Array.isArray(settingsRow.business_hours) &&
                settingsRow.business_hours.length > 0
              ) {
                const parsed = settingsRow.business_hours
                  .map((entry: any) => ({
                    day: typeof entry.day === "string" ? entry.day : "",
                    time: typeof entry.time === "string" ? entry.time : "",
                  }))
                  .filter((entry) => entry.day && entry.time);

                if (parsed.length > 0) {
                  setBusinessHours(parsed);
                }
              }
            }
          } catch (settingsError) {
            console.warn("contact_settings unavailable:", settingsError);
          }
        })(),
      ]);
    } catch (error) {
      console.error("Failed to load support chat:", error);
      toast.error(
        "We couldn't load your support conversations. Please try again shortly."
      );
    } finally {
      setLoading(false);
    }
  }, [loadMessages, navigate]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`support_messages_${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "support_messages",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const newRecord = payload.new as SupportMessage | null;
          const oldRecord = payload.old as SupportMessage | null;

          setMessages((prev) => {
            switch (payload.eventType) {
              case "INSERT":
                if (!newRecord) return prev;
                if (prev.some((msg) => msg.id === newRecord.id)) {
                  return prev;
                }
                return sortMessages([...prev, newRecord]);
              case "UPDATE":
                if (!newRecord) return prev;
                return sortMessages(
                  prev.map((msg) => (msg.id === newRecord.id ? newRecord : msg))
                );
              case "DELETE":
                if (!oldRecord) return prev;
                return prev.filter((msg) => msg.id !== oldRecord.id);
              default:
                return prev;
            }
          });
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          console.warn("Realtime subscription error for support messages");
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const groupedConversations = useMemo(() => {
    const map = new Map<
      string,
      {
        subject: string;
        status: string;
        messages: SupportMessage[];
        lastUpdated: number;
      }
    >();

    messages.forEach((msg) => {
      const subject = msg.subject || SUBJECT_PRESETS[0].subject;
      const existing =
        map.get(subject) ??
        ({
          subject,
          status: msg.status ?? "open",
          messages: [],
          lastUpdated: 0,
        } as {
          subject: string;
          status: string;
          messages: SupportMessage[];
          lastUpdated: number;
        });

      existing.messages.push(msg);
      const timestamp = new Date(msg.updated_at ?? msg.created_at).getTime();
      if (timestamp > existing.lastUpdated) {
        existing.lastUpdated = timestamp;
        existing.status = msg.status ?? existing.status;
      }

      map.set(subject, existing);
    });

    return Array.from(map.values()).sort(
      (a, b) => b.lastUpdated - a.lastUpdated
    );
  }, [messages]);

  const conversationCards = useMemo(() => {
    const presetSubjects = new Set(SUBJECT_PRESETS.map((preset) => preset.subject));
    const presetCards = SUBJECT_PRESETS.map((preset) => {
      const conversation = groupedConversations.find(
        (conv) => conv.subject === preset.subject
      );
      return {
        subject: preset.subject,
        description: preset.description,
        status: conversation?.status ?? "open",
        hasConversation: Boolean(conversation),
      };
    });

    const extraCards = groupedConversations
      .filter((conv) => !presetSubjects.has(conv.subject))
      .map((conv) => ({
        subject: conv.subject,
        description: `${conv.messages.length} message${
          conv.messages.length === 1 ? "" : "s"
        }`,
        status: conv.status ?? "open",
        hasConversation: true,
      }));

    return [...presetCards, ...extraCards];
  }, [groupedConversations]);

  const selectedConversation = useMemo(() => {
    return (
      groupedConversations.find(
        (conv) => conv.subject === selectedSubject
      ) ?? {
        subject: selectedSubject,
        status: "open",
        messages: [] as SupportMessage[],
        lastUpdated: Date.now(),
      }
    );
  }, [groupedConversations, selectedSubject]);

  const timelineMessages = useMemo(() => {
    const timeline: Array<{
      id: string;
      sender: "You" | "Support";
      content: string;
      timestamp: string;
    }> = [];

    selectedConversation.messages.forEach((msg) => {
      if (msg.message) {
        timeline.push({
          id: `${msg.id}-user`,
          sender: "You",
          content: msg.message,
          timestamp: msg.created_at,
        });
      }

      const replies = extractSupportReplies(
        msg.metadata,
        msg.updated_at ?? msg.created_at
      );

      replies.forEach((reply, index) => {
        timeline.push({
          id: `${msg.id}-reply-${index}`,
          sender: "Support",
          content: reply.content,
          timestamp: reply.timestamp,
        });
      });
    });

    return timeline.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }, [selectedConversation]);

  const handleSendMessage = async () => {
    const trimmed = inputMessage.trim();
    if (!trimmed) return;

    if (!userId) {
      toast.error("Please sign in again to send a message.");
      navigate("/user/auth?mode=signin");
      return;
    }

    setSending(true);
    const subject = selectedSubject || SUBJECT_PRESETS[0].subject;

    try {
      const { data, error } = await supabase
        .from("support_messages")
        .insert({
          user_id: userId,
          name: displayName,
          email: userEmail || supportEmail,
          subject,
          message: trimmed,
          channel: "web_chat",
        })
        .select("*")
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (data) {
        setMessages((prev) => sortMessages([...prev, data]));
      }

      const { error: notifyError } = await supabase.functions.invoke(
        "send-support-email",
        {
          body: {
            name: displayName,
            email: userEmail || supportEmail,
            subject,
            message: trimmed,
          },
        }
      );

      if (notifyError) {
        console.error("send-support-email failed:", notifyError);
        toast.warning(
          "Message received. We couldn't notify support automatically but we'll review it shortly."
        );
      } else {
        toast.success("Message sent! Our support team will follow up shortly.");
      }

      setInputMessage("");
      setSelectedSubject(subject);
    } catch (error: any) {
      console.error("Failed to send support message:", error);
      toast.error(
        error?.message ?? "Unable to send your message. Please try again."
      );
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4 pb-24">
        <Loader2 className="h-10 w-10 animate-spin text-brand" />
        <p className="text-sm text-muted-foreground">
          Loading your support conversations...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <header className="bg-white border-b">
        <div className="px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/user/profile")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Support Chat</h1>
            <p className="text-sm text-muted-foreground">
              Chat with our team or raise a support ticket
            </p>
          </div>
        </div>
      </header>

      <div className="p-4 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Start a quick chat</CardTitle>
            <CardDescription>
              Our support specialists reply within minutes between 9:00 AM – 9:00 PM.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid md:grid-cols-[240px,1fr] gap-6">
            <div className="space-y-3">
              {conversationCards.map((card) => {
                const isSelected = selectedSubject === card.subject;
                const statusLabel =
                  card.status === "resolved" ? "Resolved" : "Open";
                return (
                  <button
                    key={card.subject}
                    onClick={() => setSelectedSubject(card.subject)}
                    className={`w-full text-left rounded-lg border p-4 transition-colors ${
                      isSelected
                        ? "border-brand bg-brand/10 text-brand"
                        : "border-gray-200 hover:border-brand/40 hover:bg-brand/5"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold truncate">{card.subject}</div>
                      {card.hasConversation && (
                        <span
                          className={`text-xs font-medium ${
                            card.status === "resolved"
                              ? "text-green-600"
                              : "text-orange-500"
                          }`}
                        >
                          {statusLabel}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-2">
                      {card.description}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="bg-white border rounded-xl p-4 flex flex-col gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-brand" />
                  <h2 className="font-semibold text-lg">{selectedConversation.subject}</h2>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Status:{" "}
                  <span
                    className={
                      selectedConversation.status === "resolved"
                        ? "text-green-600 font-medium"
                        : "text-orange-500 font-medium"
                    }
                  >
                    {selectedConversation.status === "resolved"
                      ? "Resolved"
                      : "Open"}
                  </span>
                </p>
              </div>

              <div className="flex-1 space-y-3 max-h-[320px] overflow-y-auto pr-1">
                {timelineMessages.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground bg-muted/40 rounded-lg p-6">
                    No messages yet. Describe your issue and our team will respond shortly.
                  </div>
                ) : (
                  timelineMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`max-w-[82%] rounded-2xl p-3 text-sm ${
                        msg.sender === "You"
                          ? "bg-brand text-white ml-auto"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      <div className="font-medium text-xs opacity-80 mb-1">
                        {msg.sender}
                      </div>
                      <p>{msg.content}</p>
                      <div className="text-[10px] opacity-70 mt-2 text-right">
                        {formatTimestamp(msg.timestamp)}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="flex flex-col gap-3"
              >
                <Textarea
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder="Type your message..."
                  className="min-h-[90px]"
                />
                <div className="flex items-center gap-3">
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={!inputMessage.trim() || sending}
                  >
                    {sending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-2" />
                        Send message
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-brand text-brand hover:bg-brand/10"
                    onClick={() => navigate("/user/contact")}
                  >
                    <Headphones className="w-4 h-4 mr-1" />
                    Contact form
                  </Button>
                </div>
              </form>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Support availability</CardTitle>
            <CardDescription>Choose the best channel at any time.</CardDescription>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-4">
            <div className="border rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-brand font-semibold">
                <ShieldCheck className="w-5 h-5" />
                Dedicated support
              </div>
              <p className="text-sm text-muted-foreground">
                Our agents are live every day from 9:00 AM – 9:00 PM (WAT). After-hours requests are
                resolved first thing the next business day.
              </p>
              <div className="text-sm space-y-1">
                <p>
                  Email:{" "}
                  <button
                    type="button"
                    className="font-medium underline-offset-2 hover:underline"
                    onClick={() => navigator.clipboard.writeText(supportEmail)}
                  >
                    {supportEmail}
                  </button>
                </p>
                <p>
                  Phone:{" "}
                  <button
                    type="button"
                    className="font-medium underline-offset-2 hover:underline"
                    onClick={() => navigator.clipboard.writeText(supportPhone)}
                  >
                    {supportPhoneDisplay}
                  </button>
                </p>
              </div>
            </div>
            <div className="border rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-brand font-semibold">
                <Wifi className="w-5 h-5" />
                Need instant help?
              </div>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>Use this chat to raise tickets and follow up in real time.</li>
                <li>Check our FAQ for quick fixes on airtime, data, electricity and education purchases.</li>
                <li>Escalations are monitored by supervisors 24/7.</li>
              </ul>
              <div className="pt-2 border-t text-sm space-y-1">
                <p className="font-semibold text-brand">Business hours</p>
                {businessHours.map((entry, index) => (
                  <div key={`${entry.day}-${index}`} className="flex justify-between text-muted-foreground">
                    <span>{entry.day}</span>
                    <span className="font-medium text-foreground">{entry.time}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <BottomNav />
    </div>
  );
}

