import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { FileText, Headset, Loader2, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatSupportLastSeen,
  isTypingActive,
  rpcSupportEndChat,
  rpcSupportPresencePing,
  type SupportConversationPresence,
} from "@/lib/support-presence";
import { listSupportConversationsForAdmin, type SupportConversationWithProfile } from "@/lib/support-conversations";

type ConvRow = SupportConversationWithProfile;

const SUPPORT_CHAT_BUCKET = "support-chat";

const MSG_SELECT = "id, sender_id, body, created_at, kind, attachment_path, attachment_mime, attachment_name" as const;

type MsgRow = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
  kind?: string | null;
  attachment_path?: string | null;
  attachment_mime?: string | null;
  attachment_name?: string | null;
};

function isSupportImageMessage(m: {
  kind?: string | null;
  attachment_path?: string | null;
  attachment_mime?: string | null;
  attachment_name?: string | null;
}): boolean {
  if (!m.attachment_path) return false;
  const k = (m.kind || "").trim().toLowerCase();
  if (k === "image") return true;
  if ((m.attachment_mime || "").toLowerCase().startsWith("image/")) return true;
  const label = `${m.attachment_name || ""} ${m.attachment_path}`.toLowerCase();
  if (/\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)(\?|$)/i.test(label)) return true;
  return false;
}

function profileLabel(p: ConvRow["profiles"]): string {
  if (!p) return "Customer";
  const one = Array.isArray(p) ? p[0] : p;
  return one?.full_name?.trim() || one?.email || "Customer";
}

async function isStaffAdmin(userId: string): Promise<boolean> {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (error || !data) return false;
  return true;
}

