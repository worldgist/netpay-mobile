import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  createServiceClient,
  jsonResponse,
} from "../_shared/admin-auth.ts";
import { authRedirectUrls, NETPAY_SITE_URL } from "../_shared/site-url.ts";
import {
  getResendFromAddress,
  parseResendErrorMessage,
  ResendApiError,
  sendResendEmail,
} from "../_shared/resend.ts";
import {
  clientIpFromRequest,
  enforceAuthAbuseRateLimit,
} from "../_shared/auth-rate-limit.ts";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function extractRecoveryOtp(linkData: unknown): string | null {
  if (!linkData || typeof linkData !== "object") return null;

  const record = linkData as Record<string, unknown>;
  const properties = (record.properties && typeof record.properties === "object"
    ? record.properties
    : {}) as Record<string, unknown>;

  const otpCandidates = [
    properties.email_otp,
    properties.emailOtp,
    record.email_otp,
  ];

  for (const candidate of otpCandidates) {
    const value = typeof candidate === "number" ? String(candidate) : candidate;
    if (typeof value === "string" && /^\d{6}$/.test(value.trim())) {
      return value.trim();
    }
  }

  return null;
}

function buildResetCodeEmail(params: { fullName: string; email: string; code: string }) {
  const { fullName, email, code } = params;
  const greetingName = fullName.trim() || email;
  const logoUrl = Deno.env.get("NETPAY_LOGO_URL") || `${NETPAY_SITE_URL}/logo.png`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your NetPay password reset code</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f7fb;font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your NetPay password reset code is ${escapeHtml(code)}. It expires in 10 minutes.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f7fb;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,0.08);">
          <tr>
            <td style="padding:36px 40px 24px;">
              <img src="${logoUrl}" width="150" alt="NetPay" style="display:block;border:0;max-width:150px;height:auto;">
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 32px;">
              <h1 style="margin:0 0 16px;color:#222222;font-size:28px;font-weight:bold;text-align:center;">Reset your password</h1>
              <p style="margin:0 0 24px;color:#666666;font-size:16px;line-height:26px;text-align:center;">
                Hello ${escapeHtml(greetingName)},<br><br>
                Use this 6-digit code in the NetPay app to reset the password for
                <strong style="color:#222222;">${escapeHtml(email)}</strong>.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
                <tr>
                  <td align="center">
                    <p style="margin:0 0 12px;color:#666666;font-size:14px;">Your reset code:</p>
                    <p style="margin:0;padding:18px 28px;border:2px solid #FFE1CC;border-radius:14px;background-color:#FFFAF5;font-size:38px;font-weight:bold;letter-spacing:12px;color:#FF6B00;display:inline-block;font-family:'Courier New',Courier,monospace;">
                      ${escapeHtml(code)}
                    </p>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 24px;color:#888888;font-size:15px;line-height:22px;text-align:center;">
                This code expires in <strong style="color:#FF6B00;">10 minutes</strong>.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFF7F2;border:1px solid #FFE1CC;border-radius:14px;">
                <tr>
                  <td style="padding:20px 22px;">
                    <p style="margin:0 0 8px;color:#222222;font-size:15px;font-weight:bold;">Keep your account secure</p>
                    <p style="margin:0;color:#666666;font-size:14px;line-height:24px;">
                      Never share this code with anyone. NetPay staff will never ask for your OTP, PIN, or password.
                    </p>
                  </td>
                </tr>
              </table>
              <p style="margin:28px 0 0;color:#666666;font-size:15px;line-height:22px;text-align:center;">
                Didn’t request a password reset? You can safely ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#fafafa;padding:28px 40px;text-align:center;border-top:1px solid #f0f0f0;">
              <p style="margin:0 0 8px;color:#888888;font-size:14px;">
                Need help? <a href="mailto:support@netppay.com" style="color:#FF6B00;text-decoration:none;font-weight:600;">support@netppay.com</a>
              </p>
              <p style="margin:0;color:#aaaaaa;font-size:12px;">&copy; 2026 NetPay. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    "Reset your NetPay password",
    "",
    `Hello ${greetingName},`,
    "",
    `Your 6-digit password reset code is: ${code}`,
    "",
    "Enter this code in the NetPay app to choose a new password.",
    "This code expires in 10 minutes.",
    "",
    "If you did not request this, ignore this email.",
  ].join("\n");

  return { html, text };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    let email = "";
    try {
      const body = await req.json();
      email = normalizeEmail(body?.email);
    } catch {
      email = "";
    }

    // Always return a generic success to avoid email enumeration.
    const okResponse = () =>
      jsonResponse({
        success: true,
        message: "If an account exists for that email, a 6-digit reset code has been sent.",
      });

    if (!email || !email.includes("@")) {
      return jsonResponse({ success: false, error: "Enter a valid email address" }, 400);
    }

    const supabase = createServiceClient();
    const ip = clientIpFromRequest(req);

    const emailLimit = await enforceAuthAbuseRateLimit(supabase, {
      bucket: "password_reset_email",
      rateKey: email,
      windowSeconds: 15 * 60,
      maxRequests: 3,
      lockoutSeconds: 30 * 60,
    });
    if (!emailLimit.allowed) {
      return jsonResponse(
        {
          success: false,
          error: "Too many reset requests for this email. Please try again later.",
          retry_after_seconds: emailLimit.retryAfterSeconds,
        },
        429,
      );
    }

    const ipLimit = await enforceAuthAbuseRateLimit(supabase, {
      bucket: "password_reset_ip",
      rateKey: ip,
      windowSeconds: 60 * 60,
      maxRequests: 10,
    });
    if (!ipLimit.allowed) {
      return jsonResponse(
        {
          success: false,
          error: "Too many reset requests from this network. Please try again later.",
          retry_after_seconds: ipLimit.retryAfterSeconds,
        },
        429,
      );
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .ilike("email", email)
      .maybeSingle();

    const redirectTo = authRedirectUrls.passwordReset(email);
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });

    if (linkError) {
      const message = (linkError.message || "").toLowerCase();
      // Unknown email / missing user — still return success to avoid enumeration.
      if (
        message.includes("user not found") ||
        message.includes("no user found") ||
        message.includes("unable to find") ||
        (linkError as { status?: number }).status === 404
      ) {
        return okResponse();
      }
      console.error("generateLink recovery failed:", linkError);
      throw new Error("Unable to create password reset code. Please try again.");
    }

    const code = extractRecoveryOtp(linkData);
    if (!code) {
      console.error("Recovery generateLink missing email_otp:", linkData);
      throw new Error("Unable to create password reset code. Please try again.");
    }

    const metaName = (linkData as { user?: { user_metadata?: { full_name?: unknown } } })?.user
      ?.user_metadata?.full_name;
    const fullName =
      (typeof profile?.full_name === "string" ? profile.full_name : "") ||
      (typeof metaName === "string" ? metaName : "");
    const emailContent = buildResetCodeEmail({ fullName, email, code });

    try {
      await sendResendEmail({
        from: getResendFromAddress("NetPay <support@netppay.com>"),
        to: [email],
        subject: "Your NetPay password reset code",
        html: emailContent.html,
        text: emailContent.text,
        tags: [{ name: "category", value: "password_reset_code" }],
      });
    } catch (emailError) {
      console.error("send-password-reset-code email error:", emailError);
      if (emailError instanceof ResendApiError) {
        throw new Error(parseResendErrorMessage(emailError.details));
      }
      throw emailError;
    }

    return okResponse();
  } catch (error) {
    console.error("send-password-reset-code error:", error);
    const message = error instanceof Error ? error.message : "Failed to send reset code";
    return jsonResponse({ success: false, error: message }, 500);
  }
});
