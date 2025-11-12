import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
  Alert,
  ScrollView,
} from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { MaterialIcons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';

type SupportMessageRecord = {
  id: string;
  created_at: string;
  message: string | null;
  metadata: Record<string, any> | string | null;
};

type ChatEntry = {
  id: string;
  role: 'user' | 'support';
  content: string;
  timestamp: string;
};

export default function SupportChatScreen() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [chatEntries, setChatEntries] = useState<ChatEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [userEmail, setUserEmail] = useState<string>('');
  const scrollViewRef = useRef<ScrollView | null>(null);
  const isMounted = useRef(true);

  const flattenMessageRecord = (
    record: SupportMessageRecord,
    targetUserId: string | null,
    targetEmail: string | null
  ): ChatEntry[] => {
    const entries: ChatEntry[] = [];

    const parseMetadata = () => {
      const raw = record.metadata;
      if (!raw) return {} as Record<string, any>;
      if (typeof raw === 'object') return raw as Record<string, any>;
      try {
        return JSON.parse(raw) as Record<string, any>;
      } catch {
        return {} as Record<string, any>;
      }
    };

    const metadata = parseMetadata();
    const metadataUserId =
      (metadata.user_id as string | undefined) ||
      (metadata.userId as string | undefined) ||
      (metadata.profile_id as string | undefined) ||
      (metadata.profileId as string | undefined);
    const metadataEmail =
      (metadata.email as string | undefined) ||
      (metadata.user_email as string | undefined);

    const matchesUser =
      (!!targetUserId && metadataUserId === targetUserId) ||
      (!!targetEmail && metadataEmail?.toLowerCase() === targetEmail?.toLowerCase());

    if (!matchesUser) {
      return [];
    }

    const pushEntry = (
      content: string | null | undefined,
      role: 'user' | 'support',
      timestamp: string,
      key: string
    ) => {
      if (!content) return;
      entries.push({ id: `${record.id}-${key}`, role, content, timestamp });
    };

    const baseRole: 'user' | 'support' =
      (metadata.role ?? metadata.sender_role ?? metadata.sender ?? '')
        .toString()
        .toLowerCase()
        .includes('support')
        ? 'support'
        : 'user';

    pushEntry(record.message ?? metadata.message ?? metadata.content, baseRole, record.created_at, 'root');

    const replies = Array.isArray(metadata.replies) ? metadata.replies : [];
    replies.forEach((reply: any, index: number) => {
      const replyRole: 'user' | 'support' =
        (reply?.role ?? reply?.sender_role ?? reply?.sender ?? 'support')
          .toString()
          .toLowerCase()
          .includes('support')
        ? 'support'
        : 'user';
      const ts =
        reply?.timestamp ?? reply?.created_at ?? reply?.date ?? metadata.last_reply_at ?? record.created_at;
      pushEntry(reply?.message ?? reply?.content ?? reply?.body, replyRole, ts, `reply-${index}`);
    });

    if (metadata.last_reply && !replies?.length) {
      const last = metadata.last_reply;
      const lastRole: 'user' | 'support' =
        (last?.role ?? last?.sender_role ?? last?.sender ?? 'support')
          .toString()
          .toLowerCase()
          .includes('support')
        ? 'support'
        : 'user';
      const ts = last?.timestamp ?? last?.created_at ?? record.created_at;
      pushEntry(last?.message ?? last?.content ?? last?.body, lastRole, ts, 'last');
    }

    return entries;
  };

  const fetchMessages = useCallback(
    async (targetUserId: string | null, targetEmail: string | null) => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('support_messages')
          .select('id, created_at, message, metadata')
          .order('created_at', { ascending: true });

        if (error) throw error;
        if (isMounted.current) {
          const flattened = (data as SupportMessageRecord[] | null)?.flatMap((record) =>
            flattenMessageRecord(record, targetUserId, targetEmail)
          ) ?? [];

          flattened.sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );

          setChatEntries(flattened);
          requestAnimationFrame(() => scrollViewRef.current?.scrollToEnd({ animated: true }));
        }
      } catch (err) {
        console.error('Failed to load support messages:', err);
        Alert.alert('Support Chat', 'Unable to load support messages.');
      } finally {
        if (isMounted.current) setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    const init = async () => {
      try {
        const { data: sessionData, error } = await supabase.auth.getSession();
        if (error) throw error;

        const session = sessionData.session;
        if (!session) {
          router.replace('/auth/login');
          return;
        }

        if (!isMounted.current) return;

        setUserId(session.user.id);
        setUserEmail(session.user.email ?? '');
        await fetchMessages(session.user.id, session.user.email ?? null);
      } catch (err) {
        console.error('Support chat init failed:', err);
      }
    };

    isMounted.current = true;
    init();

    return () => {
      isMounted.current = false;
    };
  }, [fetchMessages, router]);

  const handleSend = useCallback(async () => {
    if (!userId || sending) return;
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    try {
      setSending(true);
      const { data: sessionData } = await supabase.auth.getSession();
      const userEmailAddress = sessionData?.session?.user?.email ?? userEmail ?? undefined;
      const displayName =
        sessionData?.session?.user?.user_metadata?.full_name ??
        sessionData?.session?.user?.email?.split('@')[0] ??
        'User';
 
      const payload = {
        message: trimmed,
        metadata: {
          user_id: userId,
          email: userEmailAddress,
          sender: displayName,
          role: 'user',
          created_via: 'mobile',
          message: trimmed,
        },
      };
 
      let { error: insertError } = await supabase.from('support_messages').insert(payload);

      if (insertError) {
        const fallbackPayload = {
          metadata: {
            user_id: userId,
            email: userEmailAddress,
            sender: displayName,
            role: 'user',
            created_via: 'mobile',
            message: trimmed,
          },
        };

        const { error: fallbackError } = await supabase.from('support_messages').insert(fallbackPayload);
        if (fallbackError) {
          throw fallbackError;
        }
      }
 
      setInputValue('');
      await fetchMessages(userId, userEmailAddress ?? null);
      requestAnimationFrame(() => scrollViewRef.current?.scrollToEnd({ animated: true }));
    } catch (err) {
      console.error('Failed to send support chat message:', err);
      const errorMessage =
        (err as any)?.message ||
        (err as any)?.error?.message ||
        'Unable to send your message. Please try again.';
      Alert.alert('Support Chat', errorMessage);
    } finally {
      setSending(false);
    }
  }, [fetchMessages, inputValue, sending, userEmail, userId]);

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Support Chat</ThemedText>
        <View style={styles.headerPlaceholder} />
      </View>

      <View style={styles.chatContainer}>
        {loading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color="#FF7F00" />
          </View>
        ) : chatEntries.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialIcons name="chat-bubble-outline" size={42} color="#bbb" />
            <ThemedText style={styles.emptyText}>No messages yet.</ThemedText>
          </View>
        ) : (
          <ScrollView
            ref={scrollViewRef}
            contentContainerStyle={styles.messageList}
            onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
            showsVerticalScrollIndicator={false}
          >
            {chatEntries.map((entry) => (
              <View
                key={entry.id}
                style={[styles.messageBubble, entry.role === 'user' ? styles.messageUser : styles.messageSupport]}
              >
                <ThemedText style={styles.messageText}>{entry.content}</ThemedText>
                <ThemedText style={styles.messageTimestamp}>
                  {new Date(entry.timestamp).toLocaleString('en-NG', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true,
                    month: 'short',
                    day: 'numeric',
                  })}
                </ThemedText>
              </View>
            ))}
          </ScrollView>
        )}
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
      >
        <View style={styles.composerRow}>
          <TextInput
            style={styles.composerInput}
            placeholder="Type your message"
            placeholderTextColor="#999"
            value={inputValue}
            onChangeText={setInputValue}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendButton, sending && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={sending}
          >
            {sending ? <ActivityIndicator size="small" color="#fff" /> : <MaterialIcons name="send" size={22} color="#fff" />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
  },
  headerPlaceholder: {
    width: 40,
  },
  chatContainer: {
    flex: 1,
    backgroundColor: '#F7F7F7',
    marginHorizontal: 20,
    borderRadius: 18,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  loadingState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
  },
  messageList: {
    paddingBottom: 12,
  },
  messageBubble: {
    maxWidth: '82%',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  messageUser: {
    alignSelf: 'flex-end',
    backgroundColor: '#FF7F00',
  },
  messageSupport: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  messageText: {
    fontSize: 14,
    color: '#1A1A1A',
  },
  messageTimestamp: {
    fontSize: 11,
    color: 'rgba(0,0,0,0.45)',
    marginTop: 6,
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 28 : 20,
  },
  composerInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 130,
    borderRadius: 16,
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: '#333',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  sendButton: {
    backgroundColor: '#FF7F00',
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
});
