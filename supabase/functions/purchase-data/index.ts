import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { debitUserWallet } from "../_shared/wallet.ts";
import { purchaseViaVendor, type VendorConfig, type DataPlan, type PurchaseResult } from "../_shared/vendor-calls.ts";

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: 'Method not allowed' }),
      { status: 405, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    let bodyText = '';
    try {
      bodyText = await req.text();
    } catch (e) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid request body' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    let requestBody: any = {};
    if (bodyText && bodyText.trim().length > 0) {
      try {
        requestBody = JSON.parse(bodyText);
      } catch (e) {
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid JSON in request body' }),
          { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
    }

    const { phone_number, plan_id } = requestBody;

    if (!phone_number || !plan_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'phone_number and plan_id are required' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch data plan
    const { data: dataPlan, error: planError } = await supabase
      .from('data_plans')
      .select('*')
      .eq('id', plan_id)
      .single();

    if (planError || !dataPlan) {
      return new Response(
        JSON.stringify({ success: false, error: 'Data plan not found' }),
        { status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch user profile and check balance
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('balance')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch user profile' }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const balanceBefore = Number(profile.balance) || 0;
    const userPrice = Number(dataPlan.user_price || dataPlan.price || 0);

    if (balanceBefore < userPrice) {
      return new Response(
        JSON.stringify({ success: false, error: 'Insufficient balance' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Get vendor priority order for this network and plan_type
    const network = dataPlan.network;
    const planType = dataPlan.plan_type || 'SME';

    const { data: vendorPriority, error: priorityError } = await supabase
      .from('vendor_priority')
      .select('vendor_order')
      .eq('network', network)
      .eq('plan_type', planType)
      .single();

    let vendorOrder: string[] = ['vtpass', 'smeplug', 'mobilenig']; // Default fallback
    if (vendorPriority?.vendor_order && Array.isArray(vendorPriority.vendor_order)) {
      vendorOrder = vendorPriority.vendor_order;
    }

    // Fetch active vendors
    const { data: vendors, error: vendorsError } = await supabase
      .from('vendors')
      .select('*')
      .eq('status', 'active');

    if (vendorsError || !vendors || vendors.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No active vendors available' }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Create vendor config map
    const vendorMap = new Map<string, VendorConfig>();
    vendors.forEach((v: any) => {
      vendorMap.set(v.name.toLowerCase(), {
        id: v.id,
        name: v.name,
        base_url: v.base_url,
        api_key: v.api_key,
        secret: v.secret,
        status: v.status,
      });
    });

    // Try vendors in priority order
    let purchaseResult: PurchaseResult | null = null;
    let successfulVendor: string | null = null;
    let lastError: string | null = null;
    const reference = `DATA-${Date.now()}-${user.id.slice(0, 8)}`;
    const vendorErrors: Array<{ vendor: string; reason: string; error?: string }> = [];

    for (const vendorName of vendorOrder) {
      const vendor = vendorMap.get(vendorName.toLowerCase());
      if (!vendor || vendor.status !== 'active') {
        const reason = !vendor ? 'not found in database' : `status is ${vendor.status}`;
        vendorErrors.push({ vendor: vendorName, reason });
        console.warn(`Vendor ${vendorName} not available: ${reason}`);
        continue;
      }

      // Check if plan has code for this vendor
      const vendorCode = vendorName === 'vtpass' ? dataPlan.vtpass_code :
                        vendorName === 'smeplug' ? dataPlan.smeplug_code :
                        vendorName === 'mobilenig' ? dataPlan.mobilenig_code : null;

      if (!vendorCode) {
        vendorErrors.push({ 
          vendor: vendorName, 
          reason: `data plan missing ${vendorName}_code` 
        });
        console.warn(`Plan ${plan_id} does not have a code for vendor ${vendorName}`);
        continue;
      }

      // Check vendor credentials (credentials can be in env vars or vendor config)
      // The purchaseViaVendor function will handle credential checking, so we just log a warning
      const hasConfigCredentials = vendorName === 'vtpass' 
        ? (vendor.api_key && vendor.secret)
        : vendorName === 'smeplug'
        ? vendor.secret
        : vendorName === 'mobilenig'
        ? (vendor.api_key && vendor.secret)
        : false;

      if (!hasConfigCredentials) {
        const envVar = vendorName === 'vtpass' 
          ? 'VTPASS_API_KEY, VTPASS_PUBLIC_KEY'
          : vendorName === 'smeplug'
          ? 'SMEPLUG_SECRET_KEY'
          : 'MOBILENIG_API_KEY, MOBILENIG_USERNAME';
        
        console.warn(`Vendor ${vendorName} credentials not in config - will check environment variables: ${envVar}`);
        // Don't skip - let purchaseViaVendor handle credential validation
      }

      console.log(`Attempting purchase via ${vendorName} with code ${vendorCode}...`);
      purchaseResult = await purchaseViaVendor(vendorName, vendor, dataPlan as DataPlan, phone_number, reference);

      if (purchaseResult.success) {
        successfulVendor = vendorName;
        console.log(`Purchase successful via ${vendorName}`);
        break;
      }

      const errorMsg = purchaseResult.error || 'Unknown error';
      lastError = errorMsg;
      vendorErrors.push({ 
        vendor: vendorName, 
        reason: 'API call failed',
        error: errorMsg
      });
      console.warn(`Purchase failed via ${vendorName}: ${errorMsg}`);
      console.warn(`Vendor response:`, JSON.stringify(purchaseResult.vendor_response || {}, null, 2));
      
      // If status is 'pending', still consider it a success and proceed
      // (This allows pending transactions to be recorded)
      if (purchaseResult.status === 'pending') {
        successfulVendor = vendorName;
        break;
      }
    }

    // If all vendors failed, return detailed error
    if (!purchaseResult || !purchaseResult.success || !successfulVendor) {
      const errorSummary = vendorErrors.length > 0
        ? vendorErrors.map(e => `- ${e.vendor}: ${e.reason}${e.error ? ` (${e.error})` : ''}`).join('\n')
        : 'No vendors were attempted';
      
      console.error('All vendors failed:', JSON.stringify(vendorErrors, null, 2));
      
      // Create a more descriptive error message
      let errorMessage = 'All vendors failed. ';
      if (vendorErrors.length === 0) {
        errorMessage += 'No vendors were attempted (check vendor configuration)';
      } else if (lastError) {
        errorMessage += lastError;
      } else {
        // All vendors were skipped (no codes, inactive, etc.)
        const skippedReasons = vendorErrors.map(e => `${e.vendor}: ${e.reason}`).join('; ');
        errorMessage += `All vendors were skipped. Reasons: ${skippedReasons}`;
      }
      
      return new Response(
        JSON.stringify({
          success: false,
          error: errorMessage,
          details: {
            vendors_tried: vendorOrder,
            vendor_errors: vendorErrors,
            last_error: lastError || 'No vendors attempted',
            error_summary: errorSummary,
            plan_id,
            network: dataPlan.network,
            plan_type: planType,
            message: errorMessage, // Add message for easier access
          },
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Debit user wallet
    const debitResult = await debitUserWallet({
      supabase,
      userId: user.id,
      amount: userPrice,
      transactionType: 'data_purchase',
      description: `Data purchase - ${dataPlan.plan_name} for ${phone_number} via ${successfulVendor}`,
      reference: purchaseResult.reference || reference,
      performedBy: user.id,
      balanceBefore,
      notification: {
        title: purchaseResult.status === 'success' ? 'Data purchase successful' : 'Data purchase processing',
        message: `₦${userPrice.toFixed(2)} data bundle (${dataPlan.plan_name}) ${purchaseResult.status === 'success' ? 'purchased' : 'being processed'} for ${phone_number}. Reference: ${purchaseResult.reference || reference}.`,
      },
    });

    // Record transaction
    const transactionData: any = {
      user_id: user.id,
      phone_number: phone_number.replace(/[^\d]/g, ''),
      network: dataPlan.network,
      plan_name: dataPlan.plan_name,
      plan_validity: dataPlan.validity || 'N/A',
      amount: userPrice,
      balance_before: debitResult.balanceBefore,
      balance_after: debitResult.balanceAfter,
      status: purchaseResult.status === 'success' ? 'success' : 'pending',
      reference: purchaseResult.reference || reference,
      api_response: purchaseResult.vendor_response || {},
      performed_by: user.id,
      provider: successfulVendor,
    };

    // Try to add optional columns if they exist
    const vendorPrice = Number(dataPlan.vendor_price || 0);
    if (vendorPrice > 0) {
      transactionData.api_cost = vendorPrice;
      transactionData.admin_revenue = userPrice - vendorPrice;
    }

    // Try insert with all columns, fallback if columns don't exist
    let insertResult = await supabase
      .from('data_transactions')
      .insert(transactionData)
      .select()
      .single();

    if (insertResult.error && (
      insertResult.error.code === '42703' ||
      insertResult.error.message?.toLowerCase().includes('column') ||
      insertResult.error.message?.toLowerCase().includes('does not exist')
    )) {
      // Remove optional columns and retry
      const { api_cost, admin_revenue, ...basicData } = transactionData;
      insertResult = await supabase
        .from('data_transactions')
        .insert(basicData)
        .select()
        .single();
    }

    if (insertResult.error || !insertResult.data) {
      console.error('CRITICAL: Failed to record transaction:', insertResult.error);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Transaction completed but failed to record. Please contact support with reference: ' + reference,
          reference,
        }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: purchaseResult.status === 'success' 
          ? 'Data purchased successfully' 
          : 'Data purchase is being processed. You will be notified when completed.',
        data: {
          reference: purchaseResult.reference || reference,
          plan_name: dataPlan.plan_name,
          amount: userPrice,
          phone_number,
          network: dataPlan.network,
          validity: dataPlan.validity,
          balance_before: debitResult.balanceBefore,
          balance_after: debitResult.balanceAfter,
          status: purchaseResult.status,
          vendor: successfulVendor,
        },
      }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in purchase-data function:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});

