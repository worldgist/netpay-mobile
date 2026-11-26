import { supabase } from '@/lib/supabase';

/**
 * Maps password-reset send errors to copy users can act on.
 */
export function getPasswordResetEmailUserMessage(error: unknown): { title: string; message: string } {
  const name =
    typeof error === 'object' && error !== null && 'name' in error
      ? String((error as { name?: string }).name)
      : '';
  const msg = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const lower = `${name} ${msg}`.toLowerCase();

  if (
    msg.includes('Network request failed') ||
    name === 'AuthRetryableFetchError' ||
    lower.includes('failed to fetch')
  ) {
    return {
      title: 'Connection problem',
      message:
        'Your phone could not reach our servers. Check Wi‑Fi or mobile data, try turning off VPN, then try again.',
    };
  }

  if (
    msg.includes('Error sending recovery email') ||
    lower.includes('recovery email') ||
    lower.includes('resend') ||
    msg.includes('email rate limit') ||
    msg.includes('429')
  ) {
    return {
      title: 'Reset email not sent',
      message:
        'We could not send the reset code email right now. Try again in a few minutes. If it keeps failing, contact support@netppay.com.',
    };
  }

  return {
    title: 'Forgot Password',
    message: msg.trim() || 'Unable to send reset instructions. Please try again.',
  };
}

export function isPasswordResetNetworkError(error: unknown): boolean {
  const name =
    typeof error === 'object' && error !== null && 'name' in error
      ? String((error as { name?: string }).name)
      : '';
  const msg = error instanceof Error ? error.message : '';
  return (
    name === 'AuthRetryableFetchError' ||
    msg.includes('Network request failed') ||
    msg.includes('Failed to fetch')
  );
}

type ResetCodeResponse = {
  success?: boolean;
  message?: string;
  error?: string;
};

/**
 * Requests a 6-digit password reset code emailed via Resend (not Supabase Auth SMTP).
 */
export async function requestPasswordResetCode(
  email: string,
): Promise<{ error: Error | null }> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) {
    return { error: new Error('Enter a valid email address') };
  }

  try {
    const { data, error } = await supabase.functions.invoke('send-password-reset-code', {
      body: { email: trimmed },
    });

    const payload = (data || {}) as ResetCodeResponse;

    if (error) {
      // Prefer the edge function's JSON error body when present.
      if (payload.error || payload.message) {
        return { error: new Error(payload.error || payload.message || 'Failed to send reset code') };
      }

      const context = (error as { context?: Response }).context;
      if (context && typeof context.json === 'function') {
        try {
          const body = (await context.json()) as ResetCodeResponse;
          if (body?.error || body?.message) {
            return { error: new Error(body.error || body.message || 'Failed to send reset code') };
          }
        } catch {
          // ignore parse failures
        }
      }

      return { error: error instanceof Error ? error : new Error(String(error.message || error)) };
    }

    if (payload.success === false) {
      return { error: new Error(payload.error || payload.message || 'Failed to send reset code') };
    }

    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err : new Error('Failed to send reset code') };
  }
}
