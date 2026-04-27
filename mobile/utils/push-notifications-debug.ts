/**
 * Debug utility to check push notification registration status
 * Use this to diagnose Android push notification issues
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { supabase } from '@/lib/supabase';

export const debugPushNotifications = async () => {
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? null;

  const debugInfo: any = {
    platform: Platform.OS,
    isDevice: Device.isDevice,
    isExpoGo: Constants.executionEnvironment === 'storeClient',
    isAndroidExpoGo: Constants.executionEnvironment === 'storeClient' && Platform.OS === 'android',
    projectId,
    androidPackage: Constants.expoConfig?.android?.package || 'com.netpay.mobile',
  };

  try {
    // Check if expo-notifications is available
    let Notifications: any = null;
    try {
      Notifications = require('expo-notifications');
      debugInfo.notificationsAvailable = true;
    } catch (e) {
      debugInfo.notificationsAvailable = false;
      debugInfo.notificationsError = e instanceof Error ? e.message : String(e);
    }

    if (Notifications) {
      // Check permissions
      try {
        const { status, canAskAgain, granted } = await Notifications.getPermissionsAsync();
        debugInfo.permissions = {
          status,
          canAskAgain,
          granted,
        };
      } catch (e) {
        debugInfo.permissionsError = e instanceof Error ? e.message : String(e);
      }

      // Try to get device push token
      try {
        if (!projectId) {
          debugInfo.tokenError = 'Missing EAS projectId (extra.eas.projectId)';
          debugInfo.tokenObtained = false;
        } else {
        const { data: expoToken } = await Notifications.getExpoPushTokenAsync({ projectId });
        debugInfo.expoToken = expoToken;
        debugInfo.tokenObtained = true;
        }
      } catch (e) {
        debugInfo.tokenError = e instanceof Error ? e.message : String(e);
        debugInfo.tokenObtained = false;
      }
    }

    // Check if user is authenticated
    try {
      const { data: { session } } = await supabase.auth.getSession();
      debugInfo.userAuthenticated = !!session?.user;
      debugInfo.userId = session?.user?.id;
    } catch (e) {
      debugInfo.authError = e instanceof Error ? e.message : String(e);
    }

    // Check existing tokens in database
    try {
      const { data: tokens, error } = await supabase
        .from('user_push_tokens')
        .select('platform, is_active, created_at')
        .eq('is_active', true);
      
      debugInfo.existingTokens = {
        count: tokens?.length || 0,
        platforms: tokens?.map(t => t.platform) || [],
        error: error?.message,
      };
    } catch (e) {
      debugInfo.tokensQueryError = e instanceof Error ? e.message : String(e);
    }

    console.log('=== Push Notification Debug Info ===');
    console.log(JSON.stringify(debugInfo, null, 2));
    console.log('===================================');

    return debugInfo;
  } catch (error) {
    debugInfo.generalError = error instanceof Error ? error.message : String(error);
    console.error('Debug error:', error);
    return debugInfo;
  }
};














