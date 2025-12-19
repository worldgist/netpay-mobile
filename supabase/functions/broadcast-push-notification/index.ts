import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type BroadcastPayload = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: string;
  priority?: "default" | "normal" | "high";
  user_ids?: string[];
  platforms?: string[];
};

const sendExpoMessages = async (messages: Array<Record<string, unknown>>) => {
  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(messages),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text);
  }

  return response.json();
};

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
    const payload = (await req.json()) as BroadcastPayload;

    if (!payload.title || !payload.body) {
      return new Response(
        JSON.stringify({ success: false, error: "title and body are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Supabase environment variables are not configured");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    let query = supabase
      .from("user_push_tokens")
      .select("user_id, expo_push_token, platform")
      .eq("is_active", true);

    if (payload.user_ids && payload.user_ids.length > 0) {
      query = query.in("user_id", payload.user_ids);
    }

    if (payload.platforms && payload.platforms.length > 0) {
      query = query.in("platform", payload.platforms);
    }

    const { data: tokens, error: tokensError } = await query;

    if (tokensError) {
      throw tokensError;
    }

    if (!tokens || tokens.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No active push tokens found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const messages = tokens.map((row: { expo_push_token: string; platform?: string | null }) => {
      const message: Record<string, unknown> = {
        to: row.expo_push_token,
        title: payload.title,
        body: payload.body,
        data: payload.data ?? {},
        sound: payload.sound ?? "default",
        priority: payload.priority ?? "high",
      };

      // Add Android-specific channelId for proper notification display
      // Android requires channelId to be specified in the push notification payload
      if (row.platform === "android") {
        // Use "transactions" channel for transaction-related notifications, "default" for others
        const channelId = (payload.data?.transactionType || payload.data?.reference) ? "transactions" : "default";
        message.channelId = channelId;
      }

      return message;
    });

    const expoResponse = await sendExpoMessages(messages);

    return new Response(
      JSON.stringify({
        success: true,
        sent: messages.length,
        expo: expoResponse,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("broadcast-push-notification error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unexpected error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
