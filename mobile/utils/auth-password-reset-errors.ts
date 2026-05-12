/**
 * Maps Supabase auth errors from resetPasswordForEmail to copy users can act on.
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
    msg.includes('email rate limit') ||
    msg.includes('429')
  ) {
    return {
      title: 'Reset email not sent',
      message:
        'The server could not send the reset email (often SMTP or email provider settings in Supabase). Try again in a few minutes. If it keeps failing, ask your team to check Supabase Dashboard → Authentication → Emails / SMTP.',
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
