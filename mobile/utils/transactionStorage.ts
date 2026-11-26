import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Transaction {
  id: string;
  type: 'credit' | 'debit';
  amount: number;
  date: string;
  time: string;
  reference: string;
  status: string;
  description?: string;
  recipient?: string;
  serviceType?: string;
  network?: string;
  metadata?: Record<string, any>;
}

const TRANSACTIONS_KEY = '@netpay_transactions';

export const TransactionStorage = {
  // Get all transactions
  async getAllTransactions(): Promise<Transaction[]> {
    try {
      const data = await AsyncStorage.getItem(TRANSACTIONS_KEY);
      if (data) {
        return JSON.parse(data);
      }
      return [];
    } catch (error) {
      console.error('Error getting transactions:', error);
      return [];
    }
  },

  // Add a new transaction
  async addTransaction(transaction: Transaction): Promise<void> {
    try {
      const transactions = await this.getAllTransactions();
      transactions.unshift(transaction); // Add to beginning
      await AsyncStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(transactions));
    } catch (error) {
      console.error('Error adding transaction:', error);
    }
  },

  // Clear all transactions (for testing)
  async clearTransactions(): Promise<void> {
    try {
      await AsyncStorage.removeItem(TRANSACTIONS_KEY);
    } catch (error) {
      console.error('Error clearing transactions:', error);
    }
  },
};

// Helper function to generate transaction ID
export const generateTransactionId = (): string => {
  return `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// Helper function to generate reference number
export const generateReference = (type: string): string => {
  const prefix = type.toUpperCase().replace(/\s+/g, '-');
  return `${prefix}-${Date.now()}`;
};

