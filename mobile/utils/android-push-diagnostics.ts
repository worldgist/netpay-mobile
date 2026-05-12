/**
 * Android Push Notification Diagnostics Utility
 * Use this to diagnose Android push notification issues
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';
import { registerForPushNotifications } from './push-notifications';

export interface AndroidPushDiagnostics {
  platform: string;
  isAndroid: boolean;
  executionEnvironment: string;
  isExpoGo: boolean;
  isAndroidExpoGo: boolean;
  projectId: string;
  androidPackage: string;
  hasNotificationsModule: boolean;
  permissionsStatus?: string;
  tokenGeneration?: {
    success: boolean;
    token?: string;
    error?: string;
  };
  backendRegistration?: {
    success: boolean;
    error?: string;
  };
  recommendations: string[];
}

export const diagnoseAndroidPushNotifications = async (): Promise<AndroidPushDiagnostics> => {
  const diagnostics: AndroidPushDiagnostics = {
    platform: Platform.OS,
    isAndroid: Platform.OS === 'android',
    executionEnvironment: Constants.executionEnvironment || 'unknown',
    isExpoGo: Constants.executionEnvironment === 'storeClient',
    isAndroidExpoGo: Constants.executionEnvironment === 'storeClient' && Platform.OS === 'android',
    projectId: Constants.expoConfig?.extra?.eas?.projectId || 'not-set',
    androidPackage: Constants.expoConfig?.android?.package || 'not-set',
    hasNotificationsModule: false,
    recommendations: [],
  };

  // Check if expo-notifications is available
  try {
    const Notifications = require('expo-notifications');
    diagnostics.hasNotificationsModule = !!Notifications;
    
    if (Notifications) {
      // Check permissions
      try {
        const { status } = await Notifications.getPermissionsAsync();
        diagnostics.permissionsStatus = status;
      } catch (error) {
        diagnostics.permissionsStatus = `error: ${error instanceof Error ? error.message : 'unknown'}`;
      }
    }
  } catch (error) {
    diagnostics.hasNotificationsModule = false;
    diagnostics.recommendations.push('expo-notifications module is not available');
  }

  // Check execution environment
  if (diagnostics.isAndroidExpoGo) {
    diagnostics.recommendations.push('⚠️ Android push notifications are NOT available in Expo Go. Use a development or production build.');
  }

  // Check project configuration
  if (diagnostics.projectId === 'not-set') {
    diagnostics.recommendations.push('⚠️ EAS project ID is not set. Check app.config.js extra.eas.projectId');
  }

  if (diagnostics.androidPackage === 'not-set') {
    diagnostics.recommendations.push('⚠️ Android package name is not set. Check app.config.js android.package');
  }

  // Check permissions
  if (diagnostics.permissionsStatus !== 'granted') {
    diagnostics.recommendations.push(`⚠️ Notification permissions are not granted. Current status: ${diagnostics.permissionsStatus}`);
  }

  // Try to register and get token
  try {
    const result = await registerForPushNotifications();
    diagnostics.tokenGeneration = {
      success: result.registered,
      token: result.token,
      error: result.reason,
    };

    if (!result.registered) {
      diagnostics.recommendations.push(`❌ Token generation failed: ${result.reason}`);
    } else {
      diagnostics.recommendations.push('✅ Token generated successfully');
      
      // Check if token was registered with backend
      if (result.token) {
        // Query database to verify registration
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            const { data: tokens, error: queryError } = await supabase
              .from('user_push_tokens')
              .select('platform, is_active, created_at')
              .eq('user_id', session.user.id)
              .eq('platform', 'android')
              .order('created_at', { ascending: false })
              .limit(1);

            if (queryError) {
              diagnostics.backendRegistration = {
                success: false,
                error: queryError.message,
              };
              diagnostics.recommendations.push(`❌ Database query failed: ${queryError.message}`);
            } else if (tokens && tokens.length > 0) {
              const token = tokens[0];
              diagnostics.backendRegistration = {
                success: token.is_active,
                error: token.is_active ? undefined : 'Token exists but is not active',
              };
              if (token.is_active) {
                diagnostics.recommendations.push('✅ Token registered in database');
              } else {
                diagnostics.recommendations.push('⚠️ Token exists in database but is not active');
              }
            } else {
              diagnostics.backendRegistration = {
                success: false,
                error: 'No Android token found in database',
              };
              diagnostics.recommendations.push('❌ Token not found in database. Registration may have failed.');
            }
          }
        } catch (dbError) {
          diagnostics.backendRegistration = {
            success: false,
            error: dbError instanceof Error ? dbError.message : 'Unknown error',
          };
        }
      }
    }
  } catch (error) {
    diagnostics.tokenGeneration = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    diagnostics.recommendations.push(`❌ Registration attempt failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  return diagnostics;
};

/**
 * Print diagnostics to console in a readable format
 */
export const printAndroidPushDiagnostics = async () => {
  console.log('\n=== Android Push Notification Diagnostics ===\n');
  
  const diagnostics = await diagnoseAndroidPushNotifications();
  
  console.log('Platform:', diagnostics.platform);
  console.log('Is Android:', diagnostics.isAndroid);
  console.log('Execution Environment:', diagnostics.executionEnvironment);
  console.log('Is Expo Go:', diagnostics.isExpoGo);
  console.log('Is Android Expo Go:', diagnostics.isAndroidExpoGo);
  console.log('Project ID:', diagnostics.projectId);
  console.log('Android Package:', diagnostics.androidPackage);
  console.log('Has Notifications Module:', diagnostics.hasNotificationsModule);
  console.log('Permissions Status:', diagnostics.permissionsStatus || 'not checked');
  
  if (diagnostics.tokenGeneration) {
    console.log('\nToken Generation:');
    console.log('  Success:', diagnostics.tokenGeneration.success);
    if (diagnostics.tokenGeneration.token) {
      console.log('  Token:', diagnostics.tokenGeneration.token.substring(0, 30) + '...');
    }
    if (diagnostics.tokenGeneration.error) {
      console.log('  Error:', diagnostics.tokenGeneration.error);
    }
  }
  
  if (diagnostics.backendRegistration) {
    console.log('\nBackend Registration:');
    console.log('  Success:', diagnostics.backendRegistration.success);
    if (diagnostics.backendRegistration.error) {
      console.log('  Error:', diagnostics.backendRegistration.error);
    }
  }
  
  console.log('\nRecommendations:');
  diagnostics.recommendations.forEach((rec, index) => {
    console.log(`  ${index + 1}. ${rec}`);
  });
  
  console.log('\n==========================================\n');
  
  return diagnostics;
};
