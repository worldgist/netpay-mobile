import { StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';
import { ThemedText } from '@/components/themed-text';

function InlineText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**') ? (
          <Text key={i} style={styles.bold}>
            {part.slice(2, -2)}
          </Text>
        ) : (
          <Text key={i}>{part}</Text>
        ),
      )}
    </>
  );
}

export function MarkdownContent({ content }: { content: string }) {
  const lines = content.split('\n');
  const elements: ReactNode[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length === 0) return;
    const items = listItems;
    listItems = [];
    elements.push(
      <View key={`list-${elements.length}`} style={styles.list}>
        {items.map((item, idx) => (
          <View key={idx} style={styles.listRow}>
            <ThemedText style={styles.bullet}>•</ThemedText>
            <ThemedText style={[styles.body, styles.listText]}>
              <InlineText text={item} />
            </ThemedText>
          </View>
        ))}
      </View>,
    );
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      elements.push(<View key={`space-${index}`} style={styles.spacer} />);
      return;
    }

    if (trimmed.startsWith('# ')) {
      flushList();
      elements.push(
        <ThemedText key={index} style={styles.h1}>
          {trimmed.slice(2)}
        </ThemedText>,
      );
      return;
    }

    if (trimmed.startsWith('## ')) {
      flushList();
      elements.push(
        <ThemedText key={index} style={styles.h2}>
          {trimmed.slice(3)}
        </ThemedText>,
      );
      return;
    }

    if (trimmed.startsWith('### ')) {
      flushList();
      elements.push(
        <ThemedText key={index} style={styles.h3}>
          {trimmed.slice(4)}
        </ThemedText>,
      );
      return;
    }

    if (trimmed.startsWith('#### ')) {
      flushList();
      elements.push(
        <ThemedText key={index} style={styles.h4}>
          {trimmed.slice(5)}
        </ThemedText>,
      );
      return;
    }

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      listItems.push(trimmed.slice(2));
      return;
    }

    flushList();
    elements.push(
      <ThemedText key={index} style={styles.body}>
        <InlineText text={trimmed} />
      </ThemedText>,
    );
  });

  flushList();

  return <View style={styles.root}>{elements}</View>;
}

const styles = StyleSheet.create({
  root: {
    gap: 4,
  },
  spacer: {
    height: 8,
  },
  h1: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A2B4A',
    marginBottom: 8,
    marginTop: 4,
  },
  h2: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FF7F00',
    marginBottom: 8,
    marginTop: 12,
  },
  h3: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1A2B4A',
    marginBottom: 6,
    marginTop: 10,
  },
  h4: {
    fontSize: 15,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 4,
    marginTop: 8,
  },
  body: {
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
    marginBottom: 8,
  },
  bold: {
    fontWeight: '700',
  },
  list: {
    marginBottom: 8,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
    paddingLeft: 4,
  },
  bullet: {
    fontSize: 15,
    color: '#333',
    marginRight: 8,
    lineHeight: 22,
  },
  listText: {
    flex: 1,
    marginBottom: 0,
  },
});
