import { useMemo, useState, useCallback } from 'react';
import { StyleSheet, View, ScrollView, TouchableOpacity, Alert, Text, ActivityIndicator } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  formatDuration,
  formatPhoneDisplay,
  getAirport,
  getFlightById,
} from '@/utils/flight-data';
import {
  downloadFlightReceipt,
  shareFlightReceipt,
  type FlightReceiptData,
} from '@/utils/flight-receipt';

const ORANGE = '#FF7F00';
const GREEN = '#22C55E';

const CLASS_LABELS: Record<string, string> = {
  economy: 'Economy',
  premium_economy: 'Premium Economy',
  business: 'Business',
  first: 'First Class',
};

export default function FlightBookingSuccessScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [downloading, setDownloading] = useState(false);
  const [sharing, setSharing] = useState(false);
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
    title: string;
    firstName: string;
    middleName: string;
    lastName: string;
    email: string;
    phoneCode: string;
    phoneNumber: string;
    bookingReference: string;
    bookingDate: string;
  }>();

  const fromCode = params.fromCode || 'ABV';
  const toCode = params.toCode || 'LOS';
  const fromCity = params.fromCity || getAirport(fromCode).city;
  const toCity = params.toCity || getAirport(toCode).city;
  const fromName = params.fromName || getAirport(fromCode).name;
  const toName = params.toName || getAirport(toCode).name;
  const passengers = params.passengers || '1 Adult';
  const cabinClass = CLASS_LABELS[params.flightClass || 'economy'] || 'Economy';
  const email = params.email || '';
  const bookingReference = params.bookingReference || 'NPF-000000-XXX';

  const passengerName = [params.title, params.firstName, params.middleName, params.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();

  const phoneDisplay = formatPhoneDisplay(params.phoneCode || '+234', params.phoneNumber || '');

  const bookedAt = useMemo(() => {
    const parsed = params.bookingDate ? new Date(params.bookingDate) : new Date();
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }, [params.bookingDate]);

  const bookingDateLabel = bookedAt.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const bookingTimeLabel = bookedAt.toLocaleTimeString('en-GB', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const departureDate = useMemo(() => {
    const parsed = params.departureDate ? new Date(params.departureDate) : new Date();
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }, [params.departureDate]);

  const flight = useMemo(
    () => getFlightById(params.flightId || '', fromCode, toCode, departureDate),
    [departureDate, fromCode, params.flightId, toCode]
  );

  const receiptData = useMemo<FlightReceiptData>(
    () => ({
      bookingReference,
      bookingDateLabel,
      bookingTimeLabel,
      fromCode,
      fromCity,
      fromName,
      toCode,
      toCity,
      toName,
      passengers,
      cabinClass,
      passengerName: passengerName || 'Passenger',
      email,
      phoneDisplay,
      airline: flight?.airline,
      flightNumber: flight?.flightNumber,
      departureDateLabel: flight?.departureDateLabel,
      arrivalDateLabel: flight?.arrivalDateLabel,
      durationMinutes: flight?.durationMinutes,
      stops: flight?.stops,
      bookingClass: flight?.bookingClass,
      baggage: flight?.baggage,
      ticketPrice: flight?.ticketPrice,
    }),
    [
      bookingDateLabel,
      bookingReference,
      bookingTimeLabel,
      cabinClass,
      email,
      flight,
      fromCity,
      fromCode,
      fromName,
      passengerName,
      passengers,
      phoneDisplay,
      toCity,
      toCode,
      toName,
    ]
  );

  const handleShare = useCallback(async () => {
    if (sharing) return;
    setSharing(true);
    try {
      await shareFlightReceipt(receiptData);
    } finally {
      setSharing(false);
    }
  }, [receiptData, sharing]);

  const handleDownload = useCallback(async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadFlightReceipt(receiptData);
    } finally {
      setDownloading(false);
    }
  }, [downloading, receiptData]);

  const handleViewTicket = () => {
    Alert.alert(
      'E-Ticket',
      `Booking Reference: ${bookingReference}\n\nYour e-ticket has been sent to ${email}.`
    );
  };

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top + 8, 16) }]}>
        <TouchableOpacity
          style={styles.headerBack}
          onPress={() => router.replace('/(tabs)')}
          activeOpacity={0.8}>
          <MaterialIcons name="chevron-left" size={28} color="#374151" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Booking Successful</ThemedText>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.successHero}>
          <View style={styles.confettiWrap}>
            <View style={[styles.confetti, styles.confettiGreen, { top: 8, left: 24 }]} />
            <View style={[styles.confetti, styles.confettiOrange, { top: 4, right: 28 }]} />
            <View style={[styles.confetti, styles.confettiYellow, { bottom: 10, left: 40 }]} />
            <View style={[styles.confetti, styles.confettiOrange, { bottom: 8, right: 36 }]} />
            <View style={styles.successCircle}>
              <MaterialIcons name="check" size={42} color="#FFFFFF" />
            </View>
          </View>
          <ThemedText style={styles.successTitle}>Your flight is booked!</ThemedText>
          <Text style={styles.successSubtitle}>
            Your e-ticket has been sent to{' '}
            <Text style={styles.successEmail}>{email || 'your email address'}</Text>
          </Text>
        </View>

        <View style={styles.referenceCard}>
          <View style={styles.referenceCol}>
            <View style={[styles.referenceIcon, { backgroundColor: '#DCFCE7' }]}>
              <MaterialIcons name="confirmation-number" size={20} color={GREEN} />
            </View>
            <View style={styles.referenceTextWrap}>
              <ThemedText style={styles.referenceLabel}>Booking Reference</ThemedText>
              <Text style={styles.referenceValue}>{bookingReference}</Text>
            </View>
          </View>
          <View style={styles.referenceDivider} />
          <View style={styles.referenceCol}>
            <View style={[styles.referenceIcon, { backgroundColor: '#DCFCE7' }]}>
              <MaterialIcons name="event" size={20} color={GREEN} />
            </View>
            <View style={styles.referenceTextWrap}>
              <ThemedText style={styles.referenceLabel}>Booking Date</ThemedText>
              <ThemedText style={styles.referenceDate}>{bookingDateLabel}</ThemedText>
              <ThemedText style={styles.referenceTime}>{bookingTimeLabel}</ThemedText>
            </View>
          </View>
        </View>

        {flight ? (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderLeft}>
                <MaterialIcons name="flight" size={20} color={ORANGE} />
                <ThemedText style={styles.cardTitle}>Flight Summary</ThemedText>
              </View>
              <View style={styles.confirmedBadge}>
                <ThemedText style={styles.confirmedBadgeText}>CONFIRMED</ThemedText>
              </View>
            </View>

            <View style={styles.routeRow}>
              <View style={styles.routeCol}>
                <ThemedText style={styles.routeCode}>{fromCode}</ThemedText>
                <ThemedText style={styles.routeCity}>{fromCity}</ThemedText>
                <ThemedText style={styles.routeAirport}>{fromName}</ThemedText>
              </View>
              <View style={styles.routeMiddle}>
                <View style={styles.routeLine} />
                <View style={styles.routePlane}>
                  <MaterialIcons name="flight" size={16} color="#FFFFFF" />
                </View>
                <ThemedText style={styles.routeDuration}>{formatDuration(flight.durationMinutes)}</ThemedText>
                <ThemedText style={styles.routeNonStop}>
                  {flight.stops === 0 ? 'Non stop' : `${flight.stops} stop${flight.stops > 1 ? 's' : ''}`}
                </ThemedText>
              </View>
              <View style={[styles.routeCol, styles.routeColRight]}>
                <ThemedText style={styles.routeCode}>{toCode}</ThemedText>
                <ThemedText style={styles.routeCity}>{toCity}</ThemedText>
                <ThemedText style={styles.routeAirport}>{toName}</ThemedText>
              </View>
            </View>

            <View style={styles.flightGrid}>
              <View style={styles.flightGridItem}>
                <MaterialIcons name="schedule" size={16} color={ORANGE} />
                <ThemedText style={styles.gridLabel}>Depart</ThemedText>
                <ThemedText style={styles.gridValue}>{flight.departureDateLabel}</ThemedText>
              </View>
              <View style={styles.flightGridItem}>
                <MaterialIcons name="schedule" size={16} color={ORANGE} />
                <ThemedText style={styles.gridLabel}>Arrive</ThemedText>
                <ThemedText style={styles.gridValue}>{flight.arrivalDateLabel}</ThemedText>
              </View>
              <View style={styles.flightGridItem}>
                <MaterialIcons name="flight" size={16} color={ORANGE} />
                <ThemedText style={styles.gridLabel}>Airline</ThemedText>
                <ThemedText style={styles.gridValue}>{flight.airline}</ThemedText>
                <ThemedText style={styles.gridSubValue}>
                  {flight.stops === 0 ? 'Non stop' : `${flight.stops} stop`} {flight.flightNumber}
                </ThemedText>
              </View>
              <View style={styles.flightGridItem}>
                <MaterialIcons name="airline-seat-recline-normal" size={16} color={ORANGE} />
                <ThemedText style={styles.gridLabel}>Booking Class</ThemedText>
                <ThemedText style={styles.gridValue}>{cabinClass}</ThemedText>
                <ThemedText style={styles.gridSubValue}>
                  {flight.bookingClass} | {flight.baggage}
                </ThemedText>
              </View>
            </View>
          </View>
        ) : null}

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderLeft}>
              <MaterialIcons name="person-outline" size={20} color={ORANGE} />
              <ThemedText style={styles.cardTitle}>Passenger</ThemedText>
            </View>
            <ThemedText style={styles.passengerCount}>{passengers}</ThemedText>
          </View>
          <ThemedText style={styles.passengerName}>{passengerName || 'Passenger'}</ThemedText>
          <ThemedText style={styles.passengerContact}>
            {email}
            {email && phoneDisplay ? ' | ' : ''}
            {phoneDisplay}
          </ThemedText>
        </View>

        <View style={styles.noticeBanner}>
          <MaterialIcons name="info-outline" size={18} color={ORANGE} />
          <Text style={styles.noticeText}>
            <Text style={styles.noticeBold}>Important:</Text> Please arrive at the airport at least 2 hours before
            departure time with a valid ID.
          </Text>
        </View>

        <TouchableOpacity style={styles.primaryButton} onPress={handleViewTicket} activeOpacity={0.9}>
          <MaterialIcons name="confirmation-number" size={20} color="#FFFFFF" />
          <ThemedText style={styles.primaryButtonText}>View E-Ticket</ThemedText>
        </TouchableOpacity>

        <View style={styles.secondaryRow}>
          <TouchableOpacity
            style={[styles.secondaryButton, (downloading || sharing) && styles.secondaryButtonDisabled]}
            onPress={handleDownload}
            disabled={downloading || sharing}
            activeOpacity={0.85}>
            {downloading ? (
              <ActivityIndicator size="small" color={ORANGE} />
            ) : (
              <MaterialIcons name="download" size={18} color={ORANGE} />
            )}
            <ThemedText style={styles.secondaryButtonText}>
              {downloading ? 'Preparing...' : 'Download'}
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryButton, (downloading || sharing) && styles.secondaryButtonDisabled]}
            onPress={handleShare}
            disabled={downloading || sharing}
            activeOpacity={0.85}>
            {sharing ? (
              <ActivityIndicator size="small" color={ORANGE} />
            ) : (
              <MaterialIcons name="share" size={18} color={ORANGE} />
            )}
            <ThemedText style={styles.secondaryButtonText}>
              {sharing ? 'Preparing...' : 'Share'}
            </ThemedText>
          </TouchableOpacity>
        </View>
      </ScrollView>
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
  },
  headerBack: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginRight: 40,
  },
  headerSpacer: {
    width: 0,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 14,
  },
  successHero: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
  },
  confettiWrap: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  confetti: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 2,
    transform: [{ rotate: '20deg' }],
  },
  confettiGreen: {
    backgroundColor: '#86EFAC',
  },
  confettiOrange: {
    backgroundColor: '#FDBA74',
  },
  confettiYellow: {
    backgroundColor: '#FDE047',
  },
  successCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  successSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 12,
  },
  successEmail: {
    color: GREEN,
    fontWeight: '600',
  },
  referenceCard: {
    flexDirection: 'row',
    backgroundColor: '#F0FDF4',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  referenceCol: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  referenceDivider: {
    width: 1,
    backgroundColor: '#DCFCE7',
    marginHorizontal: 10,
  },
  referenceIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  referenceTextWrap: {
    flex: 1,
  },
  referenceLabel: {
    fontSize: 11,
    color: '#6B7280',
    marginBottom: 4,
  },
  referenceValue: {
    fontSize: 13,
    fontWeight: '700',
    color: GREEN,
    lineHeight: 18,
  },
  referenceDate: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  referenceTime: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ECECEC',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  confirmedBadge: {
    backgroundColor: '#FFF3E8',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  confirmedBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: ORANGE,
    letterSpacing: 0.5,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  routeCol: {
    flex: 1,
  },
  routeColRight: {
    alignItems: 'flex-end',
  },
  routeCode: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 2,
  },
  routeCity: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  routeAirport: {
    fontSize: 10,
    color: '#9CA3AF',
    lineHeight: 14,
  },
  routeMiddle: {
    width: 88,
    alignItems: 'center',
    paddingTop: 6,
  },
  routeLine: {
    position: 'absolute',
    top: 22,
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#D1D5DB',
  },
  routePlane: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  routeDuration: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
  },
  routeNonStop: {
    fontSize: 11,
    color: GREEN,
    fontWeight: '600',
  },
  flightGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  flightGridItem: {
    width: '47%',
    gap: 4,
  },
  gridLabel: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  gridValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
    lineHeight: 16,
  },
  gridSubValue: {
    fontSize: 10,
    color: '#9CA3AF',
    lineHeight: 14,
  },
  passengerCount: {
    fontSize: 12,
    fontWeight: '600',
    color: ORANGE,
  },
  passengerName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
  },
  passengerContact: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  noticeBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#FFF8F2',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FFE4CC',
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  noticeBold: {
    color: ORANGE,
    fontWeight: '700',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: ORANGE,
    borderRadius: 14,
    paddingVertical: 16,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: 12,
  },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: ORANGE,
  },
  secondaryButtonDisabled: {
    opacity: 0.7,
  },
  secondaryButtonText: {
    color: ORANGE,
    fontSize: 14,
    fontWeight: '700',
  },
});
