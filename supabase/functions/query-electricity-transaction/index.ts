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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const mobilenigSecretKey = Deno.env.get("MOBILENIG_SECRET_KEY");

    if (!mobilenigSecretKey) {
      console.error("MOBILENIG_SECRET_KEY not configured");
      return new Response(
        JSON.stringify({ success: false, error: "Service configuration error" }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization header" }),
        { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error("Authentication error:", userError);
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const url = new URL(req.url);
    const searchParams = url.searchParams;
    let transId = searchParams.get("trans_id");

    if (!transId && (req.method === "POST" || req.method === "PUT" || req.method === "PATCH")) {
      try {
        const body = await req.json();
        transId = body?.trans_id?.toString?.();
      } catch (_err) {
        // ignore body parse errors for GET-only callers
      }
    }

    if (!transId) {
      return new Response(
        JSON.stringify({ success: false, error: "trans_id is required" }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    console.log("Querying electricity transaction:", { trans_id: transId, user_id: user.id });

    const queryUrl = `https://enterprise.mobilenig.com/api/v2/services/query?trans_id=${encodeURIComponent(
      transId,
    )}`;

    const queryResponse = await fetch(queryUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${mobilenigSecretKey}`,
      },
    });

    const responseText = await queryResponse.text();
    let providerResponse;
    try {
      providerResponse = JSON.parse(responseText);
    } catch (parseError) {
      console.error("Failed to parse MobileNig query response:", responseText);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Invalid response from electricity provider: ${responseText.substring(0, 120)}`,
        }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    console.log("Query response:", JSON.stringify(providerResponse, null, 2));

    if (!queryResponse.ok || providerResponse.statusCode !== "200") {
      const providerError =
        providerResponse.message ||
        providerResponse.error ||
        providerResponse.details?.responseMessage ||
        "Query failed";

      return new Response(
        JSON.stringify({
          success: false,
          error: providerError,
          details: providerResponse,
        }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const details = providerResponse.details || {};
    return new Response(
      JSON.stringify({
      success: true,
      data: {
        trans_id: details.trans_id || transId,
        service: details.service || "",
        status: details.status || providerResponse.message || "Unknown",
        amount: details.details?.amount ?? null,
        customerReference: details.details?.customerReference ?? "",
        token: details.details?.token ?? "",
        reference: details.details?.reference ?? "",
        receiptNumber: details.details?.receiptNumber ?? "",
        customer_name: details.details?.customerName || details.customerName || "",
        customer_address: details.details?.customerAddress || details.customerAddress || "",
        raw: providerResponse,
      },
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error in query-electricity-transaction function:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Query failed",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
});

