import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getFlutterwaveSecretKeyOptional,
  listFlutterwaveAirtimeBillers,
} from "../_shared/flutterwave-bills.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    if (!getFlutterwaveSecretKeyOptional()) {
      return new Response(JSON.stringify({
        success: false,
        error: "Flutterwave credentials are not configured",
      }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
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

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ success: false, error: "Admin access required" }), {
        status: 403,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const billers = await listFlutterwaveAirtimeBillers();

    const rowsToSave = billers.map((provider) => ({
      network_name: provider.network_name,
      api_code: provider.api_code,
      min_amount: Number(provider.min_amount) || 50,
      max_amount: Number(provider.max_amount) || 50000,
      commission: 0,
      is_active: true,
    }));

    const savedProviders: Array<Record<string, unknown>> = [];

    for (const row of rowsToSave) {
      const { data: existingByNetwork } = await supabase
        .from("airtime_providers")
        .select("id, api_code, network_name")
        .ilike("network_name", row.network_name)
        .limit(1)
        .maybeSingle();

      if (existingByNetwork?.id) {
        const { data: updated, error: updateError } = await supabase
          .from("airtime_providers")
          .update({
            network_name: row.network_name,
            api_code: row.api_code,
            min_amount: row.min_amount,
            max_amount: row.max_amount,
            commission: row.commission,
            is_active: row.is_active,
          })
          .eq("id", existingByNetwork.id)
          .select("*")
          .single();

        if (updateError) {
          console.error(`Failed to update airtime provider ${row.network_name}:`, updateError);
          throw updateError;
        }

        if (updated) savedProviders.push(updated);
        continue;
      }

      const { data: inserted, error: insertError } = await supabase
        .from("airtime_providers")
        .upsert(row, { onConflict: "api_code", ignoreDuplicates: false })
        .select("*")
        .single();

      if (insertError) {
        console.error(`Failed to save airtime provider ${row.network_name}:`, insertError);
        throw insertError;
      }

      if (inserted) savedProviders.push(inserted);
    }

    return new Response(JSON.stringify({
      success: true,
      data: savedProviders,
      metadata: {
        total: savedProviders.length,
        imported: billers.length,
        stored: savedProviders.length,
        vendor: "flutterwave",
      },
    }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("fetch-flutterwave-airtime-billers error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
