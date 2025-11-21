import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Bell } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

interface Notification {
  id: string;
  title: string;
  message: string;
  created_at: string;
  recipient_id: string;
  is_read: boolean;
}

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const initNotifications = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      setUserId(session.user.id);
      await fetchNotifications(session.user.id);
      setupRealtimeSubscription(session.user.id);
    };

    initNotifications();
  }, []);

  const fetchNotifications = async (userId: string) => {
    // Fetch notifications for the user
    const { data: userNotifications } = await supabase
      .from('notifications')
      .select('*')
      .or(`recipient_type.eq.all,recipient_ids.cs.{${userId}}`)
      .order('created_at', { ascending: false })
      .limit(20);

    if (userNotifications) {
      // Fetch read status from notification_recipients
      const { data: recipients } = await supabase
        .from('notification_recipients')
        .select('notification_id, is_read')
        .eq('user_id', userId);

      const readStatusMap = new Map(
        recipients?.map(r => [r.notification_id, r.is_read]) || []
      );

      const notificationsWithStatus = userNotifications.map(notif => ({
        id: notif.id,
        title: notif.title,
        message: notif.message,
        created_at: notif.created_at,
        recipient_id: userId,
        is_read: readStatusMap.get(notif.id) || false,
      }));

      setNotifications(notificationsWithStatus);
      setUnreadCount(notificationsWithStatus.filter(n => !n.is_read).length);
    }
  };

  const setupRealtimeSubscription = (userId: string) => {
    // Subscribe to new notifications
    const channel = supabase
      .channel('notifications-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
        },
        async (payload) => {
          const newNotif = payload.new as any;
          
          // Check if notification is for this user
          if (
            newNotif.recipient_type === 'all' ||
            newNotif.recipient_ids?.includes(userId)
          ) {
            setNotifications(prev => [{
              id: newNotif.id,
              title: newNotif.title,
              message: newNotif.message,
              created_at: newNotif.created_at,
              recipient_id: userId,
              is_read: false,
            }, ...prev]);
            setUnreadCount(prev => prev + 1);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notification_recipients',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const updated = payload.new as any;
          setNotifications(prev =>
            prev.map(n =>
              n.id === updated.notification_id
                ? { ...n, is_read: updated.is_read }
                : n
            )
          );
          if (updated.is_read) {
            setUnreadCount(prev => Math.max(0, prev - 1));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const markAsRead = async (notificationId: string) => {
    if (!userId) return;

    // Check if recipient record exists
    const { data: existing } = await supabase
      .from('notification_recipients')
      .select('id, is_read')
      .eq('notification_id', notificationId)
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      if (!existing.is_read) {
        await supabase
          .from('notification_recipients')
          .update({ is_read: true, read_at: new Date().toISOString() })
          .eq('id', existing.id);
      }
    } else {
      // Create recipient record
      await supabase
        .from('notification_recipients')
        .insert({
          notification_id: notificationId,
          user_id: userId,
          is_read: true,
          read_at: new Date().toISOString(),
        });
    }
  };

  const markAllAsRead = async () => {
    if (!userId) return;

    const unreadNotifications = notifications.filter(n => !n.is_read);
    
    for (const notif of unreadNotifications) {
      await markAsRead(notif.id);
    }

    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
  };

  const handleOpenChange = async (open: boolean) => {
    setIsOpen(open);
    
    if (open && notifications.length > 0 && unreadCount > 0) {
      // Mark all as read when opening
      await markAllAsRead();
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button className="relative">
          <Bell className="w-8 h-8 text-[#FF7F00] hover:text-[#FF9933] transition-colors" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-[#FF7F00] rounded-full text-white text-xs flex items-center justify-center font-medium shadow-md">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 border-2 border-[#FFE5CC] shadow-xl" align="end">
        <div className="flex items-center justify-between p-4 border-b-2 border-[#FFE5CC] bg-gradient-to-r from-[#FF7F00] to-[#FF9933]">
          <h3 className="font-semibold text-white">Notifications</h3>
          {unreadCount > 0 && (
            <Badge className="bg-white text-[#FF7F00] border-0">
              {unreadCount} new
            </Badge>
          )}
        </div>
        <ScrollArea className="h-[400px] bg-[#FFF8F0]">
          {notifications.length === 0 ? (
            <div className="p-8 text-center">
              <Bell className="w-12 h-12 text-[#FFB366] mx-auto mb-3" />
              <p className="text-[#CC6600] text-sm font-medium">No notifications yet</p>
            </div>
          ) : (
            <div className="divide-y divide-[#FFE5CC]">
              {notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`p-4 transition-colors ${
                    !notif.is_read ? 'bg-[#FFF8F0] border-l-4 border-l-[#FF7F00]' : 'bg-white hover:bg-[#FFF8F0]'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className={`font-medium text-sm ${
                          !notif.is_read ? 'text-[#FF7F00]' : 'text-gray-900'
                        }`}>
                          {notif.title}
                        </p>
                        {!notif.is_read && (
                          <div className="w-2 h-2 bg-[#FF7F00] rounded-full flex-shrink-0 mt-1 shadow-sm" />
                        )}
                      </div>
                      <p className={`text-sm line-clamp-2 mb-2 ${
                        !notif.is_read ? 'text-gray-800' : 'text-gray-600'
                      }`}>
                        {notif.message}
                      </p>
                      <p className="text-xs text-[#CC6600] font-medium">
                        {formatTime(notif.created_at)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
