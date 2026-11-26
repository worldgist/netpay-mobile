import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const MOBILENIG_SECRET_KEY = Deno.env.get("MOBILENIG_SECRET_KEY");

    if (!MOBILENIG_SECRET_KEY) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: "MOBILENIG_SECRET_KEY not configured" 
        }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // Get authentication token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization header" }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    
    // Create service role client for admin operations (bypasses RLS)
    const supabaseService = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Create user client for auth check - use anon key with user token
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUser = createClient(SUPABASE_URL, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    const { data: userData, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const user = userData.user;

    // Check if user is admin using service role client
    const { data: roleData, error: roleError } = await supabaseService
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .limit(1);

    if (roleError || !roleData || roleData.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Admin access required" }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // Parse request body for optional limit
    let body: any = {};
    try {
      if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
        const bodyText = await req.text();
        if (bodyText && bodyText.trim()) {
          body = JSON.parse(bodyText);
        }
      } else {
        // For GET requests, parse query parameters
        const url = new URL(req.url);
        body = {
          limit: url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit') || '100', 10) : undefined,
        };
      }
    } catch (parseError) {
      console.warn('Failed to parse request body, using defaults:', parseError);
      body = {};
    }
    const limit = body.limit || 100; // Process up to 100 transactions at a time

    console.log("Processing pending electricity transactions, limit:", limit);
    console.log("Using service role client for database queries");

    // Fetch all pending electricity transactions using service role client (bypasses RLS)
    try {
      const { data: pendingTransactions, error: fetchError } = await supabaseService
        .from("electricity_transactions")
        .select("id, reference, status, api_response, token, created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(limit);

      if (fetchError) {
        console.error("Error fetching pending transactions:", fetchError);
        console.error("Fetch error details:", {
          message: fetchError.message,
          code: fetchError.code,
          details: fetchError.details,
          hint: fetchError.hint,
        });
        return new Response(
          JSON.stringify({ 
            success: false,
            error: "Failed to fetch pending transactions", 
            details: fetchError.message,
            code: fetchError.code,
            hint: fetchError.hint,
          }),
          { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      if (!pendingTransactions || pendingTransactions.length === 0) {
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: "No pending electricity transactions found",
            processed: 0,
            updated: 0,
            failed: 0
          }),
          { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      console.log(`Found ${pendingTransactions.length} pending electricity transactions`);

      const results = {
        processed: 0,
        updated: 0,
        failed: 0,
        errors: [] as string[],
      };

      // Process each pending transaction
      for (const transaction of pendingTransactions) {
        try {
          results.processed++;

          // Extract trans_id from api_response
          const apiResponse = transaction.api_response || {};
          const transId = apiResponse.trans_id || apiResponse.details?.trans_id || apiResponse.data?.trans_id;

          if (!transId) {
            console.warn(`Transaction ${transaction.id} has no trans_id, skipping`);
            results.failed++;
            results.errors.push(`Transaction ${transaction.id}: No trans_id found`);
            continue;
          }

          console.log(`Querying transaction ${transaction.id} with trans_id: ${transId}`);

          // Query MobileNig for transaction status
          const queryUrl = `https://enterprise.mobilenig.com/api/v2/services/query?trans_id=${encodeURIComponent(String(transId))}`;
          const queryResponse = await fetch(queryUrl, {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${MOBILENIG_SECRET_KEY}`,
            },
          });

          const responseText = await queryResponse.text();
          let providerResponse;
          try {
            providerResponse = JSON.parse(responseText);
          } catch (parseError) {
            console.error(`Failed to parse response for transaction ${transaction.id}:`, responseText);
            results.failed++;
            results.errors.push(`Transaction ${transaction.id}: Invalid response from provider`);
            continue;
          }

          console.log(`Query response for transaction ${transaction.id}:`, JSON.stringify(providerResponse, null, 2));

          // Check if transaction is now completed
          const statusCode = providerResponse.statusCode;
          const statusCodeStr = String(statusCode);
          const statusCodeNum = typeof statusCode === 'number' ? statusCode : parseInt(statusCodeStr, 10);
          const transactionStatus = providerResponse.details?.status || '';
          const normalizedStatus = transactionStatus.toLowerCase().trim();

          // Transaction is completed if:
          // 1. statusCode is 200 and status is "Approved" or "Success"
          // 2. statusCode is 200 (regardless of status field, as 200 means success)
          const isStatusCode200 = (statusCodeStr === '200' || statusCodeNum === 200);
          const isCompleted = isStatusCode200 && 
                             (normalizedStatus === 'approved' || 
                              normalizedStatus === 'success' || 
                              normalizedStatus === 'delivered' || 
                              queryResponse.ok ||
                              providerResponse.message === 'success');

          if (isCompleted) {
            // First check if token already exists in the transaction (from initial purchase response)
            const existingToken = transaction.token || apiResponse.details?.details?.token || apiResponse.token;
            
            // Extract token and other details from query response
            // MobileNig query response structure can vary, check multiple paths:
            // 1. providerResponse.details.details.token (most common)
            // 2. providerResponse.details.token (alternative)
            // 3. providerResponse.token (fallback)
            const transactionDetails = providerResponse.details?.details || {};
            const queryToken = 
              (transactionDetails.token != null ? String(transactionDetails.token) : null) ||
              (providerResponse.details?.token != null ? String(providerResponse.details.token) : null) ||
              (providerResponse.token != null ? String(providerResponse.token) : null);
            
            // Use query token if available, otherwise use existing token
            const token = queryToken || (existingToken != null ? String(existingToken) : null);
            
            console.log(`Token extraction for transaction ${transaction.id}:`, {
              token,
              existingToken,
              queryToken,
              transactionDetailsToken: transactionDetails.token,
              detailsToken: providerResponse.details?.token,
              rootToken: providerResponse.token,
              apiResponseToken: apiResponse.details?.details?.token,
              fullResponse: JSON.stringify(providerResponse, null, 2)
            });
            
            const mobileNigReference = transactionDetails.reference || providerResponse.details?.reference || null;
            const receiptNumber = transactionDetails.receiptNumber || providerResponse.details?.receiptNumber || null;
            const customerReference = transactionDetails.customerReference || providerResponse.details?.customerReference || null;
            const customerName = 
              providerResponse.details?.customerName || 
              transactionDetails.customerName || 
              providerResponse.details?.details?.customerName ||
              null;
            const customerAddress = 
              providerResponse.details?.customerAddress || 
              transactionDetails.customerAddress || 
              providerResponse.details?.details?.customerAddress ||
              null;

            // Update transaction status to completed
            const updateData: any = {
              status: 'completed',
              api_response: {
                ...apiResponse,
                query_response: providerResponse,
                queried_at: new Date().toISOString(),
              },
            };

            // Update token if available
            if (token) {
              updateData.token = token;
            }

            // Update customer details if available
            if (customerName) {
              updateData.customer_name = customerName;
            }
            if (customerAddress) {
              updateData.customer_address = customerAddress;
            }

            const { error: updateError } = await supabaseService
              .from("electricity_transactions")
              .update(updateData)
              .eq("id", transaction.id);

            if (updateError) {
              console.error(`Failed to update transaction ${transaction.id}:`, updateError);
              results.failed++;
              results.errors.push(`Transaction ${transaction.id}: Update failed - ${updateError.message}`);
            } else {
              console.log(`Successfully updated transaction ${transaction.id} to completed`);
              results.updated++;
            }
          } else {
            // Still pending or failed
            const isStillPending = (statusCodeStr === '202' || statusCodeNum === 202) || 
                                   normalizedStatus === 'processing';
            
            if (isStillPending) {
              console.log(`Transaction ${transaction.id} is still processing`);
              // Optionally update the api_response with latest query result
              await supabaseService
                .from("electricity_transactions")
                .update({
                  api_response: {
                    ...apiResponse,
                    query_response: providerResponse,
                    queried_at: new Date().toISOString(),
                  },
                })
                .eq("id", transaction.id);
            } else {
              // Transaction failed or cancelled
              console.log(`Transaction ${transaction.id} appears to have failed or been cancelled`);
              const { error: updateError } = await supabaseService
                .from("electricity_transactions")
                .update({
                  status: 'failed',
                  api_response: {
                    ...apiResponse,
                    query_response: providerResponse,
                    queried_at: new Date().toISOString(),
                  },
                })
                .eq("id", transaction.id);

              if (updateError) {
                console.error(`Failed to update failed transaction ${transaction.id}:`, updateError);
              }
            }
          }
        } catch (error) {
          console.error(`Error processing transaction ${transaction.id}:`, error);
          results.failed++;
          results.errors.push(`Transaction ${transaction.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: `Processed ${results.processed} pending electricity transactions`,
          processed: results.processed,
          updated: results.updated,
          failed: results.failed,
          errors: results.errors.length > 0 ? results.errors : undefined,
        }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    } catch (dbError) {
      console.error("Database query error:", dbError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Database query failed",
          details: dbError instanceof Error ? dbError.message : "Unknown database error",
        }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }
  } catch (error) {
    console.error("Error in process-pending-electricity function:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : undefined;
    const errorDetails = error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack,
    } : String(error);
    
    console.error("Error details:", JSON.stringify(errorDetails, null, 2));
    
    // Return 200 with error in response body instead of 500
    // This allows the frontend to handle the error gracefully
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        details: errorDetails,
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});

