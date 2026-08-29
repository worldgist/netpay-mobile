import { useMemo, useState } from 'react';
import { StyleSheet, View, ScrollView, TouchableOpacity, FlatList, Alert, Text } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { buildRouteHref } from '@/utils/router-href';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  formatFlightCurrency,
  getAirport,
  searchFlights,
  sortFlights,
  type FlightOffer,
  type FlightSort,
} from '@/utils/flight-data';

const ORANGE = '#FF7F00';

const SORT_OPTIONS: { id: FlightSort; label: string; icon: keyof typeof MaterialIcons.glyphMap }[] = [
  { id: 'cheapest', label: 'Cheapest', icon: 'local-offer' },
  { id: 'fastest', label: 'Fastest', icon: 'bolt' },
  { id: 'earliest', label: 'Earliest', icon: 'schedule' },
  { id: 'direct', label: 'Direct', icon: 'remove-circle-outline' },
];

function AirlineBadge({ airline }: { airline: string }) {
  const initial = airline.charAt(0).toUpperCase();
  return (
    <View style={styles.airlineBadge}>
      <ThemedText style={styles.airlineBadgeText}>{initial}</ThemedText>
    </View>
  );
}

function FlightCard({
  flight,
  fromCode,
  fromCity,
  toCode,
  toCity,
  showCheapest,
  onViewDetail,
}: {
  flight: FlightOffer;
  fromCode: string;
  fromCity: string;
  toCode: string;
  toCity: string;
  showCheapest: boolean;
  onViewDetail: () => void;
}) {
  return (
    <View style={styles.flightCard}>
      {showCheapest ? (
        <View style={styles.cheapestBadge}>
          <MaterialIcons name="local-offer" size={12} color="#FFFFFF" />
          <ThemedText style={styles.cheapestBadgeText}>Cheapest</ThemedText>
        </View>
      ) : null}

      <View style={styles.routeTopRow}>
        <View style={styles.routeSide}>
          <ThemedText style={styles.routeCode}>{fromCode}</ThemedText>
          <ThemedText style={styles.routeCity}>{fromCity}</ThemedText>
        </View>
        <View style={styles.routeSideRight}>
          <ThemedText style={styles.routeCode}>{toCode}</ThemedText>
          <ThemedText style={styles.routeCity}>{toCity}</ThemedText>
        </View>
      </View>

      <View style={styles.flightPathRow}>
        <AirlineBadge airline={flight.airline} />
        <View style={styles.pathLineWrap}>
          <View style={styles.pathLine} />
          <View style={styles.pathPlaneCircle}>
            <MaterialIcons name="flight" size={16} color="#FFFFFF" />
          </View>
        </View>
        <ThemedText style={styles.stopsText}>
          {flight.stops === 0 ? '0 stop' : `${flight.stops} stop${flight.stops > 1 ? 's' : ''}`}
        </ThemedText>
      </View>

      <View style={styles.flightMetaRow}>
        <View style={styles.metaBlock}>
          <ThemedText style={styles.metaLabel}>Depart</ThemedText>
          <ThemedText style={styles.metaValue}>{flight.departureTime}</ThemedText>
          <ThemedText style={styles.priceValue}>{formatFlightCurrency(flight.listPrice)}</ThemedText>
          <ThemedText style={styles.priceLabel}>Ticket price</ThemedText>
        </View>
        <View style={[styles.metaBlock, styles.metaBlockRight]}>
          <ThemedText style={styles.metaLabel}>Airline</ThemedText>
          <ThemedText style={styles.metaValue}>{flight.airline}</ThemedText>
          <TouchableOpacity style={styles.viewDetailButton} onPress={onViewDetail} activeOpacity={0.8}>
            <ThemedText style={styles.viewDetailText}>View Detail</ThemedText>
            <MaterialIcons name="chevron-right" size={18} color={ORANGE} />
          </TouchableOpacity>
        </View>
      </View>

      {flight.moreFlightsCount ? (
        <TouchableOpacity style={styles.moreFlightsBar} activeOpacity={0.85}>
          <ThemedText style={styles.moreFlightsText}>
            +{flight.moreFlightsCount} {flight.airline} Flights
          </ThemedText>
          <MaterialIcons name="chevron-right" size={18} color={ORANGE} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export default function FlightResultsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    fromCode: string;
    fromCity: string;
    fromName: string;
    toCode: string;
    toCity: string;
    toName: string;
    departureDate: string;
    passengers: string;
    flightClass: string;
    tripType: string;
  }>();

  const [sort, setSort] = useState<FlightSort>('cheapest');

  const fromCode = params.fromCode || 'ABV';
  const toCode = params.toCode || 'LOS';
  const fromCity = params.fromCity || getAirport(fromCode).city;
  const toCity = params.toCity || getAirport(toCode).city;
  const passengers = params.passengers || '1 Adult';
  const departureDate = useMemo(() => {
    const parsed = params.departureDate ? new Date(params.departureDate) : new Date();
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }, [params.departureDate]);

  const departureLabel = useMemo(
    () =>
      departureDate.toLocaleDateString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
    [departureDate]
  );

  const flights = useMemo(() => {
    const results = searchFlights(fromCode, toCode, departureDate);
    return sortFlights(results, sort);
  }, [departureDate, fromCode, sort, toCode]);

  const cheapestId = useMemo(() => {
    const sorted = sortFlights(searchFlights(fromCode, toCode, departureDate), 'cheapest');
    return sorted[0]?.id;
  }, [departureDate, fromCode, toCode]);

  const openDetails = (flight: FlightOffer) => {
    router.push(buildRouteHref('/flight-details', {
      flightId: flight.id,
      fromCode,
      fromCity,
      fromName: params.fromName || getAirport(fromCode).name,
      toCode,
      toCity,
      toName: params.toName || getAirport(toCode).name,
      departureDate: departureDate.toISOString(),
      passengers,
      flightClass: params.flightClass || 'economy',
    }));
  };

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top + 8, 16) }]}>
        <TouchableOpacity style={styles.headerBack} onPress={() => router.back()} activeOpacity={0.8}>
          <MaterialIcons name="chevron-left" size={28} color="#374151" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <ThemedText style={styles.headerTitle}>Active Flights</ThemedText>
          <ThemedText style={styles.headerSubtitle}>
            Departure • {departureLabel} • {passengers}
          </ThemedText>
        </View>
        <TouchableOpacity
          style={styles.filterButton}
          onPress={() => Alert.alert('Filters', 'Advanced flight filters will be available soon.')}
          activeOpacity={0.85}>
          <MaterialIcons name="tune" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <View style={styles.sortSection}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.sortRow}
          style={styles.sortScroll}>
          {SORT_OPTIONS.map((option, index) => {
            const active = sort === option.id;
            const isLast = index === SORT_OPTIONS.length - 1;
            return (
              <TouchableOpacity
                key={option.id}
                style={[styles.sortChip, active && styles.sortChipActive, isLast && styles.sortChipLast]}
                onPress={() => setSort(option.id)}
                activeOpacity={0.85}>
                <MaterialIcons name={option.icon} size={16} color={active ? ORANGE : '#6B7280'} />
                <Text style={[styles.sortChipText, active && styles.sortChipTextActive]}>{option.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        data={flights}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MaterialIcons name="flight" size={48} color="#D1D5DB" />
            <ThemedText style={styles.emptyTitle}>No flights found</ThemedText>
            <ThemedText style={styles.emptySubtitle}>Try another date or route.</ThemedText>
          </View>
        }
        renderItem={({ item }) => (
          <FlightCard
            flight={item}
            fromCode={fromCode}
            fromCity={fromCity}
            toCode={toCode}
            toCity={toCity}
            showCheapest={sort === 'cheapest' && item.id === cheapestId}
            onViewDetail={() => openDetails(item)}
          />
        )}
      />
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
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 10,
    backgroundColor: '#FFFFFF',
  },
  headerBack: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    paddingTop: 2,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#9CA3AF',
    lineHeight: 17,
  },
  filterButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortSection: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
    paddingTop: 4,
    paddingBottom: 12,
  },
  sortScroll: {
    flexGrow: 0,
  },
  sortRow: {
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  sortChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 42,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    marginRight: 10,
    flexShrink: 0,
  },
  sortChipLast: {
    marginRight: 16,
  },
  sortChipActive: {
    borderColor: ORANGE,
    backgroundColor: '#FFF8F2',
  },
  sortChipText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
    color: '#374151',
    includeFontPadding: false,
  },
  sortChipTextActive: {
    color: ORANGE,
  },
  listContent: {
    padding: 16,
    gap: 14,
  },
  flightCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ECECEC',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 14,
  },
  cheapestBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#22C55E',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    zIndex: 1,
  },
  cheapestBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  routeTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
    marginTop: 8,
  },
  routeSide: {
    flex: 1,
  },
  routeSideRight: {
    flex: 1,
    alignItems: 'flex-end',
  },
  routeCode: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 2,
  },
  routeCity: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  flightPathRow: {
    alignItems: 'center',
    marginBottom: 16,
  },
  airlineBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFF3E8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  airlineBadgeText: {
    fontSize: 18,
    fontWeight: '700',
    color: ORANGE,
  },
  pathLineWrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    height: 28,
    marginBottom: 4,
  },
  pathLine: {
    position: 'absolute',
    left: 24,
    right: 24,
    top: 13,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#D1D5DB',
  },
  pathPlaneCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopsText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  flightMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  metaBlock: {
    flex: 1,
  },
  metaBlockRight: {
    alignItems: 'flex-end',
  },
  metaLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 10,
  },
  priceValue: {
    fontSize: 18,
    fontWeight: '700',
    color: ORANGE,
    marginBottom: 2,
  },
  priceLabel: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  viewDetailButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  viewDetailText: {
    fontSize: 13,
    fontWeight: '600',
    color: ORANGE,
  },
  moreFlightsBar: {
    marginTop: 14,
    marginHorizontal: -16,
    marginBottom: -16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    backgroundColor: '#FFF8F2',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  moreFlightsText: {
    fontSize: 13,
    fontWeight: '600',
    color: ORANGE,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#374151',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#9CA3AF',
  },
});
