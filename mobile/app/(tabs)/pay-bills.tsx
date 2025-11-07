import { StyleSheet, View, ScrollView, TouchableOpacity } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

export default function PayBillsScreen() {
  const router = useRouter();
  const services = [
    { id: '1', name: 'Airtime', icon: 'phone', route: '/airtime-purchase' },
    { id: '2', name: 'Cable TV', icon: 'tv', route: '/cable-tv' },
    { id: '3', name: 'Data', icon: 'wifi', route: '/data-purchase' },
    { id: '4', name: 'Education', icon: 'school', route: '/education' },
    { id: '5', name: 'Electricity', icon: 'flash-on', route: '/electricity' },
  ];

  const handleServicePress = (service: { id: string; name: string; icon: string; route: string | null }) => {
    if (service.route) {
      router.push(service.route);
    } else {
      // Handle other services
      console.log('Selected service:', service.name);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView 
        style={styles.scrollView} 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
        bounces={true}
        scrollEnabled={true}>
        <View style={styles.header}>
          <ThemedText style={styles.headerTitle}>Pay Bills</ThemedText>
        </View>

        <View style={styles.titleSection}>
          <ThemedText style={styles.mainTitle}>Pay Bills</ThemedText>
          <ThemedText style={styles.subtitle}>Select a service to continue</ThemedText>
        </View>

        <View style={styles.servicesGrid}>
          {services.map((service) => (
            <TouchableOpacity
              key={service.id}
              style={styles.serviceCard}
              onPress={() => handleServicePress(service)}
              activeOpacity={0.7}>
              <View style={styles.serviceIconContainer}>
                <MaterialIcons name={service.icon as any} size={28} color="#FF7F00" />
              </View>
              <ThemedText style={styles.serviceName} numberOfLines={2}>
                {service.name}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>
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
    width: '100%',
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  header: {
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    alignItems: 'center',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
    letterSpacing: 0.5,
  },
  titleSection: {
    paddingHorizontal: 20,
    marginBottom: 32,
  },
  mainTitle: {
    fontSize: 34,
    fontWeight: 'bold',
    color: '#FF7F00',
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 16,
    color: '#333',
    fontWeight: '400',
  },
  servicesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    justifyContent: 'space-between',
    gap: 18,
    paddingBottom: 20,
  },
  serviceCard: {
    width: '30%',
    minHeight: 120,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  serviceIconContainer: {
    marginBottom: 12,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFF3E0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  serviceName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    textAlign: 'center',
    lineHeight: 20,
  },
});

