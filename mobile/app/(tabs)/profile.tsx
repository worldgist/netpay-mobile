import { useCallback, useEffect, useRef, useState, type ReactNode, type ComponentProps } from 'react';

import { StyleSheet, View, ScrollView, TouchableOpacity, Switch, Alert, RefreshControl, Modal } from 'react-native';

import { ThemedText } from '@/components/themed-text';

import { ThemedView } from '@/components/themed-view';

import { MaterialIcons } from '@expo/vector-icons';

import { useRouter } from 'expo-router';

import { supabase } from '@/lib/supabase';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AsyncStorage from '@react-native-async-storage/async-storage';

import { clearPendingBiometricReenrollment } from '@/utils/pending-biometric-reenrollment';

import { useProfile } from '@/contexts/profile-context';



type ProfileMenuRowProps = {

  icon: ComponentProps<typeof MaterialIcons>['name'];

  title: string;

  description: string;

  onPress?: () => void;

  right?: ReactNode;

  showDivider?: boolean;

  showChevron?: boolean;

  destructive?: boolean;

  disabled?: boolean;

};



function ProfileMenuRow({

  icon,

  title,

  description,

  onPress,

  right,

  showDivider = false,

  showChevron = true,

  destructive = false,

  disabled = false,

}: ProfileMenuRowProps) {

  const content = (

    <>

      {showDivider ? <View style={styles.menuDivider} /> : null}

      <View style={[styles.menuRow, disabled && styles.menuRowDisabled]}>

        <View style={[styles.menuIconWrap, destructive && styles.menuIconWrapDestructive]}>

          <MaterialIcons name={icon} size={20} color={destructive ? '#EF4444' : '#FF7F00'} />

        </View>

        <View style={styles.menuTextWrap}>

          <ThemedText style={[styles.menuTitle, destructive && styles.menuTitleDestructive]}>{title}</ThemedText>

          <ThemedText style={[styles.menuDescription, destructive && styles.menuDescriptionDestructive]}>

            {description}

          </ThemedText>

        </View>

        {right ?? (showChevron ? (

          <MaterialIcons name="chevron-right" size={22} color={destructive ? '#EF4444' : '#C4C4C4'} />

        ) : null)}

      </View>

    </>

  );



  if (onPress) {

    return (

      <TouchableOpacity onPress={onPress} activeOpacity={0.7} disabled={disabled}>

        {content}

      </TouchableOpacity>

    );

  }



  return content;

}



const NOTIFICATIONS_ENABLED_KEY = '@netpay_notifications_enabled';



