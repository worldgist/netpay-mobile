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
    const secretKey = Deno.env.get("SMEPLUG_SECRET_KEY");
    const provider = (await req.text()).trim();

    if (!secretKey) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "SMEPLUG_SECRET_KEY is not configured for network checks",
          networks: [],
        }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const response = await fetch("https://smeplug.ng/api/v1/networks", {
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`SMEPLUG network lookup failed: ${response.status} ${errorText}`);
    }

    const payload = await response.json();
    const networks = payload?.networks ?? payload?.data?.networks ?? {};
    const items = Object.entries(networks).map(([id, name]) => ({ id, name: String(name) }));

    return new Response(
      JSON.stringify({ success: true, provider: "smeplug", networks: items, source: provider || "default" }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
});
