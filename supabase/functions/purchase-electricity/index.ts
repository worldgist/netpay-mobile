import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { debitUserWallet } from "../_shared/wallet.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('Authentication error:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const rawBody = await req.json();
    
    // Use vending_provider from request, or check app_settings as fallback
    const requestedVendingProvider = rawBody?.vending_provider;
    let vendingProvider = requestedVendingProvider;
    
    // Only check app_settings if not specified in request (for backward compatibility)
    if (!vendingProvider) {
      console.log('No vending_provider in request, checking app_settings...');
      const supabaseService = createClient(supabaseUrl, supabaseServiceKey);
      const { data: providerSetting } = await supabaseService
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'electricity_provider')
        .maybeSingle();

      vendingProvider = providerSetting?.setting_value?.provider || 'smeplug';
    } else {
      console.log('Using vending_provider from request:', vendingProvider);
    }
    
    console.log('Electricity vending provider:', vendingProvider, '(from request:', !!requestedVendingProvider, ')');
    const {
      meter_number,
      provider,
      meter_type,
      amount,
      phone,
      customer_name,
      customer_address,
    } = rawBody ?? {};

    console.log('Incoming electricity purchase payload:', JSON.stringify(rawBody, null, 2));
    console.log('Vending provider:', vendingProvider, 'Requested:', requestedVendingProvider);

    const sanitizedMeter =
      typeof meter_number === 'string' ? meter_number.replace(/\s+/g, '').trim() : '';
    const sanitizedPhone =
      typeof phone === 'string' ? phone.replace(/\s+/g, '').trim() : '';
    const providerCode = typeof provider === 'string' ? provider.trim().toUpperCase() : '';
    const meterKind = typeof meter_type === 'string' ? meter_type.trim().toLowerCase() : '';
    const purchaseAmount = Number(amount);
    const requestedCustomerName =
      typeof customer_name === 'string' ? customer_name.trim() : '';
    const requestedCustomerAddress =
      typeof customer_address === 'string' ? customer_address.trim() : '';

    if (!sanitizedMeter || !providerCode || !meterKind || !sanitizedPhone || !Number.isFinite(purchaseAmount)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'meter_number, provider, meter_type, phone, and amount are required',
          details: {
            meter_number: Boolean(sanitizedMeter),
            provider: providerCode,
            meter_type: meterKind,
            phone: Boolean(sanitizedPhone),
            amount: purchaseAmount,
          },
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (purchaseAmount <= 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid amount' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Processing electricity purchase:', {
      user_id: user.id,
      meter_number: sanitizedMeter,
      provider: providerCode,
      meter_type: meterKind,
      amount: purchaseAmount,
    });

    // Get user balance
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('balance')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      throw new Error('Failed to fetch user profile');
    }

    if (Number(profile.balance) < purchaseAmount) {
      return new Response(
        JSON.stringify({ success: false, error: 'Insufficient balance' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Map provider to MobileNig Service IDs
    // Per MobileNig API documentation:
    // - Ikeja Electricity Token Purchase (Prepaid): AMA
    // - Ikeja Electricity Bills (Postpaid): AMB
    // - Eko Electricity Prepaid: ANA
    // - Eko Electricity Postpaid: ANB
    // - Abuja Electricity Prepaid: AHB
    // - Abuja Electricity Postpaid: AHA
    // - Kaduna Electricity Prepaid: AGB
    // - Kaduna Electricity Postpaid: AGA
    // - Ibadan Electricity Prepaid: AEA
    // - Ibadan Electricity Postpaid: AEB
    // - Kano Electricity Distribution Prepaid: AFA
    // - Kano Electricity Distribution Postpaid: AFB
    // - Port-Harcourt Prepaid: ADB
    // - Port-Harcourt Postpaid: ADA
    // - Jos Electricity Prepaid: ACB
    // - Jos Electricity Postpaid: ACA
    const canonicalMap: Record<string, { prepaid: string; postpaid: string }> = {
      IKEJA: { prepaid: 'AMA', postpaid: 'AMB' }, // Token Purchase / Bills
      EKO: { prepaid: 'ANA', postpaid: 'ANB' },
      ABUJA: { prepaid: 'AHB', postpaid: 'AHA' },
      KADUNA: { prepaid: 'AGB', postpaid: 'AGA' },
      IBADAN: { prepaid: 'AEA', postpaid: 'AEB' },
      KANO: { prepaid: 'AFA', postpaid: 'AFB' },
      PORTHARCOURT: { prepaid: 'ADB', postpaid: 'ADA' },
      JOS: { prepaid: 'ACB', postpaid: 'ACA' },
      BENIN: { prepaid: 'AAB', postpaid: 'AAA' },
      YOLA: { prepaid: 'ALA', postpaid: 'ALB' },
    };

    const aliasMap: Record<string, string> = {
      IKEDC: 'IKEJA',
      IKEJAELECTRICITY: 'IKEJA',
      IKEJAELECTRICITYBILLS: 'IKEJA',
      IKEJAELECTRICITYTOKENPURCHASE: 'IKEJA',
      EKEDC: 'EKO',
      EKOELECTRICITY: 'EKO',
      EKOELECTRICITYPREPAID: 'EKO',
      EKOELECTRICITYPOSTPAID: 'EKO',
      AEDC: 'ABUJA',
      ABUJAELECTRICITY: 'ABUJA',
      ABUJAELECTRICITYPREPAID: 'ABUJA',
      ABUJAELECTRICITYPOSTPAID: 'ABUJA',
      KAEDCO: 'KADUNA',
      KADUNAELECTRICITY: 'KADUNA',
      KADUNAELECTRICITYPREPAID: 'KADUNA',
      KADUNAELECTRICITYPOSTPAID: 'KADUNA',
      IBEDC: 'IBADAN',
      IBADANELECTRICITY: 'IBADAN',
      IBADANELECTRICITYPREPAID: 'IBADAN',
      IBADANELECTRICITYPOSTPAID: 'IBADAN',
      KEDCO: 'KANO',
      KANOELECTRICITY: 'KANO',
      KANOELECTRICITYDISTRIBUTIONPREPAID: 'KANO',
      KANOELECTRICITYDISTRIBUTIONPOSTPAID: 'KANO',
      PHEDC: 'PORTHARCOURT',
      PORTHARCOURTELECTRICITY: 'PORTHARCOURT',
      PORTHARCOURTPREPAID: 'PORTHARCOURT',
      PORTHARCOURTPOSTPAID: 'PORTHARCOURT',
      JED: 'JOS',
      JOSELECTRICITY: 'JOS',
      JOSELECTRICITYPREPAID: 'JOS',
      JOSELECTRICITYPOSTPAID: 'JOS',
      BEDC: 'BENIN',
      BENINELECTRICITY: 'BENIN',
      YEDC: 'YOLA',
      YOLAELECTRICITY: 'YOLA',
    };

    const normalizedProvider = providerCode.replace(/[^A-Z]/g, '');
    const canonicalKey = aliasMap[normalizedProvider] || normalizedProvider;
    const serviceIds = canonicalMap[canonicalKey];
    if (!serviceIds) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid provider',
          details: { provider: providerCode },
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const serviceId = meterKind === 'postpaid' ? serviceIds.postpaid : serviceIds.prepaid;
    const reference = `ELEC-${Date.now()}-${user.id.substring(0, 8)}`;

    console.log('Routing purchase:', {
      vendingProvider,
      providerCode,
      meterKind,
      serviceId,
      amount: purchaseAmount
    });

    // Route to appropriate purchase function based on vending provider
    if (vendingProvider === 'vtpass') {
      console.log('Routing to VTpass purchase function');
      return await purchaseWithVTpass(
        supabase,
        user.id,
        sanitizedMeter,
        providerCode,
        meterKind,
        purchaseAmount,
        sanitizedPhone,
        requestedCustomerName,
        requestedCustomerAddress,
        profile,
        reference,
        corsHeaders
      );
    }

    if (vendingProvider === 'mobilenig') {
      console.log('Routing to MobileNig purchase function');
      return await purchaseWithMobileNig(
        supabase,
        user.id,
        sanitizedMeter,
        providerCode,
        meterKind,
        purchaseAmount,
        sanitizedPhone,
        requestedCustomerName,
        requestedCustomerAddress,
        profile,
        reference,
        serviceId,
        corsHeaders
      );
    }

    // Default to MobileNig/SMEPLUG purchase (for backward compatibility)
    console.log('Routing to MobileNig/SMEPLUG purchase function (default)');
    return await purchaseWithMobileNig(
      supabase,
      user.id,
      sanitizedMeter,
      providerCode,
      meterKind,
      purchaseAmount,
      sanitizedPhone,
      requestedCustomerName,
      requestedCustomerAddress,
      profile,
      reference,
      serviceId,
      corsHeaders
    );
  } catch (error) {
    console.error('Error in purchase-electricity function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        details: {
          message: errorMessage,
          type: error instanceof Error ? error.constructor.name : 'UnknownError'
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Purchase with VTpass
async function purchaseWithVTpass(
  supabase: any,
  userId: string,
  meterNumber: string,
  provider: string,
  meterType: string,
  amount: number,
  phone: string,
  customerName: string,
  customerAddress: string,
  profile: any,
  reference: string,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const VTPASS_API_KEY = Deno.env.get("VTPASS_API_KEY");
  const VTPASS_PUBLIC_KEY = Deno.env.get("VTPASS_PUBLIC_KEY");
  const VTPASS_SECRET_KEY = Deno.env.get("VTPASS_SECRET_KEY");
  const VTPASS_MODE = (Deno.env.get("VTPASS_MODE") || "live").toLowerCase();

  if (!VTPASS_API_KEY || !VTPASS_PUBLIC_KEY || !VTPASS_SECRET_KEY) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "VTpass credentials not configured",
      }),
      { status: 200, headers: corsHeaders }
    );
  }

  // VTpass service ID mapping
  const VTPASS_SERVICE_MAP: Record<string, string> = {
    'IKEJA': 'ikeja-electric',
    'EKO': 'eko-electric',
    'ABUJA': 'abuja-electric',
    'KADUNA': 'kaduna-electric',
    'IBADAN': 'ibadan-electric',
    'KANO': 'kano-electric',
    'PORTHARCOURT': 'portharcourt-electric',
    'JOS': 'jos-electric',
    'BENIN': 'benin-electric',
    'YOLA': 'yola-electric',
  };

  const serviceId = VTPASS_SERVICE_MAP[provider.toUpperCase()];
  if (!serviceId) {
    return new Response(
      JSON.stringify({
        success: false,
        error: `Unsupported electricity provider: ${provider}`,
      }),
      { status: 200, headers: corsHeaders }
    );
  }

  // Use variation_code exactly as per VTpass documentation
  // For prepaid: "prepaid", for postpaid: "postpaid"
  const variationCode = meterType === 'postpaid' ? 'postpaid' : 'prepaid';
  const baseUrl = VTPASS_MODE === "sandbox" ? "https://sandbox.vtpass.com" : "https://vtpass.com";
  
  // Log sandbox test scenarios for reference
  if (VTPASS_MODE === "sandbox") {
    console.log("VTpass sandbox electricity test scenarios:", {
      "Successful Prepaid": "1111111111111",
      "Successful Postpaid": "1010101010101",
      "Pending": "201000000000",
      "Unexpected Response": "500000000000",
      "No Response": "400000000000",
      "Timeout": "300000000000",
      "current_meter": meterNumber,
      "current_type": meterType,
      "variation_code": variationCode
    });
  }

  // Generate VTpass request_id (YYYYMMDDHHmm + random suffix in Africa/Lagos timezone)
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Africa/Lagos" }));
  const requestId = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${Math.random().toString(36).substring(2, 8)}`;

  const headers: HeadersInit = {
    "api-key": VTPASS_API_KEY,
    "public-key": VTPASS_PUBLIC_KEY,
    "secret-key": VTPASS_SECRET_KEY,
    "Content-Type": "application/json",
  };

  // Build payload exactly as per VTpass documentation
  // Fields: request_id (M), serviceID (M), billersCode (M), variation_code (M), amount (M), phone (M)
  // Note: amount is Number type per docs, but VTpass accepts both number and string
  const purchasePayload = {
    request_id: requestId,
    serviceID: serviceId,
    billersCode: meterNumber,
    variation_code: variationCode, // "prepaid" or "postpaid" - exact strings as per docs
    amount: amount, // Number type as per VTpass documentation
    phone: phone,
  };

  console.log("VTpass electricity purchase request:", {
    ...purchasePayload,
    mode: VTPASS_MODE,
    baseUrl: `${baseUrl}/api/pay`,
  });

  try {
    const response = await fetch(`${baseUrl}/api/pay`, {
      method: "POST",
      headers,
      body: JSON.stringify(purchasePayload),
    });

    const responseText = await response.text();
    console.log("VTpass pay response status:", response.status);
    console.log("VTpass pay response:", responseText);

    let responseJson: any = null;
    try {
      responseJson = JSON.parse(responseText);
    } catch (error) {
      console.error("Unable to parse VTpass response:", responseText, error);
      return new Response(
        JSON.stringify({ success: false, error: "Invalid response from VTpass" }),
        { status: 200, headers: corsHeaders }
      );
    }

    // Check transaction status and code
    const transactionStatus = responseJson.content?.transactions?.status || 
                             responseJson.content?.status ||
                             responseJson.transactions?.status;
    const responseCode = responseJson.code;

    console.log("VTpass initial response:", {
      code: responseCode,
      status: transactionStatus,
      response_description: responseJson.response_description
    });

    // If pending or code is not "000", requery to get final status
    const shouldRequery = transactionStatus === 'pending' || 
                         transactionStatus === 'processing' || 
                         (responseCode && responseCode !== '000');
    
    if (shouldRequery) {
      const requeryReason = transactionStatus === 'pending' || transactionStatus === 'processing' 
        ? 'pending/processing' 
        : `non-success code: ${responseCode}`;
      console.log(`Transaction ${requeryReason}, requerying after 3 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds as per best practice

      const requeryPayload = { request_id: requestId };
      console.log("VTpass requery request:", requeryPayload);

      const requeryResponse = await fetch(`${baseUrl}/api/requery`, {
        method: "POST",
        headers,
        body: JSON.stringify(requeryPayload),
      });

      const requeryText = await requeryResponse.text();
      console.log("VTpass requery response status:", requeryResponse.status);
      console.log("VTpass requery response:", requeryText);
      
      try {
        const requeryJson = JSON.parse(requeryText);
        // Merge requery response data into main response
        if (requeryJson.content?.transactions) {
          responseJson.content = responseJson.content || {};
          responseJson.content.transactions = requeryJson.content.transactions;
        }
        // Update all fields from requery (requery has more complete data)
        if (requeryJson.code !== undefined) responseJson.code = requeryJson.code;
        if (requeryJson.response_description) responseJson.response_description = requeryJson.response_description;
        if (requeryJson.purchased_code) responseJson.purchased_code = requeryJson.purchased_code;
        if (requeryJson.Token) responseJson.Token = requeryJson.Token;
        if (requeryJson.PurchasedUnits) responseJson.PurchasedUnits = requeryJson.PurchasedUnits;
        if (requeryJson.units) responseJson.units = requeryJson.units;
        if (requeryJson.exchangeReference) responseJson.exchangeReference = requeryJson.exchangeReference;
        if (requeryJson.customerName) responseJson.customerName = requeryJson.customerName;
        if (requeryJson.customerAddress) responseJson.customerAddress = requeryJson.customerAddress;
        if (requeryJson.tariff) responseJson.tariff = requeryJson.tariff;
        if (requeryJson.tokenAmount) responseJson.tokenAmount = requeryJson.tokenAmount;
        if (requeryJson.Name) responseJson.Name = requeryJson.Name;
        if (requeryJson.Address) responseJson.Address = requeryJson.Address;
        if (requeryJson.MeterNumber) responseJson.MeterNumber = requeryJson.MeterNumber;
        if (requeryJson.meterNumber) responseJson.meterNumber = requeryJson.meterNumber;
        if (requeryJson.token) responseJson.token = requeryJson.token;
        if (requeryJson.resetToken) responseJson.resetToken = requeryJson.resetToken;
        if (requeryJson.configureToken) responseJson.configureToken = requeryJson.configureToken;
        if (requeryJson.fixChargeAmount !== undefined) responseJson.fixChargeAmount = requeryJson.fixChargeAmount;
        if (requeryJson.taxAmount !== undefined) responseJson.taxAmount = requeryJson.taxAmount;
        if (requeryJson.debtAmount !== undefined) responseJson.debtAmount = requeryJson.debtAmount;
        if (requeryJson.penalty !== undefined) responseJson.penalty = requeryJson.penalty;
        if (requeryJson.ReceiptNumber) responseJson.ReceiptNumber = requeryJson.ReceiptNumber;
        if (requeryJson.Reference) responseJson.Reference = requeryJson.Reference;
        if (requeryJson.requestId) responseJson.requestId = requeryJson.requestId;
        if (requeryJson.utilityName) responseJson.utilityName = requeryJson.utilityName;
        if (requeryJson.balance !== undefined) responseJson.balance = requeryJson.balance;
      } catch (e) {
        console.error("Failed to parse requery response:", e);
      }
    }

    const finalStatus = responseJson.content?.transactions?.status || 
                       responseJson.content?.status ||
                       responseJson.transactions?.status;
    const finalCode = responseJson.code;

    // Check if purchase was successful (code "000" or status "delivered")
    const isSuccess = finalCode === '000' || finalStatus === 'delivered' || finalStatus === 'success';
    
    if (isSuccess) {
      const transactions = responseJson.content?.transactions || responseJson.transactions || {};
      
      // Extract all fields from VTpass response as per documentation
      // Prepaid fields: Token, purchased_code, PurchasedUnits, units, tokenAmount, tariff
      // Postpaid fields: exchangeReference, customerName, customerAddress, Name, Address
      const token = responseJson.purchased_code || 
                   responseJson.Token || 
                   transactions.extras || 
                   null;
      
      // Units can be in multiple formats
      const purchasedUnits = responseJson.PurchasedUnits || responseJson.units || null;
      const exchangeReference = responseJson.exchangeReference || null;
      const tokenAmount = responseJson.tokenAmount || null;
      const tariff = responseJson.tariff || responseJson.TariffRate || null;
      const resetToken = responseJson.resetToken || null;
      const configureToken = responseJson.configureToken || null;
      const fixChargeAmount = responseJson.fixChargeAmount || 0;
      const taxAmount = responseJson.taxAmount || 0;
      const debtAmount = responseJson.debtAmount || 0;
      const penalty = responseJson.penalty || 0;
      
      // Customer details - check multiple possible fields
      const responseCustomerName = responseJson.Name || 
                                   responseJson.customerName || 
                                   customerName || 
                                   null;
      const responseCustomerAddress = responseJson.Address || 
                                     responseJson.customerAddress || 
                                     customerAddress || 
                                     null;
      const meterNumberFromResponse = responseJson.MeterNumber || 
                                      transactions.unique_element || 
                                      meterNumber;
      
      // Additional fields from requery response
      const receiptNumber = responseJson.ReceiptNumber || null;
      const vtpassReference = responseJson.Reference || responseJson.requestId || null;
      const transactionId = transactions.transactionId || responseJson.requestId || null;
      
      console.log("VTpass purchase successful:", {
        code: finalCode,
        status: finalStatus,
        token: token?.substring(0, 50),
        purchasedUnits,
        exchangeReference,
        tokenAmount,
        tariff,
        customerName: responseCustomerName,
        meterNumber: meterNumberFromResponse,
        transactionId,
        requestId: responseJson.requestId
      });

      // Debit user wallet
      const debitResult = await debitUserWallet({
        supabase,
        userId: userId,
        amount: amount,
        transactionType: 'electricity',
        description: `Electricity purchase - ${provider} (${meterType}) - ${meterNumber}`,
        reference,
        performedBy: userId,
        balanceBefore: Number(profile.balance) || 0,
        notification: {
          title: 'Electricity purchase successful',
          message: `₦${amount.toFixed(2)} electricity token purchased for meter ${meterNumber} (${meterType.toUpperCase()}) on ${provider}. Reference: ${reference}.`,
        },
      });

      // Record transaction with all available data from VTpass response
      // Store additional fields (units, exchange_reference, customer_address) in api_response
      const transactionData = {
        user_id: userId,
        amount: amount,
        balance_before: debitResult.balanceBefore,
        balance_after: debitResult.balanceAfter,
        meter_number: meterNumberFromResponse || meterNumber,
        provider: provider,
        meter_type: meterType,
        customer_name: responseCustomerName || responseJson.content?.Customer_Name || '',
        token: token,
        status: 'completed',
        reference: reference,
        // Store complete VTpass response data in api_response
        api_response: {
          ...responseJson,
          // Add extracted fields for easy access
          purchased_units: purchasedUnits,
          exchange_reference: exchangeReference,
          token_amount: tokenAmount,
          tariff: tariff,
          reset_token: resetToken,
          configure_token: configureToken,
          fix_charge_amount: fixChargeAmount,
          tax_amount: taxAmount,
          debt_amount: debtAmount,
          penalty: penalty,
          receipt_number: receiptNumber,
          reference: vtpassReference,
          transaction_id: transactionId,
          customer_address: responseCustomerAddress,
          meter_number_from_response: meterNumberFromResponse,
        },
      };
      
      const { error: elecTxnError } = await supabase
        .from('electricity_transactions')
        .insert(transactionData);

      if (elecTxnError) {
        console.error('Failed to record electricity transaction:', elecTxnError);
        // Return error if transaction record fails after successful wallet debit
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Transaction completed but failed to record transaction',
            details: elecTxnError.message,
          }),
          { status: 200, headers: corsHeaders }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            reference: reference, // Internal reference
            amount: amount,
            balance_after: debitResult.balanceAfter,
            token: token,
            units: purchasedUnits,
            exchange_reference: exchangeReference,
            token_amount: tokenAmount,
            tariff: tariff,
            meter_number: meterNumberFromResponse || meterNumber,
            provider: provider,
            meter_type: meterType,
            customer_name: responseCustomerName || '',
            customer_address: responseCustomerAddress || '',
            transaction_id: transactionId || responseJson.requestId || null,
            request_id: responseJson.requestId || requestId,
            vtpass_transaction_id: transactions.transactionId || null,
            vtpass_reference: vtpassReference,
            // Include additional fields
            reset_token: resetToken,
            configure_token: configureToken,
            fix_charge_amount: fixChargeAmount,
            tax_amount: taxAmount,
            debt_amount: debtAmount,
            penalty: penalty,
            receipt_number: receiptNumber,
          },
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    // Purchase failed - extract detailed error message
    const transactions = responseJson.content?.transactions || responseJson.transactions || {};
    const errorMessage = responseJson.response_description || 
                        responseJson.message || 
                        transactions.response_message ||
                        (responseJson.code && responseJson.code !== '000' ? `VTpass error code: ${responseJson.code}` : null) ||
                        "Electricity purchase failed";

    console.error("VTpass purchase failed:", {
      code: responseJson.code,
      status: finalStatus,
      response_description: responseJson.response_description,
      errorMessage,
      fullResponse: responseJson
    });

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        details: {
          code: responseJson.code,
          status: finalStatus,
          response_description: responseJson.response_description,
          full_response: responseJson
        },
      }),
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error("Error in VTpass electricity purchase:", error);
    const message = error instanceof Error ? error.message : "Unknown error occurred";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 200, headers: corsHeaders }
    );
  }
}

