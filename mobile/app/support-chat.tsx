import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  AppState,
  Linking,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { NetpayLoadingAnimation } from '@/components/netpay-loading-animation';
import { fetchUserIsAdmin, getOrCreateOpenConversation, fetchProfileContactHint } from '@/utils/support-chat';
import {
  formatSupportLastSeen,
  isTypingActive,
  rpcSupportEndChat,
  rpcSupportPresencePing,
  type SupportConversationPresence,
} from '@/utils/support-presence';
import { SUPPORT_CHAT_BUCKET } from '@/utils/support-attachments';

type MessageRow = {
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
}): boolean {
  if (!m.attachment_path) return false;
  if (m.kind === 'image') return true;
  return (m.attachment_mime || '').toLowerCase().startsWith('image/');
}

export default function SupportChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ conversationId?: string }>();
  const paramConvId = typeof params.conversationId === 'string' ? params.conversationId : undefined;

  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [peerHint, setPeerHint] = useState<string | null>(null);
  const [convMeta, setConvMeta] = useState<SupportConversationPresence | null>(null);
  const [tick, setTick] = useState(0);
  const [signedImageUrls, setSignedImageUrls] = useState<Record<string, string>>({});
  const listRef = useRef<FlatList<MessageRow>>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const typingDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const convIdRef = useRef<string | null>(null);
  const loadedImageIds = useRef(new Set<string>());

  useEffect(() => {
    convIdRef.current = conversationId;
    loadedImageIds.current.clear();
    setSignedImageUrls({});
  }, [conversationId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const m of messages) {
        if (!isSupportImageMessage(m) || !m.attachment_path) continue;
        if (loadedImageIds.current.has(m.id)) continue;
        loadedImageIds.current.add(m.id);
        const { data, error } = await supabase.storage
          .from(SUPPORT_CHAT_BUCKET)
          .createSignedUrl(m.attachment_path, 3600);
        if (!cancelled && data?.signedUrl && !error) {
          setSignedImageUrls((prev) => ({ ...prev, [m.id]: data.signedUrl }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [messages]);

  const canSend = useMemo(
    () => input.trim().length > 0 && !sending && !!conversationId && convMeta?.status === 'open',
    [input, sending, conversationId, convMeta?.status]
  );

  const loadMessages = useCallback(async (cid: string) => {
    const { data, error } = await supabase
      .from('support_messages')
      .select('id, sender_id, body, created_at, kind, attachment_path, attachment_mime, attachment_name')
      .eq('conversation_id', cid)
      .order('created_at', { ascending: true });
    if (error) throw error;
    setMessages((data as MessageRow[]) || []);
  }, []);

  const subscribe = useCallback((cid: string) => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    const ch = supabase
      .channel(`support-thread:${cid}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'support_messages',
          filter: `conversation_id=eq.${cid}`,
        },
        (payload) => {
          const row = payload.new as MessageRow;
          if (!row?.id) return;
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'support_conversations',
          filter: `id=eq.${cid}`,
        },
        (payload) => {
          const n = payload.new as Partial<SupportConversationPresence>;
          setConvMeta((prev) => {
            if (!prev) {
              return {
                status: n.status ?? 'open',
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
        }
      )
      .subscribe();
    channelRef.current = ch;
  }, []);

  const loadConversationMeta = useCallback(async (cid: string) => {
    const { data, error } = await supabase
      .from('support_conversations')
      .select('status, last_seen_customer_at, last_seen_staff_at, typing_customer_until, typing_staff_until')
      .eq('id', cid)
      .single();
    if (error) throw error;
    setConvMeta(data as SupportConversationPresence);
  }, []);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setConvMeta(null);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const session = sessionData.session;
      if (!session) {
        router.replace('/auth/login');
        return;
      }

      const uid = session.user.id;
      setMyUserId(uid);
      const admin = await fetchUserIsAdmin(supabase, uid);
      setIsAdmin(admin);

      let cid: string | null = null;

      if (paramConvId) {
        if (!admin) {
          const { data: conv, error: convErr } = await supabase
            .from('support_conversations')
            .select('id, user_id')
            .eq('id', paramConvId)
            .maybeSingle();
          if (convErr || !conv || conv.user_id !== uid) {
            Alert.alert('Chat', 'You do not have access to this conversation.');
            router.back();
            return;
          }
        }
        cid = paramConvId;

        if (admin) {
          const { data: crow } = await supabase.from('support_conversations').select('user_id').eq('id', paramConvId).maybeSingle();
          const customerProfileId = crow?.user_id;
          const hint = customerProfileId ? await fetchProfileContactHint(supabase, customerProfileId) : 'Customer';
          setPeerHint(hint);
        } else {
          setPeerHint('NetPay support');
        }
      } else {
        if (admin) {
          setConversationId(null);
          setPeerHint(null);
          setMessages([]);
          setConvMeta(null);
          setLoading(false);
          return;
        }
        cid = await getOrCreateOpenConversation(supabase, uid);
        setPeerHint('NetPay support');
      }

      setConversationId(cid);
      await loadConversationMeta(cid);
      await loadMessages(cid);
      subscribe(cid);
      try {
        await rpcSupportPresencePing(supabase, cid, false);
      } catch {
        /* presence RPC optional if migration not applied */
      }
    } catch (e) {
      console.error('Support chat bootstrap:', e);
      Alert.alert('Chat', e instanceof Error ? e.message : 'Could not load chat.');
      router.back();
    } finally {
      setLoading(false);
    }
  }, [paramConvId, router, loadMessages, subscribe, loadConversationMeta]);

  useEffect(() => {
    bootstrap();
    return () => {
      if (typingDebounceRef.current) {
        clearTimeout(typingDebounceRef.current);
        typingDebounceRef.current = null;
      }
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [bootstrap]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!conversationId || convMeta?.status !== 'open') return;
    const id = setInterval(() => {
      const cid = convIdRef.current;
      if (!cid) return;
      void rpcSupportPresencePing(supabase, cid, false).catch(() => {});
    }, 25000);
    return () => clearInterval(id);
  }, [conversationId, convMeta?.status]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background' || next === 'inactive') {
        const cid = convIdRef.current;
        if (!cid) return;
        void rpcSupportPresencePing(supabase, cid, false).catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);

  const confirmEndChat = () => {
    if (!conversationId) return;
    Alert.alert('End chat', 'Close this thread? You can start a new conversation from Chat support when you need help again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End chat',
        style: 'destructive',
        onPress: async () => {
          try {
            await rpcSupportEndChat(supabase, conversationId);
            setConvMeta((m) =>
              m
                ? {
                    ...m,
                    status: 'closed',
                    typing_customer_until: null,
                    typing_staff_until: null,
                  }
                : m
            );
          } catch (e) {
            Alert.alert('Chat', e instanceof Error ? e.message : 'Could not end chat.');
          }
        },
      },
    ]);
  };

  const onInputChange = (t: string) => {
    setInput(t);
    const cid = conversationId;
    if (!cid || convMeta?.status !== 'open') return;
    if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
    typingDebounceRef.current = setTimeout(() => {
      void rpcSupportPresencePing(supabase, cid, t.trim().length > 0).catch(() => {});
    }, 350);
  };

  const openAttachment = async (m: MessageRow) => {
    if (!m.attachment_path) return;
    try {
      const { data, error } = await supabase.storage.from(SUPPORT_CHAT_BUCKET).createSignedUrl(m.attachment_path, 3600);
      if (error || !data?.signedUrl) throw new Error('No download link');
      const canOpen = await Linking.canOpenURL(data.signedUrl);
      if (canOpen) await Linking.openURL(data.signedUrl);
      else Alert.alert('File', 'Could not open this file on your device.');
    } catch {
      Alert.alert('File', 'Could not get a download link.');
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !conversationId || !myUserId) return;
    if (convMeta?.status !== 'open') {
      Alert.alert('Chat', 'This chat has ended.');
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase
        .from('support_messages')
        .insert({
          conversation_id: conversationId,
          sender_id: myUserId,
          body: text,
          kind: 'text',
        })
        .select('id, sender_id, body, created_at')
        .single();
      if (error) throw error;
      if (data) {
        setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data as MessageRow]));
      }
      setInput('');
      if (typingDebounceRef.current) {
        clearTimeout(typingDebounceRef.current);
        typingDebounceRef.current = null;
      }
      await rpcSupportPresencePing(supabase, conversationId, false).catch(() => {});
    } catch (e) {
      Alert.alert('Chat', e instanceof Error ? e.message : 'Message could not be sent.');
    } finally {
      setSending(false);
    }
  };

  const peerLastSeenIso = isAdmin ? convMeta?.last_seen_customer_at : convMeta?.last_seen_staff_at;
  const peerTypingUntil = isAdmin ? convMeta?.typing_customer_until : convMeta?.typing_staff_until;
  void tick;
  const showPeerTyping = convMeta?.status === 'open' && isTypingActive(peerTypingUntil);

  if (loading) {
    return (
      <ThemedView style={styles.centerFill}>
        <NetpayLoadingAnimation message={'Opening support chat…\nConnecting you to our team'} />
      </ThemedView>
    );
  }

  if (isAdmin && !paramConvId) {
    return (
      <ThemedView style={styles.container}>
        <View style={[styles.topBar, { paddingTop: Math.max(insets.top + 8, 16) }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
            <MaterialIcons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <ThemedText style={styles.topTitle}>Support chat</ThemedText>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.adminGate}>
          <MaterialIcons name="support-agent" size={48} color="#FF7F00" />
          <ThemedText style={styles.adminGateTitle}>Pick a conversation</ThemedText>
          <ThemedText style={styles.adminGateSub}>Open the support center to choose a customer thread.</ThemedText>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push('/support-admin')} activeOpacity={0.85}>
            <ThemedText style={styles.primaryBtnText}>Open support center</ThemedText>
          </TouchableOpacity>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 8 : 0}>
        <View style={[styles.topBar, { paddingTop: Math.max(insets.top + 8, 16) }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
            <MaterialIcons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <View style={styles.topTitles}>
            <ThemedText style={styles.topTitle}>Support</ThemedText>
            {peerHint ? (
              <ThemedText style={styles.topSub} numberOfLines={1}>
                {peerHint}
              </ThemedText>
            ) : null}
            {convMeta ? (
              <ThemedText style={styles.lastSeenSub} numberOfLines={1}>
                {formatSupportLastSeen(peerLastSeenIso)}
              </ThemedText>
            ) : null}
          </View>
          {conversationId && convMeta ? (
            <TouchableOpacity onPress={confirmEndChat} style={styles.menuBtn} hitSlop={12} accessibilityLabel="End chat">
              <MaterialIcons name="more-vert" size={24} color="#333" />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 40 }} />
          )}
        </View>

        {convMeta?.status === 'closed' ? (
          <View style={styles.closedBanner}>
            <MaterialIcons name="lock-outline" size={18} color="#92400e" />
            <ThemedText style={styles.closedBannerText}>This conversation has ended. Messages cannot be sent.</ThemedText>
          </View>
        ) : null}

        {showPeerTyping ? (
          <View style={styles.typingRow}>
            <ThemedText style={styles.typingText}>{isAdmin ? 'Customer is typing…' : 'Support is typing…'}</ThemedText>
          </View>
        ) : null}

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          style={styles.list}
          contentContainerStyle={[styles.listInner, { paddingBottom: 12 }]}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={styles.empty}>
              <ThemedText style={styles.emptyText}>No messages yet. Say hello and our team will reply here.</ThemedText>
            </View>
          }
          renderItem={({ item }) => {
            const mine = item.sender_id === myUserId;
            const showAsImage = isSupportImageMessage(item);
            const imgUrl = showAsImage && item.id ? signedImageUrls[item.id] : undefined;

            if (showAsImage) {
              return (
                <View style={[styles.bubbleWrap, mine ? styles.bubbleWrapMine : styles.bubbleWrapTheirs]}>
                  <View style={[styles.bubble, styles.bubbleAttachment, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                    {imgUrl ? (
                      <Image source={{ uri: imgUrl }} style={styles.attachedImage} contentFit="cover" />
                    ) : (
                      <View style={styles.imagePlaceholder}>
                        <ActivityIndicator color={mine ? '#fff' : '#FF7F00'} />
                      </View>
                    )}
                    {item.body?.trim() ? (
                      <ThemedText style={[styles.bubbleText, mine ? styles.bubbleTextMine : styles.bubbleTextTheirs, styles.captionBelow]}>
                        {item.body}
                      </ThemedText>
                    ) : null}
                  </View>
                </View>
              );
            }

            if (item.attachment_path) {
              return (
                <View style={[styles.bubbleWrap, mine ? styles.bubbleWrapMine : styles.bubbleWrapTheirs]}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => void openAttachment(item)}
                    style={[styles.bubble, styles.fileBubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                    <View style={styles.fileRow}>
                      <MaterialIcons name="insert-drive-file" size={28} color={mine ? '#fff' : '#FF7F00'} />
                      <ThemedText
                        style={[styles.fileName, mine ? styles.bubbleTextMine : styles.bubbleTextTheirs]}
                        numberOfLines={2}>
                        {item.attachment_name || 'Attachment'}
                      </ThemedText>
                      <MaterialIcons name="open-in-new" size={20} color={mine ? '#fff' : '#666'} />
                    </View>
                    {item.body?.trim() ? (
                      <ThemedText style={[styles.bubbleText, mine ? styles.bubbleTextMine : styles.bubbleTextTheirs, styles.captionBelow]}>
                        {item.body}
                      </ThemedText>
                    ) : null}
                  </TouchableOpacity>
                </View>
              );
            }

            return (
              <View style={[styles.bubbleWrap, mine ? styles.bubbleWrapMine : styles.bubbleWrapTheirs]}>
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  <ThemedText style={[styles.bubbleText, mine ? styles.bubbleTextMine : styles.bubbleTextTheirs]}>{item.body}</ThemedText>
                </View>
              </View>
            );
          }}
        />

        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={styles.composerRow}>
            <TextInput
              style={styles.input}
              placeholder="Type a message…"
              placeholderTextColor="#999"
              value={input}
              onChangeText={onInputChange}
              multiline
              maxLength={4000}
              editable={!sending && convMeta?.status === 'open'}
            />
            <TouchableOpacity
              style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!canSend}
              activeOpacity={0.85}>
              {sending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <MaterialIcons name="send" size={22} color="#fff" />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FC' },
  flex: { flex: 1 },
  centerFill: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8F9FC' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 10,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  backBtn: { padding: 8 },
  topTitles: { flex: 1, minWidth: 0 },
  topTitle: { fontSize: 18, fontWeight: '700', color: '#1E2533' },
  topSub: { fontSize: 13, color: '#666', marginTop: 2 },
  lastSeenSub: { fontSize: 12, color: '#888', marginTop: 2 },
  menuBtn: { padding: 8, width: 40, alignItems: 'center' },
  closedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#FCD34D',
  },
  closedBannerText: { flex: 1, fontSize: 13, color: '#92400e', lineHeight: 18 },
  typingRow: { paddingHorizontal: 14, paddingVertical: 6, backgroundColor: '#F0F4F8' },
  typingText: { fontSize: 13, color: '#64748b', fontStyle: 'italic' },
  list: { flex: 1 },
  listInner: { paddingHorizontal: 12, paddingTop: 12 },
  empty: { paddingVertical: 32, paddingHorizontal: 16 },
  emptyText: { fontSize: 15, color: '#666', textAlign: 'center', lineHeight: 22 },
  bubbleWrap: { marginBottom: 10, flexDirection: 'row' },
  bubbleWrapMine: { justifyContent: 'flex-end' },
  bubbleWrapTheirs: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '82%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMine: { backgroundColor: '#FF7F00' },
  bubbleTheirs: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E8ECF0' },
  bubbleAttachment: { paddingHorizontal: 8, paddingVertical: 8 },
  attachedImage: { width: 220, height: 220, borderRadius: 12, backgroundColor: '#eee' },
  imagePlaceholder: { width: 220, height: 220, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.06)' },
  captionBelow: { marginTop: 8 },
  fileBubble: { paddingVertical: 12 },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: 260 },
  fileName: { flex: 1, fontSize: 14, fontWeight: '600' },
  bubbleText: { fontSize: 15, lineHeight: 21 },
  bubbleTextMine: { color: '#fff' },
  bubbleTextTheirs: { color: '#1E2533' },
  composer: {
    alignSelf: 'stretch',
    paddingHorizontal: 10,
    paddingTop: 10,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    alignSelf: 'stretch',
    gap: 8,
    minHeight: 48,
  },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    color: '#1E2533',
    backgroundColor: '#FAFAFA',
  },
  sendBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FF7F00',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 0,
  },
  sendBtnDisabled: { opacity: 0.45 },
  adminGate: { flex: 1, padding: 28, justifyContent: 'center', alignItems: 'center' },
  adminGateTitle: { fontSize: 20, fontWeight: '700', color: '#1E2533', marginTop: 16, textAlign: 'center' },
  adminGateSub: { fontSize: 15, color: '#666', textAlign: 'center', marginTop: 10, lineHeight: 22 },
  primaryBtn: {
    marginTop: 24,
    backgroundColor: '#FF7F00',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
