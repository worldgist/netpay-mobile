import { useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  FlatList,
  Platform,
  Alert,
  KeyboardAvoidingView,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { buildRouteHref } from '@/utils/router-href';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useProfile } from '@/contexts/profile-context';
import { getFlightById, generateBookingReference, formatFlightCurrency, formatDuration, formatPhoneDisplay } from '@/utils/flight-data';

const ORANGE = '#FF7F00';
const BLUE = '#2563EB';

const CLASS_LABELS: Record<string, string> = {
  economy: 'Economy',
  premium_economy: 'Premium Economy',
  business: 'Business',
  first: 'First Class',
};

const TITLE_OPTIONS = ['Mr', 'Mrs', 'Ms', 'Miss', 'Dr'];
const GENDER_OPTIONS = ['Male', 'Female'];
const COUNTRY_OPTIONS = ['Nigeria', 'Ghana', 'United Kingdom', 'United States', 'Canada', 'United Arab Emirates'];
const PHONE_CODES = ['+234', '+233', '+44', '+1', '+971'];

type PickerKind = 'title' | 'gender' | 'country' | 'phoneCode' | null;

function SelectField({
  icon,
  value,
  placeholder,
  onPress,
  flex,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  value: string;
  placeholder: string;
  onPress: () => void;
  flex?: number;
}) {
  return (
    <TouchableOpacity
      style={[styles.selectField, flex ? { flex } : null]}
      onPress={onPress}
      activeOpacity={0.85}>
      <MaterialIcons name={icon} size={20} color={ORANGE} />
      <ThemedText style={[styles.selectFieldText, !value && styles.placeholderText]} numberOfLines={1}>
        {value || placeholder}
      </ThemedText>
      <MaterialIcons name="keyboard-arrow-down" size={22} color="#9CA3AF" />
    </TouchableOpacity>
  );
}

