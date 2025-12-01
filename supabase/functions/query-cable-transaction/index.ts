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
    // Get environment variables
    const MOBILENIG_SECRET_KEY = Deno.env.get("MOBILENIG_SECRET_KEY");
    const MOBILENIG_PUBLIC_KEY = Deno.env.get("MOBILENIG_PUBLIC_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!MOBILENIG_SECRET_KEY && !MOBILENIG_PUBLIC_KEY) {
      return new Response(
        JSON.stringify({ error: "MOBILENIG_SECRET_KEY or MOBILENIG_PUBLIC_KEY not configured" }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // Use secret key as per MobileNig API documentation
    // The query endpoint requires secret key
    const apiKey = MOBILENIG_SECRET_KEY || MOBILENIG_PUBLIC_KEY;
    
    if (!MOBILENIG_SECRET_KEY) {
      console.warn('MOBILENIG_SECRET_KEY not configured, falling back to PUBLIC_KEY');
    }

    // Initialize Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get authentication token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const user = userData.user;

    // Check if user is admin
    const { data: roleData, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .limit(1);

    if (roleError || !roleData || roleData.length === 0) {
      return new Response(
        JSON.stringify({ error: "Admin access required" }),
        { status: 403, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const body = await req.json();
    const { trans_id } = body;

    if (!trans_id) {
      return new Response(
        JSON.stringify({ error: "trans_id is required" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // Query MobileNig API
    const queryUrl = `https://enterprise.mobilenig.com/api/v2/services/query?trans_id=${trans_id}`;
    
    console.log('Querying MobileNig transaction:', {
      url: queryUrl,
      trans_id: trans_id,
      key_type: MOBILENIG_SECRET_KEY ? 'SECRET_KEY' : 'PUBLIC_KEY'
    });

    const apiResponse = await fetch(queryUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
    });

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      return new Response(
        JSON.stringify({ 
          error: "Failed to query MobileNig transaction",
          details: errorText,
          status: apiResponse.status
        }),
        { status: apiResponse.status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const responseText = await apiResponse.text();
    console.log('MobileNig query response:', responseText);

    // Parse JSON response
    let apiResult: any;
    try {
      apiResult = JSON.parse(responseText);
    } catch (parseError) {
      return new Response(
        JSON.stringify({ 
          error: "Invalid response from MobileNig API",
          details: {
            parse_error: parseError instanceof Error ? parseError.message : String(parseError),
            response_preview: responseText.substring(0, 500)
          }
        }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // Check if query was successful
    // According to MobileNig API documentation:
    // - statusCode should be "200"
    // - message should be "success"
    // - details contains the transaction information
    if (apiResult.statusCode !== "200" && apiResult.statusCode !== 200) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: "MobileNig API error",
          statusCode: apiResult.statusCode,
          message: apiResult.message,
          details: apiResult.details || apiResult
        }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    if (apiResult.message !== "success") {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: apiResult.message || "Query failed",
          statusCode: apiResult.statusCode,
          details: apiResult.details || apiResult
        }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // Return transaction details as per API documentation
    // Response structure: { message: "success", statusCode: "200", details: { trans_id, service, status, details: {...} } }
    return new Response(
      JSON.stringify({
        success: true,
        transaction: apiResult.details,
        // Include full response for reference
        raw_response: apiResult
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error querying transaction:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});

