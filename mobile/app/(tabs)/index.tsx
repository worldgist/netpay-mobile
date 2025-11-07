import { StyleSheet, View, ScrollView, TouchableOpacity } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';

export default function HomeScreen() {
  const router = useRouter();
  const [balanceVisible, setBalanceVisible] = useState(true);
  const balance = 500.00;

  return (
    <ThemedView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <ThemedText style={styles.headerTitle}>Home</ThemedText>
          <TouchableOpacity>
            <MaterialIcons name="notifications" size={24} color="#333" />
          </TouchableOpacity>
        </View>

        {/* Welcome Section */}
        <View style={styles.welcomeSection}>
          <ThemedText style={styles.welcomeName}>Hello, Mustapha</ThemedText>
          <ThemedText style={styles.welcomeBack}>Welcome back!</ThemedText>
        </View>

        {/* Balance Card */}
        <View style={styles.balanceCard}>
          <View style={styles.balanceHeader}>
            <ThemedText style={styles.balanceLabel}>Available Balance</ThemedText>
            <TouchableOpacity 
              onPress={() => setBalanceVisible(!balanceVisible)}
              style={styles.eyeButton}>
              <MaterialIcons 
                name={balanceVisible ? 'visibility' : 'visibility-off'} 
                size={22} 
                color="#fff" 
              />
            </TouchableOpacity>
          </View>
          <View style={styles.balanceAmountContainer}>
            <ThemedText style={styles.balanceAmount}>
              {balanceVisible ? '₦500' : '₦••••'}
            </ThemedText>
          </View>
          <View style={styles.balanceButtons}>
            <TouchableOpacity 
              style={styles.addMoneyButton} 
              onPress={() => router.push('/add-money')}
              activeOpacity={0.8}>
              <ThemedText style={styles.addMoneyText}>Add Money</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.transferButton} 
              onPress={() => router.push('/transfer')}
              activeOpacity={0.8}>
              <ThemedText style={styles.transferText}>Transfer</ThemedText>
            </TouchableOpacity>
          </View>
        </View>

        {/* Recent Transactions */}
        <View style={styles.transactionsSection}>
          <View style={styles.sectionHeader}>
            <ThemedText style={styles.sectionTitle}>Recent Transactions</ThemedText>
            <TouchableOpacity onPress={() => router.push('/(tabs)/transactions')}>
              <ThemedText style={styles.seeAllText}>See All</ThemedText>
            </TouchableOpacity>
          </View>

          {/* Transaction Item */}
          <View style={styles.transactionItem}>
            <View style={styles.transactionIconContainer}>
              <MaterialIcons name="flash-on" size={24} color="#666" />
            </View>
            <View style={styles.transactionDetails}>
              <ThemedText style={styles.transactionType}>credit</ThemedText>
              <ThemedText style={styles.transactionDate}>11/6/2025</ThemedText>
            </View>
            <View style={styles.transactionAmountContainer}>
              <ThemedText style={styles.transactionAmount}>+N500</ThemedText>
              <ThemedText style={styles.transactionStatus}>Credit</ThemedText>
            </View>
          </View>
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
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  welcomeSection: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  welcomeName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  welcomeBack: {
    fontSize: 16,
    color: '#666',
  },
  balanceCard: {
    backgroundColor: '#FF7F00',
    borderRadius: 20,
    padding: 24,
    marginHorizontal: 20,
    marginBottom: 32,
  },
  balanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  balanceLabel: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.95,
    fontWeight: '500',
  },
  eyeButton: {
    padding: 4,
  },
  balanceAmountContainer: {
    marginBottom: 24,
    minHeight: 60,
    justifyContent: 'center',
    paddingVertical: 8,
  },
  balanceAmount: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    lineHeight: 40,
  },
  balanceButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  addMoneyButton: {
    flex: 1,
    backgroundColor: '#FF9500',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  addMoneyText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  transferButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  transferText: {
    color: '#FF7F00',
    fontSize: 16,
    fontWeight: '600',
  },
  transactionsSection: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  seeAllText: {
    fontSize: 16,
    color: '#FF7F00',
    fontWeight: '600',
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  transactionIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  transactionDetails: {
    flex: 1,
  },
  transactionType: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
    textTransform: 'capitalize',
  },
  transactionDate: {
    fontSize: 14,
    color: '#666',
  },
  transactionAmountContainer: {
    alignItems: 'flex-end',
  },
  transactionAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginBottom: 4,
  },
  transactionStatus: {
    fontSize: 14,
    color: '#4CAF50',
    opacity: 0.8,
  },
});
