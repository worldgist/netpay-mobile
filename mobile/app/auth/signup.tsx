import { useState } from 'react';
import { StyleSheet, View, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';

export default function SignupScreen() {
  const router = useRouter();
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

      const { data: availability, error: availabilityError } = await supabase.functions.invoke(
        'check-signup-availability',
        {
          body: {
            email: trimmedEmail,
            phone: sanitizedPhone || null,
          },
        }
      );

      if (availabilityError) {
        throw availabilityError;
      }

      if (availability?.emailExists) {
        setLoading(false);
        Alert.alert('Sign Up', 'An account with this email already exists. Please sign in instead.');
        return;
      }

      if (sanitizedPhone && availability?.phoneExists) {
        setLoading(false);
        Alert.alert('Sign Up', 'This phone number is already linked to an account.');
        return;
      }

      const { data: signUpData, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
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
            <ThemedText style={styles.title} numberOfLines={2} ellipsizeMode="tail">
              Create Account
            </ThemedText>
            <ThemedText style={styles.subtitle} numberOfLines={1} ellipsizeMode="tail">
              Sign up to get started
            </ThemedText>
          </View>

          {/* Demo User Banner */}
          <View style={styles.demoUserCard}>
            <View style={styles.demoUserHeader}>
              <MaterialIcons name="info" size={20} color="#FF7F00" />
              <ThemedText style={styles.demoUserTitle}>Demo Account Available</ThemedText>
            </View>
            <View style={styles.demoUserContent}>
              <ThemedText style={styles.demoUserText}>
                For testing purposes, a demo account is already available. You can sign in with:
              </ThemedText>
              <View style={styles.demoCredentialsBox}>
                <ThemedText style={styles.demoCredentialText}>
                  Email: <ThemedText style={styles.demoCredentialValue}>demo@netpayy.ng</ThemedText>
                </ThemedText>
                <ThemedText style={styles.demoCredentialText}>
                  Password: <ThemedText style={styles.demoCredentialValue}>Demo@1234</ThemedText>
                </ThemedText>
              </View>
              <TouchableOpacity onPress={() => router.push('/auth/login')} style={styles.demoLoginLink}>
                <ThemedText style={styles.demoLoginLinkText}>Sign in with demo account →</ThemedText>
              </TouchableOpacity>
            </View>
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
          <View style={styles.inputContainer}>
            <MaterialIcons name="email" size={20} color="#666" style={styles.inputIcon} />
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
          </View>

          {/* Phone Input */}
          <View style={styles.inputContainer}>
            <MaterialIcons name="phone" size={20} color="#666" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Phone number"
              placeholderTextColor="#999"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
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
            style={[styles.createButton, loading && { opacity: 0.7 }]}
            onPress={handleCreateAccount}
            disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
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
    fontSize: Platform.OS === 'ios' ? 28 : 32,
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
    lineHeight: Platform.OS === 'ios' ? 38 : 40,
    overflow: 'visible',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    width: '100%',
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
  demoUserCard: {
    backgroundColor: '#FFF8E1',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: '#FF7F00',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  demoUserHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  demoUserTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#E65100',
    flex: 1,
  },
  demoUserContent: {
    gap: 12,
  },
  demoUserText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  demoCredentialsBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#FFE082',
  },
  demoCredentialText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  demoCredentialValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
    fontFamily: 'monospace',
  },
  demoLoginLink: {
    marginTop: 4,
  },
  demoLoginLinkText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF7F00',
    textDecorationLine: 'underline',
  },
});

