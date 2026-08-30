import { supabase } from '@/lib/supabase';

export type SyncFlutterwaveFundingResult = {
  success: boolean;
  synced: number;
  balance?: number;
  message?: string;
  error?: string;
};

export async function syncFlutterwaveFunding(): Promise<SyncFlutterwaveFundingResult> {
  const { data, error } = await supabase.functions.invoke('sync-flutterwave-funding', {
    body: {},
  });

  if (error) {
    return {
      success: false,
      synced: 0,
      error: String(data?.error || error.message || 'Unable to sync funding'),
    };
  }

  if (data?.success === false) {
    return {
      success: false,
      synced: 0,
      error: String(data.error || 'Unable to sync funding'),
    };
  }

  return {
    success: true,
    synced: Number(data?.synced ?? 0),
    balance: data?.balance != null ? Number(data.balance) : undefined,
    message: typeof data?.message === 'string' ? data.message : undefined,
  };
}
