import {
  StyleSheet,
  View,
  TouchableOpacity,
  ScrollView,
  Platform,
  Linking,
  Alert,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { supabase } from '@/lib/supabase';

const toWhatsAppNumber = (phone: string) => {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('234')) return digits;
  if (digits.startsWith('0')) return `234${digits.slice(1)}`;
  return digits;
};

export default function ContactUsScreen() {
  const router = useRouter();
  const [supportEmail, setSupportEmail] = useState('support@netppay.com');
  const [supportPhone, setSupportPhone] = useState('07067398399');
  const [supportPhoneDisplay, setSupportPhoneDisplay] = useState('+234 706 739 8399');
  const [supportAddress, setSupportAddress] = useState('');
  const [businessHours, setBusinessHours] = useState<{ day: string; time: string }[]>([
    { day: 'Monday - Friday', time: '9:00 AM - 6:00 PM' },
    { day: 'Saturday', time: '10:00 AM - 4:00 PM' },
    { day: 'Sunday', time: 'Closed' },
  ]);
  const isMounted = useRef(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        const session = sessionData.session;
        if (!session) {
          router.replace('/auth/login');
          return;
        }

        if (!isMounted.current) return;

        try {
          const { data: settingsRow, error: settingsError } = await supabase
            .from('contact_settings')
            .select('support_email, support_phone, support_phone_display, address_line, city, state, country, business_hours')
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          const recoverableCodes = new Set(['PGRST116', 'PGRST205', '42P01']);

          if (settingsError && !recoverableCodes.has(settingsError.code ?? '')) {
            throw settingsError;
          }

          if (isMounted.current && settingsRow) {
            if (settingsRow.support_email) setSupportEmail(settingsRow.support_email);
            if (settingsRow.support_phone) setSupportPhone(settingsRow.support_phone);
            if (settingsRow.support_phone_display) setSupportPhoneDisplay(settingsRow.support_phone_display);

            const addressParts = [
              settingsRow.address_line,
              settingsRow.city,
              settingsRow.state,
              settingsRow.country,
            ]
              .filter(Boolean)
              .join(', ');

            if (addressParts) {
              setSupportAddress(addressParts);
            }

            if (Array.isArray(settingsRow.business_hours) && settingsRow.business_hours.length > 0) {
              const parsedHours = settingsRow.business_hours
                .map((entry: any) => ({
                  day: typeof entry.day === 'string' ? entry.day : '',
                  time: typeof entry.time === 'string' ? entry.time : '',
                }))
                .filter((entry) => entry.day && entry.time);

              if (parsedHours.length > 0) {
                setBusinessHours(parsedHours);
              }
            }
          }
        } catch (settingsError) {
          console.warn('contact_settings unavailable:', settingsError);
        }
      } catch (error) {
        console.error('Failed to load contact data:', error);
      }
    };

    isMounted.current = true;
    loadData();

    return () => {
      isMounted.current = false;
    };
  }, [router]);

  const handleEmailAction = async () => {
    const url = `mailto:${supportEmail}`;

    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        await Clipboard.setStringAsync(supportEmail);
        Alert.alert('Copied', 'Email address copied to clipboard');
      }
    } catch {
      await Clipboard.setStringAsync(supportEmail);
      Alert.alert('Copied', 'Email address copied to clipboard');
    }
  };

  const handleWhatsAppAction = async () => {
    const whatsappNumber = toWhatsAppNumber(supportPhone);
    const url = `https://wa.me/${whatsappNumber}`;

    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        await Clipboard.setStringAsync(supportPhoneDisplay);
        Alert.alert('Copied', 'Phone number copied to clipboard');
      }
    } catch {
      await Clipboard.setStringAsync(supportPhoneDisplay);
      Alert.alert('Copied', 'Phone number copied to clipboard');
    }
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Contact Us</ThemedText>
        <View style={styles.placeholder} />
      </View>
      <ThemedText style={styles.headerSubtitle}>Get in touch with our support team</ThemedText>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <View style={styles.infoCard}>
          <ThemedText style={styles.infoCardTitle}>Contact Information</ThemedText>

          <TouchableOpacity
            style={styles.contactItem}
            onPress={handleEmailAction}
            activeOpacity={0.7}>
            <View style={styles.contactIconContainer}>
              <MaterialIcons name="email" size={24} color="#FF7F00" />
            </View>
            <View style={styles.contactDetails}>
              <ThemedText style={styles.contactTitle}>Email</ThemedText>
              <ThemedText style={styles.contactValue}>{supportEmail}</ThemedText>
              <ThemedText style={styles.contactNote}>We typically respond within 24 hours</ThemedText>
            </View>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={(e) => {
                e.stopPropagation();
                handleEmailAction();
              }}
              activeOpacity={0.7}>
              <MaterialIcons name="send" size={20} color="#FF7F00" />
            </TouchableOpacity>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.contactItem}
            onPress={handleWhatsAppAction}
            activeOpacity={0.7}>
            <View style={styles.contactIconContainer}>
              <MaterialIcons name="chat" size={24} color="#FF7F00" />
            </View>
            <View style={styles.contactDetails}>
              <ThemedText style={styles.contactTitle}>WhatsApp</ThemedText>
              <ThemedText style={styles.contactValue}>{supportPhoneDisplay}</ThemedText>
              <ThemedText style={styles.contactNote}>Chat with us on WhatsApp</ThemedText>
            </View>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={(e) => {
                e.stopPropagation();
                handleWhatsAppAction();
              }}
              activeOpacity={0.7}>
              <MaterialIcons name="open-in-new" size={20} color="#FF7F00" />
            </TouchableOpacity>
          </TouchableOpacity>

          <View style={styles.contactItem}>
            <View style={styles.contactIconContainer}>
              <MaterialIcons name="location-on" size={24} color="#FF7F00" />
            </View>
            <View style={styles.contactDetails}>
              <ThemedText style={styles.contactTitle}>Address</ThemedText>
              <ThemedText style={styles.contactValue}>{supportAddress || 'Lagos, Nigeria'}</ThemedText>
              <ThemedText style={styles.contactNote}>Visit our office during business hours</ThemedText>
            </View>
          </View>

          {businessHours.length > 0 && (
            <View style={styles.businessHoursContainer}>
              <ThemedText style={styles.businessHoursTitle}>Business Hours</ThemedText>
              {businessHours.map((hour, index) => (
                <View key={index} style={styles.businessHourRow}>
                  <ThemedText style={styles.businessHourDay}>{hour.day}</ThemedText>
                  <ThemedText style={styles.businessHourTime}>{hour.time}</ThemedText>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 16,
    backgroundColor: '#F5F5F5',
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
  },
  placeholder: {
    width: 40,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginHorizontal: 20,
    padding: 24,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  infoCardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
  },
  contactItem: {
    flexDirection: 'row',
    marginBottom: 24,
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FAFAFA',
  },
  contactIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFF3E0',
    borderWidth: 1,
    borderColor: '#FF7F00',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  contactDetails: {
    flex: 1,
  },
  contactTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  contactValue: {
    fontSize: 16,
    color: '#333',
    marginBottom: 4,
  },
  contactNote: {
    fontSize: 14,
    color: '#666',
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFF3E0',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
    borderWidth: 1,
    borderColor: '#FF7F00',
  },
  businessHoursContainer: {
    marginTop: 8,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  businessHoursTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  businessHourRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  businessHourDay: {
    fontSize: 14,
    color: '#666',
  },
  businessHourTime: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
});
