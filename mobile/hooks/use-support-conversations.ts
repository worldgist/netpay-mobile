import { useCallback, useState } from 'react';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import { fetchUserIsAdmin, listSupportConversationsForAdmin, type SupportConversationWithProfile } from '@/utils/support-chat';

export type SupportConversationRow = SupportConversationWithProfile;

export function useSupportConversations(statusFilter: 'open' | 'all') {
  const router = useRouter();
  const [rows, setRows] = useState<SupportConversationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [denied, setDenied] = useState(false);
  const [openTotalExact, setOpenTotalExact] = useState(0);
  const [closedTotalExact, setClosedTotalExact] = useState(0);

  const load = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);

        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        const session = sessionData.session;
        if (!session) {
          router.replace('/auth/login');
          return;
        }

        const isAdmin = await fetchUserIsAdmin(supabase, session.user.id);
        if (!isAdmin) {
          setDenied(true);
          setRows([]);
          setOpenTotalExact(0);
          setClosedTotalExact(0);
          return;
        }
        setDenied(false);

        const [{ count: openCount }, { count: closedCount }] = await Promise.all([
          supabase
            .from('support_conversations')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'open'),
          supabase
            .from('support_conversations')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'closed'),
        ]);
        setOpenTotalExact(openCount ?? 0);
        setClosedTotalExact(closedCount ?? 0);

        const convRows = await listSupportConversationsForAdmin(supabase, statusFilter);
        setRows(convRows);
      } catch (e) {
        console.error('Support conversations load failed:', e);
        setRows([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [router, statusFilter]
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return {
    rows,
    loading,
    refreshing,
    denied,
    refresh: () => load(true),
    openTotalExact,
    closedTotalExact,
  };
}
