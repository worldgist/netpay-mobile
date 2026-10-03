import { ReactNode, useMemo } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { LandingFooter } from '@/components/landing/landing-footer';
import { supabase } from '@/lib/supabase';
import { LANDING_BRAND as BRAND, LANDING_NAV_LINKS } from '@/constants/landing';

type LandingShellProps = {
  children: ReactNode;
  activeHref?: string;
};

export function LandingShell({ children, activeHref }: LandingShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const isWide = width >= 960;
  const contentWidth = Math.min(width, 1180);
  const current = activeHref || pathname;

  const goLogin = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) {
        router.replace('/(tabs)');
        return;
      }
    } catch {
      // Fall through to login.
    }
    router.push('/auth/login');
  };

  const goSignup = () => router.push('/auth/signup');
  const goHome = () => router.push('/landing' as never);

  const headerNav = useMemo(
    () =>
      LANDING_NAV_LINKS.map((link) => {
        const active =
          current === link.href ||
          (link.href !== '/landing' && current.startsWith(link.href));
        return (
          <Pressable
            key={link.href}
            onPress={() => router.push(link.href as never)}
            style={styles.navLink}>
            <ThemedText style={[styles.navLinkText, active && styles.navLinkTextActive]}>
              {link.label}
            </ThemedText>
          </Pressable>
        );
      }),
    [current, router],
  );

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={[styles.headerInner, { width: contentWidth }]}>
          <Pressable style={styles.brandRow} onPress={goHome}>
            <Image
              source={require('@/assets/images/logo.png')}
              style={styles.brandLogo}
              contentFit="contain"
            />
            <ThemedText style={styles.brandText}>
              NET<ThemedText style={styles.brandTextAccent}>PAY</ThemedText>
            </ThemedText>
          </Pressable>

          {isWide ? <View style={styles.navLinks}>{headerNav}</View> : null}

          <View style={styles.headerActions}>
            <Pressable style={styles.headerSignup} onPress={goSignup}>
              <ThemedText style={styles.headerSignupText}>Sign Up</ThemedText>
            </Pressable>
            <Pressable style={styles.headerLogin} onPress={goLogin}>
              <MaterialIcons name="person" size={16} color={BRAND.orange} />
              <ThemedText style={styles.headerLoginText}>Login</ThemedText>
            </Pressable>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={Platform.OS === 'web'}>
        <View style={styles.page}>{children}</View>
        <LandingFooter />
      </ScrollView>
    </View>
  );
}

export function useLandingLayout() {
  const { width } = useWindowDimensions();
  const isWide = width >= 960;
  const contentWidth = Math.min(width, 1180);
  const cardWidth = isWide ? (contentWidth - 48) / 3 : Math.min(contentWidth - 40, 340);
  return { width, isWide, contentWidth, cardWidth };
}

export async function goLandingLogin(
  router: ReturnType<typeof useRouter>,
) {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.user) {
      router.replace('/(tabs)');
      return;
    }
  } catch {
    // Fall through.
  }
  router.push('/auth/login');
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BRAND.white,
  },
  header: {
    backgroundColor: BRAND.orange,
    paddingHorizontal: 20,
    paddingVertical: 14,
    zIndex: 10,
    ...(Platform.OS === 'web' ? ({ position: 'sticky', top: 0 } as object) : null),
  },
  headerInner: {
    alignSelf: 'center',
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandLogo: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  brandText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  brandTextAccent: {
    color: '#FFE0C2',
    fontWeight: '800',
  },
  navLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 22,
    flex: 1,
    justifyContent: 'center',
  },
  navLink: {
    paddingVertical: 4,
  },
  navLinkText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    fontWeight: '600',
  },
  navLinkTextActive: {
    color: '#fff',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerSignup: {
    borderWidth: 1.5,
    borderColor: '#fff',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerSignupText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  headerLogin: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerLoginText: {
    color: BRAND.orange,
    fontWeight: '700',
    fontSize: 14,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 0,
  },
  page: {
    width: '100%',
  },
});