export default function SupportAdmin() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [booting, setBooting] = useState(true);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [rows, setRows] = useState<ConvRow[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MsgRow[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [convChatMeta, setConvChatMeta] = useState<SupportConversationPresence | null>(null);
  const [tick, setTick] = useState(0);
  const [signedImageUrls, setSignedImageUrls] = useState<Record<string, string>>({});
  const [hydratingImages, setHydratingImages] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const typingDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedConvRef = useRef<string | null>(null);
  const imageBlobUrlsRef = useRef<Record<string, string>>({});

  const clearChannel = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, []);

  const loadConversations = useCallback(async () => {
    setLoadingList(true);
    try {
      const merged = await listSupportConversationsForAdmin(supabase, filter);
      setRows(merged);
    } catch (e) {
      console.error(e);
      const msg = e && typeof e === "object" && "message" in e ? String((e as Error).message) : "Unknown error";
      toast({ title: "Could not load threads", description: msg, variant: "destructive" });
      setRows([]);
    } finally {
      setLoadingList(false);
    }
  }, [filter, toast]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
        return;
      }
      const ok = await isStaffAdmin(session.user.id);
      if (cancelled) return;
      if (!ok) {
        setBooting(false);
        toast({ title: "Staff only", description: "Admin role required.", variant: "destructive" });
        navigate("/dashboard");
        return;
      }
      setMyUserId(session.user.id);
      setBooting(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate, toast]);

  useEffect(() => {
    if (booting) return;
    loadConversations();
  }, [booting, loadConversations]);

  useEffect(() => {
    if (selectedId && !rows.some((r) => r.id === selectedId)) setSelectedId(null);
  }, [rows, selectedId]);

  useEffect(() => {
    selectedConvRef.current = selectedId;
  }, [selectedId]);

  function revokeImageBlobs() {
    for (const u of Object.values(imageBlobUrlsRef.current)) {
      URL.revokeObjectURL(u);
    }
    imageBlobUrlsRef.current = {};
  }

  useEffect(() => {
    let cancelled = false;

    revokeImageBlobs();
    setSignedImageUrls({});

    const cleanup = () => {
      cancelled = true;
      revokeImageBlobs();
      setSignedImageUrls({});
      setHydratingImages(false);
    };

    if (messages.length === 0) {
      setHydratingImages(false);
      return cleanup;
    }

    setHydratingImages(true);

    const run = async () => {
      const next: Record<string, string> = {};
      const blobs: Record<string, string> = {};
      const revokeLocalBlobs = () => {
        for (const u of Object.values(blobs)) {
          URL.revokeObjectURL(u);
        }
      };

      try {
        for (const m of messages) {
          if (!isSupportImageMessage(m) || !m.attachment_path) continue;

          const { data: signData, error: signErr } = await supabase.storage
            .from(SUPPORT_CHAT_BUCKET)
            .createSignedUrl(m.attachment_path, 3600);
          if (cancelled) {
            revokeLocalBlobs();
            return;
          }

          if (!signErr && signData?.signedUrl) {
            next[m.id] = signData.signedUrl;
            continue;
          }

          const { data: blob, error: dlErr } = await supabase.storage.from(SUPPORT_CHAT_BUCKET).download(m.attachment_path);
          if (cancelled) {
            revokeLocalBlobs();
            return;
          }

          if (!dlErr && blob) {
            const url = URL.createObjectURL(blob);
            blobs[m.id] = url;
            next[m.id] = url;
            continue;
          }

          console.warn("[SupportAdmin] could not load image for message", m.id, signErr?.message || dlErr?.message);
        }

        if (cancelled) {
          revokeLocalBlobs();
          return;
        }

        imageBlobUrlsRef.current = blobs;
        setSignedImageUrls(next);
      } finally {
        if (!cancelled) {
          setHydratingImages(false);
        }
      }
    };

    void run().catch((e) => {
      console.error("[SupportAdmin] image hydration failed", e);
      if (!cancelled) {
        setHydratingImages(false);
      }
    });

    return cleanup;
  }, [messages]);

  const openAttachment = useCallback(
    async (m: MsgRow) => {
      if (!m.attachment_path) return;

      const { data: signData, error: signErr } = await supabase.storage
        .from(SUPPORT_CHAT_BUCKET)
        .createSignedUrl(m.attachment_path, 3600);
      if (!signErr && signData?.signedUrl) {
        window.open(signData.signedUrl, "_blank", "noopener,noreferrer");
        return;
      }

      const { data: blob, error: dlErr } = await supabase.storage.from(SUPPORT_CHAT_BUCKET).download(m.attachment_path);
      if (dlErr || !blob) {
        toast({
          title: "Could not open attachment",
          description: signErr?.message || dlErr?.message || "Try again.",
          variant: "destructive",
        });
        return;
      }
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
    [toast],
  );

  const loadMessages = useCallback(async (cid: string) => {
    const { data, error } = await supabase
      .from("support_messages")
      .select(MSG_SELECT)
      .eq("conversation_id", cid)
      .order("created_at", { ascending: true });
    if (error) throw error;
    setMessages((data as MsgRow[]) || []);
  }, []);

  const loadConvChatMeta = useCallback(async (cid: string) => {
    const { data, error } = await supabase
      .from("support_conversations")
      .select("status, last_seen_customer_at, last_seen_staff_at, typing_customer_until, typing_staff_until")
      .eq("id", cid)
      .single();
    if (error) throw error;
    setConvChatMeta(data as SupportConversationPresence);
  }, []);

  const subscribe = useCallback(
    (cid: string) => {
      clearChannel();
      const ch = supabase
        .channel(`support-admin-web:${cid}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "support_messages",
            filter: `conversation_id=eq.${cid}`,
          },
          (payload) => {
            const row = payload.new as MsgRow;
            if (!row?.id) return;
            setMessages((prev) => {
              if (prev.some((m) => m.id === row.id)) return prev;
              return [...prev, row];
            });
          },
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "support_conversations",
            filter: `id=eq.${cid}`,
          },
          (payload) => {
            const n = payload.new as Partial<SupportConversationPresence>;
            setConvChatMeta((prev) => {
              if (!prev) {
                return {
                  status: n.status ?? "open",
                  last_seen_customer_at: n.last_seen_customer_at ?? null,
                  last_seen_staff_at: n.last_seen_staff_at ?? null,
                  typing_customer_until: n.typing_customer_until ?? null,
                  typing_staff_until: n.typing_staff_until ?? null,
                };
              }
              return {
                status: n.status ?? prev.status,
                last_seen_customer_at: n.last_seen_customer_at ?? prev.last_seen_customer_at,
                last_seen_staff_at: n.last_seen_staff_at ?? prev.last_seen_staff_at,
                typing_customer_until: n.typing_customer_until ?? prev.typing_customer_until,
                typing_staff_until: n.typing_staff_until ?? prev.typing_staff_until,
              };
            });
          },
        )
        .subscribe();
      channelRef.current = ch;
    },
    [clearChannel],
  );

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!selectedId || convChatMeta?.status !== "open") return;
    const id = setInterval(() => {
      const cid = selectedConvRef.current;
      if (!cid) return;
      void rpcSupportPresencePing(supabase, cid, false).catch(() => {});
    }, 25000);
    return () => clearInterval(id);
  }, [selectedId, convChatMeta?.status]);

  useEffect(() => {
    if (!selectedId || !myUserId) {
      clearChannel();
      setMessages([]);
      setConvChatMeta(null);
      if (typingDebounceRef.current) {
        clearTimeout(typingDebounceRef.current);
        typingDebounceRef.current = null;
      }
      return;
    }

    let cancelled = false;
    setMessages([]);
    (async () => {
      try {
        await loadConvChatMeta(selectedId);
        await loadMessages(selectedId);
        if (!cancelled) subscribe(selectedId);
        try {
          await rpcSupportPresencePing(supabase, selectedId, false);
        } catch {
          /* optional until migration */
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          const msg = e && typeof e === "object" && "message" in e ? String((e as Error).message) : "Unknown error";
          toast({ title: "Could not load messages", description: msg, variant: "destructive" });
        }
      }
    })();

    return () => {
      cancelled = true;
      clearChannel();
      if (typingDebounceRef.current) {
        clearTimeout(typingDebounceRef.current);
        typingDebounceRef.current = null;
      }
    };
  }, [selectedId, myUserId, loadMessages, subscribe, clearChannel, toast, loadConvChatMeta]);

  const handleEndChat = async () => {
    if (!selectedId) return;
    if (!window.confirm("End this chat for everyone? The thread will close and no new messages can be sent.")) return;
    try {
      await rpcSupportEndChat(supabase, selectedId);
      setConvChatMeta((m) =>
        m
          ? {
              ...m,
              status: "closed",
              typing_customer_until: null,
              typing_staff_until: null,
            }
          : m,
      );
      await loadConversations();
    } catch (e: unknown) {
      toast({
        title: "Could not end chat",
        description: e instanceof Error ? e.message : "Try again.",
        variant: "destructive",
      });
    }
  };

  const onInputChange = (v: string) => {
    setInput(v);
    const cid = selectedId;
    if (!cid || convChatMeta?.status !== "open") return;
    if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
    typingDebounceRef.current = setTimeout(() => {
      void rpcSupportPresencePing(supabase, cid, v.trim().length > 0).catch(() => {});
    }, 350);
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !selectedId || !myUserId) return;
    if (convChatMeta?.status !== "open") {
      toast({ title: "Chat ended", description: "This thread is closed.", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase
        .from("support_messages")
        .insert({
          conversation_id: selectedId,
          sender_id: myUserId,
          body: text,
          kind: "text",
        })
        .select(MSG_SELECT)
        .single();
      if (error) throw error;
      if (data) setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data as MsgRow]));
      setInput("");
      if (typingDebounceRef.current) {
        clearTimeout(typingDebounceRef.current);
        typingDebounceRef.current = null;
      }
      await rpcSupportPresencePing(supabase, selectedId, false).catch(() => {});
    } catch (e: unknown) {
      toast({
        title: "Send failed",
        description: e instanceof Error ? e.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const selectedRow = rows.find((r) => r.id === selectedId);
  const peerHint = selectedRow ? profileLabel(selectedRow.profiles) : null;
  void tick;
  const customerTyping = convChatMeta?.status === "open" && isTypingActive(convChatMeta?.typing_customer_until);

  if (booting) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 flex flex-col overflow-hidden">
          <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur px-4 py-3 md:px-6">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <Headset className="h-6 w-6 text-primary shrink-0" />
              <div>
                <h1 className="text-xl font-bold tracking-tight">Support center</h1>
                <p className="text-sm text-muted-foreground">Customer live chat · staff</p>
              </div>
            </div>
          </header>

          <div className="flex-1 flex flex-col md:flex-row min-h-0 p-4 gap-4">
            <Card className="w-full md:w-[380px] shrink-0 flex flex-col min-h-[280px] md:min-h-0 md:max-h-[calc(100vh-8rem)]">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Threads</CardTitle>
                <CardDescription>Open customer conversations</CardDescription>
                <div className="flex gap-2 pt-2">
                  <Button size="sm" variant={filter === "open" ? "default" : "outline"} onClick={() => setFilter("open")}>
                    Open
                  </Button>
                  <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>
                    All
                  </Button>
                  <Button size="sm" variant="ghost" className="ml-auto" onClick={() => loadConversations()} disabled={loadingList}>
                    Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0 flex-1 min-h-0">
                <ScrollArea className="h-[320px] md:h-[calc(100vh-14rem)]">
                  {loadingList ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : rows.length === 0 ? (
                    <p className="text-sm text-muted-foreground px-4 py-6 text-center">No threads yet.</p>
                  ) : (
                    <ul className="px-2 pb-2">
                      {rows.map((r) => (
                        <li key={r.id}>
                          <button
                            type="button"
                            onClick={() => setSelectedId(r.id)}
                            className={cn(
                              "w-full text-left rounded-lg px-3 py-2.5 mb-1 transition-colors border border-transparent",
                              selectedId === r.id ? "bg-primary/10 border-primary/30" : "hover:bg-muted/80",
                            )}
                          >
                            <div className="font-medium text-sm truncate">{profileLabel(r.profiles)}</div>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant={r.status === "open" ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
                                {r.status}
                              </Badge>
                              <span className="text-[11px] text-muted-foreground truncate">{r.subject}</span>
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>

            <Card className="flex-1 flex flex-col min-h-[360px] md:min-h-0">
              <CardHeader className="border-b py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="text-base">{peerHint || "Select a thread"}</CardTitle>
                    <CardDescription>
                      {selectedId && convChatMeta
                        ? `${formatSupportLastSeen(convChatMeta.last_seen_customer_at)} · ${convChatMeta.status === "open" ? "Open" : "Closed"}`
                        : "Messages sync in real time"}
                    </CardDescription>
                  </div>
                  {selectedId && convChatMeta?.status === "open" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="shrink-0 text-destructive border-destructive/40 hover:bg-destructive/10"
                      onClick={() => void handleEndChat()}>
                      End chat
                    </Button>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col gap-3 p-3 min-h-0">
                {convChatMeta?.status === "closed" ? (
                  <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                    This conversation has ended. You can still read the history.
                  </div>
                ) : null}
                {customerTyping ? <p className="text-sm italic text-muted-foreground">Customer is typing…</p> : null}
                <ScrollArea className="flex-1 min-h-[200px] rounded-md border bg-muted/20 p-3">
                  {!selectedId ? (
                    <p className="text-sm text-muted-foreground text-center py-8">Choose a conversation on the left.</p>
                  ) : messages.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No messages yet — say hello.</p>
                  ) : (
                    <ul className="space-y-3">
                      {messages.map((m) => {
                        const mine = m.sender_id === myUserId;
                        const showImage = isSupportImageMessage(m);
                        const showFile = !showImage && !!m.attachment_path;
                        const imgUrl = showImage ? signedImageUrls[m.id] : undefined;
                        return (
                          <li key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                            <div
                              className={cn(
                                "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                                mine ? "bg-primary text-primary-foreground" : "bg-background border shadow-sm",
                              )}
                            >
                              {showImage ? (
                                <div className="space-y-2">
                                  {imgUrl ? (
                                    <a
                                      href={imgUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className={cn("block", mine ? "ring-1 ring-primary-foreground/30 rounded-lg" : "")}>
                                      <img
                                        src={imgUrl}
                                        alt={m.attachment_name || "Attached image"}
                                        className="max-h-64 w-full max-w-sm rounded-lg border border-black/10 object-contain bg-muted/30"
                                      />
                                    </a>
                                  ) : hydratingImages ? (
                                    <div className="flex h-32 items-center justify-center rounded-lg border border-dashed bg-muted/40">
                                      <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
                                    </div>
                                  ) : (
                                    <div className="rounded-lg border border-dashed bg-muted/40 px-3 py-6 text-center text-xs text-muted-foreground">
                                      Image could not be loaded. Check storage access for admins.
                                    </div>
                                  )}
                                </div>
                              ) : null}
                              {showFile ? (
                                <Button
                                  type="button"
                                  variant={mine ? "secondary" : "outline"}
                                  size="sm"
                                  className="mb-1 h-auto gap-2 py-2"
                                  onClick={() => void openAttachment(m)}>
                                  <FileText className="h-4 w-4 shrink-0" />
                                  <span className="truncate text-left">{m.attachment_name || "Attachment"}</span>
                                </Button>
                              ) : null}
                              {!showImage && !showFile ? (
                                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                              ) : m.body?.trim() ? (
                                <p
                                  className={cn(
                                    "whitespace-pre-wrap break-words",
                                    showImage || showFile ? "mt-2 text-[13px] opacity-95" : "",
                                  )}>
                                  {m.body}
                                </p>
                              ) : null}
                              <p className={cn("text-[10px] mt-1 opacity-80", mine ? "text-primary-foreground/80" : "text-muted-foreground")}>
                                {new Date(m.created_at).toLocaleString()}
                              </p>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </ScrollArea>
                <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                  <Textarea
                    placeholder={selectedId ? "Type a reply…" : "Select a thread first"}
                    value={input}
                    onChange={(e) => onInputChange(e.target.value)}
                    disabled={!selectedId || sending || convChatMeta?.status !== "open"}
                    rows={2}
                    className="min-h-[72px] resize-none"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void handleSend();
                      }
                    }}
                  />
                  <Button
                    className="sm:self-end shrink-0"
                    disabled={!selectedId || !input.trim() || sending || convChatMeta?.status !== "open"}
                    onClick={() => void handleSend()}>
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    <span className="ml-2">Send</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
