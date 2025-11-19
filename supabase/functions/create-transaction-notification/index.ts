import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationPayload {
  title?: string;
  message?: string;
  metadata?: Record<string, unknown>;
}

const normalize = (value?: string | null) => {
  if (typeof value !== "string") return "";
  return value.trim();
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const body = (await req.json()) as NotificationPayload;
    const title = normalize(body?.title);
    const message = normalize(body?.message);
    const metadata = body?.metadata ?? null;

    if (!title || !message) {
      return new Response(
        JSON.stringify({ success: false, error: "title and message are required" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const { data: notification, error: notificationError } = await supabase
      .from("notifications")
      .insert({
        title,
        message,
        recipient_type: "individual",
        recipient_ids: [user.id],
        sent_by: user.id,
        is_read: false,
        metadata,
      })
      .select()
      .single();

    if (notificationError || !notification) {
      throw notificationError ?? new Error("Failed to create notification record");
    }

    const { error: recipientError } = await supabase
      .from("notification_recipients")
      .insert({
        notification_id: notification.id,
        user_id: user.id,
        is_read: false,
      });

    if (recipientError) {
      throw recipientError;
    }

    return new Response(
      JSON.stringify({ success: true, notification }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("create-transaction-notification error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unexpected error",
      }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
});




