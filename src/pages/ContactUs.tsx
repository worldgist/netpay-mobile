import { useEffect, useMemo, useState } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  Loader2,
  MapPin,
  Mail,
  Phone,
  RefreshCw,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type SupportMessage = Database["public"]["Tables"]["support_messages"]["Row"];
type BusinessHour = { day: string; time: string };

const DEFAULT_BUSINESS_HOURS: BusinessHour[] = [
  { day: "Monday - Friday", time: "9:00 AM - 6:00 PM" },
  { day: "Saturday", time: "10:00 AM - 4:00 PM" },
  { day: "Sunday", time: "Closed" },
];

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  pending: "Pending",
  in_progress: "In progress",
  resolved: "Resolved",
  closed: "Closed",
};

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  open: "destructive",
  pending: "secondary",
  in_progress: "secondary",
  resolved: "default",
  closed: "default",
};

const formatDateTime = (iso: string | null | undefined) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-NG", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
};

const normalizeStatus = (status?: string | null) =>
  (status ?? "open").toLowerCase();

const ContactUs = () => {
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeMessage, setActiveMessage] = useState<SupportMessage | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [replySubmitting, setReplySubmitting] = useState(false);
  const [supportEmail, setSupportEmail] = useState("support@netpayy.ng");
  const [supportPhone, setSupportPhone] = useState("07067398399");
  const [supportPhoneDisplay, setSupportPhoneDisplay] = useState("+234 706 739 8399");
  const [supportAddress, setSupportAddress] = useState("Lagos, Nigeria");
  const [businessHours, setBusinessHours] = useState<BusinessHour[]>(DEFAULT_BUSINESS_HOURS);

  const loadSupportMessages = async () => {
    const { data, error } = await supabase
      .from("support_messages")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    setMessages(data ?? []);
  };

  const loadContactSettings = async () => {
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

      const recoverableCodes = new Set(["PGRST116", "PGRST205", "42P01"]);
      if (settingsError && !recoverableCodes.has(settingsError.code ?? "")) {
        throw settingsError;
      }

      if (settingsRow) {
        if (settingsRow.support_email) setSupportEmail(settingsRow.support_email);
        if (settingsRow.support_phone) setSupportPhone(settingsRow.support_phone);
        if (settingsRow.support_phone_display)
          setSupportPhoneDisplay(settingsRow.support_phone_display);

        const addressParts = [
          settingsRow.address_line,
          settingsRow.city,
          settingsRow.state,
          settingsRow.country,
        ]
          .filter(Boolean)
          .join(", ");

        if (addressParts) {
          setSupportAddress(addressParts);
        }

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
    } catch (error) {
      console.warn("contact_settings unavailable:", error);
    }
  };

  useEffect(() => {
    const bootstrap = async () => {
      try {
        await Promise.all([loadSupportMessages(), loadContactSettings()]);
      } catch (error) {
        console.error("Failed to load support inbox:", error);
        toast.error("Unable to load support messages. Please try again later.");
      } finally {
        setLoading(false);
      }
    };

    bootstrap();
  }, []);

  const refreshingData = async () => {
    setRefreshing(true);
    try {
      await loadSupportMessages();
      toast.success("Support inbox refreshed");
    } catch (error) {
      console.error("Refresh failed:", error);
      toast.error("Failed to refresh support messages.");
    } finally {
      setRefreshing(false);
    }
  };

  const filteredMessages = useMemo(() => {
    return messages.filter((message) => {
      const status = normalizeStatus(message.status);
      const matchesStatus =
        statusFilter === "all" ? true : status === statusFilter;

      if (!matchesStatus) return false;

      if (!searchTerm.trim()) return true;
      const query = searchTerm.trim().toLowerCase();

      return (
        (message.subject ?? "").toLowerCase().includes(query) ||
        (message.name ?? "").toLowerCase().includes(query) ||
        (message.email ?? "").toLowerCase().includes(query) ||
        (message.message ?? "").toLowerCase().includes(query)
      );
    });
  }, [messages, statusFilter, searchTerm]);

  const stats = useMemo(() => {
    return messages.reduce(
      (acc, message) => {
        const status = normalizeStatus(message.status);
        acc.total += 1;
        if (status === "resolved" || status === "closed") {
          acc.resolved += 1;
        } else {
          acc.open += 1;
        }
        return acc;
      },
      { total: 0, open: 0, resolved: 0 }
    );
  }, [messages]);

  const handleViewMessage = (message: SupportMessage) => {
    setActiveMessage(message);
    setReplyContent("");
    setDialogOpen(true);
  };

  const conversationTimeline = useMemo(() => {
    if (!activeMessage) return [] as Array<{
      id: string;
      sender: string;
      role: "user" | "support";
      content: string;
      timestamp: string;
    }>;

    const entries: Array<{
      id: string;
      sender: string;
      role: "user" | "support";
      content: string;
      timestamp: string;
    }> = [];

    if (activeMessage.message) {
      entries.push({
        id: `${activeMessage.id}-origin`,
        sender: activeMessage.name ?? "Customer",
        role: "user",
        content: activeMessage.message,
        timestamp: activeMessage.created_at,
      });
    }

    const rawMetadata = activeMessage.metadata;
    let meta: Record<string, any> = {};
    if (rawMetadata && typeof rawMetadata === "object") {
      meta = rawMetadata as Record<string, any>;
    } else if (typeof rawMetadata === "string") {
      try {
        meta = JSON.parse(rawMetadata);
      } catch {
        meta = {};
      }
    }

    const pushReply = (reply: any, index: number) => {
      if (!reply) return;
      const content = reply.message ?? reply.content ?? reply.body ?? "";
      if (!content) return;
      const timestamp = reply.timestamp ?? reply.created_at ?? activeMessage.updated_at;
      const sender = reply.sender ?? reply.agent ?? "Support";
      const role: "user" | "support" =
        (reply.role ?? reply.sender_role ?? sender).toString().toLowerCase().includes("support")
          ? "support"
          : "user";

      entries.push({
        id: `${activeMessage?.id}-reply-${index}`,
        sender,
        role,
        content,
        timestamp,
      });
    };

    if (Array.isArray(meta.replies)) {
      meta.replies.forEach((reply: any, index: number) => pushReply(reply, index));
    }

    if (meta.last_reply) {
      pushReply(meta.last_reply, (meta.replies?.length ?? 0) + 1);
    }

    entries.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    return entries;
  }, [activeMessage]);

  const handleSendReply = async () => {
    if (!activeMessage) return;
    const trimmed = replyContent.trim();
    if (!trimmed) {
      toast.error("Please enter a reply before sending.");
      return;
    }

    try {
      setReplySubmitting(true);
      const rawMetadata = activeMessage.metadata;
      let meta: Record<string, any> = {};
      if (rawMetadata && typeof rawMetadata === "object") {
        meta = { ...(rawMetadata as Record<string, any>) };
      } else if (typeof rawMetadata === "string") {
        try {
          meta = JSON.parse(rawMetadata);
        } catch {
          meta = {};
        }
      }

      const timestamp = new Date().toISOString();
      const replyEntry = {
        sender: "Support",
        message: trimmed,
        timestamp,
      };

      const replies = Array.isArray(meta.replies) ? [...meta.replies, replyEntry] : [replyEntry];
      const updatedMetadata = {
        ...meta,
        replies,
        last_reply: replyEntry,
      };

      const nextStatus = normalizeStatus(activeMessage.status) === "resolved"
        ? "resolved"
        : "in_progress";

      const { data, error } = await supabase
        .from("support_messages")
        .update({
          metadata: updatedMetadata,
          last_reply_at: timestamp,
          status: nextStatus,
        })
        .eq("id", activeMessage.id)
        .select("*")
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (data) {
        setMessages((prev) => prev.map((item) => (item.id === data.id ? data : item)));
        setActiveMessage(data);
        setReplyContent("");
        toast.success("Reply sent to customer");
      }
    } catch (error) {
      console.error("Failed to send support reply:", error);
      toast.error("Unable to send reply. Please try again.");
    } finally {
      setReplySubmitting(false);
    }
  };

  const handleUpdateStatus = async (
    message: SupportMessage,
    nextStatus: string
  ) => {
    try {
      const { data, error } = await supabase
        .from("support_messages")
        .update({ status: nextStatus })
        .eq("id", message.id)
        .select("*")
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (data) {
        setMessages((prev) =>
          prev.map((item) => (item.id === data.id ? data : item))
        );
        if (activeMessage?.id === data.id) {
          setActiveMessage(data);
        }
        toast.success(`Conversation marked as ${STATUS_LABELS[nextStatus] ?? nextStatus}`);
      }
    } catch (error) {
      console.error("Failed to update support status:", error);
      toast.error("Unable to update conversation status.");
    }
  };

  const statusTabs = [
    { value: "all", label: `All (${stats.total})` },
    { value: "open", label: `Open (${stats.open})` },
    { value: "resolved", label: `Resolved (${stats.resolved})` },
  ];

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex h-16 items-center gap-4 px-6">
              <SidebarTrigger />
              <h1 className="text-2xl font-bold">Support Inbox</h1>
              <div className="ml-auto">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={refreshingData}
                  disabled={refreshing}
                >
                  {refreshing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Refreshing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4" />
                      Refresh
                    </>
                  )}
                </Button>
              </div>
            </div>
          </header>

          <div className="p-6 space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardDescription>Total tickets</CardDescription>
                  <CardTitle className="text-3xl">{stats.total}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader>
                  <CardDescription>Awaiting response</CardDescription>
                  <CardTitle className="text-3xl flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-orange-500" />
                    {stats.open}
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader>
                  <CardDescription>Resolved</CardDescription>
                  <CardTitle className="text-3xl flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    {stats.resolved}
                  </CardTitle>
                </CardHeader>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-[360px,1fr]">
              <Card>
                <CardHeader>
                  <CardTitle>Support contact</CardTitle>
                  <CardDescription>Customer-facing information</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="flex items-start gap-3">
                    <Mail className="h-4 w-4 text-brand mt-0.5" />
                    <div>
                      <p className="font-medium">Email</p>
                      <button
                        type="button"
                        className="text-muted-foreground underline-offset-2 hover:underline"
                        onClick={() => navigator.clipboard.writeText(supportEmail)}
                      >
                        {supportEmail}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Phone className="h-4 w-4 text-brand mt-0.5" />
                    <div>
                      <p className="font-medium">Phone</p>
                      <button
                        type="button"
                        className="text-muted-foreground underline-offset-2 hover:underline"
                        onClick={() => navigator.clipboard.writeText(supportPhone)}
                      >
                        {supportPhoneDisplay}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <MapPin className="h-4 w-4 text-brand mt-0.5" />
                    <div>
                      <p className="font-medium">Address</p>
                      <p className="text-muted-foreground">{supportAddress}</p>
                    </div>
                  </div>
                  <div className="space-y-2 pt-2 border-t">
                    <p className="font-medium">Business hours</p>
                    <div className="space-y-1">
                      {businessHours.map((entry, index) => (
                        <div
                          key={`${entry.day}-${index}`}
                          className="flex justify-between text-muted-foreground text-xs"
                        >
                          <span>{entry.day}</span>
                          <span className="text-foreground font-medium">
                            {entry.time}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="space-y-4">
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <CardTitle>Incoming conversations</CardTitle>
                      <CardDescription>
                        Manage customer messages from the app and web portal.
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                    <div className="relative w-full lg:max-w-sm">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Search by name, email or subject..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                    <Tabs value={statusFilter} onValueChange={setStatusFilter}>
                      <TabsList>
                        {statusTabs.map((tab) => (
                          <TabsTrigger key={tab.value} value={tab.value}>
                            {tab.label}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                    </Tabs>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {loading ? (
                    <div className="flex items-center justify-center py-10">
                      <Loader2 className="h-6 w-6 animate-spin text-brand" />
                    </div>
                  ) : (
                    <div className="border rounded-xl overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Subject</TableHead>
                            <TableHead>Customer</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Created</TableHead>
                            <TableHead>Updated</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredMessages.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={6}>
                                <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                                  No conversations found for the current filters.
                                </div>
                              </TableCell>
                            </TableRow>
                          ) : (
                            filteredMessages.map((message) => {
                              const status = normalizeStatus(message.status);
                              const badgeVariant =
                                STATUS_VARIANTS[status] ?? "outline";
                              const statusLabel =
                                STATUS_LABELS[status] ?? message.status ?? "Open";
                              return (
                                <TableRow key={message.id}>
                                  <TableCell className="max-w-[220px]">
                                    <div className="font-medium truncate">
                                      {message.subject ?? "Support enquiry"}
                                    </div>
                                    <div className="text-xs text-muted-foreground truncate">
                                      {(message.message ?? "").slice(0, 96)}
                                      {(message.message ?? "").length > 96 ? "…" : ""}
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <div className="font-medium">
                                      {message.name ?? "Unknown"}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      {message.email ?? "—"}
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant={badgeVariant}>
                                      {statusLabel}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-sm">
                                    {formatDateTime(message.created_at)}
                                  </TableCell>
                                  <TableCell className="text-sm">
                                    {formatDateTime(message.updated_at)}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <div className="flex items-center justify-end gap-2">
                                      {status !== "resolved" && status !== "closed" && (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => handleUpdateStatus(message, "resolved")}
                                        >
                                          Mark resolved
                                        </Button>
                                      )}
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleViewMessage(message)}
                                      >
                                        <Eye className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              );
                            })
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setActiveMessage(null);
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{activeMessage?.subject ?? "Support enquiry"}</DialogTitle>
            <DialogDescription>
              Review and respond to the customer conversation.
            </DialogDescription>
          </DialogHeader>

          {activeMessage && (
            <div className="space-y-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-semibold">{activeMessage.name ?? "Unknown user"}</p>
                  <p className="text-sm text-muted-foreground">
                    {activeMessage.email ?? "No email provided"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={STATUS_VARIANTS[normalizeStatus(activeMessage.status)] ?? "outline"}>
                    {STATUS_LABELS[normalizeStatus(activeMessage.status)] ??
                      activeMessage.status ??
                      "Open"}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleUpdateStatus(activeMessage, "resolved")}
                  >
                    Mark as resolved
                  </Button>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="font-medium text-muted-foreground">Message</div>
                <Card className="bg-muted/40">
                  <CardContent className="pt-4 text-sm leading-relaxed whitespace-pre-wrap">
                    {activeMessage.message ?? "No message body provided."}
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-3">
                <div className="font-medium text-muted-foreground">Conversation</div>
                <div className="rounded-lg border bg-muted/20 p-4 max-h-72 overflow-y-auto space-y-4">
                  {conversationTimeline.length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      No replies yet. Be the first to respond to this conversation.
                    </div>
                  ) : (
                    conversationTimeline.map((entry) => (
                      <div
                        key={entry.id}
                        className={`rounded-lg px-4 py-3 text-sm shadow-sm ${
                          entry.role === "support"
                            ? "bg-brand/10 border border-brand/20"
                            : "bg-background border"
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">
                            {entry.role === "support" ? "Support" : entry.sender}
                          </span>
                          <span>{formatDateTime(entry.timestamp)}</span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-foreground">
                          {entry.content}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <Textarea
                  placeholder="Type a reply to the customer..."
                  value={replyContent}
                  onChange={(event) => setReplyContent(event.target.value)}
                  rows={4}
                />
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setReplyContent("")}
                    disabled={replySubmitting}
                  >
                    Clear
                  </Button>
                  <Button onClick={handleSendReply} disabled={replySubmitting}>
                    {replySubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      "Send reply"
                    )}
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 text-sm text-muted-foreground">
                <div>
                  <span className="font-medium text-foreground">Created</span>
                  <div>{formatDateTime(activeMessage.created_at)}</div>
                </div>
                <div>
                  <span className="font-medium text-foreground">Last updated</span>
                  <div>{formatDateTime(activeMessage.updated_at)}</div>
                </div>
              </div>

              {activeMessage.metadata && (
                <div className="space-y-2 text-sm">
                  <div className="font-medium text-muted-foreground">Metadata</div>
                  <Card className="bg-muted/30">
                    <CardContent className="pt-4">
                      <pre className="text-xs whitespace-pre-wrap break-words">
                        {JSON.stringify(activeMessage.metadata, null, 2)}
                      </pre>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
};

export default ContactUs;
