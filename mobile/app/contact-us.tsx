import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { SeoHead } from '@/components/seo-head';
import { LandingShell, useLandingLayout } from '@/components/landing/landing-shell';
import { useAuthSession } from '@/hooks/use-auth-session';
import { supabase } from '@/lib/supabase';
import { LANDING_BRAND as BRAND } from '@/constants/landing';

const toWhatsAppNumber = (phone: string) => {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('234')) return digits;
  if (digits.startsWith('0')) return `234${digits.slice(1)}`;
  return digits;
};

export default function ContactUsPage() {
  const router = useRouter();
  const { ready, isAuthenticated } = useAuthSession();
  const { isWide, contentWidth } = useLandingLayout();
  const [supportEmail, setSupportEmail] = useState('support@netppay.com');
  const [supportPhone, setSupportPhone] = useState('07067398399');
  const [supportPhoneDisplay, setSupportPhoneDisplay] = useState('+234 706 739 8399');
  const [supportAddress, setSupportAddress] = useState('Lagos, Nigeria');
  const [businessHours, setBusinessHours] = useState<{ day: string; time: string }[]>([
    { day: 'Monday - Friday', time: '9:00 AM - 6:00 PM' },
    { day: 'Saturday', time: '10:00 AM - 4:00 PM' },
    { day: 'Sunday', time: 'Closed' },
  ]);
  const isMounted = useRef(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const { data: settingsRow, error: settingsError } = await supabase
          .from('contact_settings')
          .select(
            'support_email, support_phone, support_phone_display, address_line, city, state, country, business_hours',
          )
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const recoverableCodes = new Set(['PGRST116', 'PGRST205', '42P01']);

        if (settingsError && !recoverableCodes.has(settingsError.code ?? '')) {
          throw settingsError;
        }

        if (!isMounted.current || !settingsRow) return;

        if (settingsRow.support_email) setSupportEmail(settingsRow.support_email);
        if (settingsRow.support_phone) setSupportPhone(settingsRow.support_phone);
        if (settingsRow.support_phone_display) {
          setSupportPhoneDisplay(settingsRow.support_phone_display);
        }

        const addressParts = [
          settingsRow.address_line,
          settingsRow.city,
          settingsRow.state,
          settingsRow.country,
        ]
          .filter(Boolean)
          .join(', ');

        if (addressParts) setSupportAddress(addressParts);

        if (Array.isArray(settingsRow.business_hours) && settingsRow.business_hours.length > 0) {
          const parsedHours = settingsRow.business_hours
            .map((entry: { day?: string; time?: string }) => ({
              day: typeof entry.day === 'string' ? entry.day : '',
              time: typeof entry.time === 'string' ? entry.time : '',
            }))
            .filter((entry) => entry.day && entry.time);

          if (parsedHours.length > 0) setBusinessHours(parsedHours);
        }
      } catch (error) {
        console.warn('contact_settings unavailable:', error);
      }
    };

    isMounted.current = true;
    void loadData();
    return () => {
      isMounted.current = false;
    };
  }, []);

  const handleBack = () => {
    if ((router as { canGoBack?: () => boolean }).canGoBack?.()) {
      router.back();
      return;
    }
    router.replace('/(tabs)');
  };

  const handleEmailAction = async () => {
    const url = `mailto:${supportEmail}`;
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
        return;
      }
    } catch {
      // Fall through to clipboard.
    }
    await Clipboard.setStringAsync(supportEmail);
    Alert.alert('Email copied', supportEmail);
  };

  const handlePhoneAction = async () => {
    const url = `tel:${supportPhone}`;
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
        return;
      }
    } catch {
      // Fall through.
    }
    await Clipboard.setStringAsync(supportPhoneDisplay);
    Alert.alert('Phone copied', supportPhoneDisplay);
  };

  const handleWhatsApp = async () => {
    const url = `https://wa.me/${toWhatsAppNumber(supportPhone)}`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Unable to open WhatsApp', 'Please try again later.');
    }
  };

  const contactBody = (
    <>
      <View style={isAuthenticated ? styles.appInfoCard : styles.landingCard}>
        {!isAuthenticated ? (
          <ThemedText style={styles.landingCardTitle}>Get in touch</ThemedText>
        ) : null}

        <View style={styles.contactItem}>
          <View style={styles.iconWrap}>
            <MaterialIcons name="email" size={24} color={BRAND.orange} />
          </View>
          <View style={styles.contactDetails}>
            <ThemedText style={styles.contactTitle}>Email</ThemedText>
            <ThemedText style={styles.contactValue}>{supportEmail}</ThemedText>
            <ThemedText style={styles.contactNote}>We typically reply within a few hours</ThemedText>
          </View>
          <Pressable style={styles.actionButton} onPress={() => void handleEmailAction()}>
            <MaterialIcons name="send" size={20} color={BRAND.orange} />
          </Pressable>
        </View>

        <View style={styles.contactItem}>
          <View style={styles.iconWrap}>
            <MaterialIcons name="phone" size={24} color={BRAND.orange} />
          </View>
          <View style={styles.contactDetails}>
            <ThemedText style={styles.contactTitle}>Phone</ThemedText>
            <ThemedText style={styles.contactValue}>{supportPhoneDisplay}</ThemedText>
            <ThemedText style={styles.contactNote}>Call during business hours</ThemedText>
          </View>
          <Pressable style={styles.actionButton} onPress={() => void handlePhoneAction()}>
            <MaterialIcons name="call" size={20} color={BRAND.orange} />
          </Pressable>
        </View>

        <View style={styles.contactItem}>
          <View style={styles.iconWrap}>
            <MaterialIcons name="chat" size={24} color={BRAND.orange} />
          </View>
          <View style={styles.contactDetails}>
            <ThemedText style={styles.contactTitle}>WhatsApp</ThemedText>
            <ThemedText style={styles.contactValue}>{supportPhoneDisplay}</ThemedText>
            <ThemedText style={styles.contactNote}>Message us anytime</ThemedText>
          </View>
          <Pressable style={styles.actionButton} onPress={() => void handleWhatsApp()}>
            <MaterialIcons name="open-in-new" size={20} color={BRAND.orange} />
          </Pressable>
        </View>

        <View style={styles.contactItem}>
          <View style={styles.iconWrap}>
            <MaterialIcons name="location-on" size={24} color={BRAND.orange} />
          </View>
          <View style={styles.contactDetails}>
            <ThemedText style={styles.contactTitle}>Address</ThemedText>
            <ThemedText style={styles.contactValue}>{supportAddress}</ThemedText>
            <ThemedText style={styles.contactNote}>Visit during business hours</ThemedText>
          </View>
        </View>

        {businessHours.length > 0 ? (
          <View style={styles.hoursBlock}>
            <ThemedText style={styles.hoursTitle}>Business Hours</ThemedText>
            {businessHours.map((hour) => (
              <View key={`${hour.day}-${hour.time}`} style={styles.hoursRow}>
                <ThemedText style={styles.hoursDay}>{hour.day}</ThemedText>
                <ThemedText style={styles.hoursTime}>{hour.time}</ThemedText>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </>
  );

  if (!ready) {
    return (
      <ThemedView style={styles.appContainer}>
        <SeoHead page="contact" />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={BRAND.orange} />
        </View>
      </ThemedView>
    );
  }

  if (isAuthenticated) {
    return (
      <ThemedView style={styles.appContainer}>
        <SeoHead page="contact" />
        <View style={styles.appHeader}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <ThemedText style={styles.appHeaderTitle}>Contact Us</ThemedText>
          <View style={styles.placeholder} />
        </View>
        <ThemedText style={styles.appSubtitle}>Get in touch with our support team</ThemedText>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          {contactBody}
        </ScrollView>
      </ThemedView>
    );
  }

  return (
    <LandingShell activeHref="/contact-us">
      <SeoHead page="contact" />

      <View style={[styles.hero, { width: contentWidth }]}>
        <ThemedText style={styles.eyebrow}>CONTACT US</ThemedText>
        <ThemedText style={styles.title}>We are here to help</ThemedText>
        <ThemedText style={styles.subtitle}>
          Reach NetPay support by email, phone or WhatsApp — no login required.
        </ThemedText>
      </View>

      <View style={[styles.contentWrap, { width: contentWidth }]}>{contactBody}</View>

      <View style={[styles.bottomCta, { width: contentWidth }, !isWide && styles.bottomCtaStack]}>
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.bottomTitle}>Ready to pay with NetPay?</ThemedText>
          <ThemedText style={styles.bottomDesc}>
            Create an account or login when you want to start paying bills.
          </ThemedText>
        </View>
        <View style={[styles.ctaRow, !isWide && { width: '100%' }]}>
          <Pressable style={styles.cta} onPress={() => router.push('/auth/login')}>
            <ThemedText style={styles.ctaText}>Login</ThemedText>
            <MaterialIcons name="arrow-forward" size={18} color="#fff" />
          </Pressable>
          <Pressable style={styles.secondaryCta} onPress={() => router.push('/auth/signup')}>
            <ThemedText style={styles.secondaryCtaText}>Sign up</ThemedText>
          </Pressable>
        </View>
      </View>
    </LandingShell>
  );
}

const styles = StyleSheet.create({
  appContainer: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  appHeader: {
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
  appHeaderTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
  },
  placeholder: {
    width: 40,
  },
  appSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appInfoCard: {
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
  landingCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BRAND.border,
    padding: 22,
    borderLeftWidth: 4,
    borderLeftColor: BRAND.orange,
  },
  landingCardTitle: {
    color: BRAND.navy,
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 18,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FAFAFA',
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFF3E0',
    borderWidth: 1,
    borderColor: BRAND.orange,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
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
    marginLeft: 8,
    borderWidth: 1,
    borderColor: BRAND.orange,
  },
  hoursBlock: {
    marginTop: 8,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  hoursTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  hoursRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  hoursDay: {
    fontSize: 14,
    color: '#666',
  },
  hoursTime: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  hero: {
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 48,
    paddingBottom: 28,
    gap: 14,
  },
  eyebrow: {
    color: BRAND.orange,
    fontWeight: '800',
    letterSpacing: 1.4,
    fontSize: 12,
  },
  title: {
    color: BRAND.navy,
    fontSize: 36,
    fontWeight: '800',
    lineHeight: 42,
    maxWidth: 720,
  },
  subtitle: {
    color: BRAND.muted,
    fontSize: 17,
    lineHeight: 26,
    maxWidth: 680,
  },
  contentWrap: {
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingBottom: 28,
  },
  bottomCta: {
    alignSelf: 'center',
    marginHorizontal: 20,
    marginBottom: 48,
    backgroundColor: BRAND.orangeWash,
    borderRadius: 20,
    padding: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  bottomCtaStack: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  bottomTitle: {
    color: BRAND.navy,
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 6,
  },
  bottomDesc: {
    color: BRAND.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  ctaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: BRAND.orange,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  ctaText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  secondaryCta: {
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: BRAND.orange,
    backgroundColor: '#fff',
  },
  secondaryCtaText: {
    color: BRAND.orange,
    fontWeight: '700',
    fontSize: 15,
  },
});
