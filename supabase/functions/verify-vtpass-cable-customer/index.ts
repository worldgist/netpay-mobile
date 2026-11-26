import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CABLE_SERVICE_MAP: Record<string, string> = {
  "DSTV": "dstv",
  "GOTV": "gotv",
  "STARTIMES": "startimes",
};

const resolveServiceId = (provider?: string | null) => {
  if (!provider) return "dstv";
  const upper = provider.toUpperCase().trim();
  return CABLE_SERVICE_MAP[upper] || "dstv";
};

const normalizeSmartcard = (value: unknown) => {
  if (typeof value === "string") return value.replace(/[^\d]/g, "").trim();
  if (typeof value === "number") return value.toString().replace(/[^\d]/g, "").trim();
  return "";
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed" }),
      { status: 405, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  try {
    const VTPASS_API_KEY = Deno.env.get("VTPASS_API_KEY");
    const VTPASS_PUBLIC_KEY = Deno.env.get("VTPASS_PUBLIC_KEY");
    const VTPASS_SECRET_KEY = Deno.env.get("VTPASS_SECRET_KEY");
    const VTPASS_MODE = (Deno.env.get("VTPASS_MODE") || "live").toLowerCase();

    if (!VTPASS_API_KEY || !VTPASS_PUBLIC_KEY) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "VTpass credentials not configured. Please set VTPASS_API_KEY and VTPASS_PUBLIC_KEY.",
        }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    let parsedBody: Record<string, unknown> | null = null;
    try {
      const bodyText = await req.text();
      if (bodyText && bodyText.trim().length > 0) {
        parsedBody = JSON.parse(bodyText);
      }
    } catch (error) {
      console.error("verify-vtpass-cable-customer: unable to parse request body:", error);
      parsedBody = null;
    }

    const billersCode = parsedBody?.billersCode || parsedBody?.card_number || parsedBody?.smartcard_number;
    const provider = parsedBody?.provider || parsedBody?.serviceID;
    const explicitServiceId = parsedBody?.serviceID;

    const sanitizedSmartcard = normalizeSmartcard(billersCode);
    if (!sanitizedSmartcard) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "billersCode (smartcard number) is required",
        }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const serviceId = explicitServiceId && typeof explicitServiceId === "string"
      ? explicitServiceId.trim()
      : resolveServiceId(typeof provider === "string" ? provider : null);

    const baseUrl = VTPASS_MODE === "sandbox"
      ? "https://sandbox.vtpass.com"
      : "https://vtpass.com";

    // For POST requests to VTpass merchant-verify, we need api-key, public-key, and secret-key
    // Note: VTpass requires all three headers for POST requests
    const headers: HeadersInit = {
      "api-key": VTPASS_API_KEY, // Use API key, not public key
      "public-key": VTPASS_PUBLIC_KEY,
      "Content-Type": "application/json",
    };
    
    // Add secret-key for POST requests (required for merchant-verify endpoint)
    if (VTPASS_SECRET_KEY) {
      headers["secret-key"] = VTPASS_SECRET_KEY;
    } else {
      console.error("VTPASS_SECRET_KEY is missing - this will cause 401 errors");
    }
    
    // Log header presence (without values) for debugging
    console.log("VTpass authentication headers:", {
      hasApiKey: !!VTPASS_API_KEY,
      apiKeyLength: VTPASS_API_KEY?.length || 0,
      hasPublicKey: !!VTPASS_PUBLIC_KEY,
      publicKeyLength: VTPASS_PUBLIC_KEY?.length || 0,
      hasSecretKey: !!VTPASS_SECRET_KEY,
      secretKeyLength: VTPASS_SECRET_KEY?.length || 0,
      mode: VTPASS_MODE,
    });

    const verifyPayload = {
      billersCode: sanitizedSmartcard,
      serviceID: serviceId,
    };

    console.log("verify-vtpass-cable-customer -> verify payload:", {
      ...verifyPayload,
      mode: VTPASS_MODE,
      baseUrl: `${baseUrl}/api/merchant-verify`,
      hasApiKey: !!VTPASS_API_KEY,
      hasPublicKey: !!VTPASS_PUBLIC_KEY,
      hasSecretKey: !!VTPASS_SECRET_KEY,
      headers: {
        "api-key": VTPASS_API_KEY ? `${VTPASS_API_KEY.substring(0, 10)}...` : 'not set',
        "public-key": VTPASS_PUBLIC_KEY ? `${VTPASS_PUBLIC_KEY.substring(0, 10)}...` : 'not set',
        "secret-key": VTPASS_SECRET_KEY ? "***" : 'not set',
      },
    });

    const response = await fetch(`${baseUrl}/api/merchant-verify`, {
      method: "POST",
      headers,
      body: JSON.stringify(verifyPayload),
    });

    const responseText = await response.text();
    console.log("VTpass merchant-verify response status:", response.status);
    console.log("VTpass merchant-verify response:", responseText);

    if (!response.ok) {
      console.error("VTpass API error:", {
        status: response.status,
        statusText: response.statusText,
        response: responseText,
        requestUrl: `${baseUrl}/api/merchant-verify`,
        payload: verifyPayload,
      });
      
      // Parse error response if possible
      let errorMessage = `VTpass API error: ${response.status}`;
      try {
        const errorJson = JSON.parse(responseText);
        errorMessage = errorJson.response_description || errorJson.message || errorJson.error || errorMessage;
      } catch (e) {
        // Keep default error message
      }
      
      return new Response(
        JSON.stringify({
          success: false,
          error: errorMessage,
          status: response.status,
          details: responseText,
        }),
        { status: response.status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    let responseJson: any = null;
    try {
      responseJson = JSON.parse(responseText);
    } catch (error) {
      console.error("Unable to parse VTpass response:", responseText, error);
      return new Response(
        JSON.stringify({ success: false, error: "Invalid response from VTpass" }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    // Check if verification was successful (code "000" per VTpass spec)
    if (responseJson.code === "000" && responseJson.content) {
      const content = responseJson.content;
      
      // Map VTpass response fields exactly as per specification:
      // Customer_Name, Status, Due_Date, Customer_Number, Customer_Type
      // Also includes renewal_amount for bouquet renewal
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            customer_name: content.Customer_Name || content.customer_name || null,
            status: content.Status || content.status || null,
            due_date: content.Due_Date || content.due_date || null,
            customer_number: content.Customer_Number || content.customer_number || null,
            customer_type: content.Customer_Type || content.customer_type || null,
            renewal_amount: content.Renewal_Amount || content.renewal_amount || null,
            card_number: sanitizedSmartcard,
            smartcard_number: sanitizedSmartcard,
            service_id: serviceId,
            // Include commission details if available
            commission_details: content.commission_details || null,
          },
        }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    // Verification failed or invalid smartcard
    const errorMessage = responseJson.response_description || 
                        responseJson.message || 
                        responseJson.error || 
                        "Smartcard verification failed";

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        code: responseJson.code,
        details: responseJson,
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error in verify-vtpass-cable-customer function:", error);
    const message = error instanceof Error ? error.message : "Unknown error occurred";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
});

