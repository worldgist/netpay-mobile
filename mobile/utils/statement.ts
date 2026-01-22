import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';
import { supabase } from '@/lib/supabase';

/**
 * Downloads a PDF statement from the Supabase Edge Function and shares it
 * @param userId - The user ID (not required, will use authenticated user)
 * @param startDate - Start date for the statement
 * @param endDate - End date for the statement
 * @returns Promise that resolves when the download/share is complete
 */
export async function downloadStatementPDF(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<void> {
  try {
    // Get session for authentication
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('Please sign in to download statement');
    }

    // Get Supabase URL from environment
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      throw new Error('Supabase URL is not configured');
    }

    // Call edge function directly with fetch to handle PDF response
    const functionUrl = `${supabaseUrl}/functions/v1/statement-of-account`;
    
    console.log('Calling statement function:', {
      url: functionUrl,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      hasToken: !!session.access_token,
    });
    
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        send_email: false,
      }),
    });
    
    console.log('Response status:', response.status, response.statusText);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      let errorMessage = 'Failed to generate statement';
      let errorDetails: any = null;
      
      try {
        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          const errorData = await response.json();
          // Prioritize the 'error' field as it contains user-friendly message
          errorMessage = errorData.error || errorData.message || errorMessage;
          errorDetails = errorData.details || errorData;
          
          // If we have details with a message, use it if errorMessage is generic
          if (errorDetails?.message && errorMessage === 'Failed to generate statement') {
            errorMessage = errorDetails.message;
          }
        } else {
          const errorText = await response.text();
          if (errorText) {
            try {
              const errorJson = JSON.parse(errorText);
              errorMessage = errorJson.error || errorJson.message || errorMessage;
              errorDetails = errorJson.details || errorJson;
            } catch {
              errorMessage = errorText || errorMessage;
            }
          }
        }
      } catch (parseError) {
        console.error('Error parsing error response:', parseError);
        errorMessage = `Server error (${response.status}): ${response.statusText}`;
      }
      
      console.error('Statement generation failed:', {
        status: response.status,
        statusText: response.statusText,
        error: errorMessage,
        details: errorDetails,
      });
      
      // Use the most descriptive error message available
      throw new Error(errorMessage);
    }

    // Get PDF as array buffer
    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    const fileUri = FileSystem.cacheDirectory + `statement-${userId}-${Date.now()}.pdf`;
    
    // Convert to base64 string
    const base64 = btoa(String.fromCharCode(...uint8Array));
    
    // Write file with base64 encoding using legacy API
    await FileSystem.writeAsStringAsync(fileUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Share Statement of Account',
      });
    } else {
      Alert.alert('Success', 'Statement downloaded successfully');
    }
  } catch (err) {
    console.error('Download error:', err);
    throw err;
  }
}

/**
 * Sends a PDF statement to the user's email via Supabase Edge Function
 * @param userId - The user ID (not required, will use authenticated user)
 * @param userEmail - The user's email address
 * @param startDate - Start date for the statement
 * @param endDate - End date for the statement
 * @returns Promise that resolves when the email is sent
 */
export async function sendStatementEmail(
  userId: string,
  userEmail: string,
  startDate: Date,
  endDate: Date
): Promise<void> {
  try {
    // Get session for authentication
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('Please sign in to send statement');
    }

    // Get Supabase URL from environment
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      throw new Error('Supabase URL is not configured');
    }

    // Call edge function
    const { data, error } = await supabase.functions.invoke('statement-of-account', {
      body: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        send_email: true,
        email: userEmail,
      },
    });

    if (error) {
      console.error('Edge function error:', error);
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        context: error.context,
      });
      
      // Try to extract more details from the error
      let errorMessage = error.message || 'Failed to send statement';
      if (error.context) {
        try {
          const context = typeof error.context === 'string' ? JSON.parse(error.context) : error.context;
          if (context.message) {
            errorMessage = context.message;
          }
        } catch {
          // Ignore parse errors
        }
      }
      
      throw new Error(errorMessage);
    }

    const result = typeof data === 'string' ? JSON.parse(data) : data;
    Alert.alert('Success', result?.message || 'Statement sent to your email!');
  } catch (err) {
    console.error('Email error:', err);
    throw err;
  }
}
