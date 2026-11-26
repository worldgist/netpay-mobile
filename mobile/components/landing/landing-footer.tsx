import { Linking, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { Social3DIcon, type Social3DVariant } from '@/components/landing/social-3d-icon';
import { LANDING_BRAND as BRAND } from '@/constants/landing';

const COMPANY_LINKS = [
  { label: 'About NetPay', href: '/about-us' },
  { label: 'Contact & Support', href: '/contact-us' },
  { label: 'Features', href: '/features' },
  { label: 'Services', href: '/services' },
  { label: 'FAQ', href: '/faq' },
] as const;

const LEGAL_LINKS = [
  { label: 'Terms & Conditions', href: '/terms-and-conditions' },
  { label: 'Privacy Policy', href: '/privacy-policy' },
  { label: 'Support', href: '/support' },
] as const;

const CONNECT_LINKS: {
  key: Social3DVariant;
  label: string;
  url: string;
}[] = [
  { key: 'x', label: 'Twitter / X', url: 'https://twitter.com/netpay' },
  { key: 'instagram', label: 'Instagram', url: 'https://instagram.com/netpay' },
  { key: 'facebook', label: 'Facebook', url: 'https://facebook.com/netpay' },
  { key: 'whatsapp', label: 'WhatsApp', url: 'https://wa.me/2347067398399' },
];

function openUrl(url: string) {
  void Linking.openURL(url);
}

type LandingFooterProps = {
  onHomePress?: () => void;
};

export function LandingFooter({ onHomePress }: LandingFooterProps) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWide = width >= 960;
  const contentWidth = Math.min(width, 1180);

  const goHome = () => {
    if (onHomePress) {
      onHomePress();
      return;
    }
    router.push('/landing' as never);
  };

  return (
    <View style={styles.footer}>
      <View style={[styles.inner, { width: contentWidth }]}>
        <View style={[styles.topRow, !isWide && styles.topRowStack]}>
          <View style={[styles.brandBlock, !isWide && { maxWidth: '100%' }]}>
            <Pressable style={styles.brandRow} onPress={goHome}>
              <Image
                source={require('@/assets/images/logo.png')}
                style={styles.logo}
                contentFit="contain"
              />
              <ThemedText style={styles.brandText}>
                <ThemedText style={styles.brandAccent}>NET</ThemedText>PAY
              </ThemedText>
            </Pressable>
            <ThemedText style={styles.brandBlurb}>
              Nigeria’s best bill payments platform—powering airtime, data, entertainment, utilities,
              gaming, education and financial services with instant settlement, enterprise-grade
              security and a delightful orange-and-milk experience.
            </ThemedText>
          </View>

          <View style={[styles.columns, !isWide && styles.columnsStack]}>
            <View style={styles.column}>
              <ThemedText style={styles.columnTitle}>Company</ThemedText>
              {COMPANY_LINKS.map((link) => (
                <Pressable key={link.href} onPress={() => router.push(link.href as never)}>
                  <ThemedText style={styles.columnLink}>{link.label}</ThemedText>
                </Pressable>
              ))}
              <ThemedText style={styles.cacNote}>
                Registered with the Corporate Affairs Commission (CAC), RC: RN7062973.
              </ThemedText>
            </View>

            <View style={styles.column}>
              <ThemedText style={styles.columnTitle}>Legal</ThemedText>
              {LEGAL_LINKS.map((link) => (
                <Pressable key={link.href} onPress={() => router.push(link.href as never)}>
                  <ThemedText style={styles.columnLink}>{link.label}</ThemedText>
                </Pressable>
              ))}
            </View>

            <View style={styles.column}>
              <ThemedText style={styles.columnTitle}>Connect</ThemedText>
              {CONNECT_LINKS.map((link) => (
                <Pressable key={link.key} style={styles.connectRow} onPress={() => openUrl(link.url)}>
                  <Social3DIcon variant={link.key} size={26} />
                  <ThemedText style={styles.columnLink}>{link.label}</ThemedText>
                </Pressable>
              ))}
              <Pressable
                style={styles.connectRow}
                onPress={() => openUrl('mailto:support@netppay.com')}>
                <Social3DIcon variant="email" size={26} />
                <ThemedText style={styles.columnLink}>support@netppay.com</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>

        <View style={[styles.bottomBar, !isWide && styles.bottomBarStack]}>
          <ThemedText style={[styles.copyright, !isWide && styles.centerText]}>
            © {new Date().getFullYear()} NetPay. All rights reserved. Built in Lagos, powering
            payments across Nigeria.
          </ThemedText>
          <ThemedText style={[styles.registration, !isWide && styles.centerText]}>
            Corporate Affairs Commission Registration: RN7062973.
          </ThemedText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,127,0,0.2)',
    paddingTop: 40,
    paddingBottom: 28,
    paddingHorizontal: 20,
  },
  inner: {
    alignSelf: 'center',
    gap: 28,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 36,
  },
  topRowStack: {
    flexDirection: 'column',
  },
  brandBlock: {
    maxWidth: 340,
    gap: 14,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,127,0,0.3)',
    backgroundColor: '#fff',
  },
  brandText: {
    color: BRAND.navy,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  brandAccent: {
    color: BRAND.orange,
    fontWeight: '800',
  },
  brandBlurb: {
    color: BRAND.muted,
    fontSize: 14,
    lineHeight: 22,
  },
  columns: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 28,
    justifyContent: 'flex-end',
  },
  columnsStack: {
    justifyContent: 'flex-start',
  },
  column: {
    minWidth: 140,
    maxWidth: 200,
    gap: 10,
  },
  columnTitle: {
    color: BRAND.navy,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  columnLink: {
    color: BRAND.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  cacNote: {
    color: 'rgba(102,112,133,0.9)',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },
  connectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 32,
  },
  bottomBar: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(226,232,240,0.9)',
    paddingTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  bottomBarStack: {
    flexDirection: 'column',
    alignItems: 'center',
  },
  copyright: {
    color: BRAND.muted,
    fontSize: 13,
    lineHeight: 20,
    flex: 1,
  },
  registration: {
    color: BRAND.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  centerText: {
    textAlign: 'center',
  },
});
