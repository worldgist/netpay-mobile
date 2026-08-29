import { supabase } from '@/lib/supabase';
import { authRedirectUrls } from '@/constants/site';

export const EMAIL_VERIFICATION_CODE_LENGTH = 6;

const EMAIL_OTP_TYPES = ['signup', 'email', 'magiclink'] as const;
type EmailOtpType = (typeof EMAIL_OTP_TYPES)[number];

export type SendVerificationCodeResult = {
  sent: boolean;
  error?: string;
  method?: 'signup_resend' | 'signup_resend_no_redirect' | 'magic_link_otp';
};

function emailVerificationRedirect(email: string): string {
  return authRedirectUrls.emailVerification(email);
}

function formatResendError(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes('once every') || normalized.includes('rate limit')) {
    return `${message} Wait 60 seconds, then tap Resend Code again.`;
  }
  if (normalized.includes('redirect') || normalized.includes('invalid')) {
    return `${message} Ask support to add your redirect URL in Supabase Auth settings.`;
  }
  return message;
}

/** Resend signup confirmation via Supabase Auth built-in mailer. */
export async function sendVerificationCode(email: string): Promise<SendVerificationCodeResult> {
  const trimmedEmail = email.trim().toLowerCase();
  if (!trimmedEmail) {
    return { sent: false, error: 'Email address is required.' };
  }

  const redirectTo = emailVerificationRedirect(trimmedEmail);

  const { error: signupRedirectError } = await supabase.auth.resend({
    type: 'signup',
    email: trimmedEmail,
    options: { emailRedirectTo: redirectTo },
  });

  if (!signupRedirectError) {
    return { sent: true, method: 'signup_resend' };
  }

  const { error: signupPlainError } = await supabase.auth.resend({
    type: 'signup',
    email: trimmedEmail,
  });

  if (!signupPlainError) {
    return { sent: true, method: 'signup_resend_no_redirect' };
  }

  const { error: magicLinkError } = await supabase.auth.signInWithOtp({
    email: trimmedEmail,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: redirectTo,
    },
  });

  if (!magicLinkError) {
    return { sent: true, method: 'magic_link_otp' };
  }

  const primaryError =
    signupRedirectError.message ||
    signupPlainError.message ||
    magicLinkError.message ||
    'Unable to resend the verification email.';

  return {
    sent: false,
    error: formatResendError(primaryError),
  };
}

export async function verifyEmailCode(email: string, token: string) {
  const trimmedEmail = email.trim().toLowerCase();
  const otpToken = token.trim();
  let lastError: Error | null = null;

  for (const type of EMAIL_OTP_TYPES) {
    const result = await supabase.auth.verifyOtp({
      email: trimmedEmail,
      token: otpToken,
      type,
    });

    if (!result.error) {
      return result;
    }

    lastError = result.error;
  }

  return {
    data: { session: null, user: null },
    error: lastError ?? new Error('Invalid verification code.'),
  };
}

export function isExistingUnconfirmedSignup(
  user: { identities?: Array<{ id?: string }> } | null | undefined,
): boolean {
  return Boolean(user && Array.isArray(user.identities) && user.identities.length === 0);
}

async function verifyTokenHash(tokenHash: string, preferredType?: string) {
  const types: EmailOtpType[] = preferredType === 'signup'
    ? ['signup', 'email', 'magiclink']
    : preferredType === 'magiclink'
      ? ['magiclink', 'email', 'signup']
      : ['email', 'signup', 'magiclink'];

  let lastError: Error | null = null;

  for (const type of types) {
    const result = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });

    if (!result.error) {
      return result;
    }

    lastError = result.error;
  }

  return {
    data: { session: null, user: null },
    error: lastError ?? new Error('Invalid verification link.'),
  };
}

export async function completeEmailVerificationFromLink(params: {
  accessToken?: string;
  refreshToken?: string;
  tokenHash?: string;
  type?: string;
  code?: string;
}) {
  const { accessToken, refreshToken, tokenHash, type, code } = params;

  if (accessToken && refreshToken) {
    return supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
  }

  if (code) {
    return supabase.auth.exchangeCodeForSession(code);
  }

  if (tokenHash) {
    return verifyTokenHash(tokenHash, type);
  }

  return { data: { session: null, user: null }, error: new Error('Missing verification tokens.') };
}
