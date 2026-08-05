import { useMemo } from 'react';
import { StyleSheet, View, ScrollView, TouchableOpacity } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getAirport,
  getFareRulesForFlight,
  getFlightById,
} from '@/utils/flight-data';

const ORANGE = '#FF7F00';

const CLASS_LABELS: Record<string, string> = {
  economy: 'Economy',
  premium_economy: 'Premium Economy',
  business: 'Business',
  first: 'First Class',
};

export default function FlightFareRulesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    flightId: string;
    fromCode: string;
    toCode: string;
    departureDate: string;
    flightClass: string;
  }>();

  const fromCode = params.fromCode || 'ABV';
  const toCode = params.toCode || 'LOS';
  const cabinClass = CLASS_LABELS[params.flightClass || 'economy'] || 'Economy';

  const departureDate = useMemo(() => {
    const parsed = params.departureDate ? new Date(params.departureDate) : new Date();
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }, [params.departureDate]);

  const flight = useMemo(
    () => getFlightById(params.flightId || '', fromCode, toCode, departureDate),
    [departureDate, fromCode, params.flightId, toCode]
  );

  const sections = useMemo(() => {
    if (!flight) return [];
    return getFareRulesForFlight(flight, cabinClass, fromCode, toCode);
  }, [cabinClass, flight, fromCode, toCode]);

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top + 8, 16) }]}>
        <TouchableOpacity style={styles.headerBack} onPress={() => router.back()} activeOpacity={0.8}>
          <MaterialIcons name="chevron-left" size={28} color="#374151" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <ThemedText style={styles.headerTitle}>Fare Rules</ThemedText>
          <View style={styles.headerDash} />
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {!flight ? (
        <View style={styles.missingState}>
          <ThemedText style={styles.missingText}>Fare rules are unavailable for this flight.</ThemedText>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}>
          <View style={styles.summaryCard}>
            <View style={styles.summaryIconWrap}>
              <MaterialIcons name="info-outline" size={22} color="#FFFFFF" />
            </View>
            <View style={styles.summaryTextWrap}>
              <ThemedText style={styles.summaryTitle}>
                {flight.airline} • {flight.flightNumber}
              </ThemedText>
              <ThemedText style={styles.summarySubtitle}>
                {fromCode} ({getAirport(fromCode).city}) → {toCode} ({getAirport(toCode).city})
              </ThemedText>
            </View>
          </View>

          {sections.map((section) => (
            <View key={section.title} style={styles.sectionCard}>
              <ThemedText style={styles.sectionTitle}>{section.title}</ThemedText>
              {section.items.map((item) => (
                <View key={item} style={styles.ruleRow}>
                  <View style={styles.ruleBullet} />
                  <ThemedText style={styles.ruleText}>{item}</ThemedText>
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F6F8',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    gap: 8,
  },
  headerBack: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  headerDash: {
    width: 28,
    height: 3,
    borderRadius: 2,
    backgroundColor: ORANGE,
    marginTop: 6,
  },
  headerSpacer: {
    width: 40,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 14,
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#FFF8F2',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FFE4CC',
  },
  summaryIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryTextWrap: {
    flex: 1,
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  summarySubtitle: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ECECEC',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  ruleBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: ORANGE,
    marginTop: 7,
  },
  ruleText: {
    flex: 1,
    fontSize: 13,
    color: '#4B5563',
    lineHeight: 20,
  },
  missingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  missingText: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
  },
});
