/**
 * MobileNig Enterprise API Service
 * 
 * Based on MobileNig Enterprise API v2 documentation:
 * - Validate: POST /api/v2/services/proxy (uses public_key)
 * - Recharge: POST /api/v2/services/ (uses secret_key)
 * - Query: GET /api/v2/services/query (uses secret_key)
 * 
 * Service ID: AHB for Abuja Prepaid
 */

export interface MobileNigValidateRequest {
  service_id: string; // "AHB" for Abuja Prepaid
  customerAccountId: string; // Customer reference/meter number
}

export interface MobileNigValidateResponse {
  message: string;
  statusCode: string;
  details: {
    customerAddress: string;
    customerReference: string;
    minimumVend: number;
    tariff: string;
    responseMessage: string;
    customerName: string;
    responseCode: number;
  };
}

export interface MobileNigRechargeRequest {
  service_id: string; // "AHB" for Abuja Prepaid
  trans_id: number; // Unique reference for the transaction
  customerReference: string; // Account number of the customer
  amount: number; // Total transaction amount
  customerName: string; // Customer name obtained from validation
  customerAddress: string; // Customer address obtained from validation
}

export interface MobileNigRechargeResponse {
  message: string;
  statusCode: string;
  details: {
    trans_id: number;
    service: string;
    status: string;
    details: {
      amount: number;
      customerReference: string;
      token: number;
      reference: string;
      receiptNumber: string;
    };
    wallet_balance: string;
  };
}

export interface MobileNigQueryResponse {
  message: string;
  statusCode: string;
  details: {
    trans_id: string;
    service: string;
    status: string;
    details: {
      amount: number;
      customerReference: string;
      token: number;
      reference: string;
      receiptNumber: string;
    };
  };
}

/**
 * MobileNig Enterprise API Client
 * 
 * This service handles direct API calls to MobileNig Enterprise API
 * Note: In production, these calls should go through Supabase Edge Functions
 * to protect API keys and handle authentication
 */
export class MobileNigService {
  private readonly baseUrl = 'https://enterprise.mobilenig.com/api/v2';
  private publicKey?: string;
  private secretKey?: string;

  constructor(publicKey?: string, secretKey?: string) {
    this.publicKey = publicKey;
    this.secretKey = secretKey;
  }

  /**
   * Validate meter number
   * POST /api/v2/services/proxy
   * Uses public_key for authorization
   */
  async validateMeter(
    serviceId: string,
    customerAccountId: string,
    publicKey?: string
  ): Promise<MobileNigValidateResponse> {
    const key = publicKey || this.publicKey;
    if (!key) {
      throw new Error('MobileNig public key is required for validation');
    }

    const response = await fetch(`${this.baseUrl}/services/proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({
        service_id: serviceId,
        customerAccountId: customerAccountId,
      } as MobileNigValidateRequest),
    });

    const responseText = await response.text();
    if (!response.ok || !responseText) {
      throw new Error(`Validation failed: ${response.status} ${response.statusText}`);
    }

    const data: MobileNigValidateResponse = JSON.parse(responseText);
    
    if (data.statusCode !== '200' || data.message !== 'success') {
      throw new Error(data.details?.responseMessage || 'Validation failed');
    }

    return data;
  }

  /**
   * Recharge/ Purchase electricity
   * POST /api/v2/services/
   * Uses secret_key for authorization
   */
  async recharge(
    request: MobileNigRechargeRequest,
    secretKey?: string
  ): Promise<MobileNigRechargeResponse> {
    const key = secretKey || this.secretKey;
    if (!key) {
      throw new Error('MobileNig secret key is required for recharge');
    }

    const response = await fetch(`${this.baseUrl}/services/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify(request),
    });

    const responseText = await response.text();
    if (!response.ok || !responseText) {
      throw new Error(`Recharge failed: ${response.status} ${response.statusText}`);
    }

    const data: MobileNigRechargeResponse = JSON.parse(responseText);
    
    if (data.statusCode !== '200' || data.message !== 'success') {
      throw new Error(`Recharge failed: ${data.details?.status || 'Unknown error'}`);
    }

    return data;
  }

  /**
   * Query transaction status
   * GET /api/v2/services/query?trans_id=...
   * Uses secret_key for authorization
   */
  async queryTransaction(
    transId: number | string,
    secretKey?: string
  ): Promise<MobileNigQueryResponse> {
    const key = secretKey || this.secretKey;
    if (!key) {
      throw new Error('MobileNig secret key is required for query');
    }

    const response = await fetch(`${this.baseUrl}/services/query?trans_id=${encodeURIComponent(String(transId))}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
    });

    const responseText = await response.text();
    if (!response.ok || !responseText) {
      throw new Error(`Query failed: ${response.status} ${response.statusText}`);
    }

    const data: MobileNigQueryResponse = JSON.parse(responseText);
    
    if (data.statusCode !== '200' || data.message !== 'success') {
      throw new Error(`Query failed: ${data.message || 'Unknown error'}`);
    }

    return data;
  }

  /**
   * Generate unique transaction ID
   * Uses timestamp + random number for uniqueness
   */
  generateTransId(): number {
    return Date.now() * 1000 + Math.floor(Math.random() * 1000);
  }
}

// Export singleton instance (keys should be set from environment)
export const mobileNigService = new MobileNigService();



















