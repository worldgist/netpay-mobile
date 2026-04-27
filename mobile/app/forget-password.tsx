import { useState } from 'react';
import {
  StyleSheet,
  View,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';

export default function ForgetPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSendResetCode = async () => {
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail) {
      Alert.alert('Forgot Password', 'Please enter the email associated with your account.');
      return;
    }

    try {
      setLoading(true);

      // Use Supabase's built-in password reset
      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: 'netpay://reset-password',
      });

      setLoading(false);

      if (error) {
        console.error('Error sending reset code:', error);
        const errorMessage = error.message || 'Unable to send reset instructions. Please try again.';
        Alert.alert(
          'Forgot Password', 
          `${errorMessage}\n\nIf the problem persists, please check:\n• Your email address is correct\n• Your internet connection\n• Try again in a few minutes`
        );
        return;
      }

      // Navigate to reset-password screen with email
      router.push({
        pathname: '/reset-password',
        params: { email: trimmedEmail },
      });
    } catch (err) {
      setLoading(false);
      console.error('Error in handleSendResetCode:', err);
      Alert.alert('Forgot Password', err instanceof Error ? err.message : 'An unexpected error occurred.');
    }
  };

  const handleBackToLogin = () => {
    router.replace('/auth/login');
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <ThemedView style={styles.card}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>

          <View style={styles.header}>
            <ThemedText style={styles.title}>
              Forgot Password?
            </ThemedText>
            <ThemedText style={styles.subtitle}>
              Enter your email address and we will send you an 8-digit reset code.
            </ThemedText>
          </View>


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

          <TouchableOpacity
            style={[styles.sendButton, loading && { opacity: 0.7 }]}
            onPress={handleSendResetCode}
            disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.sendButtonText}>Send Reset Instructions</ThemedText>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.backToLoginButton} onPress={handleBackToLogin}>
            <ThemedText style={styles.backToLoginText}>Back to Login</ThemedText>
          </TouchableOpacity>
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
  card: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    paddingHorizontal: 28,
    paddingVertical: 40,
    backgroundColor: '#fff',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
    overflow: 'visible',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  header: {
    marginBottom: 28,
    overflow: 'visible',
    flexShrink: 1,
    width: '100%',
  },
  title: {
    fontSize: Platform.OS === 'ios' ? 27 : 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
    includeFontPadding: true,
    lineHeight: Platform.OS === 'ios' ? 34 : 36,
    overflow: 'visible',
    flexShrink: 1,
    width: '100%',
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  subtitle: {
    fontSize: 15,
    color: '#666',
    lineHeight: 21,
    includeFontPadding: false,
    overflow: 'visible',
    flexShrink: 1,
    textAlign: 'center',
    width: '100%',
    alignSelf: 'stretch',
    paddingHorizontal: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    height: 56,
    marginBottom: 24,
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
  sendButton: {
    backgroundColor: '#FF7F00',
    borderRadius: 12,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  sendButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  backToLoginButton: {
    alignItems: 'center',
  },
  backToLoginText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666',
    textDecorationLine: 'underline',
  },
});