export default function ProfileScreen() {

  const router = useRouter();

  const insets = useSafeAreaInsets();

  const { profile, loading, refreshing, refresh, patchProfile } = useProfile();

  const [biometricUpdating, setBiometricUpdating] = useState(false);

  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const [notificationsUpdating, setNotificationsUpdating] = useState(false);

  const [feedbackModal, setFeedbackModal] = useState<{

    visible: boolean;

    variant: 'success' | 'error';

    title: string;

    message: string;

  }>({ visible: false, variant: 'success', title: '', message: '' });



  const isMounted = useRef(true);



  useEffect(() => {

    isMounted.current = true;

    return () => {

      isMounted.current = false;

    };

  }, []);



  useEffect(() => {

    AsyncStorage.getItem(NOTIFICATIONS_ENABLED_KEY)

      .then((value) => {

        if (value !== null) {

          setNotificationsEnabled(JSON.parse(value));

        }

      })

      .catch((error) => {

        console.error('Failed to load notifications preference:', error);

      });

  }, []);



  useEffect(() => {

    if (!loading && !profile) {

      supabase.auth.getSession().then(({ data }) => {

        if (!data.session) {

          router.replace('/auth/login');

        }

      });

    }

  }, [loading, profile, router]);



  const userId = profile?.id ?? null;

  const userName = profile?.full_name ?? '';

  const userEmail = profile?.email ?? '';

  const biometricEnabled = profile?.biometric_enabled ?? false;



  const handleToggleBiometric = useCallback(

    async (enabled: boolean) => {

      if (!userId || biometricUpdating) return;



      setBiometricUpdating(true);

      const previousValue = biometricEnabled;

      patchProfile({ biometric_enabled: enabled });



      try {

        const { error } = await supabase

          .from('profiles')

          .update({ biometric_enabled: enabled, updated_at: new Date().toISOString() })

          .eq('id', userId);



        if (error) throw error;



        if (enabled) {

          await clearPendingBiometricReenrollment();

        }



        if (isMounted.current) {

          setFeedbackModal({

            visible: true,

            variant: 'success',

            title: 'Biometric login',

            message: enabled

              ? 'Biometric login has been enabled successfully. You can use Face ID or fingerprint to sign in faster.'

              : 'Biometric login has been turned off. You can enable it again anytime from this screen.',

          });

        }

      } catch (error) {

        patchProfile({ biometric_enabled: previousValue });

        const fallbackMessage =

          error instanceof Error

            ? error.message

            : 'Unable to update biometric setting. Please check your network or try again later.';



        if (isMounted.current) {

          setFeedbackModal({

            visible: true,

            variant: 'error',

            title: 'Biometric login',

            message: fallbackMessage,

          });

        }

      } finally {

        if (isMounted.current) {

          setBiometricUpdating(false);

        }

      }

    },

    [userId, biometricUpdating, biometricEnabled, patchProfile]

  );



  const handleLogout = useCallback(() => {

    Alert.alert(

      'Logout',

      'Are you sure you want to logout?',

      [

        { text: 'Cancel', style: 'cancel' },

        {

          text: 'Logout',

          style: 'destructive',

          onPress: async () => {

            try {

              await supabase.auth.signOut();

              router.replace('/auth/login');

            } catch (error) {

              console.error('Failed to logout:', error);

              const message = error instanceof Error ? error.message : 'Unable to log out. Please try again.';

              Alert.alert('Logout', message);

            }

          },

        },

      ]

    );

  }, [router]);



  const handleToggleNotifications = useCallback(

    async (enabled: boolean) => {

      if (!isMounted.current) return;



      setNotificationsUpdating(true);

      const previousValue = notificationsEnabled;

      setNotificationsEnabled(enabled);



      try {

        await AsyncStorage.setItem(NOTIFICATIONS_ENABLED_KEY, JSON.stringify(enabled));



        if (isMounted.current) {

          setFeedbackModal({

            visible: true,

            variant: 'success',

            title: 'Notifications',

            message: enabled

              ? 'Notifications have been enabled successfully. You will receive updates and alerts when they are available.'

              : 'Notifications have been turned off. You can turn them back on anytime from this screen.',

          });

        }

      } catch (error) {

        if (isMounted.current) {

          setNotificationsEnabled(previousValue);

          const message = error instanceof Error ? error.message : 'Unable to update notifications setting. Please try again.';

          setFeedbackModal({

            visible: true,

            variant: 'error',

            title: 'Notifications',

            message,

          });

        }

      } finally {

        if (isMounted.current) {

          setNotificationsUpdating(false);

        }

      }

    },

    [notificationsEnabled]

  );



  const showInitialPlaceholder = loading && !profile;



  return (

    <ThemedView style={styles.container}>

      <View style={[styles.header, { paddingTop: Math.max(insets.top + 8, 44) }]}>

        <TouchableOpacity

          style={styles.headerBackButton}

          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}

          activeOpacity={0.7}

          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>

          <MaterialIcons name="arrow-back-ios" size={20} color="#111" />

        </TouchableOpacity>

        <ThemedText style={styles.headerTitle}>My Profile</ThemedText>

        <View style={styles.headerBackButton} />

      </View>



      <ScrollView

        style={styles.scrollView}

        showsVerticalScrollIndicator={false}

        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 96 }]}

        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#FF7F00" />}>

        <View style={styles.profileCard}>

          <View style={styles.profileCardAvatar}>

            <MaterialIcons name="person" size={34} color="#BDBDBD" />

          </View>

          <View style={styles.profileCardText}>

            <ThemedText style={styles.profileCardName} numberOfLines={1}>

              {showInitialPlaceholder ? 'Loading...' : userName || 'User'}

            </ThemedText>

            <ThemedText style={styles.profileCardEmail} numberOfLines={1}>

              {showInitialPlaceholder ? 'Loading...' : userEmail}

            </ThemedText>

          </View>

        </View>



        <View style={styles.menuCard}>

          <ProfileMenuRow

            icon="edit"

            title="Edit Profile"

            description="Update your personal account information"

            onPress={() => router.push('/edit-profile')}

          />



          <ProfileMenuRow

            icon="notifications"

            title="Notifications"

            description={notificationsEnabled ? 'Notifications are enabled' : 'Enable notifications for updates and alerts'}

            showDivider

            right={

              <Switch

                value={notificationsEnabled}

                onValueChange={handleToggleNotifications}

                trackColor={{ false: '#E5E7EB', true: '#FFD4A8' }}

                thumbColor={notificationsEnabled ? '#FF7F00' : '#FFFFFF'}

                ios_backgroundColor="#E5E7EB"

                disabled={showInitialPlaceholder || notificationsUpdating || !userId}

              />

            }

            disabled={showInitialPlaceholder || notificationsUpdating || !userId}

            onPress={() => {

              if (showInitialPlaceholder || notificationsUpdating || !userId) return;

              handleToggleNotifications(!notificationsEnabled);

            }}

          />



          <ProfileMenuRow

            icon="people"

            title="Referral"

            description="Invite friends and earn referral rewards"

            onPress={() => router.push('/referral')}

            showDivider

          />



          <ProfileMenuRow

            icon="email"

            title="Contact us"

            description="Reach our team for help and feedback"

            onPress={() => router.push('/contact-us')}

            showDivider

          />



          <ProfileMenuRow

            icon="description"

            title="Statement"

            description="View, download or email your transaction statement"

            onPress={() => router.push('/statement-of-account')}

            showDivider

          />



          <ProfileMenuRow

            icon="verified-user"

            title="Security"

            description="Manage change PIN and change password"

            onPress={() => router.push('/security')}

            showDivider

          />



          <ProfileMenuRow

            icon="fingerprint"

            title="Biometric Login"

            description={

              biometricEnabled

                ? 'Use fingerprint or Face ID to sign in'

                : 'Enable fingerprint or Face ID sign in'

            }

            showDivider

            right={

              <Switch

                value={biometricEnabled}

                onValueChange={handleToggleBiometric}

                trackColor={{ false: '#E5E7EB', true: '#FFD4A8' }}

                thumbColor={biometricEnabled ? '#FF7F00' : '#FFFFFF'}

                ios_backgroundColor="#E5E7EB"

                disabled={showInitialPlaceholder || biometricUpdating || !userId}

              />

            }

            disabled={showInitialPlaceholder || biometricUpdating || !userId}

            onPress={() => {

              if (showInitialPlaceholder || biometricUpdating || !userId) return;

              handleToggleBiometric(!biometricEnabled);

            }}

          />



          <ProfileMenuRow

            icon="description"

            title="Terms & Conditions"

            description="Read the rules and terms for using NetPay"

            onPress={() => router.push('/terms-and-conditions')}

            showDivider

          />



          <ProfileMenuRow

            icon="description"

            title="Privacy Policy"

            description="See how your personal data is collected and used"

            onPress={() => router.push('/privacy-policy')}

            showDivider

          />



          <ProfileMenuRow

            icon="delete"

            title="Delete Account"

            description="Permanently delete your account and all data"

            onPress={() => router.push('/delete-account')}

            destructive

            showChevron

          />

        </View>



        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.7}>

          <MaterialIcons name="logout" size={20} color="#EF4444" />

          <ThemedText style={styles.logoutText}>Logout</ThemedText>

        </TouchableOpacity>

      </ScrollView>



      <Modal

        visible={feedbackModal.visible}

        transparent

        animationType="fade"

        onRequestClose={() => setFeedbackModal((m) => ({ ...m, visible: false }))}>

        <View style={styles.modalOverlay}>

          <View style={styles.modalContent}>

            <View

              style={feedbackModal.variant === 'success' ? styles.modalIconCircleSuccess : styles.modalIconCircleError}>

              <MaterialIcons

                name={feedbackModal.variant === 'success' ? 'check-circle' : 'error-outline'}

                size={36}

                color="#fff"

              />

            </View>

            <ThemedText style={styles.modalTitle}>{feedbackModal.title}</ThemedText>

            <ThemedText style={styles.modalMessage}>{feedbackModal.message}</ThemedText>

            <TouchableOpacity

              style={styles.modalButton}

              activeOpacity={0.85}

              onPress={() => setFeedbackModal((m) => ({ ...m, visible: false }))}>

              <ThemedText style={styles.modalButtonText}>OK</ThemedText>

            </TouchableOpacity>

          </View>

        </View>

      </Modal>

    </ThemedView>

  );

}



