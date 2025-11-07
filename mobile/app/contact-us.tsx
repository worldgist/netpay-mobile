import { StyleSheet, View, TouchableOpacity, ScrollView, TextInput, Platform, Alert, Modal, Linking } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import * as Clipboard from 'expo-clipboard';
import { UserStorage } from '@/utils/userStorage';

export default function ContactUsScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // Auto-fill user details when screen loads
  useEffect(() => {
    const loadUserData = async () => {
      const userData = await UserStorage.getUserData();
      setName(userData.fullName);
      setEmail(userData.email);
    };
    loadUserData();
  }, []);

  const handleSendMessage = () => {
    if (!name.trim() || !email.trim() || !subject.trim() || !message.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    // TODO: Implement actual message sending functionality
    // Show success modal
    setShowSuccessModal(true);
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
    const email = 'support@netpay.com';
    const url = `mailto:${email}`;
    
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        // Fallback: Copy to clipboard
        await Clipboard.setStringAsync(email);
        Alert.alert('Copied', 'Email address copied to clipboard');
      }
    } catch (error) {
      // Fallback: Copy to clipboard
      await Clipboard.setStringAsync(email);
      Alert.alert('Copied', 'Email address copied to clipboard');
    }
  };

  const handlePhoneAction = async () => {
    const phone = '+2348000000000';
    const url = `tel:${phone}`;
    
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        // Fallback: Copy to clipboard
        await Clipboard.setStringAsync('+234 (0) 800 000 0000');
        Alert.alert('Copied', 'Phone number copied to clipboard');
      }
    } catch (error) {
      // Fallback: Copy to clipboard
      await Clipboard.setStringAsync('+234 (0) 800 000 0000');
      Alert.alert('Copied', 'Phone number copied to clipboard');
    }
  };

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
          <TouchableOpacity style={styles.sendButton} onPress={handleSendMessage}>
            <MaterialIcons name="send" size={20} color="#fff" style={styles.sendIcon} />
            <ThemedText style={styles.sendButtonText}>Send Message</ThemedText>
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
              <ThemedText style={styles.contactValue}>support@netpay.com</ThemedText>
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
              <ThemedText style={styles.contactValue}>+234 (0) 800 000 0000</ThemedText>
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
              <ThemedText style={styles.contactValue}>123 Business Street</ThemedText>
              <ThemedText style={styles.contactNote}>Lagos, Nigeria</ThemedText>
            </View>
          </View>
        </View>

        {/* Business Hours Card */}
        <View style={styles.hoursCard}>
          <ThemedText style={styles.hoursCardTitle}>Business Hours</ThemedText>

          <View style={styles.hoursRow}>
            <ThemedText style={styles.hoursDay}>Monday - Friday</ThemedText>
            <ThemedText style={styles.hoursTime}>9:00 AM - 6:00 PM</ThemedText>
          </View>

          <View style={styles.hoursRow}>
            <ThemedText style={styles.hoursDay}>Saturday</ThemedText>
            <ThemedText style={styles.hoursTime}>10:00 AM - 4:00 PM</ThemedText>
          </View>

          <View style={styles.hoursRow}>
            <ThemedText style={styles.hoursDay}>Sunday</ThemedText>
            <ThemedText style={styles.hoursTime}>Closed</ThemedText>
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
});

