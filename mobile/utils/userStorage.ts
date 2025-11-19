import AsyncStorage from '@react-native-async-storage/async-storage';

export interface UserData {
  fullName: string;
  email: string;
  phoneNumber: string;
}

const USER_DATA_KEY = '@netpay_user_data';

// Default user data
const DEFAULT_USER_DATA: UserData = {
  fullName: 'Mustapha Suleiman',
  email: 'netpay0147@gmail.com',
  phoneNumber: '07067398399',
};

export const UserStorage = {
  // Get user data
  async getUserData(): Promise<UserData> {
    try {
      const data = await AsyncStorage.getItem(USER_DATA_KEY);
      if (data) {
        return JSON.parse(data);
      }
      // Return default data if nothing is stored
      return DEFAULT_USER_DATA;
    } catch (error) {
      console.error('Error getting user data:', error);
      return DEFAULT_USER_DATA;
    }
  },

  // Save user data
  async saveUserData(userData: UserData): Promise<void> {
    try {
      await AsyncStorage.setItem(USER_DATA_KEY, JSON.stringify(userData));
    } catch (error) {
      console.error('Error saving user data:', error);
    }
  },

  // Clear user data (for testing)
  async clearUserData(): Promise<void> {
    try {
      await AsyncStorage.removeItem(USER_DATA_KEY);
    } catch (error) {
      console.error('Error clearing user data:', error);
    }
  },
};

