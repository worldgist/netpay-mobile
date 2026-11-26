import { useCallback, useMemo, useState } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  Modal,
  FlatList,
  Platform,
  Alert,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { buildRouteHref } from '@/utils/router-href';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const PAY_BILLS_TAB: Href = '/(tabs)/pay-bills';
const ORANGE = '#FF7F00';

type TripType = 'one_way' | 'round_trip';

type Airport = {
  code: string;
  name: string;
  city: string;
  country: string;
};

type FlightClass = 'economy' | 'premium_economy' | 'business' | 'first';

type PassengerOption = {
  id: string;
  label: string;
  adults: number;
  children: number;
};

const AIRPORTS: Airport[] = [
  { code: 'ABV', name: 'Nnamdi Azikiwe International Airport', city: 'Abuja', country: 'Nigeria' },
  { code: 'LOS', name: 'Murtala Muhammed International Airport', city: 'Lagos', country: 'Nigeria' },
  { code: 'PHC', name: 'Port Harcourt International Airport', city: 'Port Harcourt', country: 'Nigeria' },
  { code: 'KAN', name: 'Mallam Aminu Kano International Airport', city: 'Kano', country: 'Nigeria' },
  { code: 'ENU', name: 'Akanu Ibiam International Airport', city: 'Enugu', country: 'Nigeria' },
  { code: 'BNI', name: 'Benin Airport', city: 'Benin City', country: 'Nigeria' },
  { code: 'QUO', name: 'Akwa Ibom International Airport', city: 'Uyo', country: 'Nigeria' },
];

const FLIGHT_CLASSES: { id: FlightClass; label: string }[] = [
  { id: 'economy', label: 'Economy' },
  { id: 'premium_economy', label: 'Premium Economy' },
  { id: 'business', label: 'Business' },
  { id: 'first', label: 'First Class' },
];

const PASSENGER_OPTIONS: PassengerOption[] = [
  { id: '1a', label: '1 Adult', adults: 1, children: 0 },
  { id: '2a', label: '2 Adults', adults: 2, children: 0 },
  { id: '3a', label: '3 Adults', adults: 3, children: 0 },
  { id: '4a', label: '4 Adults', adults: 4, children: 0 },
  { id: '1a1c', label: '1 Adult, 1 Child', adults: 1, children: 1 },
  { id: '2a1c', label: '2 Adults, 1 Child', adults: 2, children: 1 },
  { id: '2a2c', label: '2 Adults, 2 Children', adults: 2, children: 2 },
];

const formatFlightDate = (date: Date) =>
  date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

type PickerKind = 'from' | 'to' | 'class' | 'passengers' | null;

function AirportField({
  label,
  airport,
  onPress,
}: {
  label: string;
  airport: Airport;
  onPress: () => void;
}) {
  return (
    <View style={styles.fieldBlock}>
      <ThemedText style={styles.fieldLabel}>{label}</ThemedText>
      <TouchableOpacity style={styles.airportField} onPress={onPress} activeOpacity={0.85}>
        <MaterialIcons name="location-on" size={22} color={ORANGE} />
        <View style={styles.airportTextWrap}>
          <ThemedText style={styles.airportCodeLine} numberOfLines={1}>
            <ThemedText style={styles.airportCode}>{airport.code} </ThemedText>
            {airport.name}
          </ThemedText>
          <ThemedText style={styles.airportCity} numberOfLines={1}>
            {airport.city}, {airport.country}
          </ThemedText>
        </View>
        <MaterialIcons name="keyboard-arrow-down" size={22} color="#9CA3AF" />
      </TouchableOpacity>
    </View>
  );
}

