import { StyleSheet, View, ScrollView, TouchableOpacity, ImageSourcePropType } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { useState, useCallback } from 'react';
import { TransactionStorage, Transaction } from '@/utils/transactionStorage';

export default function TransactionsScreen() {
  const router = useRouter();
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  // Load transactions when screen is focused
  useFocusEffect(
    useCallback(() => {
      const loadTransactions = async () => {
        const allTransactions = await TransactionStorage.getAllTransactions();
        setTransactions(allTransactions);
      };
      loadTransactions();
    }, [])
  );
  
  // Helper function to get transaction logo
  const getTransactionLogo = (serviceType: string, network: string): ImageSourcePropType | null => {
    if (!serviceType || !network) return null;
    
    const networkLower = network.toLowerCase();
    const serviceLower = serviceType.toLowerCase();
    
    // Network logos (for Airtime, Data)
    if (serviceLower === 'airtime vtu' || serviceLower === 'data bundle') {
      switch (networkLower) {
        case 'mtn':
          return require('@/assets/images/mtn.png');
        case 'airtel':
          return require('@/assets/images/airtel.png');
        case '9mobile':
          return require('@/assets/images/9mobile.png');
        case 'glo':
          return require('@/assets/images/glo.png');
        default:
          return null;
      }
    }
    
    // Cable TV logos
    if (serviceLower === 'cable tv') {
      switch (networkLower) {
        case 'dstv':
          return require('@/assets/images/dstv.png');
        case 'gotv':
          return require('@/assets/images/gotv.png');
        case 'startimes':
          return require('@/assets/images/startimes.png');
        default:
          return null;
      }
    }
    
    // Electricity logos
    if (serviceLower === 'electricity') {
      switch (networkLower) {
        case 'aedc':
          return require('@/assets/images/AEDC.png');
        case 'eedc':
          return require('@/assets/images/EEDC.png');
        case 'ekedc':
          return require('@/assets/images/EKEDC.png');
        case 'ikedc':
          return require('@/assets/images/IKEDC.png');
        case 'kedco':
          return require('@/assets/images/KEDCO.png');
        case 'phedc':
          return require('@/assets/images/PHEDC.png');
        default:
          return null;
      }
    }
    
    // Education logos
    if (serviceLower === 'education') {
      switch (networkLower) {
        case 'waec':
          return require('@/assets/images/waec.png');
        case 'neco':
          return require('@/assets/images/neco.png');
        case 'jamb':
          return require('@/assets/images/jamb.png');
        default:
          return null;
      }
    }
    
    return null;
  };
  

  const handleTransactionPress = (transaction: any) => {
    router.push({
      pathname: '/transaction-details',
      params: {
        id: transaction.id,
        type: transaction.type,
        amount: transaction.amount.toString(),
        date: transaction.date,
        time: transaction.time,
        reference: transaction.reference,
        status: transaction.status,
        description: transaction.description || '',
        serviceType: transaction.serviceType || '',
        network: transaction.network || '',
      },
    });
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText style={styles.headerTitle}>Transactions</ThemedText>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {transactions.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialIcons name="receipt-long" size={64} color="#999" />
            <ThemedText style={styles.emptyText}>No transactions yet</ThemedText>
            <ThemedText style={styles.emptySubtext}>Your transactions will appear here</ThemedText>
          </View>
        ) : (
          transactions.map((transaction) => {
          const logo = getTransactionLogo(transaction.serviceType, transaction.network);
          return (
            <TouchableOpacity 
              key={transaction.id} 
              style={styles.transactionCard}
              onPress={() => handleTransactionPress(transaction)}
              activeOpacity={0.7}>
              <View style={styles.transactionIconContainer}>
                {logo ? (
                  <Image
                    source={logo}
                    style={styles.transactionLogo}
                    contentFit="contain"
                  />
                ) : (
                  <MaterialIcons name="account-balance-wallet" size={24} color="#666" />
                )}
              </View>
              <View style={styles.transactionDetails}>
                <ThemedText style={styles.transactionType}>
                  {transaction.serviceType || transaction.type}
                </ThemedText>
                <ThemedText style={styles.transactionDate}>{transaction.date}</ThemedText>
                <ThemedText style={styles.transactionReference}>{transaction.reference}</ThemedText>
              </View>
              <View style={styles.transactionAmountContainer}>
                <ThemedText style={[
                  styles.transactionAmount,
                  { color: transaction.type === 'credit' ? '#4CAF50' : '#F44336' }
                ]}>
                  {transaction.type === 'credit' ? '+' : '-'}N{transaction.amount}
                </ThemedText>
                <ThemedText style={styles.transactionStatus}>{transaction.status}</ThemedText>
              </View>
            </TouchableOpacity>
          );
          })
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
  },
  transactionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  transactionIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    padding: 8,
  },
  transactionLogo: {
    width: '100%',
    height: '100%',
  },
  transactionDetails: {
    flex: 1,
  },
  transactionType: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
    textTransform: 'capitalize',
  },
  transactionDate: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  transactionReference: {
    fontSize: 12,
    color: '#999',
  },
  transactionAmountContainer: {
    alignItems: 'flex-end',
  },
  transactionAmount: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginBottom: 4,
  },
  transactionStatus: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
});

