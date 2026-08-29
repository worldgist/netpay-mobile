import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';
import { supabase } from '@/lib/supabase';

type StatementRequestBody = {
  start: string;
  end: string;
  send_email: boolean;
  email?: string;
};

function getSupabaseConfig() {
  const supabaseUrl =
    process.env.EXPO_PUBLIC_SUPABASE_URL ||
    (supabase as unknown as { supabaseUrl?: string }).supabaseUrl;
  const anonKey =
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    (supabase as unknown as { supabaseKey?: string }).supabaseKey;

  if (!supabaseUrl || !anonKey) {
    throw new Error('Supabase is not configured');
  }

  return { supabaseUrl, anonKey };
}

async function getAccessToken() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Please sign in to continue');
  }
  return session.access_token;
}

function getStatementFunctionUrl() {
  const { supabaseUrl } = getSupabaseConfig();
  return `${supabaseUrl}/functions/v1/statement-of-account`;
}

async function buildStatementHeaders() {
  const { anonKey } = getSupabaseConfig();
  const accessToken = await getAccessToken();

  return {
    Authorization: `Bearer ${accessToken}`,
    apikey: anonKey,
    'Content-Type': 'application/json',
  };
}

function parseStatementErrorBody(status: number, responseText: string): string {
  let errorMessage = `Failed to process statement (${status})`;

  if (!responseText) {
    return errorMessage;
  }

  try {
    const errorData = JSON.parse(responseText);
    errorMessage = errorData.error || errorData.message || errorMessage;
  } catch {
    errorMessage = responseText.slice(0, 240);
  }

  return errorMessage;
}

const STATEMENT_REQUEST_TIMEOUT_MS = 60_000;

async function postStatementRequest(body: StatementRequestBody) {
  const headers = await buildStatementHeaders();
  const functionUrl = getStatementFunctionUrl();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), STATEMENT_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Statement request timed out. Please try again.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Downloads a PDF statement from the Supabase Edge Function and shares it
 */
export async function downloadStatementPDF(
  userId: string,
  startDate: Date,
  endDate: Date,
): Promise<void> {
  try {
    const response = await postStatementRequest({
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      send_email: false,
    });

    if (!response.ok) {
      const responseText = await response.text();
      console.error('Statement PDF error:', {
        status: response.status,
        body: responseText.slice(0, 500),
      });
      throw new Error(parseStatementErrorBody(response.status, responseText));
    }

    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    const fileUri = `${FileSystem.cacheDirectory}statement-${userId}-${Date.now()}.pdf`;
    const base64 = btoa(String.fromCharCode(...uint8Array));

    await FileSystem.writeAsStringAsync(fileUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Share Statement',
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
 * Sends a PDF statement to the user's email via the statement-of-account edge function
 */
export async function sendStatementEmail(
  _userId: string,
  userEmail: string,
  startDate: Date,
  endDate: Date,
): Promise<string> {
  const response = await postStatementRequest({
    start: startDate.toISOString(),
    end: endDate.toISOString(),
    send_email: true,
    email: userEmail,
  });

  const responseText = await response.text();

  if (!response.ok) {
    console.error('Statement email error:', {
      status: response.status,
      body: responseText.slice(0, 500),
    });
    throw new Error(parseStatementErrorBody(response.status, responseText));
  }

  if (responseText) {
    try {
      const result = JSON.parse(responseText) as { message?: string };
      return result.message || 'Statement sent to your email!';
    } catch {
      return responseText;
    }
  }

  return 'Statement sent to your email!';
}