function TextField({
  icon,
  value,
  placeholder,
  onChangeText,
  keyboardType = 'default',
  autoCapitalize = 'words',
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  value: string;
  placeholder: string;
  onChangeText: (text: string) => void;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  autoCapitalize?: 'none' | 'words' | 'sentences';
}) {
  return (
    <View style={styles.textField}>
      <MaterialIcons name={icon} size={20} color={ORANGE} />
      <TextInput
        style={styles.textInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
      />
    </View>
  );
}

export default function FlightTravellerInfoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useProfile();
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

  const [title, setTitle] = useState('');
  const [gender, setGender] = useState('');
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState<Date | null>(null);
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState('Nigeria');
  const [city, setCity] = useState('');
  const [phoneCode, setPhoneCode] = useState('+234');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [picker, setPicker] = useState<PickerKind>(null);
  const [showDobPicker, setShowDobPicker] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [hasPrefilled, setHasPrefilled] = useState(false);

  const passengers = params.passengers || '1 Adult';
  const adultMatch = passengers.match(/(\d+)\s+Adult/i);
  const adultCount = adultMatch ? Number(adultMatch[1]) : 1;

  const departureDate = useMemo(() => {
    const parsed = params.departureDate ? new Date(params.departureDate) : new Date();
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }, [params.departureDate]);

  const flight = useMemo(
    () => getFlightById(params.flightId || '', params.fromCode || 'ABV', params.toCode || 'LOS', departureDate),
    [departureDate, params.flightId, params.fromCode, params.toCode]
  );

  useEffect(() => {
    if (!profile || hasPrefilled) return;

    const nameParts = profile.full_name.trim().split(/\s+/).filter(Boolean);
    if (nameParts.length >= 1) setFirstName(nameParts[0]);
    if (nameParts.length >= 3) {
      setMiddleName(nameParts.slice(1, -1).join(' '));
      setLastName(nameParts[nameParts.length - 1]);
    } else if (nameParts.length === 2) {
      setLastName(nameParts[1]);
    }

    if (profile.email) setEmail(profile.email);
    if (profile.phone) {
      const digits = profile.phone.replace(/\D/g, '');
      if (digits.startsWith('234') && digits.length >= 13) {
        setPhoneCode('+234');
        setPhoneNumber(digits.slice(3));
      } else if (digits.length === 11 && digits.startsWith('0')) {
        setPhoneCode('+234');
        setPhoneNumber(digits.slice(1));
      } else {
        setPhoneNumber(profile.phone);
      }
    }

    setHasPrefilled(true);
  }, [hasPrefilled, profile]);

  const dobLabel = dateOfBirth
    ? dateOfBirth.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';

  const pickerOptions = useMemo(() => {
    if (picker === 'title') return TITLE_OPTIONS;
    if (picker === 'gender') return GENDER_OPTIONS;
    if (picker === 'country') return COUNTRY_OPTIONS;
    if (picker === 'phoneCode') return PHONE_CODES;
    return [];
  }, [picker]);

  const pickerTitle =
    picker === 'title'
      ? 'Select title'
      : picker === 'gender'
        ? 'Select gender'
        : picker === 'country'
          ? 'Select country'
          : picker === 'phoneCode'
            ? 'Select country code'
            : '';

  const handlePickerSelect = (value: string) => {
    if (picker === 'title') setTitle(value);
    if (picker === 'gender') setGender(value);
    if (picker === 'country') setCountry(value);
    if (picker === 'phoneCode') setPhoneCode(value);
    setPicker(null);
  };

  const cabinClass = CLASS_LABELS[params.flightClass || 'economy'] || 'Economy';

  const travellerName = useMemo(
    () => [title, firstName.trim(), middleName.trim(), lastName.trim()].filter(Boolean).join(' '),
    [firstName, lastName, middleName, title]
  );

  const phoneDisplay = formatPhoneDisplay(phoneCode, phoneNumber.trim());

  const validateTravellerForm = () => {
    if (!title) {
      Alert.alert('Traveller Information', 'Please select a title.');
      return false;
    }
    if (!gender) {
      Alert.alert('Traveller Information', 'Please select a gender.');
      return false;
    }
    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert('Traveller Information', 'Please enter your first and last name.');
      return false;
    }
    if (!dateOfBirth) {
      Alert.alert('Traveller Information', 'Please select your date of birth.');
      return false;
    }
    if (!email.trim()) {
      Alert.alert('Traveller Information', 'Please enter your email address.');
      return false;
    }
    if (!city.trim()) {
      Alert.alert('Traveller Information', 'Please enter your city.');
      return false;
    }
    if (!phoneNumber.trim() || phoneNumber.trim().length < 10) {
      Alert.alert('Traveller Information', 'Please enter a valid phone number.');
      return false;
    }
    return true;
  };

  const handleBookFlight = () => {
    if (!validateTravellerForm()) return;
    setShowPreviewModal(true);
  };

  const confirmBooking = () => {
    setShowPreviewModal(false);
    router.replace(buildRouteHref('/flight-booking-success', {
      flightId: params.flightId || flight?.id || '',
      fromCode: params.fromCode || 'ABV',
      fromCity: params.fromCity || '',
      fromName: params.fromName || '',
      toCode: params.toCode || 'LOS',
      toCity: params.toCity || '',
      toName: params.toName || '',
      departureDate: params.departureDate || new Date().toISOString(),
      passengers,
      flightClass: params.flightClass || 'economy',
      title,
      firstName: firstName.trim(),
      middleName: middleName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      phoneCode,
      phoneNumber: phoneNumber.trim(),
      bookingReference: generateBookingReference(),
      bookingDate: new Date().toISOString(),
    }));
  };

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top + 8, 16) }]}>
          <TouchableOpacity style={styles.headerBack} onPress={() => router.back()} activeOpacity={0.8}>
            <MaterialIcons name="chevron-left" size={28} color="#374151" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <ThemedText style={styles.headerTitle}>Traveller&apos;s Information</ThemedText>
            <View style={styles.progressRow}>
              <View style={[styles.progressSegment, styles.progressSegmentActive]} />
              <View style={styles.progressSegment} />
            </View>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          <View style={styles.infoBanner}>
            <View style={styles.infoBannerIcon}>
              <MaterialIcons name="info" size={18} color="#FFFFFF" />
            </View>
            <ThemedText style={styles.infoBannerText}>
              Use all given names and last name exactly as they appear in your passport/ID to avoid complications.
            </ThemedText>
          </View>

          <ThemedText style={styles.sectionTitle}>
            Adults 1 ({Math.min(1, adultCount)}/{adultCount})
          </ThemedText>

          <View style={styles.splitRow}>
            <SelectField
              icon="person-outline"
              value={title}
              placeholder="Title"
              onPress={() => setPicker('title')}
              flex={1}
            />
            <SelectField
              icon="person-outline"
              value={gender}
              placeholder="Gender"
              onPress={() => setPicker('gender')}
              flex={1}
            />
          </View>

          <TextField icon="person-outline" value={firstName} placeholder="First Name" onChangeText={setFirstName} />
          <TextField icon="person-outline" value={middleName} placeholder="Middle Name" onChangeText={setMiddleName} />
          <TextField icon="person-outline" value={lastName} placeholder="Last Name" onChangeText={setLastName} />

          <TouchableOpacity style={styles.textField} onPress={() => setShowDobPicker(true)} activeOpacity={0.85}>
            <MaterialIcons name="calendar-today" size={20} color={ORANGE} />
            <ThemedText style={[styles.selectFieldText, !dobLabel && styles.placeholderText]}>
              {dobLabel || 'Date of Birth'}
            </ThemedText>
            <MaterialIcons name="keyboard-arrow-down" size={22} color="#9CA3AF" />
          </TouchableOpacity>

          <TextField
            icon="email"
            value={email}
            placeholder="Email"
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <SelectField
            icon="flag"
            value={country}
            placeholder="Country"
            onPress={() => setPicker('country')}
          />

          <TextField icon="location-city" value={city} placeholder="City" onChangeText={setCity} />

          <View style={styles.phoneRow}>
            <TouchableOpacity style={styles.phoneCodeField} onPress={() => setPicker('phoneCode')} activeOpacity={0.85}>
              <MaterialIcons name="phone" size={20} color={ORANGE} />
              <ThemedText style={styles.phoneCodeText}>{phoneCode}</ThemedText>
              <MaterialIcons name="keyboard-arrow-down" size={20} color="#9CA3AF" />
            </TouchableOpacity>
            <View style={[styles.textField, styles.phoneNumberField]}>
              <TextInput
                style={styles.textInput}
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                placeholder="Phone Number"
                placeholderTextColor="#9CA3AF"
                keyboardType="phone-pad"
                maxLength={11}
              />
            </View>
          </View>

          <View style={styles.ticketBanner}>
            <MaterialIcons name="error-outline" size={18} color={ORANGE} />
            <ThemedText style={styles.ticketBannerText}>
              Your e-Ticket will be sent to the email address you provide.
            </ThemedText>
          </View>

          <ThemedText style={styles.termsText}>
            By tapping &apos;Book Flight&apos;, you are agreeing to the{' '}
            <ThemedText style={styles.termsLink} onPress={() => router.push('/terms-and-conditions')}>
              Terms and Condition
            </ThemedText>
          </ThemedText>

          <TouchableOpacity style={styles.bookButton} onPress={handleBookFlight} activeOpacity={0.9}>
            <ThemedText style={styles.bookButtonText}>Book Flight</ThemedText>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {showDobPicker ? (
        <DateTimePicker
          value={dateOfBirth || new Date(1995, 0, 1)}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          maximumDate={new Date()}
          onChange={(event, date) => {
            if (Platform.OS !== 'ios') setShowDobPicker(false);
            if (event.type === 'dismissed') {
              setShowDobPicker(false);
              return;
            }
            if (date) {
              setDateOfBirth(date);
              if (Platform.OS === 'ios') setShowDobPicker(false);
            }
          }}
        />
      ) : null}

      <Modal visible={picker !== null} transparent animationType="fade" onRequestClose={() => setPicker(null)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setPicker(null)}>
          <View style={styles.modalSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>{pickerTitle}</ThemedText>
              <TouchableOpacity onPress={() => setPicker(null)}>
                <MaterialIcons name="close" size={24} color="#374151" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={pickerOptions}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.modalOption} onPress={() => handlePickerSelect(item)} activeOpacity={0.8}>
                  <ThemedText style={styles.modalOptionText}>{item}</ThemedText>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={showPreviewModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPreviewModal(false)}>
        <View style={styles.previewOverlay}>
          <View style={[styles.previewSheet, { paddingBottom: Math.max(insets.bottom + 16, 24) }]}>
            <View style={styles.previewHeader}>
              <ThemedText style={styles.previewTitle}>Booking Preview</ThemedText>
              <TouchableOpacity onPress={() => setShowPreviewModal(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MaterialIcons name="close" size={24} color="#374151" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.previewScroll} showsVerticalScrollIndicator={false}>
              {flight ? (
                <View style={styles.previewCard}>
                  <View style={styles.previewCardHeader}>
                    <MaterialIcons name="flight" size={20} color={ORANGE} />
                    <ThemedText style={styles.previewCardTitle}>Flight Details</ThemedText>
                  </View>
                  <ThemedText style={styles.previewRoute}>
                    {params.fromCode || 'ABV'} → {params.toCode || 'LOS'}
                  </ThemedText>
                  <ThemedText style={styles.previewMeta}>
                    {flight.airline} • {flight.flightNumber} • {cabinClass}
                  </ThemedText>
                  <View style={styles.previewRow}>
                    <View style={styles.previewCol}>
                      <ThemedText style={styles.previewLabel}>Depart</ThemedText>
                      <ThemedText style={styles.previewValue}>{flight.departureDateLabel}</ThemedText>
                    </View>
                    <View style={styles.previewCol}>
                      <ThemedText style={styles.previewLabel}>Arrive</ThemedText>
                      <ThemedText style={styles.previewValue}>{flight.arrivalDateLabel}</ThemedText>
                    </View>
                  </View>
                  <View style={styles.previewRow}>
                    <View style={styles.previewCol}>
                      <ThemedText style={styles.previewLabel}>Duration</ThemedText>
                      <ThemedText style={styles.previewValue}>{formatDuration(flight.durationMinutes)}</ThemedText>
                    </View>
                    <View style={styles.previewCol}>
                      <ThemedText style={styles.previewLabel}>Baggage</ThemedText>
                      <ThemedText style={styles.previewValue}>{flight.baggage}</ThemedText>
                    </View>
                  </View>
                  <View style={styles.previewPriceRow}>
                    <ThemedText style={styles.previewLabel}>Total fare</ThemedText>
                    <ThemedText style={styles.previewPrice}>{formatFlightCurrency(flight.ticketPrice)}</ThemedText>
                  </View>
                </View>
              ) : null}

              <View style={styles.previewCard}>
                <View style={styles.previewCardHeader}>
                  <MaterialIcons name="person-outline" size={20} color={ORANGE} />
                  <ThemedText style={styles.previewCardTitle}>Passenger</ThemedText>
                </View>
                <ThemedText style={styles.previewPassengerName}>{travellerName}</ThemedText>
                <ThemedText style={styles.previewPassengerMeta}>
                  {gender} • {dobLabel} • {country}
                </ThemedText>
                <ThemedText style={styles.previewPassengerMeta}>{city}</ThemedText>
                <ThemedText style={styles.previewPassengerMeta}>{email.trim()}</ThemedText>
                <ThemedText style={styles.previewPassengerMeta}>{phoneDisplay}</ThemedText>
              </View>

              <View style={styles.previewNotice}>
                <MaterialIcons name="email" size={18} color={ORANGE} />
                <ThemedText style={styles.previewNoticeText}>
                  E-ticket will be sent to {email.trim()} after confirmation.
                </ThemedText>
              </View>
            </ScrollView>

            <View style={styles.previewActions}>
              <TouchableOpacity
                style={styles.previewCancelButton}
                onPress={() => setShowPreviewModal(false)}
                activeOpacity={0.85}>
                <ThemedText style={styles.previewCancelText}>Edit Details</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity style={styles.previewConfirmButton} onPress={confirmBooking} activeOpacity={0.9}>
                <ThemedText style={styles.previewConfirmText}>Confirm Booking</ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
    backgroundColor: '#FFFFFF',
  },
  headerBack: {
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
    alignItems: 'center',
    paddingTop: 2,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 10,
    textAlign: 'center',
  },
  progressRow: {
    flexDirection: 'row',
    gap: 8,
    width: '72%',
  },
  progressSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E7EB',
  },
  progressSegmentActive: {
    backgroundColor: ORANGE,
  },
  headerSpacer: {
    width: 44,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: BLUE,
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
  },
  infoBannerIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBannerText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 19,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 14,
  },
  splitRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  selectField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 16,
    marginBottom: 12,
  },
  selectFieldText: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
  },
  placeholderText: {
    color: '#9CA3AF',
  },
  textField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 4,
    minHeight: 54,
    marginBottom: 12,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
    paddingVertical: 12,
  },
  phoneRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  phoneCodeField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    paddingHorizontal: 12,
    minHeight: 54,
    backgroundColor: '#FFFFFF',
  },
  phoneCodeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  phoneNumberField: {
    flex: 1,
    marginBottom: 0,
  },
  ticketBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#FFF8F2',
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FFE4CC',
  },
  ticketBannerText: {
    flex: 1,
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  termsText: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  termsLink: {
    color: ORANGE,
    fontWeight: '600',
  },
  bookButton: {
    backgroundColor: ORANGE,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 8,
  },
  bookButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
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
    maxHeight: '55%',
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
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F3F4F6',
  },
  modalOptionText: {
    fontSize: 15,
    color: '#111827',
  },
  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  previewSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '88%',
    paddingTop: 8,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  previewTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  previewScroll: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  previewCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#ECECEC',
  },
  previewCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  previewCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  previewRoute: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  previewMeta: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 14,
  },
  previewRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  previewCol: {
    flex: 1,
  },
  previewLabel: {
    fontSize: 11,
    color: '#9CA3AF',
    marginBottom: 4,
  },
  previewValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
    lineHeight: 18,
  },
  previewPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
  },
  previewPrice: {
    fontSize: 20,
    fontWeight: '700',
    color: ORANGE,
  },
  previewPassengerName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
  },
  previewPassengerMeta: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 20,
  },
  previewNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#FFF8F2',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#FFE4CC',
  },
  previewNoticeText: {
    flex: 1,
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  previewActions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  previewCancelButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: ORANGE,
    backgroundColor: '#FFFFFF',
  },
  previewCancelText: {
    fontSize: 15,
    fontWeight: '700',
    color: ORANGE,
  },
  previewConfirmButton: {
    flex: 1.4,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: ORANGE,
  },
  previewConfirmText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
