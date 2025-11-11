import { supabase } from '@/lib/supabase';

interface CreateTransactionNotificationParams {
  title: string;
  message: string;
}

export async function createTransactionNotification(params: CreateTransactionNotificationParams): Promise<void> {
  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;

    const session = sessionData.session;
    if (!session) {
      console.warn('No active session; skipping notification creation');
      return;
    }

    const accessToken = session.access_token;

    const { data, error } = await supabase.functions.invoke('create-transaction-notification', {
      body: {
        title: params.title,
        message: params.message,
      },
      headers: accessToken
        ? {
            Authorization: `Bearer ${accessToken}`,
          }
        : undefined,
    });

    if (error) {
      throw error;
    }

    if (!data?.success) {
      throw new Error(data?.error || 'Unable to create notification');
    }
  } catch (error) {
    console.error('Failed to create transaction notification:', error);
  }
}
