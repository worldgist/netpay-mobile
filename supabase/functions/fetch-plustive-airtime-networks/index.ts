import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { listPlustiveNetworks, type PlustiveNetwork } from "../_shared/plustive-api.ts";
import {
  corsHeaders,
  createServiceClient,
  jsonResponse,
  requireAdmin,
} from "../_shared/admin-auth.ts";

function displayName(network: PlustiveNetwork): string {
  const raw = String(network.name || network.code || network.id || "").trim();
  const key = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (key.includes("9mobile") || key.includes("etisalat") || key === "t2") return "9Mobile";
  if (key.includes("mtn")) return "MTN";
  if (key.includes("airtel")) return "Airtel";
  if (key.includes("glo")) return "Glo";
  return raw || "Unknown";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const supabase = createServiceClient();
    await requireAdmin(req, supabase);

    const networks = await listPlustiveNetworks();
    const rows = networks
      .map((network) => ({
        network_name: displayName(network),
        api_code: String(network.id || network.code || "").trim(),
        min_amount: 50,
        max_amount: 50000,
        commission: 0,
        is_active: true,
      }))
      .filter((row) => row.api_code && row.network_name !== "Unknown");

    if (!rows.length) {
      return jsonResponse({
        success: false,
        error: "Plustive returned no airtime networks",
      });
    }

    const saved = [];
    for (const row of rows) {
      const { data: existing } = await supabase
        .from("airtime_providers")
        .select("id")
        .ilike("network_name", row.network_name)
        .limit(1)
        .maybeSingle();

      if (existing?.id) {
        const { data: updated, error } = await supabase
          .from("airtime_providers")
          .update(row)
          .eq("id", existing.id)
          .select("*")
          .single();
        if (error) throw error;
        if (updated) saved.push(updated);
        continue;
      }

      const { data: inserted, error } = await supabase
        .from("airtime_providers")
        .upsert(row, { onConflict: "api_code", ignoreDuplicates: false })
        .select("*")
        .single();
      if (error) throw error;
      if (inserted) saved.push(inserted);
    }

    return jsonResponse({
      success: true,
      data: saved,
      metadata: { stored: saved.length, vendor: "plustive" },
    });
  } catch (error) {
    console.error("fetch-plustive-airtime-networks error:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch Plustive airtime networks";
    return jsonResponse({ success: false, error: message });
  }
});
