import { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { NetpayLoadingAnimation } from '@/components/netpay-loading-animation';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { checkSignupAvailability } from '@/utils/signup-availability';
import { assertNetworkAccessAllowed } from '@/utils/network-access';
import { authRedirectUrls } from '@/constants/site';

export default function SignupScreen() {
  const router = useRouter();
  const { ref: refParam } = useLocalSearchParams<{ ref?: string }>();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [emailExists, setEmailExists] = useState(false);
  const [phoneExists, setPhoneExists] = useState(false);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [checkingPhone, setCheckingPhone] = useState(false);
  const emailCheckTimeout = useRef<NodeJS.Timeout | null>(null);
  const phoneCheckTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (typeof refParam === 'string' && refParam.trim()) {
      setReferralCode(refParam.trim());
    }
  }, [refParam]);

  const checkEmailAvailability = async (emailToCheck: string) => {
    const trimmedEmail = emailToCheck.trim().toLowerCase();

    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setEmailExists(false);
      return;
    }

    try {
      setCheckingEmail(true);
      const availability = await checkSignupAvailability({ email: trimmedEmail, phone: null });

      if (!availability.success) {
        console.warn('Email availability check failed:', availability.error);
        setEmailExists(false);
        return;
      }

      setEmailExists(availability.emailExists);
    } catch (err) {
      console.error('Error checking email availability:', err);
      setEmailExists(false);
    } finally {
      setCheckingEmail(false);
    }
  };

  const checkPhoneAvailability = async (phoneToCheck: string) => {
    const sanitizedPhone = phoneToCheck.replace(/[^0-9]/g, '');

    if (!sanitizedPhone || sanitizedPhone.length < 10) {
      setPhoneExists(false);
      return;
    }

    try {
      setCheckingPhone(true);
      const availability = await checkSignupAvailability({ email: null, phone: sanitizedPhone });

      if (!availability.success) {
        console.warn('Phone availability check failed:', availability.error);
        setPhoneExists(false);
        return;
      }

      setPhoneExists(availability.phoneExists);
    } catch (err) {
      console.error('Error checking phone availability:', err);
      setPhoneExists(false);
    } finally {
      setCheckingPhone(false);
    }
  };

  // Debounced email check
  useEffect(() => {
    if (emailCheckTimeout.current) {
      clearTimeout(emailCheckTimeout.current);
    }

    emailCheckTimeout.current = setTimeout(() => {
      if (email) {
        checkEmailAvailability(email);
      } else {
        setEmailExists(false);
      }
    }, 500) as unknown as NodeJS.Timeout; // Wait 500ms after user stops typing

    return () => {
      if (emailCheckTimeout.current) {
        clearTimeout(emailCheckTimeout.current);
      }
    };
  }, [email]);

  // Debounced phone check
  useEffect(() => {
    if (phoneCheckTimeout.current) {
      clearTimeout(phoneCheckTimeout.current);
    }

    phoneCheckTimeout.current = setTimeout(() => {
      if (phone) {
        checkPhoneAvailability(phone);
      } else {
        setPhoneExists(false);
      }
    }, 500) as unknown as NodeJS.Timeout; // Wait 500ms after user stops typing

    return () => {
      if (phoneCheckTimeout.current) {
        clearTimeout(phoneCheckTimeout.current);
      }
    };
  }, [phone]);

  const handleCreateAccount = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedFirstName = firstName.trim();
    const trimmedLastName = lastName.trim();
    const trimmedPhone = phone.trim();
    const trimmedReferral = referralCode.trim();
    const sanitizedPhone = trimmedPhone ? trimmedPhone.replace(/[^0-9]/g, '') : '';

    if (!trimmedFirstName || !trimmedLastName) {
      Alert.alert('Sign Up', 'Please provide your first and last name.');
      return;
    }

    if (!trimmedEmail) {
      Alert.alert('Sign Up', 'Please enter a valid email address.');
      return;
    }

    if (emailExists) {
      Alert.alert('Sign Up', 'This email is already registered. Please sign in instead.');
      return;
    }

    if (sanitizedPhone && phoneExists) {
      Alert.alert('Sign Up', 'This phone number is already linked to an account.');
      return;
    }

    if (!password || password.length < 6) {
      Alert.alert('Sign Up', 'Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Sign Up', 'Passwords do not match.');
      return;
    }

    try {
      setLoading(true);
      await assertNetworkAccessAllowed(supabase);

      const availability = await checkSignupAvailability({
        email: trimmedEmail,
        phone: sanitizedPhone || null,
      });

      if (!availability.success) {
        throw new Error(availability.error || 'Unable to verify email and phone.');
      }

      if (availability.emailExists) {
        setLoading(false);
        Alert.alert('Sign Up', 'An account with this email already exists. Please sign in instead.');
        return;
      }

      if (sanitizedPhone && availability.phoneExists) {
        setLoading(false);
        Alert.alert('Sign Up', 'This phone number is already linked to an account.');
        return;
      }

      const { data: signUpData, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          emailRedirectTo: authRedirectUrls.emailVerification(trimmedEmail),
          data: {
            first_name: trimmedFirstName,
            last_name: trimmedLastName,
            phone: sanitizedPhone || null,
            referral_code: trimmedReferral || null,
          },
        },
      });

      if (error) {
        setLoading(false);
        Alert.alert('Sign Up Failed', error.message || 'We could not create your account.');
        return;
      }

      const createdUserId = signUpData?.user?.id || null;

      if (trimmedReferral && createdUserId) {
        try {
          const { data: referralResponse, error: referralError } = await supabase.functions.invoke(
            'apply-referral-code',
            {
              body: {
                referral_code: trimmedReferral,
                referred_user_id: createdUserId,
                referred_email: trimmedEmail,
                referred_phone: sanitizedPhone || null,
              },
            }
          );

          if (referralError || referralResponse?.success === false) {
            const message =
              (referralResponse && 'error' in referralResponse && typeof referralResponse.error === 'string'
                ? referralResponse.error
                : referralError?.message) || 'Unable to apply referral code.';
            Alert.alert('Referral Code', message);
          }
        } catch (referralException) {
          console.error('Failed to apply referral code:', referralException);
          Alert.alert('Referral Code', 'Unable to apply referral code. Please try again later.');
        }
      }

      setLoading(false);
      Alert.alert('Verify Your Email', 'We have sent a verification code to your email address. Enter it to complete your registration.');
      router.push({ pathname: '/email-verification', params: { email: trimmedEmail } });
    } catch (err) {
      setLoading(false);
      Alert.alert('Sign Up Error', err instanceof Error ? err.message : 'An unexpected error occurred.');
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <ThemedView style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <MaterialIcons name="arrow-back" size={24} color="#000" />
            </TouchableOpacity>
            <Image
              source={require('@/assets/images/logo.png')}
              style={styles.logoImage}
              contentFit="contain"
            />
            <View style={styles.placeholder} />
          </View>

          {/* Title Section */}
          <View style={styles.titleSection}>
            <ThemedText style={styles.title}>
              Create Account
            </ThemedText>
            <ThemedText style={styles.subtitle}>
              Sign up to get started
            </ThemedText>
          </View>


          {/* Name Row */}
          <View style={styles.row}>
            <View style={[styles.inputContainer, styles.halfWidth]}>
              <MaterialIcons name="person" size={20} color="#666" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="First name"
                placeholderTextColor="#999"
                value={firstName}
                onChangeText={setFirstName}
                autoCapitalize="words"
                maxLength={50}
              />
            </View>
            <View style={[styles.inputContainer, styles.halfWidth]}>
              <MaterialIcons name="person" size={20} color="#666" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Last name"
                placeholderTextColor="#999"
                value={lastName}
                onChangeText={setLastName}
                autoCapitalize="words"
              />
            </View>
          </View>

          {/* Email Input */}
          <View>
            <View style={[styles.inputContainer, emailExists && styles.inputContainerError]}>
              <MaterialIcons 
                name="email" 
                size={20} 
                color={emailExists ? '#F44336' : '#666'} 
                style={styles.inputIcon} 
              />
              <TextInput
                style={styles.input}
                placeholder="Email address"
                placeholderTextColor="#999"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {checkingEmail && (
                <NetpayLoadingAnimation size={22} strokeWidth={2} style={styles.checkingIndicator} />
              )}
              {!checkingEmail && email && email.includes('@') && (
                <MaterialIcons 
                  name={emailExists ? 'error' : 'check-circle'} 
                  size={20} 
                  color={emailExists ? '#F44336' : '#4CAF50'} 
                />
              )}
            </View>
            {emailExists && (
              <ThemedText style={styles.errorText}>
                This email is already registered. Please sign in instead.
              </ThemedText>
            )}
          </View>

          {/* Phone Input */}
          <View>
            <View style={[styles.inputContainer, phoneExists && styles.inputContainerError]}>
              <MaterialIcons 
                name="phone" 
                size={20} 
                color={phoneExists ? '#F44336' : '#666'} 
                style={styles.inputIcon} 
              />
              <TextInput
                style={styles.input}
                placeholder="Phone number"
                placeholderTextColor="#999"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />
              {checkingPhone && (
                <NetpayLoadingAnimation size={22} strokeWidth={2} style={styles.checkingIndicator} />
              )}
              {!checkingPhone && phone && phone.replace(/[^0-9]/g, '').length >= 10 && (
                <MaterialIcons 
                  name={phoneExists ? 'error' : 'check-circle'} 
                  size={20} 
                  color={phoneExists ? '#F44336' : '#4CAF50'} 
                />
              )}
            </View>
            {phoneExists && (
              <ThemedText style={styles.errorText}>
                This phone number is already linked to an account.
              </ThemedText>
            )}
          </View>

          {/* Password Input */}
          <View style={styles.inputContainer}>
            <MaterialIcons name="lock" size={20} color="#666" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#999"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
            />
            <TouchableOpacity
              onPress={() => setShowPassword(!showPassword)}
              style={styles.eyeIcon}>
              <MaterialIcons
                name={showPassword ? 'visibility' : 'visibility-off'}
                size={20}
                color="#666"
              />
            </TouchableOpacity>
          </View>

          {/* Confirm Password Input */}
          <View style={styles.inputContainer}>
            <MaterialIcons name="lock" size={20} color="#666" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Confirm password"
              placeholderTextColor="#999"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showConfirmPassword}
              autoCapitalize="none"
            />
            <TouchableOpacity
              onPress={() => setShowConfirmPassword(!showConfirmPassword)}
              style={styles.eyeIcon}>
              <MaterialIcons
                name={showConfirmPassword ? 'visibility' : 'visibility-off'}
                size={20}
                color="#666"
              />
            </TouchableOpacity>
          </View>

          {/* Referral Code Input */}
          <View style={styles.inputContainer}>
            <MaterialIcons name="person" size={20} color="#666" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Referral code (optional)"
              placeholderTextColor="#999"
              value={referralCode}
              onChangeText={setReferralCode}
              autoCapitalize="none"
            />
          </View>

          {/* Create Account Button */}
          <TouchableOpacity
            style={[
              styles.createButton, 
              (loading || emailExists || phoneExists) && { opacity: 0.7 }
            ]}
            onPress={handleCreateAccount}
            disabled={loading || emailExists || phoneExists}>
            {loading ? (
              <NetpayLoadingAnimation size={40} variant="onBrand" strokeWidth={2.5} />
            ) : (
              <View style={styles.buttonTextContainer}>
                <ThemedText 
                  style={styles.createButtonText}
                  numberOfLines={1}
                >
                  Create Account
                </ThemedText>
              </View>
            )}
          </TouchableOpacity>

          {/* Sign In Link */}
          <View style={styles.signInContainer}>
            <ThemedText style={styles.signInText}>Already have an account? </ThemedText>
            <TouchableOpacity onPress={() => router.push('/auth/login')}>
              <ThemedText style={styles.signInLink}>Sign in</ThemedText>
            </TouchableOpacity>
          </View>
        </ThemedView>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FC',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingVertical: 32,
    justifyContent: 'center',
  },
  content: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    paddingHorizontal: 28,
    paddingTop: Platform.OS === 'ios' ? 56 : 48,
    paddingBottom: 40,
    backgroundColor: '#fff',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
    borderBottomWidth: 0,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  logoImage: {
    width: 120,
    height: 120,
  },
  placeholder: {
    width: 40,
  },
  titleSection: {
    alignItems: 'center',
    marginBottom: 28,
    paddingHorizontal: 4,
    width: '100%',
    paddingTop: Platform.OS === 'ios' ? 12 : 0,
    paddingBottom: Platform.OS === 'ios' ? 4 : 0,
  },
  title: {
    fontSize: Platform.OS === 'ios' ? 27 : 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
    includeFontPadding: true,
    width: '100%',
    flexShrink: 1,
    paddingHorizontal: 4,
    paddingTop: Platform.OS === 'ios' ? 8 : 0,
    paddingBottom: Platform.OS === 'ios' ? 8 : 0,
    lineHeight: Platform.OS === 'ios' ? 34 : 36,
    overflow: 'visible',
  },
  subtitle: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 21,
    width: '100%',
    flexShrink: 1,
    alignSelf: 'stretch',
    paddingHorizontal: 4,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    height: 56,
  },
  inputContainerError: {
    borderColor: '#F44336',
    backgroundColor: '#FFF5F5',
  },
  checkingIndicator: {
    marginLeft: 8,
  },
  errorText: {
    color: '#F44336',
    fontSize: 14,
    marginTop: -12,
    marginBottom: 8,
    marginLeft: 4,
  },
  halfWidth: {
    flex: 1,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    minWidth: 0,
    paddingVertical: 0,
    includeFontPadding: false,
  },
  eyeIcon: {
    padding: 4,
  },
  createButton: {
    backgroundColor: '#FF7F00',
    borderRadius: 12,
    minHeight: 56,
    paddingVertical: 16,
    paddingHorizontal: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 24,
    width: '100%',
  },
  buttonTextContainer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    includeFontPadding: false,
  },
  signInContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  signInText: {
    color: '#333',
    fontSize: 16,
  },
  signInLink: {
    color: '#FF7F00',
    fontSize: 16,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});

