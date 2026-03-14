import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type NotificationTarget = {
  user_id?: string;
  expo_push_token?: string;
};

type NotificationPayload = NotificationTarget & {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: string;
  priority?: "default" | "normal" | "high";
};

const normalizeString = (value?: string | null) => value?.trim() ?? "";

const sendExpoNotification = async (messages: Array<Record<string, unknown>>) => {
  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(messages),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Expo push send failed: ${errorText}`);
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Supabase environment variables are not configured");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const payload = (await req.json()) as NotificationPayload | NotificationPayload[];

    const notifications = Array.isArray(payload) ? payload : [payload];

    if (notifications.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "No notification payload provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const expoMessages: Array<Record<string, unknown>> = [];
    const errors: Array<{ target: NotificationTarget; error: string }> = [];

    for (const item of notifications) {
      const userId = normalizeString(item.user_id);
      const directToken = normalizeString(item.expo_push_token);
      const resolvedTargets: Array<{ token: string; platform: string | null }> = [];

      if (!directToken && userId) {
        const { data: tokenRows, error: tokenError } = await supabase
          .from("user_push_tokens")
          .select("expo_push_token, platform")
          .eq("user_id", userId)
          .eq("is_active", true)
          .order("updated_at", { ascending: false });

        if (tokenError) {
          errors.push({ target: { user_id: userId }, error: tokenError.message });
          continue;
        }

        for (const row of tokenRows ?? []) {
          const token = normalizeString(row.expo_push_token);
          if (token) {
            resolvedTargets.push({ token, platform: row.platform || null });
          }
        }
      } else if (directToken) {
        // If a token is provided directly, try to enrich with platform info
        const { data: tokenData } = await supabase
          .from("user_push_tokens")
          .select("platform")
          .eq("expo_push_token", directToken)
          .maybeSingle();
        resolvedTargets.push({ token: directToken, platform: tokenData?.platform || null });
      }

      if (resolvedTargets.length === 0) {
        errors.push({ target: { user_id: item.user_id, expo_push_token: item.expo_push_token }, error: "Missing Expo push token" });
        continue;
      }

      // A user can have multiple active device tokens, so enqueue one message per token.
      for (const target of resolvedTargets) {
        const message: Record<string, unknown> = {
          to: target.token,
          title: item.title,
          body: item.body,
          data: item.data ?? {},
          sound: item.sound ?? "default",
          priority: item.priority ?? "high",
        };

        // Android requires channelId in the push payload for reliable display behavior.
        if (target.platform === "android") {
          const channelId = (item.data?.transactionType || item.data?.type || item.data?.reference) ? "transactions" : "default";
          message.channelId = channelId;
        }

        expoMessages.push(message);
      }
    }

    if (expoMessages.length === 0) {
      const statusPayload = {
        success: errors.length === 0,
        delivered: 0,
        errors,
        message: errors.length === 0
          ? "No notifications to send."
          : "No valid Expo push tokens found for the provided targets.",
      };

      return new Response(
        JSON.stringify(statusPayload),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const expoResponse = await sendExpoNotification(expoMessages);

    const successfullyEnqueued =
      Array.isArray(expoResponse?.data) ? expoResponse.data.length : expoMessages.length;

    return new Response(
      JSON.stringify({
        success: true,
        delivered: successfullyEnqueued,
        data: expoResponse,
        errors,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("send-push-notification error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unexpected error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
