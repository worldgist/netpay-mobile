import { useCallback, useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { supabase } from '@/lib/supabase';

type Role = 'user' | 'assistant';

interface MessageAction {
  type: 'navigate' | 'check_balance';
  route?: string;
  label: string;
}

interface Message {
  id: string;
  role: Role;
  content: string;
  timestamp: Date;
  suggestions?: string[];
  action?: MessageAction;
}

interface ChatHistoryItem {
  id: string;
  title: string;
  updatedAt: Date;
  messages: Message[];
}

const INITIAL_SUGGESTIONS = ['Ask Any Question', 'Buy Airtime', 'Buy Data', 'Pay Bills', 'Check Balance'];

const formatTime = (date: Date) =>
  date.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: true });

const cloneMessages = (items: Message[]): Message[] =>
  items.map((m) => ({ ...m, timestamp: new Date(m.timestamp) }));

const getHistoryTitle = (items: Message[]) => {
  const firstUser = items.find((m) => m.role === 'user' && m.content.trim().length > 0)?.content.trim();
  if (!firstUser) return 'Conversation';
  return firstUser.length > 48 ? `${firstUser.slice(0, 48)}...` : firstUser;
};

function InlineText({ text, color }: { text: string; color: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**') ? (
          <Text key={i} style={{ fontWeight: '700', color }}>{part.slice(2, -2)}</Text>
        ) : (
          <Text key={i} style={{ color }}>{part}</Text>
        )
      )}
    </>
  );
}

