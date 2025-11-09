import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bell, CheckCheck, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import BottomNav from "@/components/BottomNav";

interface Notification {
  id: string;
  title: string;
  message: string;
  created_at: string;
  read_status?: {
    is_read: boolean;
    read_at: string | null;
  };
}

export default function UserNotifications() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");

  useEffect(() => {
    const checkAuthAndFetch = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/user/auth");
        return;
      }

      setUserId(session.user.id);
      await fetchNotifications(session.user.id);
    };

    checkAuthAndFetch();
  }, [navigate]);

  const fetchNotifications = async (currentUserId: string) => {
    try {
      const { data, error } = await supabase
        .from("notifications")
        .select(`
          *,
          notification_recipients!inner(is_read, read_at)
        `)
        .or(`recipient_type.eq.all,recipient_ids.cs.{${currentUserId}}`)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setNotifications(data || []);
    } catch (error: any) {
      console.error("Error fetching notifications:", error);
      toast.error("Failed to load notifications");
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from("notification_recipients")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("notification_id", notificationId)
        .eq("user_id", userId);

      if (error) throw error;

      await fetchNotifications(userId);
      toast.success("Notification marked as read");
    } catch (error: any) {
      console.error("Error marking notification as read:", error);
      toast.error("Failed to mark as read");
    }
  };

  const markAllAsRead = async () => {
    try {
      const { error } = await supabase
        .from("notification_recipients")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("is_read", false);

      if (error) throw error;

      await fetchNotifications(userId);
      toast.success("All notifications marked as read");
    } catch (error: any) {
      console.error("Error marking all as read:", error);
      toast.error("Failed to mark all as read");
    }
  };

  const unreadCount = notifications.filter(n => !n.read_status?.is_read).length;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/user/profile")}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-xl font-bold">Notifications</h1>
                {unreadCount > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {unreadCount} unread
                  </p>
                )}
              </div>
            </div>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={markAllAsRead}
              >
                <CheckCheck className="h-4 w-4 mr-2" />
                Mark all read
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Notifications List */}
      <div className="p-4 space-y-3">
        {notifications.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Bell className="h-12 w-12 mx-auto text-gray-300 mb-4" />
              <h3 className="font-semibold text-lg mb-2">No notifications</h3>
              <p className="text-muted-foreground">
                You're all caught up! Check back later for updates.
              </p>
            </CardContent>
          </Card>
        ) : (
          notifications.map((notification) => (
            <Card
              key={notification.id}
              className={notification.read_status?.is_read ? "opacity-60" : ""}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-start justify-between">
                      <h3 className="font-semibold">{notification.title}</h3>
                      {!notification.read_status?.is_read && (
                        <Badge variant="default" className="ml-2">New</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {notification.message}
                    </p>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        {new Date(notification.created_at).toLocaleDateString('en-NG', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                      {!notification.read_status?.is_read && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => markAsRead(notification.id)}
                          className="h-auto py-1 px-2 text-xs"
                        >
                          Mark as read
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <BottomNav />
    </div>
  );
}