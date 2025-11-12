import {
  StyleSheet,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Platform,
  Alert,
  Modal,
  Linking,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { supabase } from '@/lib/supabase';

type SupportMessage = {
  id: string;
  created_at: string;
  user_id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status?: string | null;
};

export default function ContactUsScreen() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [supportEmail, setSupportEmail] = useState('support@netpay.com');
  const [supportPhone, setSupportPhone] = useState('+2348000000000');
  const [supportPhoneDisplay, setSupportPhoneDisplay] = useState('+234 (0) 800 000 0000');
  const [supportAddress, setSupportAddress] = useState('');
  const [businessHours, setBusinessHours] = useState<Array<{ day: string; time: string }>>([
    { day: 'Monday - Friday', time: '9:00 AM - 6:00 PM' },
    { day: 'Saturday', time: '10:00 AM - 4:00 PM' },
    { day: 'Sunday', time: 'Closed' },
  ]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const isMounted = useRef(true);

  // Auto-fill user details when screen loads
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

        setUserId(session.user.id);
        setEmail(session.user.email || '');

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', session.user.id)
          .maybeSingle();

        if (profileError) throw profileError;

        if (isMounted.current && profile?.full_name) {
          setName(profile.full_name);
        } else if (isMounted.current && !profile?.full_name && session.user.email) {
          const fallbackName = session.user.email.split('@')[0];
          setName(fallbackName);
        }

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
        if (isMounted.current) {
          const message = error instanceof Error ? error.message : 'Unable to load contact information. Please try again later.';
          Alert.alert('Contact Us', message);
        }
      } finally {
        if (isMounted.current) setLoading(false);
      }
    };

    isMounted.current = true;
    loadData();

    return () => {
      isMounted.current = false;
    };
  }, [router]);

  const handleSendMessage = async () => {
    if (submitting) return;

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedSubject = subject.trim();
    const trimmedMessage = message.trim();

    if (!trimmedName || !trimmedEmail || !trimmedSubject || !trimmedMessage) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    if (!userId) {
      Alert.alert('Contact Us', 'Please sign in again to send a message.');
      return;
    }

    setSubmitting(true);

    try {
      const { error } = await supabase
        .from('support_messages')
        .insert({
          user_id: userId,
          name: trimmedName,
          email: trimmedEmail,
          subject: trimmedSubject,
          message: trimmedMessage,
        });

      if (error) {
        throw error;
      }

      const { error: notificationError } = await supabase.functions.invoke('send-support-email', {
        body: {
          name: trimmedName,
          email: trimmedEmail,
          subject: trimmedSubject,
          message: trimmedMessage,
        },
      });

      if (notificationError) {
        console.error('send-support-email failed:', notificationError);
        Alert.alert(
          'Contact Us',
          'Your message was saved, but we were unable to email support automatically. We will review it shortly.'
        );
      } else {
        setShowSuccessModal(true);
      }
    } catch (error) {
      console.error('Failed to send support message:', error);
      const message =
        error instanceof Error ? error.message : 'Unable to send your message right now. Please try again later.';
      Alert.alert('Contact Us', message);
    } finally {
      if (isMounted.current) setSubmitting(false);
    }
  };

  const handleCloseModal = () => {
    setShowSuccessModal(false);
    // Clear form fields
    setName('');
    setEmail('');
    setSubject('');
    setMessage('');
  };

  const handleEmailAction = async () => {
    const url = `mailto:${supportEmail}`;
    
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        // Fallback: Copy to clipboard
        await Clipboard.setStringAsync(supportEmail);
        Alert.alert('Copied', 'Email address copied to clipboard');
      }
    } catch (error) {
      // Fallback: Copy to clipboard
      await Clipboard.setStringAsync(supportEmail);
      Alert.alert('Copied', 'Email address copied to clipboard');
    }
  };

  const handlePhoneAction = async () => {
    const url = `tel:${supportPhone}`;
    
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        // Fallback: Copy to clipboard
        await Clipboard.setStringAsync(supportPhoneDisplay);
        Alert.alert('Copied', 'Phone number copied to clipboard');
      }
    } catch (error) {
      // Fallback: Copy to clipboard
      await Clipboard.setStringAsync(supportPhoneDisplay);
      Alert.alert('Copied', 'Phone number copied to clipboard');
    }
  };

  if (loading) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator color="#FF7F00" size="large" />
      </ThemedView>
    );
  }

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
        
        {/* Contact Form Card */}
        <View style={styles.formCard}>
          <ThemedText style={styles.formTitle}>Send us a message</ThemedText>
          <ThemedText style={styles.formDescription}>
            Fill out the form below and we'll get back to you as soon as possible
          </ThemedText>

          {/* Name Field */}
          <View style={styles.fieldContainer}>
            <ThemedText style={styles.fieldLabel}>Name</ThemedText>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Your name"
                placeholderTextColor="#999"
              />
          </View>

          {/* Email Field */}
          <View style={styles.fieldContainer}>
            <ThemedText style={styles.fieldLabel}>Email</ThemedText>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="your.email@example.com"
                placeholderTextColor="#999"
                keyboardType="email-address"
                autoCapitalize="none"
              />
          </View>

          {/* Subject Field */}
          <View style={styles.fieldContainer}>
            <ThemedText style={styles.fieldLabel}>Subject</ThemedText>
            <TextInput
              style={styles.input}
              value={subject}
              onChangeText={setSubject}
              placeholder="How can we help?"
              placeholderTextColor="#999"
            />
          </View>

          {/* Message Field */}
          <View style={styles.fieldContainer}>
            <ThemedText style={styles.fieldLabel}>Message</ThemedText>
            <TextInput
              style={[styles.input, styles.messageInput]}
              value={message}
              onChangeText={setMessage}
              placeholder="Your message..."
              placeholderTextColor="#999"
              multiline
              numberOfLines={6}
              textAlignVertical="top"
            />
          </View>

          {/* Send Message Button */}
          <TouchableOpacity
            style={[styles.sendButton, submitting && styles.sendButtonDisabled]}
            onPress={handleSendMessage}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <MaterialIcons name="send" size={20} color="#fff" style={styles.sendIcon} />
                <ThemedText style={styles.sendButtonText}>Send Message</ThemedText>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Contact Information Card */}
        <View style={styles.infoCard}>
          <ThemedText style={styles.infoCardTitle}>Contact Information</ThemedText>
          <ThemedText style={styles.infoCardSubtitle}>Other ways to reach us</ThemedText>

          {/* Email */}
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

          {/* Phone */}
          <TouchableOpacity 
            style={styles.contactItem} 
            onPress={handlePhoneAction}
            activeOpacity={0.7}>
            <View style={styles.contactIconContainer}>
              <MaterialIcons name="phone" size={24} color="#FF7F00" />
            </View>
            <View style={styles.contactDetails}>
              <ThemedText style={styles.contactTitle}>Phone</ThemedText>
              <ThemedText style={styles.contactValue}>{supportPhoneDisplay}</ThemedText>
              <ThemedText style={styles.contactNote}>Mon-Fri: 9:00 AM - 6:00 PM WAT</ThemedText>
            </View>
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={(e) => {
                e.stopPropagation();
                handlePhoneAction();
              }}
              activeOpacity={0.7}>
              <MaterialIcons name="call" size={20} color="#FF7F00" />
            </TouchableOpacity>
          </TouchableOpacity>

          {/* Address */}
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
        </View>

        {/* Business Hours Card */}
        <View style={styles.hoursCard}>
          <ThemedText style={styles.hoursCardTitle}>Business Hours</ThemedText>

          {businessHours.map((entry) => (
            <View key={`${entry.day}-${entry.time}`} style={styles.hoursRow}>
              <ThemedText style={styles.hoursDay}>{entry.day}</ThemedText>
              <ThemedText style={styles.hoursTime}>{entry.time}</ThemedText>
            </View>
          ))}
        </View>

        {/* Support Options */}
        <View style={styles.supportSection}>
          <ThemedText style={styles.sectionTitle}>Other ways to reach us</ThemedText>
          <TouchableOpacity
            style={styles.supportCard}
            onPress={handleEmailAction}
            activeOpacity={0.7}>
            <View style={styles.supportIconContainer}>
              <MaterialIcons name="email" size={24} color="#FF7F00" />
            </View>
            <View style={styles.supportDetails}>
              <ThemedText style={styles.supportTitle}>Email</ThemedText>
              <ThemedText style={styles.supportValue}>{supportEmail}</ThemedText>
              <ThemedText style={styles.supportNote}>We typically respond within 24 hours</ThemedText>
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
            style={styles.supportCard}
            onPress={handlePhoneAction}
            activeOpacity={0.7}>
            <View style={styles.supportIconContainer}>
              <MaterialIcons name="phone" size={24} color="#FF7F00" />
            </View>
            <View style={styles.supportDetails}>
              <ThemedText style={styles.supportTitle}>Phone</ThemedText>
              <ThemedText style={styles.supportValue}>{supportPhoneDisplay}</ThemedText>
              <ThemedText style={styles.supportNote}>Mon-Fri: 9:00 AM - 6:00 PM WAT</ThemedText>
            </View>
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={(e) => {
                e.stopPropagation();
                handlePhoneAction();
              }}
              activeOpacity={0.7}>
              <MaterialIcons name="call" size={20} color="#FF7F00" />
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
        </View>
      </ScrollView>

      {/* Success Modal */}
      <Modal
        visible={showSuccessModal}
        transparent={true}
        animationType="fade"
        onRequestClose={handleCloseModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.successIconContainer}>
              <View style={styles.successIconCircle}>
                <MaterialIcons name="check" size={48} color="#fff" />
              </View>
            </View>
            <ThemedText style={styles.modalTitle}>Message Sent!</ThemedText>
            <ThemedText style={styles.modalMessage}>
              Your message has been sent successfully. We'll get back to you as soon as possible.
            </ThemedText>
            <TouchableOpacity style={styles.modalButton} onPress={handleCloseModal}>
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
    backgroundColor: '#F5F5F5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  formCard: {
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
  formTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 8,
  },
  formDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 24,
    lineHeight: 20,
  },
  fieldContainer: {
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#333',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  messageInput: {
    minHeight: 120,
    paddingTop: 14,
  },
  sendButton: {
    backgroundColor: '#FF7F00',
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: '#FF7F00',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  sendButtonDisabled: {
    opacity: 0.7,
  },
  sendIcon: {
    marginRight: 8,
  },
  sendButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
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
    marginBottom: 4,
  },
  infoCardSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 24,
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
  hoursCard: {
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
  hoursCardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
  },
  hoursRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  hoursDay: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  hoursTime: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 32,
    marginHorizontal: 40,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    minWidth: 280,
  },
  successIconContainer: {
    marginBottom: 24,
  },
  successIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
    paddingHorizontal: 8,
  },
  modalButton: {
    backgroundColor: '#FF7F00',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 48,
    minWidth: 120,
    alignItems: 'center',
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  supportSection: {
    marginBottom: 24,
    gap: 16,
  },
  supportCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FAFAFA',
  },
  supportIconContainer: {
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
  supportDetails: {
    flex: 1,
  },
  supportTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  supportValue: {
    fontSize: 16,
    color: '#333',
    marginBottom: 4,
  },
  supportNote: {
    fontSize: 14,
    color: '#666',
  },
});