function MarkdownText({ text, isUser }: { text: string; isUser: boolean }) {
  const c = isUser ? '#3B240C' : '#222';
  return (
    <View>
      {text.split('\n').map((line, i) => {
        const bullet = line.match(/^[-•*]\s+(.*)/);
        if (bullet) return (
          <View key={i} style={styles.mdListRow}>
            <Text style={[styles.mdText, { color: c, marginRight: 6 }]}>•</Text>
            <Text style={[styles.mdText, { color: c, flex: 1 }]}><InlineText text={bullet[1]} color={c} /></Text>
          </View>
        );
        const numbered = line.match(/^(\d+\.)\s+(.*)/);
        if (numbered) return (
          <View key={i} style={styles.mdListRow}>
            <Text style={[styles.mdText, { color: c, marginRight: 6 }]}>{numbered[1]}</Text>
            <Text style={[styles.mdText, { color: c, flex: 1 }]}><InlineText text={numbered[2]} color={c} /></Text>
          </View>
        );
        const heading = line.match(/^#{1,3}\s+(.*)/);
        if (heading) return (
          <Text key={i} style={[styles.mdHeading, { color: c }]}>{heading[1]}</Text>
        );
        if (!line.trim()) return <View key={i} style={{ height: 5 }} />;
        return (
          <Text key={i} style={[styles.mdText, { color: c }]}> 
            <InlineText text={line} color={c} />
          </Text>
        );
      })}
    </View>
  );
}

const makeWelcome = (): Message => ({
  id: 'welcome',
  role: 'assistant',
  content: "Hi! I'm **Netpay AI**.\n\nYou can chat with me freely like ChatGPT, or ask me to help with **airtime**, **data**, **bill payments**, **transfers**, and your **wallet/account** tasks.",
  timestamp: new Date(),
  suggestions: INITIAL_SUGGESTIONS,
});

export default function AiChatScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([makeWelcome()]);
  const [history, setHistory] = useState<ChatHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const listRef = useRef<FlatList>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 120);
  }, []);

  const handleBackPress = useCallback(() => {
    const canGoBack = (router as any).canGoBack?.();
    if (canGoBack) {
      router.back();
      return;
    }
    router.replace('/(tabs)');
  }, [router]);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  const saveCurrentChatToHistory = useCallback(() => {
    const hasUserMessage = messages.some((m) => m.role === 'user' && m.content.trim().length > 0);
    if (!hasUserMessage) return;

    const snapshot = cloneMessages(messages);
    const title = getHistoryTitle(snapshot);
    const id = `hist-${Date.now()}`;

    setHistory((prev) => [{ id, title, updatedAt: new Date(), messages: snapshot }, ...prev].slice(0, 8));
  }, [messages]);

  const startNewChat = useCallback(() => {
    saveCurrentChatToHistory();
    setMessages([makeWelcome()]);
    setInput('');
    setShowHistory(false);
  }, [saveCurrentChatToHistory]);

  const loadHistoryChat = useCallback((item: ChatHistoryItem) => {
    setMessages(cloneMessages(item.messages));
    setShowHistory(false);
  }, []);

  const handleAction = useCallback(async (action: MessageAction) => {
    if (action.type === 'navigate' && action.route) {
      router.push(`/${action.route}` as any);
      return;
    }
    if (action.type === 'check_balance') {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase.from('profiles').select('balance').eq('id', user.id).single();
        if (data) {
          setMessages((prev) => [...prev, {
            id: `bal-${Date.now()}`,
            role: 'assistant',
            content: `Your current wallet balance is **₦${Number(data.balance ?? 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}**.`,
            timestamp: new Date(),
            suggestions: ['Buy Airtime', 'Buy Data', 'Transfer Money', 'Fund Wallet'],
          }]);
        }
      } catch { /* ignore */ }
    }
  }, [router]);

  const sendMessage = useCallback(async (text?: string) => {
    const msgText = (text ?? input).trim();
    if (!msgText || loading) return;

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: msgText, timestamp: new Date() };
    const historyBuffer = [...messages, userMsg];
    setMessages(historyBuffer);
    setInput('');
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const recent = historyBuffer.slice(-16).map(({ role, content }) => ({ role, content }));
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/ai-chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({ messages: recent }),
        }
      );
      const data = await response.json();

      setMessages((prev) => [...prev, {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: data?.reply ?? data?.message ?? "Sorry, I couldn't process that. Please try again.",
        timestamp: new Date(),
        suggestions: Array.isArray(data?.suggestions) ? data.suggestions : undefined,
        action: data?.action ?? undefined,
      }]);
    } catch {
      setMessages((prev) => [...prev, {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: 'Something went wrong. Please check your connection and try again.',
        timestamp: new Date(),
        suggestions: ['Try Again', 'Check Balance', 'Pay Bills'],
      }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages]);

  const renderItem = useCallback(({ item }: { item: Message }) => {
    const isUser = item.role === 'user';
    const ts = item.timestamp instanceof Date ? item.timestamp : new Date(item.timestamp);
    return (
      <View style={styles.msgWrapper}>
        <View style={[styles.row, isUser ? styles.rowUser : styles.rowAi]}>
          <View style={[styles.bubbleCol, isUser && styles.bubbleColUser]}>
            <View style={[styles.bubble, isUser ? styles.userBubble : styles.aiBubble]}>
              <MarkdownText text={item.content} isUser={isUser} />
            </View>
            <Text style={[styles.timestamp, isUser && styles.timestampRight]}>{formatTime(ts)}</Text>
            {!isUser && item.action && (
              <TouchableOpacity style={styles.actionBtn} onPress={() => handleAction(item.action!)}>
                <MaterialIcons name="arrow-forward" size={14} color="#fff" />
                <Text style={styles.actionBtnText}>{item.action.label}</Text>
              </TouchableOpacity>
            )}
            {!isUser && !!item.suggestions?.length && (
              <View style={styles.chipsRow}>
                {item.suggestions.map((s) => (
                  <TouchableOpacity key={s} style={styles.chip} onPress={() => sendMessage(s)} disabled={loading}>
                    <Text style={styles.chipText}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </View>
      </View>
    );
  }, [handleAction, sendMessage, loading]);

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}> 
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={handleBackPress} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerAvatar}>
            <MaterialIcons name="smart-toy" size={22} color="#fff" />
          </View>
          <View>
            <ThemedText style={styles.headerTitle}>Netpay AI</ThemedText>
            <ThemedText style={styles.headerSub}>online</ThemedText>
          </View>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => setShowHistory((prev) => !prev)} style={styles.clearBtn}>
            <MaterialIcons name="history" size={20} color="#999" />
          </TouchableOpacity>
          <TouchableOpacity onPress={startNewChat} style={styles.clearBtn}>
            <MaterialIcons name="refresh" size={20} color="#999" />
          </TouchableOpacity>
        </View>
      </View>

      {showHistory && (
        <View style={styles.historyPanel}>
          {history.length === 0 ? (
            <Text style={styles.historyEmptyText}>No previous chats yet.</Text>
          ) : (
            <FlatList
              data={history}
              horizontal
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.historyListContent}
              showsHorizontalScrollIndicator={false}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.historyChip} onPress={() => loadHistoryChat(item)}>
                  <Text numberOfLines={1} style={styles.historyChipTitle}>{item.title}</Text>
                  <Text style={styles.historyChipTime}>{formatTime(item.updatedAt)}</Text>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      )}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        style={{ flex: 1 }}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 180 }]}
        onContentSizeChange={scrollToBottom}
        showsVerticalScrollIndicator={false}
      />

      {loading && (
        <View style={styles.typingRow}>
          <View style={styles.typingBubble}>
            <ActivityIndicator size="small" color="#F57C00" />
            <Text style={styles.typingText}>Netpay AI is typing...</Text>
          </View>
        </View>
      )}

      <KeyboardAvoidingView
        style={styles.composerWrapper}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.bottom + 64}
      >
        <Text style={styles.inputHelperText}>Type any question and tap send to chat.</Text>
        <View style={[styles.inputRow, { paddingBottom: insets.bottom + 8 }]}>
          <TextInput
            style={styles.textInput}
            value={input}
            onChangeText={(val) => {
              if (Platform.OS === 'android' && val.endsWith('\n')) {
                sendMessage(val.slice(0, -1));
                return;
              }
              setInput(val);
            }}
            placeholder="Ask me anything..."
            autoCapitalize="sentences"
            autoCorrect
            placeholderTextColor="#aaa"
            multiline
            maxLength={1000}
            returnKeyType="send"
            onSubmitEditing={() => sendMessage()}
            blurOnSubmit={false}
            enablesReturnKeyAutomatically
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
            onPress={() => sendMessage()}
            disabled={!input.trim() || loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <MaterialIcons name="send" size={20} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7EADF' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#F57C00',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#FB8C00', alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  headerSub: { fontSize: 11, color: '#FFE2C2', marginTop: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  clearBtn: { padding: 8 },
  historyPanel: {
    borderBottomWidth: 1,
    borderBottomColor: '#D4CBC3',
    backgroundColor: '#F2ECE7',
    paddingVertical: 8,
  },
  historyEmptyText: {
    fontSize: 12,
    color: '#999',
    paddingHorizontal: 16,
  },
  historyListContent: {
    paddingHorizontal: 12,
    gap: 8,
  },
  historyChip: {
    width: 190,
    borderWidth: 1,
    borderColor: '#D9CEC6',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  historyChipTitle: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#333',
  },
  historyChipTime: {
    marginTop: 3,
    fontSize: 11,
    color: '#999',
  },
  listContent: { paddingHorizontal: 10, paddingTop: 8 },
  msgWrapper: { marginBottom: 14 },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  rowUser: { justifyContent: 'flex-end' },
  rowAi: { justifyContent: 'flex-start' },
  bubbleCol: { maxWidth: '88%', alignItems: 'flex-start' },
  bubbleColUser: { alignItems: 'flex-end' },
  bubble: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, elevation: 1, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 1, shadowOffset: { width: 0, height: 1 } },
  userBubble: { backgroundColor: '#FFD9B3', borderTopRightRadius: 0 },
  aiBubble: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 0 },
  mdListRow: { flexDirection: 'row', marginBottom: 3 },
  mdText: { fontSize: 14.5, lineHeight: 21, marginBottom: 1 },
  mdHeading: { fontSize: 15.5, fontWeight: '700', marginBottom: 4, marginTop: 2 },
  timestamp: { fontSize: 10, color: '#7A7A7A', marginTop: 3, marginLeft: 2 },
  timestampRight: { textAlign: 'right', marginRight: 2 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#F57C00', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 7,
    marginTop: 6, alignSelf: 'flex-start',
  },
  actionBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: {
    borderWidth: 1, borderColor: '#FFD2A6',
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5,
    backgroundColor: '#FFF7EE',
  },
  chipText: { color: '#C25E00', fontSize: 12.5, fontWeight: '500' },
  typingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 10, paddingBottom: 8,
  },
  typingBubble: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FFFFFF', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  typingText: { fontSize: 13, color: '#5E5E5E' },
  composerWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
    backgroundColor: '#FFF4E8',
  },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 8, paddingTop: 6,
    backgroundColor: '#FFF4E8', gap: 8,
  },
  inputHelperText: {
    fontSize: 11,
    color: '#8C6B4E',
    backgroundColor: '#FFF4E8',
    paddingHorizontal: 12,
    paddingTop: 4,
  },
  textInput: {
    flex: 1, minHeight: 44, maxHeight: 120,
    backgroundColor: '#FFFFFF', borderRadius: 24,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 15, color: '#222',
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#F57C00', alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#FFC88F' },
});
