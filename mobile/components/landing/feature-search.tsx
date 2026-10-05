import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { featurePath, searchSeoFeatures } from '@/constants/seo-features';
import { LANDING_BRAND as BRAND } from '@/constants/landing';

type FeatureSearchProps = {
  initialQuery?: string;
  placeholder?: string;
};

export function FeatureSearch({
  initialQuery = '',
  placeholder = 'Search airtime, electricity token, DStv, WAEC…',
}: FeatureSearchProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [open, setOpen] = useState(false);
  const matches = useMemo(() => (query.trim() ? searchSeoFeatures(query).slice(0, 6) : []), [query]);

  const goToQuery = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    const results = searchSeoFeatures(trimmed);
    if (results.length === 1) {
      router.push(featurePath(results[0].slug) as never);
      setOpen(false);
      return;
    }
    router.push(`/search?q=${encodeURIComponent(trimmed)}` as never);
    setOpen(false);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <MaterialIcons name="search" size={20} color={BRAND.muted} />
        <TextInput
          value={query}
          onChangeText={(value) => {
            setQuery(value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onSubmitEditing={goToQuery}
          placeholder={placeholder}
          placeholderTextColor={BRAND.muted}
          style={styles.input}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable style={styles.button} onPress={goToQuery}>
          <ThemedText style={styles.buttonText}>Search</ThemedText>
        </Pressable>
      </View>
      {open && query.trim() && matches.length > 0 ? (
        <View style={styles.menu}>
          {matches.map((feature) => (
            <Pressable
              key={feature.slug}
              style={styles.item}
              onPress={() => {
                setOpen(false);
                router.push(featurePath(feature.slug) as never);
              }}>
              <ThemedText style={styles.itemTitle}>{feature.navTitle}</ThemedText>
              <ThemedText style={styles.itemSummary}>{feature.summary}</ThemedText>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    maxWidth: 560,
    zIndex: 5,
    marginBottom: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: BRAND.border,
    borderRadius: 14,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 6,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: BRAND.navy,
    paddingVertical: 8,
  },
  button: {
    backgroundColor: BRAND.orange,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
  },
  menu: {
    marginTop: 8,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BRAND.border,
    overflow: 'hidden',
  },
  item: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.border,
  },
  itemTitle: {
    color: BRAND.navy,
    fontWeight: '700',
  },
  itemSummary: {
    color: BRAND.muted,
    marginTop: 2,
  },
});
