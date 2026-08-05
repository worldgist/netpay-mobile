import { useMemo } from 'react';
import { StyleSheet, View, ScrollView, TouchableOpacity } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  formatDuration,
  formatFlightCurrency,
  getAirport,
  getFlightById,
} from '@/utils/flight-data';

const ORANGE = '#FF7F00';

const CLASS_LABELS: Record<string, string> = {
  economy: 'Economy',
  premium_economy: 'Premium Economy',
  business: 'Business',
  first: 'First Class',
};

export default function FlightDetailsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    flightId: string;
    fromCode: string;
    fromCity: string;
    fromName: string;
    toCode: string;
    toCity: string;
    toName: string;
    departureDate: string;
    passengers: string;
    flightClass: string;
  }>();

  const fromCode = params.fromCode || 'ABV';
  const toCode = params.toCode || 'LOS';
  const fromCity = params.fromCity || getAirport(fromCode).city;
  const toCity = params.toCity || getAirport(toCode).city;
  const fromName = params.fromName || getAirport(fromCode).name;
  const toName = params.toName || getAirport(toCode).name;
  const passengers = params.passengers || '1 Adult';
  const cabinClass = CLASS_LABELS[params.flightClass || 'economy'] || 'Economy';

  const departureDate = useMemo(() => {
    const parsed = params.departureDate ? new Date(params.departureDate) : new Date();
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }, [params.departureDate]);

  const flight = useMemo(
    () => getFlightById(params.flightId || '', fromCode, toCode, departureDate),
    [departureDate, fromCode, params.flightId, toCode]
  );

  if (!flight) {
    return (
      <ThemedView style={styles.container}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top + 8, 16) }]}>
          <TouchableOpacity style={styles.headerBack} onPress={() => router.back()} activeOpacity={0.8}>
            <MaterialIcons name="chevron-left" size={28} color="#374151" />
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>Flight Details</ThemedText>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.missingState}>
          <ThemedText style={styles.missingText}>Flight not found.</ThemedText>
        </View>
      </ThemedView>
    );
  }

  const handleContinue = () => {
    router.push({
      pathname: '/flight-traveller-info',
      params: {
        flightId: params.flightId || flight.id,
        fromCode,
        fromCity,
        fromName,
        toCode,
        toCity,
        toName,
        departureDate: departureDate.toISOString(),
        passengers,
        flightClass: params.flightClass || 'economy',
      },
    });
  };

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top + 8, 16) }]}>
        <TouchableOpacity style={styles.headerBack} onPress={() => router.back()} activeOpacity={0.8}>
          <MaterialIcons name="chevron-left" size={28} color="#374151" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <ThemedText style={styles.headerTitle}>Flight Details</ThemedText>
          <View style={styles.headerDash} />
        </View>
        <TouchableOpacity
          style={styles.fareRulesButton}
          onPress={() =>
            router.push({
              pathname: '/flight-fare-rules',
              params: {
                flightId: params.flightId || flight.id,
                fromCode,
                toCode,
                departureDate: departureDate.toISOString(),
                flightClass: params.flightClass || 'economy',
              },
            })
          }
          activeOpacity={0.85}>
          <MaterialIcons name="info-outline" size={16} color={ORANGE} />
          <ThemedText style={styles.fareRulesText}>Fare Rules</ThemedText>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <View style={styles.airlineRow}>
            <View style={styles.airlineLogo}>
              <MaterialIcons name="flight" size={24} color="#FFFFFF" />
            </View>
            <View style={styles.airlineInfo}>
              <ThemedText style={styles.airlineName}>{flight.airline}</ThemedText>
              <ThemedText style={styles.airlineMeta}>
                {flight.stops === 0 ? 'Non stop' : `${flight.stops} stop`} • {flight.flightNumber}
              </ThemedText>
            </View>
            <View style={styles.classBadge}>
              <MaterialIcons name="airline-seat-recline-normal" size={14} color={ORANGE} />
              <ThemedText style={styles.classBadgeText}>{cabinClass}</ThemedText>
            </View>
          </View>
          <View style={styles.bookingMetaRow}>
            <MaterialIcons name="work-outline" size={16} color={ORANGE} />
            <ThemedText style={styles.bookingMetaText}>
              Booking Class: {flight.bookingClass} | {flight.baggage}
            </ThemedText>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.routeRow}>
            <View style={styles.routeCol}>
              <View style={styles.codePill}>
                <ThemedText style={styles.codePillText}>{fromCode}</ThemedText>
              </View>
              <ThemedText style={styles.routeCity}>{fromCity}</ThemedText>
              <ThemedText style={styles.routeAirport}>{fromName}</ThemedText>
            </View>
            <View style={styles.routeMiddle}>
              <View style={styles.routeMiddleLine} />
              <View style={styles.routePlaneCircle}>
                <MaterialIcons name="flight" size={18} color="#FFFFFF" />
              </View>
              <ThemedText style={styles.routeDuration}>{formatDuration(flight.durationMinutes)}</ThemedText>
            </View>
            <View style={[styles.routeCol, styles.routeColRight]}>
              <View style={styles.codePill}>
                <ThemedText style={styles.codePillText}>{toCode}</ThemedText>
              </View>
              <ThemedText style={styles.routeCity}>{toCity}</ThemedText>
              <ThemedText style={styles.routeAirport}>{toName}</ThemedText>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.detailRow}>
            <View style={styles.detailCol}>
              <ThemedText style={styles.detailValue}>{flight.departureDateLabel}</ThemedText>
              <ThemedText style={styles.detailLabel}>Departure time</ThemedText>
            </View>
            <View style={[styles.detailCol, styles.detailColRight]}>
              <ThemedText style={styles.detailValue}>{flight.arrivalDateLabel}</ThemedText>
              <ThemedText style={styles.detailLabel}>Arrival time</ThemedText>
            </View>
          </View>

          <View style={styles.dashedDivider} />

          <View style={styles.detailRow}>
            <View style={styles.detailCol}>
              <ThemedText style={styles.detailLabel}>Ticket price</ThemedText>
              <ThemedText style={styles.ticketPrice}>{formatFlightCurrency(flight.ticketPrice)}</ThemedText>
            </View>
            <View style={[styles.detailCol, styles.detailColRight]}>
              <ThemedText style={styles.detailLabel}>Trip Total</ThemedText>
              <ThemedText style={styles.detailValue}>{formatDuration(flight.durationMinutes)}</ThemedText>
            </View>
          </View>

          <View style={styles.dashedDivider} />

          <View style={styles.detailRow}>
            <View style={styles.detailCol}>
              <ThemedText style={styles.detailLabel}>Is Refundable</ThemedText>
              <ThemedText style={styles.detailValue}>{flight.refundable ? 'Yes' : 'No'}</ThemedText>
            </View>
          </View>

          <View style={styles.dashedDivider} />

          <View style={styles.detailRow}>
            <View style={styles.detailCol}>
              <ThemedText style={styles.detailLabel}>Boarding point</ThemedText>
              <ThemedText style={styles.detailLongValue}>
                {fromCity} ({fromName})
              </ThemedText>
            </View>
          </View>

          <View style={styles.dashedDivider} />

          <View style={styles.detailRow}>
            <View style={styles.detailCol}>
              <ThemedText style={styles.detailLabel}>Arrival point</ThemedText>
              <ThemedText style={styles.detailLongValue}>
                {toCity} ({toName})
              </ThemedText>
            </View>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom + 12, 20) }]}>
        <TouchableOpacity style={styles.continueButton} onPress={handleContinue} activeOpacity={0.9}>
          <ThemedText style={styles.continueButtonText}>Continue</ThemedText>
        </TouchableOpacity>
      </View>
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
    width: 72,
  },
  fareRulesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 4,
  },
  fareRulesText: {
    fontSize: 12,
    fontWeight: '600',
    color: ORANGE,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 14,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ECECEC',
  },
  airlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  airlineLogo: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  airlineInfo: {
    flex: 1,
  },
  airlineName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 2,
  },
  airlineMeta: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  classBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF3E8',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  classBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: ORANGE,
  },
  bookingMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bookingMetaText: {
    fontSize: 12,
    fontWeight: '600',
    color: ORANGE,
    flex: 1,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  routeCol: {
    flex: 1,
  },
  routeColRight: {
    alignItems: 'flex-end',
  },
  codePill: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFF3E8',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 6,
  },
  codePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: ORANGE,
  },
  routeCity: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  routeAirport: {
    fontSize: 11,
    color: '#9CA3AF',
    lineHeight: 16,
  },
  routeMiddle: {
    width: 72,
    alignItems: 'center',
    paddingTop: 8,
  },
  routeMiddleLine: {
    position: 'absolute',
    top: 22,
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#D1D5DB',
  },
  routePlaneCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  routeDuration: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  detailCol: {
    flex: 1,
  },
  detailColRight: {
    alignItems: 'flex-end',
  },
  detailValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  detailLongValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    lineHeight: 20,
  },
  detailLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 4,
  },
  ticketPrice: {
    fontSize: 22,
    fontWeight: '700',
    color: ORANGE,
  },
  dashedDivider: {
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#E5E7EB',
    marginVertical: 14,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
  },
  continueButton: {
    backgroundColor: ORANGE,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  missingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  missingText: {
    fontSize: 15,
    color: '#6B7280',
  },
});
