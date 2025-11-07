import { useState } from 'react';
import { StyleSheet, View, ScrollView, TouchableOpacity, Switch, Alert } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

export default function ProfileScreen() {
  const router = useRouter();
  const [biometricEnabled, setBiometricEnabled] = useState(true);

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: () => router.replace('/auth/login'),
        },
      ]
    );
  };

  const handlePINCode = () => {
    router.push('/change-pin');
  };

  const handleEditProfile = () => {
    router.push('/edit-profile');
  };

  const handleNotifications = () => {
    Alert.alert('Notifications', 'Notifications screen coming soon');
  };

  const handleReferral = () => {
    router.push('/referral');
  };

  const handleContactUs = () => {
    router.push('/contact-us');
  };

  const handleTerms = () => {
    router.push('/terms-and-conditions');
  };

  const handlePrivacy = () => {
    router.push('/privacy-policy');
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* User Profile Section */}
        <View style={styles.profileSection}>
          <View style={styles.avatarContainer}>
            <MaterialIcons name="person" size={48} color="#FF7F00" />
          </View>
          <ThemedText style={styles.userName}>Mustapha Suleiman</ThemedText>
          <ThemedText style={styles.userEmail}>netpay0147@gmail.com</ThemedText>
        </View>

        {/* Security Section */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionHeader}>SECURITY</ThemedText>

          {/* Biometric Login */}
          <TouchableOpacity style={styles.optionCard} activeOpacity={0.7}>
            <View style={styles.optionLeft}>
              <MaterialIcons name="fingerprint" size={24} color="#FF7F00" />
              <View style={styles.optionTextContainer}>
                <ThemedText style={styles.optionTitle}>Biometric Login</ThemedText>
                <ThemedText style={styles.optionDescription}>Use fingerprint or face ID</ThemedText>
              </View>
            </View>
            <Switch
              value={biometricEnabled}
              onValueChange={setBiometricEnabled}
              trackColor={{ false: '#E0E0E0', true: '#FFB366' }}
              thumbColor={biometricEnabled ? '#FF7F00' : '#f4f3f4'}
            />
          </TouchableOpacity>

          {/* PIN Code */}
          <TouchableOpacity style={styles.optionCard} onPress={handlePINCode} activeOpacity={0.7}>
            <View style={styles.optionLeft}>
              <MaterialIcons name="lock" size={24} color="#FF7F00" />
              <View style={styles.optionTextContainer}>
                <ThemedText style={styles.optionTitle}>PIN Code</ThemedText>
                <ThemedText style={styles.optionDescription}>Change your PIN</ThemedText>
              </View>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#999" />
          </TouchableOpacity>
        </View>

        {/* Account Section */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionHeader}>ACCOUNT</ThemedText>

          {/* Edit Profile */}
          <TouchableOpacity style={styles.optionCard} onPress={handleEditProfile} activeOpacity={0.7}>
            <View style={styles.optionLeft}>
              <MaterialIcons name="edit" size={24} color="#FF7F00" />
              <ThemedText style={styles.optionTitle}>Edit Profile</ThemedText>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#999" />
          </TouchableOpacity>

          {/* Notifications */}
          <TouchableOpacity style={styles.optionCard} onPress={handleNotifications} activeOpacity={0.7}>
            <View style={styles.optionLeft}>
              <MaterialIcons name="notifications" size={24} color="#FF7F00" />
              <ThemedText style={styles.optionTitle}>Notifications</ThemedText>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#999" />
          </TouchableOpacity>

          {/* Referral */}
          <TouchableOpacity style={styles.optionCard} onPress={handleReferral} activeOpacity={0.7}>
            <View style={styles.optionLeft}>
              <MaterialIcons name="people" size={24} color="#FF7F00" />
              <ThemedText style={styles.optionTitle}>Referral</ThemedText>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#999" />
          </TouchableOpacity>

          {/* Contact Us */}
          <TouchableOpacity style={styles.optionCard} onPress={handleContactUs} activeOpacity={0.7}>
            <View style={styles.optionLeft}>
              <MaterialIcons name="email" size={24} color="#FF7F00" />
              <ThemedText style={styles.optionTitle}>Contact us</ThemedText>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#999" />
          </TouchableOpacity>
        </View>

        {/* Legal Section */}
        <View style={styles.section}>
          {/* Terms & Conditions */}
          <TouchableOpacity style={styles.optionCard} onPress={handleTerms} activeOpacity={0.7}>
            <View style={styles.optionLeft}>
              <MaterialIcons name="description" size={24} color="#FF7F00" />
              <ThemedText style={styles.optionTitle}>Terms & Conditions</ThemedText>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#999" />
          </TouchableOpacity>

          {/* Privacy Policy */}
          <TouchableOpacity style={styles.optionCard} onPress={handlePrivacy} activeOpacity={0.7}>
            <View style={styles.optionLeft}>
              <MaterialIcons name="security" size={24} color="#FF7F00" />
              <ThemedText style={styles.optionTitle}>Privacy Policy</ThemedText>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#999" />
          </TouchableOpacity>
        </View>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.7}>
          <MaterialIcons name="logout" size={20} color="#FF3B30" />
          <ThemedText style={styles.logoutText}>Logout</ThemedText>
        </TouchableOpacity>

        <View style={styles.bottomSpacer} />
      </ScrollView>
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
  profileSection: {
    alignItems: 'center',
    paddingTop: 60,
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
    marginLeft: 12,
  },
  optionDescription: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
    marginLeft: 12,
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
  bottomSpacer: {
    height: 20,
  },
});

