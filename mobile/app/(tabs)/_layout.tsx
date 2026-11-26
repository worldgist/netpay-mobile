import { Tabs, useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { MaterialIcons } from '@expo/vector-icons';
import { Platform, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HapticTab } from '@/components/haptic-tab';
import { hasCompletedOnboarding } from '@/utils/onboarding';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }

    let active = true;

    const guardTabs = async () => {
      const completed = await hasCompletedOnboarding();
      if (!active || completed) return;
      router.replace('/onboarding');
    };

    void guardTabs();

    return () => {
      active = false;
    };
  }, [router]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#FF7F00',
        tabBarInactiveTintColor: '#999',
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: '#fff',
          borderTopWidth: 1,
          borderTopColor: '#E0E0E0',
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.08,
          shadowRadius: 8,
          elevation: 8,
          height: 64 + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 2,
        },
        tabBarAllowFontScaling: false,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="home" size={size || 24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="pay-bills"
        options={{
          title: 'Pay Bills',
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="credit-card" size={size || 24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="ai-chat"
        options={{
          href: null,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: 'Transactions',
          tabBarLabel: ({ color, focused }) => (
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
              style={{
                color,
                fontSize: 11,
                fontWeight: focused ? '700' : '600',
                textAlign: 'center',
                width: '100%',
              }}>
              Transactions
            </Text>
          ),
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="swap-horiz" size={size || 24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="person" size={size || 24} color={color} />
          ),
        }}
      />
      {/* Pay Bills & deep links: stack-style screens inside tab navigator (hidden from tab bar) */}
      <Tabs.Screen name="flight-booking" options={{ href: null, headerShown: false }} />
    </Tabs>
  );
}
