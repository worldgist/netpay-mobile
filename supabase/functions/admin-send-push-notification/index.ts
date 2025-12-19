import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type AdminPushPayload = {
  title: string;
  body: string;
  user_ids?: string[];
  data?: Record<string, unknown>;
  sound?: string;
  priority?: "default" | "normal" | "high";
};

const normalize = (value?: string | null) => value?.trim() ?? "";

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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
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
      throw new Error("Unauthorized");
    }

    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userData.user.id)
      .eq('role', 'admin')
      .single();

    if (roleError || !roleData) {
      throw new Error('Forbidden: admin role required');
    }

    const payload = (await req.json()) as AdminPushPayload;
    const title = normalize(payload.title);
    const body = normalize(payload.body);

    if (!title || !body) {
      throw new Error("Title and body are required");
    }

    let targetUserIds = Array.isArray(payload.user_ids)
      ? payload.user_ids.map((id) => normalize(id)).filter(Boolean)
      : [];

    const shouldBroadcast = targetUserIds.length === 0;

    const { data: tokens, error: tokenError } = await supabase
      .from('user_push_tokens')
      .select('expo_push_token, user_id, platform')
      .eq('is_active', true);

    if (tokenError) {
      throw tokenError;
    }

    const uniqueTokens = new Map<string, { user_id: string; platform: string | null }>();
    (tokens || []).forEach((row) => {
      if (!row?.expo_push_token) return;
      if (shouldBroadcast || targetUserIds.includes(row.user_id)) {
        uniqueTokens.set(row.expo_push_token, { user_id: row.user_id, platform: row.platform });
      }
    });

    if (uniqueTokens.size === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No push tokens available for the selected recipients' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const messages = Array.from(uniqueTokens.entries()).map(([expoToken, tokenInfo]) => {
      const message: Record<string, unknown> = {
        to: expoToken,
        title,
        body,
        data: payload.data ?? {},
        sound: payload.sound ?? 'default',
        priority: payload.priority ?? 'high',
      };

      // Add Android-specific channelId for proper notification display
      // Android requires channelId to be specified in the push notification payload
      if (tokenInfo.platform === "android") {
        // Use "transactions" channel for transaction-related notifications, "default" for others
        const channelId = (payload.data?.transactionType || payload.data?.reference) ? "transactions" : "default";
        message.channelId = channelId;
      }

      return message;
    });

    const expoResponse = await sendExpoNotification(messages);

    return new Response(
      JSON.stringify({
        success: true,
        data: expoResponse,
        recipients: uniqueTokens.size,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('admin-send-push-notification error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unexpected error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
