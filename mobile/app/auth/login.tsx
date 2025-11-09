import { useState } from 'react';
import { StyleSheet, View, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { supabase } from '@/lib/supabase';
import * as SecureStore from 'expo-secure-store';

const BIOMETRIC_PROMPT = 'Sign in with Biometrics';
const SESSION_KEY = 'supabase_session';
const EMAIL_KEY = 'supabase_email';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);

  const handleSignIn = async () => {
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail || !password) {
      Alert.alert('Sign In', 'Please enter both email and password.');
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });

      if (error) {
        setLoading(false);

        const message = error.message || 'Unable to sign in. Please try again.';
        if (message.toLowerCase().includes('email not confirmed')) {
          Alert.alert('Email Not Verified', 'Please verify your email to continue. We will redirect you to the verification screen.');
          router.push({ pathname: '/email-verification', params: { email: trimmedEmail } });
          return;
        }

        Alert.alert('Sign In Failed', message);
        return;
      }

      setLoading(false);

      if (!data.session) {
        Alert.alert('Sign In', 'No active session was returned. Please verify your email and try again.');
        router.push({ pathname: '/email-verification', params: { email: trimmedEmail } });
        return;
      }

      try {
        await SecureStore.setItemAsync(
          SESSION_KEY,
          JSON.stringify({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          })
        );
        await SecureStore.setItemAsync(EMAIL_KEY, trimmedEmail);
      } catch (storageError) {
        console.warn('Unable to persist Supabase session for biometrics:', storageError);
      }

      router.replace('/(tabs)');
    } catch (err) {
      setLoading(false);
      Alert.alert('Sign In Error', err instanceof Error ? err.message : 'An unexpected error occurred.');
    }
  };

  const handleBiometric = async () => {
    try {
      setBiometricLoading(true);
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      if (!hasHardware) {
        Alert.alert('Biometric Login', 'Biometric authentication is not available on this device.');
        setBiometricLoading(false);
        return;
      }

      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!enrolled) {
        Alert.alert('Biometric Login', 'No biometric data found. Please register in your device settings.');
        setBiometricLoading(false);
        return;
      }

      const storedEmailRaw = await SecureStore.getItemAsync(EMAIL_KEY);
      const storedEmail = storedEmailRaw?.trim().toLowerCase();
      if (!storedEmail) {
        Alert.alert('Biometric Login', 'No saved email found. Please sign in with your email and password first.');
        setBiometricLoading(false);
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: BIOMETRIC_PROMPT,
        cancelLabel: 'Cancel',
      });

      if (!result.success) {
        Alert.alert('Biometric Login', result.error || 'Biometric authentication was cancelled.');
        setBiometricLoading(false);
        return;
      }

      const { data: pinData, error: pinError } = await supabase.functions.invoke('sign-in-with-biometric', {
        body: {
          email: storedEmail,
        },
      });

      if (pinError) {
        throw pinError;
      }

      if (!pinData?.success) {
        console.error('Biometric sign-in function responded with error:', pinData);
        Alert.alert(
          'Biometric Login',
          typeof pinData?.error === 'string' && pinData.error.trim().length > 0
            ? pinData.error
            : 'Unable to authenticate with biometrics. Please sign in manually.'
        );
        setBiometricLoading(false);
        return;
      }

      console.log('Biometric sign-in response:', pinData);

      const token: string | undefined = pinData?.token;
      const otpType: 'email' | 'magiclink' = pinData?.otpType === 'magiclink' ? 'magiclink' : 'email';

      if (!token) {
        Alert.alert('Biometric Login', 'Invalid response from authentication service. Please sign in manually.');
        setBiometricLoading(false);
        return;
      }

      const { data, error } = await supabase.auth.verifyOtp({
        email: storedEmail,
        token,
        type: otpType,
      });

      if (error || !data.session) {
        console.error('Biometric verifyOtp failed:', error);
        Alert.alert('Biometric Login', error?.message || 'Unable to restore session. Please sign in manually.');
        setBiometricLoading(false);
        return;
      }

      try {
        await SecureStore.setItemAsync(
          SESSION_KEY,
          JSON.stringify({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          })
        );
        await SecureStore.setItemAsync(EMAIL_KEY, storedEmail);
      } catch (storageError) {
        console.warn('Unable to persist session after biometric login:', storageError);
      }

      setBiometricLoading(false);
      router.replace('/(tabs)');
    } catch (error) {
      console.error('Biometric login unexpected error:', error);
      setBiometricLoading(false);
      Alert.alert(
        'Biometric Login',
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : 'Unable to authenticate with biometrics.'
      );
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <ThemedView style={styles.content}>
          {/* Logo */}
          <View style={styles.logoContainer}>
            <Image
              source={require('@/assets/images/logo.png')}
              style={styles.logoImage}
              contentFit="contain"
            />
          </View>

          {/* Welcome Section */}
          <View style={styles.welcomeSection}>
            <ThemedText style={styles.welcomeTitle}>Welcome Back</ThemedText>
            <ThemedText style={styles.welcomeSubtitle}>Sign in to your account</ThemedText>
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

          {/* Sign In Button */}
          <TouchableOpacity
            style={[styles.signInButton, loading && { opacity: 0.7 }]}
            onPress={handleSignIn}
            disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.signInButtonText}>Sign In</ThemedText>
            )}
          </TouchableOpacity>

          {/* Biometric Button */}
          <TouchableOpacity
            style={[styles.biometricButton, (loading || biometricLoading) && { opacity: 0.7 }]}
            onPress={handleBiometric}
            disabled={loading || biometricLoading}>
            {biometricLoading ? (
              <ActivityIndicator color="#FF7F00" style={styles.biometricIcon} />
            ) : (
              <MaterialIcons name="fingerprint" size={20} color="#FF7F00" style={styles.biometricIcon} />
            )}
            <ThemedText style={styles.biometricButtonText}>Sign in with Biometric</ThemedText>
          </TouchableOpacity>

          {/* Links */}
          <TouchableOpacity style={styles.linkContainer} onPress={() => router.push('/forget-password')}>
            <ThemedText style={styles.linkText}>Forgot Password?</ThemedText>
          </TouchableOpacity>

          {/* Sign Up Link */}
          <View style={styles.signUpContainer}>
            <ThemedText style={styles.signUpText}>Don't have an account? </ThemedText>
            <TouchableOpacity onPress={() => router.push('/auth/signup')}>
              <ThemedText style={styles.signUpLink}>Sign Up</ThemedText>
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
    paddingBottom: 48,
    justifyContent: 'flex-start',
  },
  content: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    paddingHorizontal: 28,
    paddingTop: 48,
    paddingBottom: 48,
    backgroundColor: '#fff',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
    rowGap: 20,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  logoImage: {
    width: 140,
    height: 140,
  },
  welcomeSection: {
    alignItems: 'center',
    marginBottom: 28,
  },
  welcomeTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 6,
    textAlign: 'center',
    lineHeight: 34,
  },
  welcomeSubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
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
  signInButton: {
    backgroundColor: '#FF7F00',
    borderRadius: 12,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  signInButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  biometricButton: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FF7F00',
    marginBottom: 24,
  },
  biometricIcon: {
    marginRight: 8,
  },
  biometricButtonText: {
    color: '#FF7F00',
    fontSize: 16,
    fontWeight: '600',
  },
  linkContainer: {
    marginBottom: 16,
    alignItems: 'center',
  },
  linkText: {
    color: '#FF7F00',
    fontSize: 16,
    textAlign: 'center',
  },
  secondaryLinkText: {
    color: '#333',
    fontSize: 16,
    textAlign: 'center',
  },
  signUpContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 32,
  },
  signUpText: {
    color: '#333',
    fontSize: 16,
  },
  signUpLink: {
    color: '#FF7F00',
    fontSize: 16,
    fontWeight: '600',
  },
});

