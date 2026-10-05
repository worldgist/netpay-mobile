import { supabase } from '@/integrations/supabase/client';

export interface MeterInfo {
  customer_name?: string;
  meter_number?: string;
  address?: string;
  tariff?: string;
  meter_type?: string;
  minimum_vend?: number;
  outstanding_amount?: number;
  customer_category?: string;
  business_unit?: string;
  utility_account?: string;
  response_message?: string;
}

export interface ValidateMeterParams {
  meter_number: string;
  provider: string;
  meter_type: 'prepaid' | 'postpaid';
  vending_provider?: 'vtpass' | 'mobilenig' | 'smeplug' | 'ebills';
}

export interface ValidateMeterResponse {
  success: boolean;
  data?: MeterInfo;
  error?: string;
}

export interface PurchaseElectricityParams {
  meter_number: string;
  provider: string;
  meter_type: 'prepaid' | 'postpaid';
  amount: number;
  phone: string;
  vending_provider?: 'vtpass' | 'mobilenig' | 'smeplug' | 'ebills';
  customer_name?: string;
  customer_address?: string;
  tariff?: string;
  minimum_vend?: number;
  outstanding_amount?: number;
  customer_category?: string;
  business_unit?: string;
  idempotency_key?: string;
}

export interface PurchaseElectricityResponse {
  success: boolean;
  data?: any;
  error?: string;
  message?: string;
  status?: string;
  transaction_id?: string;
  reference?: string;
  token?: string;
}

/**
 * Electricity Service - Handles all electricity-related edge function calls
 * with proper error handling, retries, and fallbacks
 */
class ElectricityService {
  private readonly TIMEOUT_MS = 45000; // 45 seconds (increased for slower networks)
  private readonly MAX_RETRIES = 2;

  /**
   * Validate meter number with retry and fallback logic
   */
  async validateMeter(params: ValidateMeterParams): Promise<ValidateMeterResponse> {
    const { meter_number, provider, meter_type, vending_provider } = params;

    console.log('ElectricityService.validateMeter called with:', {
      meter_number: meter_number?.substring(0, 4) + '***',
      provider,
      meter_type,
      vending_provider,
    });

    // Try supabase.functions.invoke first (better error handling)
    try {
      const result = await this.validateMeterWithInvoke(params);
      console.log('validateMeterWithInvoke succeeded:', { success: result.success });
      return result;
    } catch (invokeError: any) {
      console.log('Supabase invoke failed, trying direct fetch:', {
        error: invokeError?.message || invokeError,
        name: invokeError?.name,
      });
      
      // Fallback to direct fetch
      try {
        const result = await this.validateMeterWithFetch(params);
        console.log('validateMeterWithFetch succeeded:', { success: result.success });
        return result;
      } catch (fetchError: any) {
        console.error('Both methods failed:', {
          invokeError: invokeError?.message || invokeError,
          fetchError: fetchError?.message || fetchError,
        });
        throw this.normalizeError(fetchError || invokeError);
      }
    }
  }