export default function FlightBookingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [tripType, setTripType] = useState<TripType>('one_way');
  const [fromAirport, setFromAirport] = useState<Airport>(AIRPORTS[0]);
  const [toAirport, setToAirport] = useState<Airport>(AIRPORTS[1]);
  const [departureDate, setDepartureDate] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [returnDate, setReturnDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [flightClass, setFlightClass] = useState<FlightClass>('economy');
  const [passengerId, setPassengerId] = useState('1a');
  const [picker, setPicker] = useState<PickerKind>(null);
  const [showDeparturePicker, setShowDeparturePicker] = useState(false);
  const [showReturnPicker, setShowReturnPicker] = useState(false);

  const selectedClass = FLIGHT_CLASSES.find((item) => item.id === flightClass)!;
  const selectedPassengers = PASSENGER_OPTIONS.find((item) => item.id === passengerId)!;

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.navigate(PAY_BILLS_TAB);
  }, [router]);

  const swapAirports = useCallback(() => {
    setFromAirport(toAirport);
    setToAirport(fromAirport);
  }, [fromAirport, toAirport]);

  const handleContinue = useCallback(() => {
    if (fromAirport.code === toAirport.code) {
      Alert.alert('Book Flights', 'Please choose different departure and destination airports.');
      return;
    }

    if (tripType === 'round_trip' && returnDate < departureDate) {
      Alert.alert('Book Flights', 'Return date must be on or after your leaving date.');
      return;
    }

    router.push(buildRouteHref('/flight-results', {
      fromCode: fromAirport.code,
      fromCity: fromAirport.city,
      fromName: fromAirport.name,
      toCode: toAirport.code,
      toCity: toAirport.city,
      toName: toAirport.name,
      departureDate: departureDate.toISOString(),
      returnDate: tripType === 'round_trip' ? returnDate.toISOString() : '',
      tripType,
      flightClass,
      passengers: selectedPassengers.label,
    }));
  }, [
    departureDate,
    flightClass,
    fromAirport,
    returnDate,
    router,
    selectedPassengers.label,
    toAirport,
    tripType,
  ]);

  const pickerOptions = useMemo(() => {
    if (picker === 'from' || picker === 'to') {
      return AIRPORTS.map((airport) => ({
        id: airport.code,
        title: `${airport.code} · ${airport.name}`,
        subtitle: `${airport.city}, ${airport.country}`,
        airport,
      }));
    }
    if (picker === 'class') {
      return FLIGHT_CLASSES.map((item) => ({
        id: item.id,
        title: item.label,
        subtitle: '',
      }));
    }
    if (picker === 'passengers') {
      return PASSENGER_OPTIONS.map((item) => ({
        id: item.id,
        title: item.label,
        subtitle: '',
      }));
    }
    return [];
  }, [picker]);

  const handlePickerSelect = (id: string) => {
    if (picker === 'from' || picker === 'to') {
      const airport = AIRPORTS.find((item) => item.code === id);
      if (!airport) return;
      if (picker === 'from') setFromAirport(airport);
      else setToAirport(airport);
    } else if (picker === 'class') {
      setFlightClass(id as FlightClass);
    } else if (picker === 'passengers') {
      setPassengerId(id);
    }
    setPicker(null);
  };

  const pickerTitle =
    picker === 'from'
      ? 'Select departure'
      : picker === 'to'
        ? 'Select destination'
        : picker === 'class'
          ? 'Select class'
          : picker === 'passengers'
            ? 'Select passengers'
            : '';

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: Math.max(insets.top + 8, 16), paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <TouchableOpacity
            onPress={goBack}
            style={styles.headerCircleButton}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Go back">
            <MaterialIcons name="chevron-left" size={28} color="#374151" />
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <ThemedText style={styles.headerTitle}>Book Flights</ThemedText>
            <ThemedText style={styles.headerSubtitle}>Search and book flights in seconds</ThemedText>
          </View>

          <View style={styles.headerFlightIcon}>
            <MaterialIcons name="flight" size={22} color="#FFFFFF" />
          </View>
        </View>

        <View style={styles.tripToggleRow}>
          <TouchableOpacity
            style={[styles.tripToggle, tripType === 'one_way' && styles.tripToggleActive]}
            onPress={() => setTripType('one_way')}
            activeOpacity={0.85}>
            <MaterialIcons
              name="flight"
              size={18}
              color={tripType === 'one_way' ? ORANGE : '#9CA3AF'}
            />
            <ThemedText style={[styles.tripToggleText, tripType === 'one_way' && styles.tripToggleTextActive]}>
              One way
            </ThemedText>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tripToggle, tripType === 'round_trip' && styles.tripToggleActive]}
            onPress={() => setTripType('round_trip')}
            activeOpacity={0.85}>
            <MaterialIcons
              name="sync"
              size={18}
              color={tripType === 'round_trip' ? ORANGE : '#9CA3AF'}
            />
            <ThemedText style={[styles.tripToggleText, tripType === 'round_trip' && styles.tripToggleTextActive]}>
              Round Trip
            </ThemedText>
          </TouchableOpacity>
        </View>

        <View style={styles.routeSection}>
          <View style={styles.routeFields}>
            <AirportField label="From" airport={fromAirport} onPress={() => setPicker('from')} />
            <AirportField label="To" airport={toAirport} onPress={() => setPicker('to')} />
          </View>
          <TouchableOpacity style={styles.swapButton} onPress={swapAirports} activeOpacity={0.85}>
            <MaterialIcons name="swap-vert" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <View style={styles.fieldBlock}>
          <ThemedText style={styles.fieldLabel}>Leaving Date</ThemedText>
          <TouchableOpacity
            style={styles.dateField}
            onPress={() => setShowDeparturePicker(true)}
            activeOpacity={0.85}>
            <MaterialIcons name="calendar-today" size={20} color={ORANGE} />
            <ThemedText style={styles.dateFieldText}>{formatFlightDate(departureDate)}</ThemedText>
            <MaterialIcons name="keyboard-arrow-down" size={22} color="#9CA3AF" />
          </TouchableOpacity>
        </View>

        {tripType === 'round_trip' ? (
          <View style={styles.fieldBlock}>
            <ThemedText style={styles.fieldLabel}>Return Date</ThemedText>
            <TouchableOpacity
              style={styles.dateField}
              onPress={() => setShowReturnPicker(true)}
              activeOpacity={0.85}>
              <MaterialIcons name="calendar-today" size={20} color={ORANGE} />
              <ThemedText style={styles.dateFieldText}>{formatFlightDate(returnDate)}</ThemedText>
              <MaterialIcons name="keyboard-arrow-down" size={22} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.splitRow}>
          <View style={styles.splitCol}>
            <ThemedText style={styles.fieldLabel}>Select Class</ThemedText>
            <TouchableOpacity
              style={styles.compactField}
              onPress={() => setPicker('class')}
              activeOpacity={0.85}>
              <MaterialIcons name="airline-seat-recline-normal" size={20} color={ORANGE} />
              <ThemedText style={styles.compactFieldText} numberOfLines={1}>
                {selectedClass.label}
              </ThemedText>
              <MaterialIcons name="keyboard-arrow-down" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          <View style={styles.splitCol}>
            <ThemedText style={styles.fieldLabel}>Passengers</ThemedText>
            <TouchableOpacity
              style={styles.compactField}
              onPress={() => setPicker('passengers')}
              activeOpacity={0.85}>
              <MaterialIcons name="person-outline" size={20} color={ORANGE} />
              <ThemedText style={styles.compactFieldText} numberOfLines={1}>
                {selectedPassengers.label}
              </ThemedText>
              <MaterialIcons name="keyboard-arrow-down" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity style={styles.continueButton} onPress={handleContinue} activeOpacity={0.9}>
          <ThemedText style={styles.continueButtonText}>Continue</ThemedText>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.securityBanner}
          activeOpacity={0.85}
          onPress={() => router.push('/privacy-policy')}>
          <View style={styles.securityIconWrap}>
            <MaterialIcons name="verified-user" size={22} color="#FFFFFF" />
          </View>
          <View style={styles.securityTextWrap}>
            <ThemedText style={styles.securityTitle}>Safe & Secure Booking</ThemedText>
            <ThemedText style={styles.securitySubtitle}>
              Your payments and personal details are protected with bank-level security.
            </ThemedText>
          </View>
          <MaterialIcons name="chevron-right" size={22} color={ORANGE} />
        </TouchableOpacity>
      </ScrollView>

      {showDeparturePicker ? (
        <DateTimePicker
          value={departureDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          minimumDate={new Date()}
          onChange={(event, date) => {
            if (Platform.OS !== 'ios') setShowDeparturePicker(false);
            if (event.type === 'dismissed') {
              setShowDeparturePicker(false);
              return;
            }
            if (date) {
              setDepartureDate(date);
              if (returnDate < date) {
                const nextReturn = new Date(date);
                nextReturn.setDate(nextReturn.getDate() + 1);
                setReturnDate(nextReturn);
              }
              if (Platform.OS === 'ios') setShowDeparturePicker(false);
            }
          }}
        />
      ) : null}

      {showReturnPicker ? (
        <DateTimePicker
          value={returnDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          minimumDate={departureDate}
          onChange={(event, date) => {
            if (Platform.OS !== 'ios') setShowReturnPicker(false);
            if (event.type === 'dismissed') {
              setShowReturnPicker(false);
              return;
            }
            if (date) {
              setReturnDate(date);
              if (Platform.OS === 'ios') setShowReturnPicker(false);
            }
          }}
        />
      ) : null}

      <Modal visible={picker !== null} transparent animationType="fade" onRequestClose={() => setPicker(null)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setPicker(null)}>
          <View style={styles.modalSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>{pickerTitle}</ThemedText>
              <TouchableOpacity onPress={() => setPicker(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MaterialIcons name="close" size={24} color="#374151" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={pickerOptions}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.modalOption} onPress={() => handlePickerSelect(item.id)} activeOpacity={0.8}>
                  <View style={styles.modalOptionText}>
                    <ThemedText style={styles.modalOptionTitle}>{item.title}</ThemedText>
                    {item.subtitle ? (
                      <ThemedText style={styles.modalOptionSubtitle}>{item.subtitle}</ThemedText>
                    ) : null}
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color="#D1D5DB" />
                </TouchableOpacity>
              )}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 24,
    gap: 12,
  },
  headerCircleButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#F0F0F0',
  },
  headerCenter: {
    flex: 1,
    paddingTop: 2,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#9CA3AF',
    lineHeight: 18,
  },
  headerFlightIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripToggleRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 22,
  },
  tripToggle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  tripToggleActive: {
    borderColor: ORANGE,
    backgroundColor: '#FFF8F2',
  },
  tripToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  tripToggleTextActive: {
    color: ORANGE,
  },
  routeSection: {
    position: 'relative',
    marginBottom: 8,
  },
  routeFields: {
    paddingRight: 28,
  },
  swapButton: {
    position: 'absolute',
    right: 0,
    top: '50%',
    marginTop: -4,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: ORANGE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  fieldBlock: {
    marginBottom: 18,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 10,
  },
  airportField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  airportTextWrap: {
    flex: 1,
  },
  airportCodeLine: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
    marginBottom: 2,
  },
  airportCode: {
    fontWeight: '700',
    color: '#111827',
  },
  airportCity: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  dateField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  dateFieldText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  splitRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  splitCol: {
    flex: 1,
  },
  compactField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 16,
  },
  compactFieldText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  continueButton: {
    backgroundColor: ORANGE,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: ORANGE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 4,
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  securityBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFF8F2',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FFE4CC',
  },
  securityIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  securityTextWrap: {
    flex: 1,
  },
  securityTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: ORANGE,
    marginBottom: 4,
  },
  securitySubtitle: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 17,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F3F4F6',
  },
  modalOptionText: {
    flex: 1,
    paddingRight: 8,
  },
  modalOptionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  modalOptionSubtitle: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
  },
});
