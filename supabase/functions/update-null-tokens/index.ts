import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
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

    console.log("Updating completed electricity transactions with null tokens, limit:", limit);

    // Fetch all completed electricity transactions with null tokens using service role client (bypasses RLS)
    try {
      // Fetch completed transactions with null or empty tokens
      // We'll filter in memory to catch both null and empty string cases
      const { data: allCompletedTransactions, error: fetchError } = await supabaseService
        .from("electricity_transactions")
        .select("id, reference, status, api_response, token, created_at")
        .eq("status", "completed")
        .order("created_at", { ascending: true })
        .limit(limit * 2); // Fetch more to account for filtering

      if (fetchError) {
        console.error("Error fetching completed transactions:", fetchError);
        console.error("Fetch error details:", {
          message: fetchError.message,
          code: fetchError.code,
          details: fetchError.details,
          hint: fetchError.hint,
        });
        return new Response(
          JSON.stringify({ 
            success: false,
            error: "Failed to fetch transactions", 
            details: fetchError.message,
            code: fetchError.code,
            hint: fetchError.hint,
          }),
          { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      // Filter for transactions with null or empty tokens
      const completedTransactions = (allCompletedTransactions || []).filter(tx => 
        !tx.token || tx.token === null || tx.token === '' || tx.token === 'null'
      ).slice(0, limit);

      if (fetchError) {
        console.error("Error fetching completed transactions with null tokens:", fetchError);
        console.error("Fetch error details:", {
          message: fetchError.message,
          code: fetchError.code,
          details: fetchError.details,
          hint: fetchError.hint,
        });
        return new Response(
          JSON.stringify({ 
            success: false,
            error: "Failed to fetch transactions", 
            details: fetchError.message,
            code: fetchError.code,
            hint: fetchError.hint,
          }),
          { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      if (!completedTransactions || completedTransactions.length === 0) {
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: "No completed electricity transactions with null tokens found",
            processed: 0,
            updated: 0,
            failed: 0
          }),
          { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      console.log(`Found ${completedTransactions.length} completed electricity transactions with null tokens`);

      const results = {
        processed: 0,
        updated: 0,
        failed: 0,
        errors: [] as string[],
      };

      // Process each transaction
      for (const transaction of completedTransactions) {
        try {
          results.processed++;

          // Extract trans_id from api_response
          // Check multiple possible locations where trans_id might be stored
          const apiResponse = transaction.api_response || {};
          const transId = 
            apiResponse.trans_id || 
            apiResponse.details?.trans_id || 
            apiResponse.data?.trans_id ||
            (apiResponse.details && typeof apiResponse.details === 'object' && apiResponse.details.trans_id) ||
            null;

          console.log(`Extracting trans_id for transaction ${transaction.id}:`, {
            trans_id: transId,
            apiResponseKeys: Object.keys(apiResponse),
            hasDetails: !!apiResponse.details,
            detailsKeys: apiResponse.details ? Object.keys(apiResponse.details) : [],
            fullApiResponse: JSON.stringify(apiResponse, null, 2)
          });

          if (!transId) {
            console.warn(`Transaction ${transaction.id} has no trans_id, skipping`);
            console.warn(`Available api_response structure:`, JSON.stringify(apiResponse, null, 2));
            results.failed++;
            results.errors.push(`Transaction ${transaction.id}: No trans_id found in api_response`);
            continue;
          }

          // First, check if token is already in the original purchase response
          // This is more efficient than querying if the token was already returned
          const originalToken = 
            apiResponse.details?.details?.token ||
            apiResponse.token ||
            (apiResponse.details && typeof apiResponse.details === 'object' && apiResponse.details.token) ||
            null;

          if (originalToken) {
            const tokenValue = String(originalToken);
            console.log(`Found token in original purchase response for transaction ${transaction.id}: ${tokenValue}`);
            console.log(`Token details:`, {
              originalToken,
              tokenValue,
              tokenType: typeof originalToken,
              tokenLength: tokenValue.length
            });
            
            // Update directly with the original token
            const { data: updateDataResult, error: updateError } = await supabaseService
              .from("electricity_transactions")
              .update({ token: tokenValue })
              .eq("id", transaction.id)
              .select("id, token");

            if (updateError) {
              console.error(`Failed to update transaction ${transaction.id} with original token:`, updateError);
              console.error(`Update error details:`, {
                message: updateError.message,
                code: updateError.code,
                details: updateError.details,
                hint: updateError.hint
              });
              results.failed++;
              results.errors.push(`Transaction ${transaction.id}: Update failed - ${updateError.message}`);
            } else if (updateDataResult && updateDataResult.length > 0) {
              const updatedRecord = updateDataResult[0];
              console.log(`Update result for transaction ${transaction.id}:`, {
                updatedToken: updatedRecord.token,
                expectedToken: tokenValue,
                match: updatedRecord.token === tokenValue || updatedRecord.token === String(tokenValue)
              });
              
              if (updatedRecord.token === tokenValue || updatedRecord.token === String(tokenValue)) {
                console.log(`✓ Successfully updated transaction ${transaction.id} with original token: ${tokenValue}`);
                results.updated++;
                continue; // Skip querying since we already have the token
              } else {
                console.error(`Update verification failed for transaction ${transaction.id}. Expected: ${tokenValue}, Got: ${updatedRecord.token}`);
                results.failed++;
                results.errors.push(`Transaction ${transaction.id}: Update verification failed (expected: ${tokenValue}, got: ${updatedRecord.token})`);
              }
            } else {
              console.error(`Update returned no data for transaction ${transaction.id}`);
              results.failed++;
              results.errors.push(`Transaction ${transaction.id}: Update returned no data`);
            }
          }

          console.log(`Querying transaction ${transaction.id} with trans_id: ${transId}`);

          // Query MobileNig for transaction status (only if token not found in original response)
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
            console.error(`Query URL: ${queryUrl}`);
            console.error(`Response status: ${queryResponse.status}`);
            results.failed++;
            results.errors.push(`Transaction ${transaction.id}: Invalid response from provider (${queryResponse.status})`);
            continue;
          }

          // Check if query was successful
          if (!queryResponse.ok) {
            console.error(`Query failed for transaction ${transaction.id}:`, {
              status: queryResponse.status,
              statusText: queryResponse.statusText,
              response: providerResponse
            });
            results.failed++;
            results.errors.push(`Transaction ${transaction.id}: Query failed (${queryResponse.status}) - ${providerResponse.message || providerResponse.error || 'Unknown error'}`);
            continue;
          }

          console.log(`Query response for transaction ${transaction.id}:`, JSON.stringify(providerResponse, null, 2));

          // Check if transaction is completed
          const statusCode = providerResponse.statusCode;
          const statusCodeStr = String(statusCode);
          const statusCodeNum = typeof statusCode === 'number' ? statusCode : parseInt(statusCodeStr, 10);
          const transactionStatus = providerResponse.details?.status || '';
          const normalizedStatus = transactionStatus.toLowerCase().trim();

          // Transaction is completed if statusCode is 200
          const isStatusCode200 = (statusCodeStr === '200' || statusCodeNum === 200);
          const isCompleted = isStatusCode200 && 
                             (normalizedStatus === 'approved' || 
                              normalizedStatus === 'success' || 
                              normalizedStatus === 'delivered' || 
                              queryResponse.ok ||
                              providerResponse.message === 'success');

          if (isCompleted) {
            // First check if token already exists in the transaction (from initial purchase response)
            // Check multiple possible locations in the original api_response
            const existingToken = 
              transaction.token || 
              apiResponse.details?.details?.token || 
              apiResponse.token ||
              (apiResponse.details && typeof apiResponse.details === 'object' && apiResponse.details.token) ||
              null;
            
            // Extract token and other details from query response
            // MobileNig query response structure can vary, check multiple paths:
            // 1. providerResponse.details.details.token (most common - same as purchase response)
            // 2. providerResponse.details.token (alternative)
            // 3. providerResponse.token (fallback)
            const transactionDetails = providerResponse.details?.details || {};
            const queryToken = 
              (transactionDetails.token != null ? String(transactionDetails.token) : null) ||
              (providerResponse.details?.token != null ? String(providerResponse.details.token) : null) ||
              (providerResponse.token != null ? String(providerResponse.token) : null);
            
            // Use query token if available, otherwise use existing token from original purchase
            const token = queryToken || (existingToken != null ? String(existingToken) : null);
            
            console.log(`Token extraction for transaction ${transaction.id}:`, {
              token,
              existingToken,
              queryToken,
              transactionDetailsToken: transactionDetails.token,
              detailsToken: providerResponse.details?.token,
              rootToken: providerResponse.token,
              apiResponseToken: apiResponse.details?.details?.token,
              apiResponseDetailsToken: apiResponse.details?.token,
              apiResponseRootToken: apiResponse.token,
              fullApiResponse: JSON.stringify(apiResponse, null, 2),
              fullProviderResponse: JSON.stringify(providerResponse, null, 2)
            });
            

            if (token) {
              // Update transaction with token
              const updateData: any = {
                token: token,
                api_response: {
                  ...apiResponse,
                  query_response: providerResponse,
                  queried_at: new Date().toISOString(),
                },
              };

              // Also update customer details if available
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

              if (customerName) {
                updateData.customer_name = customerName;
              }
              if (customerAddress) {
                updateData.customer_address = customerAddress;
              }

              console.log(`Updating transaction ${transaction.id} with data:`, {
                token,
                tokenType: typeof token,
                tokenLength: token?.length,
                hasCustomerName: !!customerName,
                hasCustomerAddress: !!customerAddress,
                updateDataKeys: Object.keys(updateData),
                updateData: JSON.stringify(updateData, null, 2)
              });

              // Update the token field
              const { error: updateError } = await supabaseService
                .from("electricity_transactions")
                .update({ token: token })
                .eq("id", transaction.id);

              if (updateError) {
                console.error(`Failed to update transaction ${transaction.id}:`, updateError);
                console.error(`Update error details:`, {
                  message: updateError.message,
                  code: updateError.code,
                  details: updateError.details,
                  hint: updateError.hint
                });
                results.failed++;
                results.errors.push(`Transaction ${transaction.id}: Update failed - ${updateError.message}`);
              } else {
                // Verify the update by querying the record separately
                const { data: verifyData, error: verifyError } = await supabaseService
                  .from("electricity_transactions")
                  .select("id, token")
                  .eq("id", transaction.id)
                  .single();

                if (verifyError) {
                  console.error(`Failed to verify update for transaction ${transaction.id}:`, verifyError);
                  results.failed++;
                  results.errors.push(`Transaction ${transaction.id}: Verification failed - ${verifyError.message}`);
                } else if (verifyData) {
                  console.log(`Verification result for transaction ${transaction.id}:`, {
                    updatedToken: verifyData.token,
                    expectedToken: token,
                    match: verifyData.token === token || verifyData.token === String(token),
                    tokenType: typeof verifyData.token,
                    expectedType: typeof token
                  });
                  
                  if (verifyData.token === token || verifyData.token === String(token)) {
                    console.log(`✓ Successfully updated transaction ${transaction.id} with token: ${token}`);
                    results.updated++;
                    
                    // Now update the api_response and customer details separately if needed
                    const additionalUpdates: any = {};
                    if (customerName) additionalUpdates.customer_name = customerName;
                    if (customerAddress) additionalUpdates.customer_address = customerAddress;
                    
                    if (Object.keys(additionalUpdates).length > 0 || providerResponse) {
                      additionalUpdates.api_response = {
                        ...apiResponse,
                        query_response: providerResponse,
                        queried_at: new Date().toISOString(),
                      };
                      
                      const { error: apiResponseError } = await supabaseService
                        .from("electricity_transactions")
                        .update(additionalUpdates)
                        .eq("id", transaction.id);
                      
                      if (apiResponseError) {
                        console.warn(`Failed to update additional fields for transaction ${transaction.id}:`, apiResponseError);
                      }
                    }
                  } else {
                    console.error(`Update verification failed for transaction ${transaction.id}. Expected token: ${token}, Got: ${verifyData.token}`);
                    results.failed++;
                    results.errors.push(`Transaction ${transaction.id}: Update verification failed - token mismatch (expected: ${token}, got: ${verifyData.token})`);
                  }
                } else {
                  console.error(`Verification returned no data for transaction ${transaction.id}`);
                  results.failed++;
                  results.errors.push(`Transaction ${transaction.id}: Verification returned no data`);
                }
              }
            } else {
              console.warn(`Transaction ${transaction.id} completed but no token found in response`);
              console.warn(`Full provider response:`, JSON.stringify(providerResponse, null, 2));
              results.failed++;
              results.errors.push(`Transaction ${transaction.id}: No token found in provider response. Check logs for details.`);
            }
          } else {
            console.warn(`Transaction ${transaction.id} is not completed according to provider`);
            results.failed++;
            results.errors.push(`Transaction ${transaction.id}: Not completed (statusCode: ${statusCode}, status: ${transactionStatus})`);
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
          message: `Processed ${results.processed} completed electricity transactions with null tokens`,
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
    console.error("Error in update-null-tokens function:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : undefined;
    const errorDetails = error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack,
    } : String(error);
    
    console.error("Error details:", JSON.stringify(errorDetails, null, 2));
    
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        stack: errorStack,
        details: errorDetails,
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});

