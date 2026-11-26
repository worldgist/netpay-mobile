import { supabase } from '@/lib/supabase';

export type SignupAvailabilityResult = {
  success: boolean;
  emailExists: boolean;
  phoneExists: boolean;
  error?: string;
};

/**
 * Ask the backend whether an email and/or phone is already registered.
 * Used during signup (debounced) and once more before auth.signUp.
 */
export async function checkSignupAvailability(params: {
  email: string | null;
  phone: string | null;
}): Promise<SignupAvailabilityResult> {
  const { data, error } = await supabase.functions.invoke('check-signup-availability', {
    body: {
      email: params.email,
      phone: params.phone,
    },
  });

  if (error) {
    const bodyError =
      data && typeof data === 'object' && 'error' in data && typeof (data as { error?: string }).error === 'string'
        ? (data as { error: string }).error
        : null;
    return {
      success: false,
      emailExists: false,
      phoneExists: false,
      error: bodyError || error.message || 'Availability check failed',
    };
  }

  if (data && typeof data === 'object' && 'success' in data && (data as { success?: boolean }).success === false) {
    return {
      success: false,
      emailExists: false,
      phoneExists: false,
      error:
        typeof (data as { error?: string }).error === 'string'
          ? (data as { error: string }).error
          : 'Availability check failed',
    };
  }

  return {
    success: true,
    emailExists: Boolean((data as { emailExists?: boolean })?.emailExists),
    phoneExists: Boolean((data as { phoneExists?: boolean })?.phoneExists),
  };
}
