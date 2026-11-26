import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Mail, Send, Users, User, Circle, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface UserProfile {
  id: string;
  full_name: string | null;
  email: string | null;
}

interface EmailLog {
  id: string;
  sent_by: string;
  recipient_count: number;
  subject: string;
  recipient_emails: string[];
  status: string;
  created_at: string;
  resend_id: string | null;
}

export default function EmailNotifications() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  const [subject, setSubject] = useState("");
  const [htmlContent, setHtmlContent] = useState("");
  const [recipientType, setRecipientType] = useState<"all" | "single" | "multiple">("all");
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    checkAdminAndFetch();
  }, [navigate]);

  const checkAdminAndFetch = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        navigate('/auth');
        return;
      }

      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', session.user.id)
        .eq('role', 'admin')
        .single();

      if (!roles) {
        toast({
          title: "Access Denied",
          description: "You don't have permission to access this page",
          variant: "destructive",
        });
        navigate('/dashboard');
        return;
      }

      await fetchUsers();
      await fetchEmailLogs();
      setLoading(false);
    } catch (error) {
      console.error('Error:', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (loading) return;

    fetchEmailLogs();

    // Realtime: Listen for new email logs
    const emailLogsChannel = supabase
      .channel('admin-email-logs')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'email_logs',
        },
        (payload) => {
          console.log('New email log:', payload);
          fetchEmailLogs();
          setLastUpdate(new Date());
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(emailLogsChannel);
    };
  }, [loading]);

  const fetchUsers = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("status", "active")
      .order("full_name");

    if (error) {
      console.error("Error fetching users:", error);
      return;
    }

    setUsers(data || []);
  };

  const fetchEmailLogs = async () => {
    const { data, error } = await supabase
      .from("email_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("Error fetching email logs:", error);
      return;
    }

    setEmailLogs(data || []);
  };

  const handleUserSelect = (userId: string, checked: boolean) => {
    if (checked) {
      setSelectedUsers([...selectedUsers, userId]);
    } else {
      setSelectedUsers(selectedUsers.filter((id) => id !== userId));
    }
  };

  const handleSendEmail = async () => {
    if (!subject.trim() || !htmlContent.trim()) {
      toast({
        title: "Error",
        description: "Please fill in both subject and message",
        variant: "destructive",
      });
      return;
    }

    if (recipientType !== "all" && selectedUsers.length === 0) {
      toast({
        title: "Error",
        description: "Please select at least one recipient",
        variant: "destructive",
      });
      return;
    }

    setIsSending(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error("Not authenticated");
      }

      // Get recipient emails
      const recipientEmails: string[] = [];
      const recipientUserIds: string[] = [];

      if (recipientType === "all") {
        users.forEach(user => {
          if (user.email) {
            recipientEmails.push(user.email);
            recipientUserIds.push(user.id);
          }
        });
      } else {
        selectedUsers.forEach(userId => {
          const user = users.find(u => u.id === userId);
          if (user?.email) {
            recipientEmails.push(user.email);
            recipientUserIds.push(userId);
          }
        });
      }

      if (recipientEmails.length === 0) {
        throw new Error("No valid email addresses found for selected recipients");
      }

      // Log what we're sending for debugging
      console.log("Sending email with:", {
        recipientCount: recipientEmails.length,
        recipients: recipientEmails,
        subject: subject.trim(),
      });

      // Call the send-admin-email function
      const { data, error } = await supabase.functions.invoke('send-admin-email', {
        body: {
          emails: recipientEmails,
          subject: subject.trim(),
          htmlContent: htmlContent.trim(),
          user_ids: recipientUserIds,
        },
      });

      // Log the response for debugging
      console.log("Email function response:", { data, error });

      if (error) {
        console.error("Email function error:", error);
        throw error;
      }

      if (!data.success) {
        const errorMsg = data.error || "Failed to send email";
        const details = data.details || data.results ? JSON.stringify(data.details || data.results, null, 2) : "";
        throw new Error(`${errorMsg}${details ? `\n\nDetails: ${details}` : ""}`);
      }

      // Show detailed results
      const sentCount = data.sent_to || 0;
      const failedCount = data.failed || 0;
      
      if (failedCount > 0 && sentCount > 0) {
        toast({
          title: "Partial Success",
          description: `Email sent to ${sentCount} recipient(s), but ${failedCount} failed. Check console for details.`,
          variant: "default",
        });
        console.error("Email sending results:", data.results);
      } else if (sentCount > 0) {
        toast({
          title: "Success",
          description: `Email sent to ${sentCount} recipient(s)${data.invalid_emails > 0 ? ` (${data.invalid_emails} invalid emails skipped)` : ""}`,
        });
      } else {
        throw new Error(data.error || "Failed to send all emails");
      }

      // Reset form
      setSubject("");
      setHtmlContent("");
      setRecipientType("all");
      setSelectedUsers([]);
      fetchEmailLogs();
    } catch (error: any) {
      console.error("Error sending email:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to send email",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const getStatusBadge = (status: string) => {
    if (status === "sent") {
      return (
        <Badge className="bg-green-500 text-white">
          <CheckCircle className="h-3 w-3 mr-1" />
          Sent
        </Badge>
      );
    }
    if (status === "failed") {
      return (
        <Badge variant="destructive">
          <XCircle className="h-3 w-3 mr-1" />
          Failed
        </Badge>
      );
    }
    return (
      <Badge variant="secondary">
        <Circle className="h-3 w-3 mr-1" />
        {status}
      </Badge>
    );
  };

  if (loading) {
    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full bg-background">
          <AppSidebar />
          <main className="flex-1 overflow-auto flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-[#FF7F00]" />
          </main>
        </div>
      </SidebarProvider>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <header className="sticky top-0 z-10 border-b-2 border-[#FF7F00] bg-gradient-to-r from-[#FFF8F0] to-white backdrop-blur supports-[backdrop-filter]:bg-background/60 shadow-md">
            <div className="flex h-16 items-center justify-between px-6">
              <div className="flex items-center gap-4">
                <SidebarTrigger />
                <Mail className="h-6 w-6 text-[#FF7F00]" />
                <div>
                  <h1 className="text-2xl font-bold text-[#FF7F00]">Email Delivery Service</h1>
                  <p className="text-xs text-[#CC6600]">
                    Last updated: {lastUpdate.toLocaleTimeString()}
                  </p>
                </div>
              </div>
              <Badge variant="outline" className="gap-1 border-[#FF7F00] bg-[#FFF4E6] text-[#CC6600]">
                <Circle className="h-2 w-2 fill-[#FF7F00] text-[#FF7F00] animate-pulse" />
                Live Updates
              </Badge>
            </div>
          </header>

          <div className="p-6 space-y-6 bg-gradient-to-b from-[#FFF8F0] to-white min-h-screen">
            {/* Compose Email Card */}
            <Card className="border-2 border-[#FFE5CC] shadow-lg">
              <CardHeader className="bg-gradient-to-r from-[#FF7F00] to-[#FF9933] text-white rounded-t-lg">
                <CardTitle className="flex items-center gap-2 text-white">
                  <Send className="h-5 w-5" />
                  Compose Email
                </CardTitle>
                <CardDescription className="text-white/90">
                  Send email notifications to users
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="subject">Subject</Label>
                    <Input
                      id="subject"
                      placeholder="Enter email subject"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="html-content">Message (HTML supported)</Label>
                    <Textarea
                      id="html-content"
                      placeholder="Enter your email message here. You can use HTML tags for formatting..."
                      rows={8}
                      value={htmlContent}
                      onChange={(e) => setHtmlContent(e.target.value)}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      You can use HTML tags like &lt;p&gt;, &lt;strong&gt;, &lt;br&gt;, etc. for formatting
                    </p>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="recipient-type">Send To</Label>
                    <Select
                      value={recipientType}
                      onValueChange={(value: any) => {
                        setRecipientType(value);
                        setSelectedUsers([]);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4" />
                            All Users ({users.length})
                          </div>
                        </SelectItem>
                        <SelectItem value="single">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4" />
                            Single User
                          </div>
                        </SelectItem>
                        <SelectItem value="multiple">
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4" />
                            Multiple Users
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {recipientType !== "all" && (
                    <div className="grid gap-2">
                      <Label>Select Recipients</Label>
                      <div className="border rounded-lg p-4 max-h-64 overflow-y-auto space-y-2">
                        {users.filter(u => u.email).map((user) => (
                          <div key={user.id} className="flex items-center space-x-2">
                            <Checkbox
                              id={user.id}
                              checked={selectedUsers.includes(user.id)}
                              onCheckedChange={(checked) =>
                                handleUserSelect(user.id, checked as boolean)
                              }
                              disabled={
                                recipientType === "single" &&
                                selectedUsers.length === 1 &&
                                !selectedUsers.includes(user.id)
                              }
                            />
                            <label
                              htmlFor={user.id}
                              className="flex-1 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                            >
                              {user.full_name || user.email} {user.email && `(${user.email})`}
                            </label>
                          </div>
                        ))}
                      </div>
                      {selectedUsers.length > 0 && (
                        <p className="text-sm text-muted-foreground">
                          {selectedUsers.length} user(s) selected
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      onClick={handleSendEmail}
                      disabled={isSending}
                      className="flex-1 bg-[#FF7F00] hover:bg-[#FF9933] text-white font-semibold shadow-md"
                    >
                      {isSending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4 mr-2" />
                          Send Email
                        </>
                      )}
                    </Button>
                    <Button
                      onClick={async () => {
                        const { data: { session } } = await supabase.auth.getSession();
                        if (!session?.user?.email) {
                          toast({
                            title: "Error",
                            description: "No email found for your account",
                            variant: "destructive",
                          });
                          return;
                        }
                        setRecipientType("single");
                        setSelectedUsers([]);
                        // Find current user in users list
                        const currentUser = users.find(u => u.email === session.user.email);
                        if (currentUser) {
                          setSelectedUsers([currentUser.id]);
                        }
                        setSubject(`[TEST] ${subject || "Test Email"}`);
                        toast({
                          title: "Test Mode",
                          description: `Prepared to send test email to ${session.user.email}. Fill in the message and click Send Email.`,
                        });
                      }}
                      variant="outline"
                      className="border-[#FF7F00] text-[#FF7F00] hover:bg-[#FFF4E6]"
                    >
                      <Mail className="h-4 w-4 mr-2" />
                      Test
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Email History */}
            <Card className="border-2 border-[#FFE5CC] shadow-lg">
              <CardHeader className="bg-gradient-to-r from-[#FF7F00] to-[#FF9933] text-white rounded-t-lg">
                <CardTitle className="flex items-center justify-between text-white">
                  <span>Email History</span>
                  <Badge variant="outline" className="gap-1 border-white bg-white/20 text-white">
                    <Circle className="h-2 w-2 fill-white text-white animate-pulse" />
                    Live
                  </Badge>
                </CardTitle>
                <CardDescription className="text-white/90">
                  Recently sent emails with delivery status
                </CardDescription>
              </CardHeader>
              <CardContent>
                {emailLogs.length === 0 ? (
                  <div className="text-center py-12">
                    <Mail className="h-16 w-16 mx-auto text-[#FFB366] mb-4" />
                    <p className="text-[#CC6600] font-medium">
                      No emails sent yet
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Subject</TableHead>
                        <TableHead>Recipients</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Sent At</TableHead>
                        <TableHead>Resend ID</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {emailLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="font-medium">{log.subject}</TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <Badge variant="outline" className="border-[#FF7F00] bg-[#FFF4E6] text-[#CC6600]">
                                {log.recipient_count} recipient(s)
                              </Badge>
                              {log.recipient_emails && log.recipient_emails.length > 0 && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  {log.recipient_emails.slice(0, 2).join(", ")}
                                  {log.recipient_emails.length > 2 && ` +${log.recipient_emails.length - 2} more`}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{getStatusBadge(log.status)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(log.created_at).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            {log.resend_id ? (
                              <code className="text-xs bg-muted px-2 py-1 rounded">
                                {log.resend_id.substring(0, 8)}...
                              </code>
                            ) : (
                              <span className="text-xs text-muted-foreground">N/A</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}

