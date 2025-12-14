import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Send push notification to a user
 * This is a fire-and-forget function - errors are logged but don't throw
 */
export async function sendPushNotification(
  supabase: SupabaseClient,
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!supabaseUrl) {
      console.error("SUPABASE_URL not configured, cannot send push notification");
      return;
    }

    // Call the send-push-notification function
    const response = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({
        user_id: userId,
        title,
        body,
        data: data || {},
        priority: "high",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to send push notification to user ${userId}:`, errorText);
    }
  } catch (error) {
    // Log error but don't throw - push notifications are non-critical
    console.error(`Error sending push notification to user ${userId}:`, error);
  }
}