// Purchase with MobileNig
async function purchaseWithMobileNig(
  supabase: any,
  userId: string,
  meterNumber: string,
  provider: string,
  meterType: string,
  amount: number,
  phone: string,
  customerName: string,
  customerAddress: string,
  profile: any,
  reference: string,
  serviceId: string,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const mobilenigPublicKey = Deno.env.get('MOBILENIG_PUBLIC_KEY');
  const mobilenigSecretKey = Deno.env.get('MOBILENIG_SECRET_KEY');

  if (!mobilenigPublicKey || !mobilenigSecretKey) {
    console.error('MobileNig credentials not configured');
    return new Response(
      JSON.stringify({ error: 'Service configuration error' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const transId = Date.now().toString();

  try {
    const mobilenigTestMode =
      (Deno.env.get('MOBILENIG_TEST_MODE') || Deno.env.get('MOBILENIG_TESTING') || '').toLowerCase() === 'true';
    const mobilenigTestPhone = Deno.env.get('MOBILENIG_TEST_PHONE');

    // MobileNig electricity purchase payload as per API documentation
    // POST /api/v2/services/
    // Required fields: service_id, trans_id, customerReference, amount, customerName, customerAddress
    // Authorization: Bearer {{secret_key}}
    const purchasePayload: Record<string, unknown> = {
      service_id: serviceId,
      trans_id: Number(transId),
      customerReference: meterNumber,
      amount: amount,
      customerName: customerName || meterNumber,
      customerAddress: customerAddress || 'Not Provided',
    };
    
    console.log('MobileNig electricity purchase payload:', {
      service_id: purchasePayload.service_id,
      trans_id: purchasePayload.trans_id,
      customerReference: purchasePayload.customerReference,
      amount: purchasePayload.amount,
      customerName: purchasePayload.customerName,
      customerAddress: purchasePayload.customerAddress,
    });

    const purchaseResponse = await fetch('https://enterprise.mobilenig.com/api/v2/services/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mobilenigSecretKey}`,
      },
      body: JSON.stringify(purchasePayload),
    });

    const purchaseText = await purchaseResponse.text();
    let purchaseData;
    try {
      purchaseData = JSON.parse(purchaseText);
    } catch (parseError) {
      console.error('Failed to parse MobileNig response:', purchaseText);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Invalid response from electricity provider: ${purchaseText.substring(0, 120)}`,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    console.log('MobileNig purchase response:', JSON.stringify(purchaseData, null, 2));

    // Check for success: statusCode should be "200" and status should be "Approved"
    // Per MobileNig API documentation:
    // { message: "success", statusCode: "200", details: { status: "Approved", details: { token, reference, receiptNumber } } }
    const statusCode = purchaseData.statusCode;
    const transactionStatus = purchaseData.details?.status;
    const isSuccess = statusCode === '200' && (transactionStatus === 'Approved' || transactionStatus === 'Success');
    
    if (!purchaseResponse.ok || !isSuccess) {
      const providerError =
        purchaseData.details?.details?.message ||
        purchaseData.details?.message ||
        purchaseData.message ||
        purchaseData.error ||
        'Purchase failed';
      return new Response(
        JSON.stringify({
          success: false,
          error: providerError,
          details: purchaseData,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract response data as per MobileNig API documentation
    // Response structure: 
    // {
    //   "message": "success",
    //   "statusCode": "200",
    //   "details": {
    //     "trans_id": 3647824372323,
    //     "service": "AbujaPrepaid",
    //     "status": "Approved",
    //     "details": {
    //       "amount": 900,
    //       "customerReference": "42328955339",
    //       "token": 9630107556,
    //       "reference": "T2032434490141eef176efef59b2bc00",
    //       "receiptNumber": "7011502065525210692"
    //     },
    //     "wallet_balance": "328012"
    //   }
    // }
    const transactionDetails = purchaseData.details?.details || {};
    const token = transactionDetails.token || null;
    const mobileNigReference = transactionDetails.reference || null;
    const receiptNumber = transactionDetails.receiptNumber || null;
    const customerReference = transactionDetails.customerReference || meterNumber;
    const transactionId = purchaseData.details?.trans_id || transId;
    const serviceName = purchaseData.details?.service || null;
    const walletBalance = purchaseData.details?.wallet_balance || null;
    
    const providerCustomerAddress =
      purchaseData.details?.details?.customerAddress ||
      purchaseData.details?.customerAddress ||
      customerAddress ||
      '';
    
    const providerCustomerName =
      purchaseData.details?.customerName ||
      purchaseData.details?.details?.customerName ||
      customerName ||
      '';

    const formattedAmount = `₦${amount.toFixed(2)}`;
    const meterLabel = meterType ? meterType.toUpperCase() : 'METER';

    const debitResult = await debitUserWallet({
      supabase,
      userId: userId,
      amount: amount,
      transactionType: 'electricity',
      description: `Electricity purchase - ${provider} (${meterType}) - ${meterNumber}`,
      reference,
      performedBy: userId,
      balanceBefore: Number(profile.balance) || 0,
      notification: {
        title: 'Electricity purchase successful',
        message: `${formattedAmount} electricity token purchased for meter ${meterNumber} (${meterLabel}) on ${provider}. Reference: ${reference}.`,
      },
    });

    // Record transaction in electricity_transactions
    const { error: elecTxnError } = await supabase
      .from('electricity_transactions')
      .insert({
        user_id: userId,
        amount: amount,
        balance_before: debitResult.balanceBefore,
        balance_after: debitResult.balanceAfter,
        meter_number: meterNumber,
        provider: provider,
        meter_type: meterType,
        customer_name: providerCustomerName,
        token: token,
        status: 'completed',
        reference: reference,
        api_response: {
          ...purchaseData,
          // Extract key fields for easy access
          mobile_nig_reference: mobileNigReference,
          receipt_number: receiptNumber,
          trans_id: transactionId,
          service_name: serviceName,
          wallet_balance: walletBalance,
        },
      });

    if (elecTxnError) {
      console.error('Failed to record electricity transaction:', elecTxnError);
      // Return error if transaction record fails after successful wallet debit
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Transaction completed but failed to record transaction',
          details: elecTxnError.message,
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          reference: reference, // Internal reference
          amount: amount,
          balance_after: debitResult.balanceAfter,
          trans_id: transactionId,
          token: token,
          meter_number: meterNumber,
          provider: provider,
          meter_type: meterType,
          customer_name: providerCustomerName,
          customer_address: providerCustomerAddress,
          // Additional MobileNig response fields
          mobile_nig_reference: mobileNigReference,
          receipt_number: receiptNumber,
          customer_reference: customerReference,
          service_name: serviceName,
          wallet_balance: walletBalance,
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in MobileNig electricity purchase:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Purchase failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}
