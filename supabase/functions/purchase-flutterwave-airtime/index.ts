import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const bodyText = await req.text();
    let body: Record<string, unknown> = {};

    try {
      body = bodyText ? JSON.parse(bodyText) as Record<string, unknown> : {};
    } catch {
      body = {};
    }

    const phoneNumber = String(body.phone_number || body.phone || "").trim();
    const amount = Number(body.amount || 0);

    if (!phoneNumber || !Number.isFinite(amount) || amount <= 0) {
      return new Response(
        JSON.stringify({ success: false, error: "phone_number and amount are required" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const secretKey = Deno.env.get("FLUTTERWAVE_SECRET_KEY") || Deno.env.get("FLUTTERWAVE_PUBLIC_KEY");
    if (!secretKey) {
      return new Response(
        JSON.stringify({ success: false, error: "Flutterwave credentials are not configured" }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, provider: "flutterwave", message: "Airtime purchase request validated", phone_number: phoneNumber, amount }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
});