  /**
   * Validate meter using supabase.functions.invoke
   */
  private async validateMeterWithInvoke(
    params: ValidateMeterParams
  ): Promise<ValidateMeterResponse> {
    const { meter_number, provider, meter_type, vending_provider } = params;

    // Create timeout with cleanup
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('Request timed out'));
      }, this.TIMEOUT_MS);
    });

    try {
      // Create invoke promise
      const invokePromise = supabase.functions.invoke('validate-meter-number', {
        body: {
          meter_number: meter_number.trim(),
          provider,
          meter_type,
          vending_provider: vending_provider || undefined,
        },
      });

      // Race between invoke and timeout
      const result = await Promise.race([invokePromise, timeoutPromise]) as any;
      
      // Clear timeout if request completed first
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

    console.log('validateMeterWithInvoke result:', {
      hasError: !!result.error,
      hasData: !!result.data,
      dataType: typeof result.data,
      dataKeys: result.data ? Object.keys(result.data) : [],
    });

    // supabase.functions.invoke returns { data, error }
    if (result.error) {
      // If error is an object with message, extract it
      const errorMessage = result.error?.message || result.error?.error || result.error || 'Validation failed';
      console.error('validateMeterWithInvoke error:', errorMessage);
      throw new Error(errorMessage);
    }

    // The data from invoke is the actual response from the edge function
    const responseData = result.data;

    if (!responseData) {
      console.error('validateMeterWithInvoke: No data received');
      throw new Error('No data received from server');
    }

    console.log('validateMeterWithInvoke responseData:', {
      success: responseData.success,
      hasData: !!responseData.data,
      error: responseData.error,
    });

    // Check if responseData is already the parsed response
    if (responseData.success !== undefined) {
      if (responseData.success) {
        return {
          success: true,
          data: responseData.data,
        };
      } else {
        return {
          success: false,
          error: responseData.error || responseData.message || 'Validation failed',
        };
      }
    }

    // Fallback: if responseData doesn't have success, treat as error
    console.error('validateMeterWithInvoke: Invalid response format', responseData);
    throw new Error(responseData.error || responseData.message || 'Invalid response format');
    } catch (error: any) {
      // Clear timeout on error
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      throw error;
    }
  }

  /**
   * Validate meter using direct fetch (fallback)
   */
  private async validateMeterWithFetch(
    params: ValidateMeterParams
  ): Promise<ValidateMeterResponse> {
    const { meter_number, provider, meter_type, vending_provider } = params;

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    if (!supabaseUrl) {
      throw new Error('Configuration error: Supabase URL not set');
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('Please sign in to continue');
    }

    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT_MS);

    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/validate-meter-number`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          meter_number: meter_number.trim(),
          provider,
          meter_type,
          vending_provider: vending_provider || undefined,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const responseText = await response.text();

      if (!responseText || responseText.trim().length === 0) {
        throw new Error('No response from server. Please try again.');
      }

      let responseData: any;
      try {
        responseData = JSON.parse(responseText);
      } catch (parseError) {
        if (response.status >= 500) {
          throw new Error('Server error. Please try again later.');
        }
        throw new Error(`Invalid response from server: ${responseText.substring(0, 200)}`);
      }

      if (!response.ok) {
        const errorMsg = responseData?.error || responseData?.message || 
          `HTTP ${response.status}: ${response.statusText}`;
        throw new Error(errorMsg);
      }

      if (responseData?.success) {
        return {
          success: true,
          data: responseData.data,
        };
      } else {
        return {
          success: false,
          error: responseData?.error || responseData?.message || 'Validation failed',
        };
      }
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      throw fetchError;
    }
  }

  /**
   * Purchase electricity with retry and fallback logic
   */
  async purchaseElectricity(
    params: PurchaseElectricityParams
  ): Promise<PurchaseElectricityResponse> {
    const withKey: PurchaseElectricityParams & { idempotency_key: string } = {
      ...params,
      idempotency_key: `elec-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`,
    };
    // Try supabase.functions.invoke first
    try {
      return await this.purchaseElectricityWithInvoke(withKey);
    } catch (invokeError: any) {
      console.log('Supabase invoke failed, trying direct fetch:', invokeError);
      
      // Fallback to direct fetch
      try {
        return await this.purchaseElectricityWithFetch(withKey);
      } catch (fetchError: any) {
        console.error('Both methods failed:', { invokeError, fetchError });
        throw this.normalizeError(fetchError || invokeError);
      }
    }
  }

  /**
   * Purchase electricity using supabase.functions.invoke
   */
  private async purchaseElectricityWithInvoke(
    params: PurchaseElectricityParams
  ): Promise<PurchaseElectricityResponse> {
    // Create timeout with cleanup
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('Request timed out'));
      }, this.TIMEOUT_MS);
    });

    try {
      const invokePromise = supabase.functions.invoke('purchase-electricity', {
        body: {
          meter_number: params.meter_number.trim(),
          provider: params.provider,
          meter_type: params.meter_type,
          amount: params.amount,
          phone: params.phone.trim(),
          vending_provider: params.vending_provider || undefined,
          customer_name: params.customer_name || undefined,
          customer_address: params.customer_address || undefined,
          tariff: params.tariff || undefined,
          minimum_vend: params.minimum_vend || undefined,
          outstanding_amount: params.outstanding_amount || undefined,
          customer_category: params.customer_category || undefined,
          business_unit: params.business_unit || undefined,
          idempotency_key: params.idempotency_key,
        },
      });

      const result = await Promise.race([invokePromise, timeoutPromise]) as any;
      
      // Clear timeout if request completed first
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // supabase.functions.invoke returns { data, error }
      if (result.error) {
        const errorMessage = result.error?.message || result.error?.error || result.error || 'Purchase failed';
        throw new Error(errorMessage);
      }

      const responseData = result.data;

      if (!responseData) {
        throw new Error('No data received from server');
      }

      // Check if responseData is already the parsed response
      if (responseData.success !== undefined) {
        if (responseData.success) {
          return {
            success: true,
            data: responseData.data,
            status: responseData.status || responseData.data?.status,
            message: responseData.message,
            transaction_id: responseData.data?.transaction_id || responseData.transaction_id,
            reference: responseData.data?.reference || responseData.reference,
            token: responseData.data?.token || responseData.data?.energyToken || responseData.token,
          };
        } else {
          return {
            success: false,
            error: responseData.error || responseData.message || 'Purchase failed',
          };
        }
      }

      // Fallback: if responseData doesn't have success, treat as error
      throw new Error(responseData.error || responseData.message || 'Invalid response format');
    } catch (error: any) {
      // Clear timeout on error
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      throw error;
    }
  }

  /**
   * Purchase electricity using direct fetch (fallback)
   */
  private async purchaseElectricityWithFetch(
    params: PurchaseElectricityParams
  ): Promise<PurchaseElectricityResponse> {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    if (!supabaseUrl) {
      throw new Error('Configuration error: Supabase URL not set');
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('Please sign in to continue');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT_MS);

    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/purchase-electricity`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          meter_number: params.meter_number.trim(),
          provider: params.provider,
          meter_type: params.meter_type,
          amount: params.amount,
          phone: params.phone.trim(),
          vending_provider: params.vending_provider || undefined,
          customer_name: params.customer_name || undefined,
          customer_address: params.customer_address || undefined,
          tariff: params.tariff || undefined,
          minimum_vend: params.minimum_vend || undefined,
          outstanding_amount: params.outstanding_amount || undefined,
          customer_category: params.customer_category || undefined,
          business_unit: params.business_unit || undefined,
          idempotency_key: params.idempotency_key,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const responseText = await response.text();

      if (!responseText || responseText.trim().length === 0) {
        throw new Error('No response from server. Please try again.');
      }

      let responseData: any;
      try {
        responseData = JSON.parse(responseText);
      } catch (parseError) {
        if (response.status >= 500) {
          throw new Error('Server error. Please try again later.');
        }
        throw new Error(`Invalid response from server: ${responseText.substring(0, 200)}`);
      }

      if (!response.ok) {
        const errorMsg = responseData?.error || responseData?.message || 
          `HTTP ${response.status}: ${response.statusText}`;
        throw new Error(errorMsg);
      }

      if (responseData?.success) {
        return {
          success: true,
          data: responseData.data,
          status: responseData.status || responseData.data?.status,
          message: responseData.message,
          transaction_id: responseData.data?.transaction_id || responseData.transaction_id,
          reference: responseData.data?.reference || responseData.reference,
          token: responseData.data?.token || responseData.data?.energyToken || responseData.token,
        };
      } else {
        return {
          success: false,
          error: responseData?.error || responseData?.message || 'Purchase failed',
        };
      }
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      throw fetchError;
    }
  }

  /**
   * Normalize errors to user-friendly messages
   */
  private normalizeError(error: any): Error {
    if (error instanceof Error) {
      // Handle specific error types
      if (error.name === 'AbortError' || error.message?.includes('timeout') || error.message?.includes('timed out')) {
        return new Error('Request timed out. Please check your internet connection and try again.');
      }

      if (error.name === 'FunctionsFetchError' || 
          error.message?.includes('edge function') ||
          error.message?.includes('Edge Function')) {
        return new Error('Service temporarily unavailable. Please try again in a moment.');
      }

      if (error.message?.includes('Failed to fetch') || 
          error.message?.includes('NetworkError') ||
          error.message?.includes('Network request failed') ||
          error.name === 'TypeError') {
        return new Error('Connection error. Please check your internet connection and try again.');
      }

      return error;
    }

    // Handle non-Error objects
    if (typeof error === 'string') {
      return new Error(error);
    }

    return new Error('An unexpected error occurred. Please try again.');
  }
}

// Export singleton instance
export const electricityService = new ElectricityService();

