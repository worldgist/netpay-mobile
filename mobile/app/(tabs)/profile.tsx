import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View, ScrollView, TouchableOpacity, Switch, Alert, RefreshControl, Modal, Platform } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricUpdating, setBiometricUpdating] = useState(false);
  const [pinEnabled, setPinEnabled] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true); // Default to true
  const [notificationsUpdating, setNotificationsUpdating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Statement of Account Modal State
  const [showStatementModal, setShowStatementModal] = useState(false);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const isMounted = useRef(true);

  const NOTIFICATIONS_ENABLED_KEY = '@netpay_notifications_enabled';

  const fetchProfile = useCallback(
    async ({ isRefresh = false }: { isRefresh?: boolean } = {}) => {
      if (isRefresh) {
        if (isMounted.current) setRefreshing(true);
      } else {
        if (isMounted.current) setLoading(true);
      }

      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        const session = sessionData.session;
        if (!session) {
          router.replace('/auth/login');
          return;
        }

        const sessionEmail = session.user.email || '';
        const fallbackName = sessionEmail.split('@')[0] || 'User';

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('full_name, email, biometric_enabled, pin_enabled')
          .eq('id', session.user.id)
          .maybeSingle();

        if (profileError) {
          console.error('Profile fetch error details:', {
            message: profileError.message,
            code: profileError.code,
            details: profileError.details,
            hint: profileError.hint,
            userId: session.user.id,
            email: sessionEmail
          });
          
          // If it's a "not found" error or RLS permission issue, try to create the profile
          const isNotFoundError = profileError.code === 'PGRST116' || 
                                 profileError.message?.includes('not found') ||
                                 profileError.message?.includes('No rows returned');
          const isRLSError = profileError.code === '42501' || 
                            profileError.message?.includes('permission') ||
                            profileError.message?.includes('policy');
          
          if (isNotFoundError || (isRLSError && !profile)) {
            console.log('Profile not found or RLS issue, attempting to create it...');
            try {
              const { error: createError, data: createdProfile } = await supabase
                .from('profiles')
                .insert({
                  id: session.user.id,
                  email: sessionEmail,
                  full_name: fallbackName,
                  balance: 0,
                  status: 'active',
                  biometric_enabled: false,
                  pin_enabled: false,
                })
                .select('full_name, email, biometric_enabled, pin_enabled')
                .single();
              
              if (createError) {
                console.error('Failed to create profile:', createError);
                // If creation fails due to RLS, try using upsert instead
                if (createError.code === '42501') {
                  console.log('RLS error on insert, trying upsert...');
                  const { error: upsertError, data: upsertedProfile } = await supabase
                    .from('profiles')
                    .upsert({
                      id: session.user.id,
                      email: sessionEmail,
                      full_name: fallbackName,
                      balance: 0,
                      status: 'active',
                      biometric_enabled: false,
                      pin_enabled: false,
                    }, {
                      onConflict: 'id'
                    })
                    .select('full_name, email, biometric_enabled, pin_enabled')
                    .single();
                  
                  if (upsertError) {
                    console.error('Upsert also failed:', upsertError);
                    // Continue with fallback values
                  } else if (upsertedProfile) {
                    console.log('Profile upserted successfully');
                    setUserId(session.user.id);
                    setUserName(upsertedProfile.full_name || fallbackName);
                    const profileEmail = upsertedProfile.email || '';
                    const displayEmail = sessionEmail || profileEmail;
                    setUserEmail(displayEmail);
                    setBiometricEnabled(Boolean(upsertedProfile.biometric_enabled));
                    setPinEnabled(Boolean(upsertedProfile.pin_enabled));
                    return; // Success, exit early
                  }
                }
                // Continue with fallback values even if creation fails
              } else if (createdProfile) {
                console.log('Profile created successfully');
                setUserId(session.user.id);
                setUserName(createdProfile.full_name || fallbackName);
                const profileEmail = createdProfile.email || '';
                const displayEmail = sessionEmail || profileEmail;
                setUserEmail(displayEmail);
                setBiometricEnabled(Boolean(createdProfile.biometric_enabled));
                setPinEnabled(Boolean(createdProfile.pin_enabled));
                return; // Success, exit early
              }
            } catch (createErr) {
              console.error('Error creating profile:', createErr);
              // Continue with fallback values
            }
          } else {
            throw profileError;
          }
        }

        if (!isMounted.current) return;

        setUserId(session.user.id);
        setUserName(profile?.full_name || fallbackName);
        const profileEmail = profile?.email || '';
        const displayEmail = sessionEmail || profileEmail;
        setUserEmail(displayEmail);
        setBiometricEnabled(Boolean(profile?.biometric_enabled));
        setPinEnabled(Boolean(profile?.pin_enabled));

        // Load notifications preference from AsyncStorage
        try {
          const notificationsPref = await AsyncStorage.getItem(NOTIFICATIONS_ENABLED_KEY);
          if (notificationsPref !== null) {
            setNotificationsEnabled(JSON.parse(notificationsPref));
          }
        } catch (error) {
          console.error('Failed to load notifications preference:', error);
          // Keep default value (true)
        }

        // If profile exists but email doesn't match, update it
        if (profile && sessionEmail && profileEmail !== sessionEmail) {
          supabase
            .from('profiles')
            .update({ email: sessionEmail, updated_at: new Date().toISOString() })
            .eq('id', session.user.id)
            .then(({ error: syncError }) => {
              if (syncError) {
                console.warn('Failed to sync profile email:', syncError);
              }
            });
        }
        
        // If no profile exists, create it
        if (!profile && !profileError) {
          console.log('No profile found, creating one...');
          try {
            const { error: createError } = await supabase
              .from('profiles')
              .insert({
                id: session.user.id,
                email: sessionEmail,
                full_name: fallbackName,
                balance: 0,
                status: 'active',
                biometric_enabled: false,
                pin_enabled: false,
              });
            
            if (createError) {
              console.error('Failed to create profile:', createError);
            } else {
              console.log('Profile created successfully');
            }
          } catch (createErr) {
            console.error('Error creating profile:', createErr);
          }
        }
      } catch (error) {
        console.error('Failed to load profile:', error);
        console.error('Error details:', {
          message: error instanceof Error ? error.message : String(error),
          code: (error as any)?.code,
          details: (error as any)?.details,
          hint: (error as any)?.hint,
          name: error instanceof Error ? error.name : undefined,
          stack: error instanceof Error ? error.stack : undefined
        });
        if (!isMounted.current) return;
        
        // Provide more specific error messages
        let message = 'Unable to load your profile. Please try again.';
        if (error instanceof Error) {
          const errorCode = (error as any)?.code;
          if (errorCode === '42501' || error.message?.includes('permission') || error.message?.includes('policy')) {
            message = 'Permission denied. Please contact support.';
          } else if (errorCode === 'PGRST116' || error.message?.includes('not found')) {
            message = 'Profile not found. Please contact support.';
          } else {
            message = error.message || message;
          }
        }
        Alert.alert('Profile', message);
      } finally {
        if (!isMounted.current) return;
        if (isRefresh) {
          setRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    },
    [router]
  );

  useFocusEffect(
    useCallback(() => {
      isMounted.current = true;
      fetchProfile();

      return () => {
        isMounted.current = false;
      };
    }, [fetchProfile])
  );

  const handleRefresh = useCallback(() => {
    fetchProfile({ isRefresh: true });
  }, [fetchProfile]);

  const handleToggleBiometric = useCallback(
    async (enabled: boolean) => {
      if (!userId) return;

      if (!isMounted.current) return;

      setBiometricUpdating(true);
      const previousValue = biometricEnabled;
      setBiometricEnabled(enabled);

      try {
        const { error } = await supabase
          .from('profiles')
          .update({ biometric_enabled: enabled })
          .eq('id', userId);

        if (error) {
          throw error;
        }
      } catch (error) {
        console.error('Failed to update biometric setting:', error);
        if (isMounted.current) {
          setBiometricEnabled(previousValue);
          const message = error instanceof Error ? error.message : 'Unable to update biometric setting. Please try again.';
          Alert.alert('Biometric Login', message);
        }
      } finally {
        if (isMounted.current) {
          setBiometricUpdating(false);
        }
      }
    },
    [userId, biometricEnabled]
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

  const handlePINCode = useCallback(() => {
    if (pinEnabled) {
      router.push('/change-pin');
    } else {
      router.push('/setup-pin');
    }
  }, [pinEnabled, router]);

  const handleEditProfile = useCallback(() => {
    router.push('/edit-profile');
  }, [router]);

  const handleToggleNotifications = useCallback(
    async (enabled: boolean) => {
      if (!isMounted.current) return;

      setNotificationsUpdating(true);
      const previousValue = notificationsEnabled;
      setNotificationsEnabled(enabled);

      try {
        await AsyncStorage.setItem(NOTIFICATIONS_ENABLED_KEY, JSON.stringify(enabled));
        
        // Optionally, you can also update push notification permissions here
        // For now, we're just storing the preference
      } catch (error) {
        console.error('Failed to update notifications setting:', error);
        if (isMounted.current) {
          setNotificationsEnabled(previousValue);
          const message = error instanceof Error ? error.message : 'Unable to update notifications setting. Please try again.';
          Alert.alert('Notifications', message);
        }
      } finally {
        if (isMounted.current) {
          setNotificationsUpdating(false);
        }
      }
    },
    [notificationsEnabled]
  );

  const handleReferral = useCallback(() => {
    router.push('/referral');
  }, [router]);

  const handleContactUs = useCallback(() => {
    router.push('/contact-us');
  }, [router]);



  const handleTerms = useCallback(() => {
    router.push('/terms-and-conditions');
  }, [router]);

  const handlePrivacy = useCallback(() => {
    router.push('/privacy-policy');
  }, [router]);

  const handleDownloadStatement = useCallback(async () => {
    if (!userId) return;

    try {
      const res = await fetch(`https://netpay.ng/api/print-user-transactions?user_id=${userId}`);
      if (!res.ok) throw new Error('Failed to generate statement');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      // For web: open in new tab, for mobile: use share or download
      if (Platform.OS === 'web') {
        window.open(url, '_blank');
      } else {
        // Use expo-file-system and expo-sharing for mobile
        const fileUri = FileSystem.cacheDirectory + `statement-${userId}.pdf`;
        await FileSystem.writeAsStringAsync(fileUri, await blob.text(), { encoding: FileSystem.EncodingType.Base64 });
        await Sharing.shareAsync(fileUri);
      }
      URL.revokeObjectURL(url);
    } catch (err) {
      Alert.alert('Statement', err instanceof Error ? err.message : 'Failed to download statement');
    }
  }, [userId]);

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 80 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#FF7F00" />}>
        {/* User Profile Section */}
        <View style={[styles.profileSection, { paddingTop: Math.max(insets.top + 20, 60) }]}>
          <View style={styles.avatarContainer}>
            <MaterialIcons name="person" size={48} color="#FF7F00" />
          </View>
          <ThemedText style={styles.userName}>
            {userName || (loading ? 'Loading...' : 'User')}
          </ThemedText>
          <ThemedText style={styles.userEmail}>
            {userEmail || (loading ? 'Loading...' : '')}
          </ThemedText>
        </View>

        {/* Account Section */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionHeader}>ACCOUNT</ThemedText>

          {/* Edit Profile */}
          <TouchableOpacity style={styles.optionCard} onPress={handleEditProfile} activeOpacity={0.7}>
            <View style={styles.optionLeft}>
              <MaterialIcons name="edit" size={24} color="#FF7F00" />
              <View style={styles.optionTextContainer}>
                <ThemedText style={styles.optionTitle}>Edit Profile</ThemedText>
              </View>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#999" />
          </TouchableOpacity>

          {/* Notifications */}
          <TouchableOpacity
            style={[
              styles.optionCard,
              styles.optionCardWithSwitch,
              (loading || notificationsUpdating || !userId) && styles.optionCardDisabled,
            ]}
            activeOpacity={0.7}
            onPress={() => {
              if (loading || notificationsUpdating || !userId) return;
              handleToggleNotifications(!notificationsEnabled);
            }}
            disabled={loading || notificationsUpdating || !userId}>
            <View style={styles.optionLeft}>
              <MaterialIcons name="notifications" size={24} color="#FF7F00" />
              <View style={styles.optionTextContainer}>
                <ThemedText style={styles.optionTitle}>Notifications</ThemedText>
                <ThemedText style={styles.optionDescription}>
                  {notificationsEnabled ? 'Notifications are enabled' : 'Enable notifications for updates and alerts'}
                </ThemedText>
              </View>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={handleToggleNotifications}
              trackColor={{ false: '#E0E0E0', true: '#FFE0BF' }}
              thumbColor={notificationsEnabled ? '#FF7F00' : '#FF7F00'}
              disabled={loading || notificationsUpdating || !userId}
            />
          </TouchableOpacity>

          {/* Referral */}
          <TouchableOpacity style={styles.optionCard} onPress={handleReferral} activeOpacity={0.7}>
            <View style={styles.optionLeft}>
              <MaterialIcons name="people" size={24} color="#FF7F00" />
              <View style={styles.optionTextContainer}>
                <ThemedText style={styles.optionTitle}>Referral</ThemedText>
              </View>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#999" />
          </TouchableOpacity>


          {/* Contact Us */}
          <TouchableOpacity style={styles.optionCard} onPress={handleContactUs} activeOpacity={0.7}>
            <View style={styles.optionLeft}>
              <MaterialIcons name="email" size={24} color="#FF7F00" />
              <View style={styles.optionTextContainer}>
                <ThemedText style={styles.optionTitle}>Contact us</ThemedText>
              </View>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#999" />
          </TouchableOpacity>

          {/* Biometric Login */}
          <TouchableOpacity
            style={[
              styles.optionCard,
              styles.optionCardWithSwitch,
              (loading || biometricUpdating || !userId) && styles.optionCardDisabled,
            ]}
            activeOpacity={0.7}
            onPress={() => {
              if (loading || biometricUpdating || !userId) return;
              handleToggleBiometric(!biometricEnabled);
            }}
            disabled={loading || biometricUpdating || !userId}>
            <View style={styles.optionLeft}>
              <MaterialIcons name="fingerprint" size={24} color="#FF7F00" />
              <View style={styles.optionTextContainer}>
                <ThemedText style={styles.optionTitle}>Biometric Login</ThemedText>
                <ThemedText style={styles.optionDescription}>
                  {biometricEnabled ? 'Biometric login is enabled' : 'Enable biometric login for quick access'}
                </ThemedText>
              </View>
            </View>
            <Switch
              value={biometricEnabled}
              onValueChange={handleToggleBiometric}
              trackColor={{ false: '#E0E0E0', true: '#FFE0BF' }}
              thumbColor={biometricEnabled ? '#FF7F00' : '#FF7F00'}
              disabled={loading || biometricUpdating || !userId}
            />
          </TouchableOpacity>

          {/* PIN Code */}
          <TouchableOpacity style={styles.optionCard} onPress={handlePINCode} activeOpacity={0.7}>
            <View style={styles.optionLeft}>
              <MaterialIcons name="lock" size={24} color="#FF7F00" />
              <View style={styles.optionTextContainer}>
                <ThemedText style={styles.optionTitle}>{pinEnabled ? 'Change PIN' : 'Set Up PIN'}</ThemedText>
                <ThemedText style={styles.optionDescription}>
                  {pinEnabled ? 'Change your PIN' : 'Set up PIN'}
                </ThemedText>
              </View>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#999" />
          </TouchableOpacity>

          {/* Statement of Account */}
          <TouchableOpacity
            style={styles.optionCard}
            onPress={() => setShowStatementModal(true)}
            activeOpacity={0.7}
          >
            <View style={styles.optionLeft}>
              <MaterialIcons name="description" size={24} color="#FF7F00" />
              <View style={styles.optionTextContainer}>
                <ThemedText style={styles.optionTitle}>Statement of Account (PDF)</ThemedText>
                <ThemedText style={styles.optionDescription}>
                  Download or email your transaction statement
                </ThemedText>
              </View>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#999" />
          </TouchableOpacity>

          {/* Statement Modal */}
          <Modal
            visible={showStatementModal}
            animationType="slide"
            transparent
            onRequestClose={() => setShowStatementModal(false)}
          >
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' }}>
              <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '90%' }}>
                <ThemedText style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 12 }}>Statement of Account</ThemedText>
                <ThemedText style={{ marginBottom: 8 }}>Select date range:</ThemedText>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
                  <TouchableOpacity onPress={() => setShowStartPicker(true)} style={{ flex: 1, marginRight: 8, borderWidth: 1, borderColor: '#eee', borderRadius: 8, padding: 10 }}>
                    <ThemedText>Start: {startDate ? startDate.toLocaleDateString() : 'Select'}</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setShowEndPicker(true)} style={{ flex: 1, marginLeft: 8, borderWidth: 1, borderColor: '#eee', borderRadius: 8, padding: 10 }}>
                    <ThemedText>End: {endDate ? endDate.toLocaleDateString() : 'Select'}</ThemedText>
                  </TouchableOpacity>
                </View>
                {showStartPicker && (
                  <DateTimePicker
                    value={startDate || new Date()}
                    mode="date"
                    display="default"
                    onChange={(_, date) => {
                      setShowStartPicker(false);
                      if (date) setStartDate(date);
                    }}
                  />
                )}
                {showEndPicker && (
                  <DateTimePicker
                    value={endDate || new Date()}
                    mode="date"
                    display="default"
                    onChange={(_, date) => {
                      setShowEndPicker(false);
                      if (date) setEndDate(date);
                    }}
                  />
                )}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 }}>
                  <TouchableOpacity
                    style={{ flex: 1, backgroundColor: '#FF7F00', borderRadius: 8, padding: 12, marginRight: 8, alignItems: 'center', opacity: downloading ? 0.6 : 1 }}
                    disabled={downloading}
                    onPress={async () => {
                      if (!userId || !startDate || !endDate) return Alert.alert('Select date range');
                      setDownloading(true);
                      try {
                        const url = `https://netpay.ng/api/print-user-transactions?user_id=${userId}&start=${startDate.toISOString()}&end=${endDate.toISOString()}`;
                        const res = await fetch(url);
                        if (!res.ok) throw new Error('Failed to generate statement');
                        const blob = await res.blob();
                        const fileUri = FileSystem.cacheDirectory + `statement-${userId}.pdf`;
                        await FileSystem.writeAsStringAsync(fileUri, await blob.text(), { encoding: FileSystem.EncodingType.Base64 });
                        await Sharing.shareAsync(fileUri);
                      } catch (err) {
                        Alert.alert('Statement', err instanceof Error ? err.message : 'Failed to download statement');
                      } finally {
                        setDownloading(false);
                      }
                    }}
                  >
                    <ThemedText style={{ color: '#fff', fontWeight: 'bold' }}>{downloading ? 'Downloading...' : 'Download PDF'}</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ flex: 1, backgroundColor: '#007AFF', borderRadius: 8, padding: 12, marginLeft: 8, alignItems: 'center', opacity: sendingEmail ? 0.6 : 1 }}
                    disabled={sendingEmail}
                    onPress={async () => {
                      if (!userId || !userEmail || !startDate || !endDate) return Alert.alert('Select date range');
                      setSendingEmail(true);
                      try {
                        const url = `https://netpay.ng/api/print-user-transactions?user_id=${userId}&start=${startDate.toISOString()}&end=${endDate.toISOString()}&send_email=1&email=${encodeURIComponent(userEmail)}`;
                        const res = await fetch(url);
                        if (!res.ok) throw new Error('Failed to send statement');
                        Alert.alert('Statement', 'Statement sent to your email!');
                      } catch (err) {
                        Alert.alert('Statement', err instanceof Error ? err.message : 'Failed to send statement');
                      } finally {
                        setSendingEmail(false);
                      }
                    }}
                  >
                    <ThemedText style={{ color: '#fff', fontWeight: 'bold' }}>{sendingEmail ? 'Sending...' : 'Send to Email'}</ThemedText>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity onPress={() => setShowStatementModal(false)} style={{ marginTop: 20, alignItems: 'center' }}>
                  <ThemedText style={{ color: '#FF3B30', fontWeight: 'bold' }}>Cancel</ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        </View>

        {/* Legal Section */}
        <View style={styles.section}>
          {/* Terms & Conditions */}
          <TouchableOpacity style={styles.optionCard} onPress={handleTerms} activeOpacity={0.7}>
            <View style={styles.optionLeft}>
              <MaterialIcons name="description" size={24} color="#FF7F00" />
              <View style={styles.optionTextContainer}>
                <ThemedText style={styles.optionTitle}>Terms & Conditions</ThemedText>
              </View>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#999" />
          </TouchableOpacity>

          {/* Privacy Policy */}
          <TouchableOpacity style={styles.optionCard} onPress={handlePrivacy} activeOpacity={0.7}>
            <View style={styles.optionLeft}>
              <MaterialIcons name="security" size={24} color="#FF7F00" />
              <View style={styles.optionTextContainer}>
                <ThemedText style={styles.optionTitle}>Privacy Policy</ThemedText>
              </View>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#999" />
          </TouchableOpacity>
        </View>

        {/* Delete Account Section */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.deleteAccountCard}
            onPress={() => router.push('/delete-account')}
            activeOpacity={0.7}>
            <View style={styles.optionLeft}>
              <MaterialIcons name="delete" size={24} color="#DC2626" />
              <View style={styles.optionTextContainer}>
                <ThemedText style={styles.deleteAccountTitle}>Delete Account</ThemedText>
                <ThemedText style={styles.deleteAccountDescription}>
                  Permanently delete your account and all data
                </ThemedText>
              </View>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#DC2626" />
          </TouchableOpacity>
        </View>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.7}>
          <MaterialIcons name="logout" size={20} color="#FF3B30" />
          <ThemedText style={styles.logoutText}>Logout</ThemedText>
        </TouchableOpacity>

        <View style={{ height: 16 }} />
      </ScrollView>

      {/* Statement Modal */}
      <Modal
        visible={showStatementModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowStatementModal(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <ThemedText style={styles.modalTitle}>Download Statement of Account</ThemedText>
            <ThemedText style={styles.modalDescription}>
              Select a date range for your statement
            </ThemedText>

            {/* Date Pickers */}
            <View style={styles.datePickerContainer}>
              <View style={styles.datePickerWrapper}>
                <ThemedText style={styles.datePickerLabel}>Start Date</ThemedText>
                <TouchableOpacity
                  style={styles.datePickerButton}
                  onPress={() => setShowStartPicker(true)}>
                  <ThemedText style={styles.datePickerText}>
                    {startDate ? startDate.toLocaleDateString() : 'Select start date'}
                  </ThemedText>
                  <MaterialIcons name="calendar-today" size={20} color="#FF7F00" />
                </TouchableOpacity>
              </View>

              <View style={styles.datePickerWrapper}>
                <ThemedText style={styles.datePickerLabel}>End Date</ThemedText>
                <TouchableOpacity
                  style={styles.datePickerButton}
                  onPress={() => setShowEndPicker(true)}>
                  <ThemedText style={styles.datePickerText}>
                    {endDate ? endDate.toLocaleDateString() : 'Select end date'}
                  </ThemedText>
                  <MaterialIcons name="calendar-today" size={20} color="#FF7F00" />
                </TouchableOpacity>
              </View>
            </View>

            {/* DateTimePicker for selecting dates */}
            {showStartPicker && (
              <DateTimePicker
                value={startDate || new Date()}
                mode="date"
                display="default"
                onChange={(event, date) => {
                  setShowStartPicker(false);
                  if (date) {
                    setStartDate(date);
                  }
                }}
              />
            )}
            {showEndPicker && (
              <DateTimePicker
                value={endDate || new Date()}
                mode="date"
                display="default"
                onChange={(event, date) => {
                  setShowEndPicker(false);
                  if (date) {
                    setEndDate(date);
                  }
                }}
              />
            )}

            <TouchableOpacity
              style={styles.downloadButton}
              onPress={handleDownloadStatement}>
              <ThemedText style={styles.downloadButtonText}>
                {downloading ? 'Sending...' : 'Download Statement'}
              </ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowStatementModal(false)}>
              <ThemedText style={styles.closeButtonText}>Close</ThemedText>
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
    backgroundColor: '#fff',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 80,
  },
  profileSection: {
    alignItems: 'center',
    paddingBottom: 32,
    paddingHorizontal: 20,
  },
  avatarContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#FFF3E0',
    borderWidth: 2,
    borderColor: '#FF7F00',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 16,
    color: '#666',
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  optionCardWithSwitch: {
    paddingRight: 12,
  },
  optionCardDisabled: {
    opacity: 0.6,
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  optionTextContainer: {
    marginLeft: 12,
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  optionDescription: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  deleteAccountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#DC2626',
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  deleteAccountTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#DC2626',
    marginBottom: 4,
  },
  deleteAccountDescription: {
    fontSize: 12,
    color: '#991B1B',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FF3B30',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 20,
    marginTop: 8,
    gap: 8,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF3B30',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  modalContent: {
    width: '90%',
    maxWidth: 400,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    elevation: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  modalDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  datePickerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  datePickerWrapper: {
    flex: 1,
    marginHorizontal: 4,
  },
  datePickerLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  datePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FF7F00',
  },
  datePickerText: {
    fontSize: 16,
    color: '#333',
    marginRight: 8,
  },
  downloadButton: {
    backgroundColor: '#FF7F00',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  downloadButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#fff',
  },
  closeButton: {
    backgroundColor: '#ccc',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
});

