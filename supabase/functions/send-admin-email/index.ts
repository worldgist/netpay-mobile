import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AdminEmailPayload {
  emails: string[];
  subject: string;
  htmlContent: string;
  textContent?: string;
  user_ids?: string[]; // Optional: for tracking which users received the email
}

const normalizeString = (value?: string | null) => {
  if (typeof value !== "string") return "";
  return value.trim();
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const buildEmailTemplate = (subject: string, htmlContent: string) => {
  // Logo URL - update this to your actual hosted logo URL
  const LOGO_URL = Deno.env.get("NETPAY_LOGO_URL") || "https://netpayy.ng/logo.png";
  
  return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; color: #1f2933; background-color: #fef2e8; padding: 20px;">
      <div style="max-width: 800px; margin: 0 auto; background: #ffffff; border-radius: 22px; padding: 0; box-shadow: 0 24px 65px rgba(255,127,0,0.28); border: 1px solid rgba(255,127,0,0.16); overflow: hidden;">
        <div style="background: linear-gradient(135deg, #ff7f00, #ff9f3f); padding: 30px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 20px;">
            <tr>
              <td>
                <img 
                  src="${LOGO_URL}" 
                  alt="NetPay Logo" 
                  style="height: 48px; width: auto; max-width: 150px; display: block;"
                />
              </td>
            </tr>
          </table>
          <p style="margin: 0; font-size: 12px; letter-spacing: 0.42em; text-transform: uppercase; color: rgba(255,255,255,0.65); font-weight: 600;">NetPay</p>
          <h1 style="margin: 12px 0 0; font-size: 24px; color: #ffffff;">${escapeHtml(subject)}</h1>
        </div>

        <div style="padding: 32px;">
          <div style="color: #3b2f1d; line-height: 1.6; font-size: 15px;">
            ${htmlContent}
          </div>

          <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(255,127,0,0.12); border-radius: 16px; padding: 16px; margin-top: 28px;">
            <p style="margin: 0; font-size: 13px; color: rgba(50,30,8,0.85);">Need help? Reply to this email or contact NetPay support.</p>
            <div style="width: 42px; height: 42px; border-radius: 12px; background: linear-gradient(135deg, #ffb347, #ff7f00); display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700;">NP</div>
          </div>
        </div>
      </div>
    </div>
  `;
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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization header" }),
        { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Supabase environment variables are not configured");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Verify the user is an admin
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);

    if (userError || !userData.user) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    // Check if user has admin role
    const { data: roleData, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .single();

    if (roleError || !roleData) {
      return new Response(
        JSON.stringify({ success: false, error: "Forbidden: Admin access required" }),
        { status: 403, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    // Parse request body
    const body = await req.json() as AdminEmailPayload;
    const emails = Array.isArray(body.emails) ? body.emails : [];
    const subject = normalizeString(body.subject);
    const htmlContent = normalizeString(body.htmlContent);
    const textContent = normalizeString(body.textContent);

    if (emails.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "At least one email address is required" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    if (!subject || !htmlContent) {
      return new Response(
        JSON.stringify({ success: false, error: "Subject and HTML content are required" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    // Validate email addresses
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const validEmails = emails.filter(email => emailRegex.test(email));
    
    if (validEmails.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "No valid email addresses provided" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    // Get Resend API configuration
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY is not configured");
      throw new Error("RESEND_API_KEY environment variable is not configured");
    }

    const FROM_ADDRESS = Deno.env.get("RESEND_FROM_EMAIL") ?? "NetPay Notifications <support@netpayy.ng>";
    
    console.log("Email configuration:", {
      hasApiKey: !!RESEND_API_KEY,
      fromAddress: FROM_ADDRESS,
      recipientCount: validEmails.length,
    });

    // Build email content
    const html = buildEmailTemplate(subject, htmlContent);
    const text = textContent || htmlContent.replace(/<[^>]*>/g, "").trim();

    // Send emails via Resend API
    // Resend supports multiple recipients, but we'll send individually for better tracking
    const emailResults: Array<{ email: string; success: boolean; id?: string; error?: string }> = [];
    let successCount = 0;
    let failureCount = 0;
    const resendIds: string[] = [];

    // Send emails individually for better error tracking
    for (const email of validEmails) {
      try {
        const resendResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: FROM_ADDRESS,
            to: [email],
            subject,
            html,
            text,
            tags: [
              { name: "notification_type", value: "admin_email" },
              { name: "source", value: "admin_portal" },
            ],
          }),
        });

        if (!resendResponse.ok) {
          const errorText = await resendResponse.text();
          const statusCode = resendResponse.status;
          console.error(`Resend API error for ${email} (${statusCode}):`, errorText);
          emailResults.push({ email, success: false, error: `Status ${statusCode}: ${errorText}` });
          failureCount++;
        } else {
          const resendJson = await resendResponse.json();
          console.log(`Email sent successfully to ${email}:`, resendJson.id);
          emailResults.push({ email, success: true, id: resendJson.id });
          resendIds.push(resendJson.id);
          successCount++;
        }
      } catch (error) {
        console.error(`Error sending email to ${email}:`, error);
        emailResults.push({ 
          email, 
          success: false, 
          error: error instanceof Error ? error.message : "Unknown error" 
        });
        failureCount++;
      }
    }

    // If all emails failed, return error
    if (successCount === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Failed to send all emails", 
          details: emailResults,
          sent_to: 0,
          failed: failureCount,
        }),
        { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const resendJson = { 
      id: resendIds[0] || "batch", 
      results: emailResults 
    };

    // Log email sent event
    const finalStatus = failureCount > 0 && successCount > 0 ? "partial" : (successCount > 0 ? "sent" : "failed");
    try {
      await supabase.from("email_logs").insert({
        sent_by: userData.user.id,
        recipient_count: validEmails.length,
        subject,
        recipient_emails: validEmails,
        user_ids: body.user_ids || [],
        status: finalStatus === "sent" ? "sent" : (finalStatus === "failed" ? "failed" : "sent"), // Store as sent if any succeeded
        resend_id: resendIds.join(","), // Store all resend IDs
        error_message: failureCount > 0 ? `${failureCount} email(s) failed to send` : null,
      });
    } catch (logError) {
      // Log error but don't fail the request
      console.error("Failed to log email:", logError);
    }

    return new Response(
      JSON.stringify({ 
        success: successCount > 0, 
        data: resendJson,
        sent_to: successCount,
        failed: failureCount,
        invalid_emails: emails.length - validEmails.length,
        results: emailResults,
      }),
      { status: successCount > 0 ? 200 : 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("send-admin-email error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unexpected error",
      }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
});

