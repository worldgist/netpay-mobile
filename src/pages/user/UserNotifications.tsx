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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#FFF8F0] to-white">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#FF7F00]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#FFF8F0] to-white pb-24">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#FF7F00] to-[#FF9933] border-b-2 border-[#FF7F00] sticky top-0 z-10 shadow-md">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/user/profile")}
                className="text-white hover:bg-white/20"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-xl font-bold text-white">Notifications</h1>
                {unreadCount > 0 && (
                  <p className="text-sm text-white/90">
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
                className="text-white hover:bg-white/20 border border-white/30"
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
          <Card className="border-2 border-[#FFE5CC] shadow-lg">
            <CardContent className="py-12 text-center bg-white">
              <Bell className="h-16 w-16 mx-auto text-[#FFB366] mb-4" />
              <h3 className="font-semibold text-lg mb-2 text-[#FF7F00]">No notifications</h3>
              <p className="text-[#CC6600]">
                You're all caught up! Check back later for updates.
              </p>
            </CardContent>
          </Card>
        ) : (
          notifications.map((notification) => (
            <Card
              key={notification.id}
              className={`border-2 shadow-md transition-all ${
                notification.read_status?.is_read 
                  ? "border-[#FFE5CC] bg-white opacity-70" 
                  : "border-[#FF7F00] bg-[#FFF8F0] border-l-4"
              }`}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-start justify-between">
                      <h3 className={`font-semibold ${
                        notification.read_status?.is_read ? "text-[#CC6600]" : "text-[#FF7F00]"
                      }`}>
                        {notification.title}
                      </h3>
                      {!notification.read_status?.is_read && (
                        <Badge className="ml-2 bg-[#FF7F00] text-white">New</Badge>
                      )}
                    </div>
                    <p className={`text-sm ${
                      notification.read_status?.is_read ? "text-gray-600" : "text-gray-800"
                    }`}>
                      {notification.message}
                    </p>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-[#CC6600] font-medium">
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
                          className="h-auto py-1 px-2 text-xs text-[#FF7F00] hover:bg-[#FFF4E6]"
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