const styles = StyleSheet.create({

  container: {

    flex: 1,

    backgroundColor: '#F3F4F6',

  },

  header: {

    flexDirection: 'row',

    alignItems: 'center',

    justifyContent: 'space-between',

    paddingHorizontal: 16,

    paddingBottom: 12,

    backgroundColor: '#F3F4F6',

  },

  headerBackButton: {

    width: 36,

    height: 36,

    alignItems: 'center',

    justifyContent: 'center',

  },

  headerTitle: {

    fontSize: 18,

    fontWeight: '700',

    color: '#111827',

  },

  scrollView: {

    flex: 1,

  },

  scrollContent: {

    paddingHorizontal: 16,

    paddingTop: 4,

  },

  profileCard: {

    flexDirection: 'row',

    alignItems: 'center',

    backgroundColor: '#FF7F00',

    borderRadius: 16,

    padding: 16,

    marginBottom: 16,

    gap: 14,

  },

  profileCardAvatar: {

    width: 56,

    height: 56,

    borderRadius: 28,

    backgroundColor: '#FFFFFF',

    alignItems: 'center',

    justifyContent: 'center',

  },

  profileCardText: {

    flex: 1,

  },

  profileCardName: {

    fontSize: 18,

    fontWeight: '700',

    color: '#FFFFFF',

    marginBottom: 4,

  },

  profileCardEmail: {

    fontSize: 14,

    color: 'rgba(255, 255, 255, 0.92)',

  },

  menuCard: {

    backgroundColor: '#FFFFFF',

    borderRadius: 16,

    overflow: 'hidden',

    marginBottom: 16,

    shadowColor: '#000',

    shadowOffset: { width: 0, height: 1 },

    shadowOpacity: 0.06,

    shadowRadius: 4,

    elevation: 2,

  },

  menuDivider: {

    height: StyleSheet.hairlineWidth,

    backgroundColor: '#ECECEC',

    marginLeft: 68,

  },

  menuRow: {

    flexDirection: 'row',

    alignItems: 'center',

    paddingHorizontal: 14,

    paddingVertical: 14,

    gap: 12,

  },

  menuRowDisabled: {

    opacity: 0.6,

  },

  menuIconWrap: {

    width: 40,

    height: 40,

    borderRadius: 20,

    backgroundColor: '#FFF3E8',

    alignItems: 'center',

    justifyContent: 'center',

  },

  menuIconWrapDestructive: {

    backgroundColor: '#FEE2E2',

  },

  menuTextWrap: {

    flex: 1,

    paddingRight: 8,

  },

  menuTitle: {

    fontSize: 15,

    fontWeight: '600',

    color: '#111827',

    marginBottom: 2,

  },

  menuTitleDestructive: {

    color: '#EF4444',

  },

  menuDescription: {

    fontSize: 12,

    lineHeight: 17,

    color: '#6B7280',

  },

  menuDescriptionDestructive: {

    color: '#DC2626',

  },

  logoutButton: {

    flexDirection: 'row',

    alignItems: 'center',

    justifyContent: 'center',

    backgroundColor: '#FFFFFF',

    borderWidth: 1,

    borderColor: '#EF4444',

    borderRadius: 14,

    paddingVertical: 14,

    gap: 8,

  },

  logoutText: {

    fontSize: 15,

    fontWeight: '700',

    color: '#EF4444',

  },

  modalOverlay: {

    flex: 1,

    backgroundColor: 'rgba(0, 0, 0, 0.5)',

    justifyContent: 'center',

    alignItems: 'center',

    paddingHorizontal: 24,

  },

  modalContent: {

    backgroundColor: '#fff',

    borderRadius: 20,

    paddingHorizontal: 28,

    paddingVertical: 36,

    width: '100%',

    maxWidth: 360,

    alignItems: 'center',

  },

  modalIconCircleSuccess: {

    width: 80,

    height: 80,

    borderRadius: 40,

    backgroundColor: '#4CAF50',

    justifyContent: 'center',

    alignItems: 'center',

    marginBottom: 20,

  },

  modalIconCircleError: {

    width: 80,

    height: 80,

    borderRadius: 40,

    backgroundColor: '#F44336',

    justifyContent: 'center',

    alignItems: 'center',

    marginBottom: 20,

  },

  modalTitle: {

    fontSize: 20,

    fontWeight: '700',

    color: '#333',

    marginBottom: 10,

    textAlign: 'center',

  },

  modalMessage: {

    fontSize: 15,

    color: '#666',

    textAlign: 'center',

    marginBottom: 26,

    lineHeight: 22,

  },

  modalButton: {

    backgroundColor: '#FF7F00',

    paddingVertical: 14,

    paddingHorizontal: 40,

    borderRadius: 12,

    minWidth: 140,

    alignItems: 'center',

  },

  modalButtonText: {

    fontSize: 16,

    fontWeight: '700',

    color: '#fff',

  },

});


