import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type RegisterTokenPayload = {
  expo_push_token?: string;
  device_id?: string;
  platform?: string;
};

const normalize = (value?: string | null) => value?.trim() ?? "";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Supabase environment variables are not configured");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);

    if (userError || !userData.user) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const payload = (await req.json()) as RegisterTokenPayload;
    const expoToken = normalize(payload.expo_push_token);

    if (!expoToken) {
      return new Response(
        JSON.stringify({ success: false, error: "Expo push token is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const deviceId = normalize(payload.device_id);
    // Lowercase for consistent Android/iOS checks (e.g. send-push-notification channelId).
    const rawPlatform = payload.platform?.trim();
    const platform = rawPlatform ? rawPlatform.toLowerCase() : null;

    // Log registration attempt for debugging
    console.log('Registering push token:', {
      userId: userData.user.id,
      platform: platform,
      hasDeviceId: !!deviceId,
      tokenPrefix: expoToken.substring(0, 20),
    });

    if (deviceId) {
      await supabase
        .from("user_push_tokens")
        .update({ is_active: false })
        .eq("user_id", userData.user.id)
        .eq("device_id", deviceId);
    }

    const { error: upsertError } = await supabase
      .from("user_push_tokens")
      .upsert({
        user_id: userData.user.id,
        expo_push_token: expoToken,
        device_id: deviceId || null,
        platform: platform, // Store platform as-is (should be 'ios' or 'android')
        is_active: true,
      }, {
        onConflict: "expo_push_token",
        ignoreDuplicates: false,
      });

    if (upsertError) {
      console.error('Upsert error:', upsertError);
      throw upsertError;
    }

    console.log('Push token registered successfully:', {
      platform: platform,
      userId: userData.user.id,
      tokenPrefix: expoToken.substring(0, 20),
    });

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("register-push-token error:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unexpected error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
