import { registerForPushNotifications } from '@/utils/push-notifications';
  useEffect(() => {
    if (session?.user) {
      registerForPushNotifications();
    }
  }, [session?.user]);
