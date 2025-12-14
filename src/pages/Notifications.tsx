import { useState, useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Bell, Send, Users, User, Circle, Eye, EyeOff, Smartphone, TestTube } from "lucide-react";
import { Switch } from "@/components/ui/switch";
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

const LOGO_SRC = "/logo.png";

interface UserProfile {
  id: string;
  full_name: string | null;
  email: string | null;
}

interface Notification {
  id: string;
  title: string;
  message: string;
  recipient_type: string;
  recipient_ids: string[];
  created_at: string;
  notification_recipients?: Array<{
    id: string;
    is_read: boolean;
    read_at: string | null;
  }>;
}

export default function Notifications() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [recipientType, setRecipientType] = useState<"all" | "single" | "multiple">("all");
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [logoFailed, setLogoFailed] = useState(false);
  const [enablePushNotifications, setEnablePushNotifications] = useState(true);
  const [pushNotificationStats, setPushNotificationStats] = useState<{
    totalTokens: number;
    activeTokens: number;
    platforms: { ios: number; android: number };
  } | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchUsers();
    fetchNotifications();
    fetchPushNotificationStats();

    // Realtime: Listen for new notifications
    const notificationsChannel = supabase
      .channel('admin-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
        },
        (payload) => {
          console.log('New notification sent:', payload);
          fetchNotifications();
          setLastUpdate(new Date());
        }
      )
      .subscribe();

    // Realtime: Listen for notification read status changes
    const recipientsChannel = supabase
      .channel('admin-notification-recipients')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notification_recipients',
        },
        (payload) => {
          console.log('Notification status updated:', payload);
          fetchNotifications();
          setLastUpdate(new Date());
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(notificationsChannel);
      supabase.removeChannel(recipientsChannel);
    };
  }, []);

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

  const fetchNotifications = async () => {
    const { data, error } = await supabase
      .from("notifications")
      .select(`
        *,
        notification_recipients (
          id,
          is_read,
          read_at
        )
      `)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("Error fetching notifications:", error);
      return;
    }

    // Sort: newest first (already sorted by query, but ensure it's correct)
    const sorted = (data || []).sort((a, b) => {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    setNotifications(sorted);
  };

  const fetchPushNotificationStats = async () => {
    try {
      const { data: tokens, error } = await supabase
        .from("user_push_tokens")
        .select("platform, is_active");

      if (error) {
        console.error("Error fetching push token stats:", error);
        return;
      }

      const activeTokens = (tokens || []).filter(t => t.is_active);
      const iosCount = activeTokens.filter(t => t.platform === 'ios').length;
      const androidCount = activeTokens.filter(t => t.platform === 'android').length;

      setPushNotificationStats({
        totalTokens: tokens?.length || 0,
        activeTokens: activeTokens.length,
        platforms: {
          ios: iosCount,
          android: androidCount,
        },
      });
    } catch (error) {
      console.error("Error fetching push notification stats:", error);
    }
  };

  const handleTestPushNotification = async () => {
    if (!title.trim() || !message.trim()) {
      toast({
        title: "Error",
        description: "Please fill in both title and message to test",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("Not authenticated");
      }

      const { data, error } = await supabase.functions.invoke('admin-send-push-notification', {
        body: {
          title: `[TEST] ${title}`,
          body: message,
          user_ids: [user.id], // Send test to current admin user
          data: {
            type: 'test_notification',
          },
        },
      });

      if (error) {
        throw error;
      }

      toast({
        title: "Test Push Sent",
        description: data?.recipients 
          ? `Test push notification sent to ${data.recipients} device(s)`
          : "Test push notification sent",
      });
    } catch (error: any) {
      toast({
        title: "Test Failed",
        description: error.message || "Failed to send test push notification",
        variant: "destructive",
      });
    }
  };

  const handleUserSelect = (userId: string, checked: boolean) => {
    if (checked) {
      setSelectedUsers([...selectedUsers, userId]);
    } else {
      setSelectedUsers(selectedUsers.filter((id) => id !== userId));
    }
  };

  const handleSendNotification = async () => {
    if (!title.trim() || !message.trim()) {
      toast({
        title: "Error",
        description: "Please fill in both title and message",
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("Not authenticated");
      }

      const recipientIds = recipientType === "all" ? [] : selectedUsers;

      // Insert notification
      const { data: notification, error: notificationError } = await supabase
        .from("notifications")
        .insert({
          title,
          message,
          recipient_type: recipientType,
          recipient_ids: recipientIds,
          sent_by: user.id,
        })
        .select()
        .single();

      if (notificationError) {
        throw notificationError;
      }

      // Create notification recipients for tracking
      const recipientsToNotify = recipientType === "all" 
        ? users.map(u => u.id)
        : recipientIds;

      if (recipientsToNotify.length > 0) {
        const recipientRecords = recipientsToNotify.map(userId => ({
          notification_id: notification.id,
          user_id: userId,
        }));

        const { error: recipientError } = await supabase
          .from("notification_recipients")
          .insert(recipientRecords);

        if (recipientError) {
          console.error("Error creating recipient records:", recipientError);
        }
      }

      // Send push notification if enabled
      if (enablePushNotifications) {
        try {
          const { data: pushData, error: pushError } = await supabase.functions.invoke('admin-send-push-notification', {
            body: {
              title,
              body: message,
              user_ids: recipientType === 'all' ? undefined : recipientsToNotify,
              data: {
                notification_id: notification.id,
                type: 'admin_notification',
              },
            },
          });

          if (pushError) {
            console.error('Error sending push notification:', pushError);
            toast({
              title: "Warning",
              description: "In-app notification sent, but push notification failed. Check console for details.",
              variant: "destructive",
            });
          } else if (pushData?.recipients) {
            toast({
              title: "Success",
              description: `Notification sent to ${recipientsToNotify.length} user(s). Push notifications delivered to ${pushData.recipients} device(s).`,
            });
          }
        } catch (pushError: any) {
          console.error('Error sending push notification:', pushError);
          toast({
            title: "Warning",
            description: "In-app notification sent, but push notification failed. Check console for details.",
            variant: "destructive",
          });
        }
      } else {
        toast({
          title: "Success",
          description: `In-app notification sent to ${recipientsToNotify.length} user(s) (push notifications disabled)`,
        });
      }


      // Reset form
      setTitle("");
      setMessage("");
      setRecipientType("all");
      setSelectedUsers([]);
      fetchNotifications();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to send notification",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <header className="sticky top-0 z-10 border-b-2 border-[#FF7F00] bg-gradient-to-r from-[#FFF8F0] to-white backdrop-blur supports-[backdrop-filter]:bg-background/60 shadow-md">
            <div className="flex h-16 items-center justify-between px-6">
              <div className="flex items-center gap-4">
                <SidebarTrigger />
                <Bell className="h-6 w-6 text-[#FF7F00]" />
                <div>
                  <h1 className="text-2xl font-bold text-[#FF7F00]">Notifications Management</h1>
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
            {/* Compose Notification Card */}
            <Card className="border-2 border-[#FFE5CC] shadow-lg">
              <CardHeader className="bg-gradient-to-r from-[#FF7F00] to-[#FF9933] text-white rounded-t-lg">
                <CardTitle className="flex items-center gap-2 text-white">
                  <Send className="h-5 w-5" />
                  Compose Notification
                </CardTitle>
                <CardDescription className="text-white/90">
                  Send notifications to users about important updates
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="title">Title</Label>
                    <Input
                      id="title"
                      placeholder="Enter notification title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="message">Message</Label>
                    <Textarea
                      id="message"
                      placeholder="Enter your message here..."
                      rows={4}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                    />
                  </div>

                  <div className="rounded-2xl border bg-white shadow-sm p-5 max-w-md">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="h-12 w-12 rounded-full bg-muted overflow-hidden flex items-center justify-center">
                        {logoFailed ? (
                          <span className="text-sm font-semibold text-primary">NP</span>
                        ) : (
                          <img
                            src={LOGO_SRC}
                            alt="NetPay logo"
                            className="h-full w-full object-cover"
                            onError={() => setLogoFailed(true)}
                          />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-semibold">NetPay Alerts</p>
                        <p className="text-xs text-muted-foreground">Just now</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-semibold">
                        {title.trim() || "Upcoming Event"}
                      </p>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {message.trim() || "A new event is coming soon! Stay tuned for more details and be sure not to miss out."}
                      </p>
                    </div>
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
                            All Users
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
                        {users.map((user) => (
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
                              {user.full_name || user.email}
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

                  {/* Push Notification Settings */}
                  <div className="border rounded-lg p-4 space-y-4 bg-[#FFF8F0]">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Smartphone className="h-5 w-5 text-[#FF7F00]" />
                        <Label htmlFor="push-toggle" className="text-base font-semibold">
                          Push Notifications
                        </Label>
                      </div>
                      <Switch
                        id="push-toggle"
                        checked={enablePushNotifications}
                        onCheckedChange={setEnablePushNotifications}
                      />
                    </div>
                    {enablePushNotifications && pushNotificationStats && (
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div className="text-center">
                          <p className="font-semibold text-[#FF7F00]">{pushNotificationStats.activeTokens}</p>
                          <p className="text-muted-foreground">Active Devices</p>
                        </div>
                        <div className="text-center">
                          <p className="font-semibold text-[#FF7F00]">{pushNotificationStats.platforms.ios}</p>
                          <p className="text-muted-foreground">iOS Devices</p>
                        </div>
                        <div className="text-center">
                          <p className="font-semibold text-[#FF7F00]">{pushNotificationStats.platforms.android}</p>
                          <p className="text-muted-foreground">Android Devices</p>
                        </div>
                      </div>
                    )}
                    {enablePushNotifications && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleTestPushNotification}
                        className="w-full border-[#FF7F00] text-[#FF7F00] hover:bg-[#FFF4E6]"
                      >
                        <TestTube className="h-4 w-4 mr-2" />
                        Test Push Notification
                      </Button>
                    )}
                  </div>

                  <Button
                    onClick={handleSendNotification}
                    disabled={isSending}
                    className="w-full bg-[#FF7F00] hover:bg-[#FF9933] text-white font-semibold shadow-md"
                  >
                    {isSending ? (
                      "Sending..."
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Send Notification
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Notification History */}
            <Card className="border-2 border-[#FFE5CC] shadow-lg">
                  <CardHeader className="bg-gradient-to-r from-[#FF7F00] to-[#FF9933] text-white rounded-t-lg">
                    <CardTitle className="flex items-center justify-between text-white">
                      <span>Notification History</span>
                      <Badge variant="outline" className="gap-1 border-white bg-white/20 text-white">
                        <Circle className="h-2 w-2 fill-white text-white animate-pulse" />
                        Live
                      </Badge>
                    </CardTitle>
                    <CardDescription className="text-white/90">Recently sent notifications with read status</CardDescription>
                  </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {notifications.length === 0 ? (
                    <div className="text-center py-12">
                      <Bell className="h-16 w-16 mx-auto text-[#FFB366] mb-4" />
                      <p className="text-[#CC6600] font-medium">
                        No notifications sent yet
                      </p>
                    </div>
                  ) : (
                    notifications.map((notification) => {
                      const recipients = notification.notification_recipients || [];
                      const readCount = recipients.filter((r) => r.is_read).length;
                      const totalCount = recipients.length;
                      
                      return (
                        <div
                          key={notification.id}
                          className="border-2 border-[#FFE5CC] rounded-lg p-4 space-y-3 bg-white hover:bg-[#FFF8F0] transition-colors shadow-sm"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h3 className="font-semibold text-[#FF7F00]">{notification.title}</h3>
                              <p className="text-sm text-[#333] mt-1">
                                {notification.message}
                              </p>
                            </div>
                            <Badge
                              className={
                                notification.recipient_type === "all"
                                  ? "bg-[#FF7F00] text-white"
                                  : "bg-[#FFF4E6] text-[#CC6600] border-[#FFB366]"
                              }
                            >
                              {notification.recipient_type === "all"
                                ? "All Users"
                                : notification.recipient_type === "single"
                                ? "1 User"
                                : `${notification.recipient_ids.length} Users`}
                            </Badge>
                          </div>
                          
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-[#CC6600] font-medium">
                              {new Date(notification.created_at).toLocaleString()}
                            </span>
                            
                            {totalCount > 0 && (
                              <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1">
                                  <Eye className="h-3 w-3 text-[#FF7F00]" />
                                  <span className="text-[#FF7F00] font-medium">{readCount}</span>
                                </div>
                                <span className="text-[#CC6600]">/</span>
                                <div className="flex items-center gap-1">
                                  <EyeOff className="h-3 w-3 text-[#CC6600]" />
                                  <span className="text-[#CC6600]">{totalCount - readCount}</span>
                                </div>
                                <Badge variant="outline" className="ml-1 border-[#FFB366] bg-[#FFF4E6] text-[#CC6600]">
                                  {totalCount > 0 ? Math.round((readCount / totalCount) * 100) : 0}% read
                                </Badge>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
