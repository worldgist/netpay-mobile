import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  createServiceClient,
  errorResponse,
  jsonResponse,
  requireAdmin,
} from "../_shared/admin-auth.ts";
import { authRedirectUrls, NETPAY_SITE_URL } from "../_shared/site-url.ts";
import {
  getResendFromAddress,
  parseResendErrorMessage,
  ResendApiError,
  sendResendEmail,
} from "../_shared/resend.ts";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function extractActionLink(linkData: unknown): string | null {
  if (!linkData || typeof linkData !== "object") {
    return null;
  }

  const record = linkData as Record<string, unknown>;
  const properties = record.properties as Record<string, unknown> | undefined;

  const candidates = [
    properties?.action_link,
    record.action_link,
    properties?.redirect_to,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

function buildPasswordResetLinkEmail(params: {
  fullName: string;
  email: string;
  resetLink: string;
  reason?: string | null;
}) {
  const { fullName, email, resetLink, reason } = params;
  const greetingName = fullName.trim() || email;
  const logoUrl = Deno.env.get("NETPAY_LOGO_URL") || `${NETPAY_SITE_URL}/logo.png`;
  const reasonBlock = reason
    ? `<p style="margin:0 0 16px;color:#666666;font-size:15px;line-height:24px;">Reason: ${escapeHtml(reason)}</p>`
    : "";

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset your NetPay password</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f7fb;font-family:Arial,Helvetica,sans-serif;">
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
              <h1 style="margin:0 0 16px;color:#222222;font-size:28px;font-weight:bold;">Reset your password</h1>
              <p style="margin:0 0 16px;color:#666666;font-size:16px;line-height:26px;">
                Hello ${escapeHtml(greetingName)},<br><br>
                A NetPay administrator sent you a secure link to reset the password for
                <strong>${escapeHtml(email)}</strong>.
                Tap the button below to open NetPay and choose a new password.
              </p>
              ${reasonBlock}
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
                <tr>
                  <td align="center">
                    <a href="${escapeHtml(resetLink)}" target="_blank" style="background-color:#FF6B00;color:#ffffff;padding:16px 48px;text-decoration:none;font-size:17px;font-weight:bold;border-radius:10px;display:inline-block;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 16px;color:#888888;font-size:14px;line-height:22px;text-align:center;">
                This link expires in <strong style="color:#FF6B00;">1 hour</strong>.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFF7F2;border:1px solid #FFE1CC;border-radius:14px;">
                <tr>
                  <td style="padding:20px 22px;">
                    <p style="margin:0 0 8px;color:#222222;font-size:15px;font-weight:bold;">Keep your account secure</p>
                    <p style="margin:0;color:#666666;font-size:14px;line-height:24px;">
                      If you did not request this reset, contact
                      <a href="mailto:support@netppay.com" style="color:#FF6B00;text-decoration:none;font-weight:600;">support@netppay.com</a>
                      immediately.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color:#fafafa;padding:28px 40px;text-align:center;border-top:1px solid #f0f0f0;">
              <p style="margin:0;color:#888888;font-size:12px;line-height:20px;word-break:break-all;">
                If the button does not work, copy this link:<br>
                <a href="${escapeHtml(resetLink)}" style="color:#FF6B00;text-decoration:none;">${escapeHtml(resetLink)}</a>
              </p>
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
    "A NetPay administrator sent you a secure password reset link.",
    `Email: ${email}`,
    reason ? `Reason: ${reason}` : "",
    "",
    `Reset link: ${resetLink}`,
    "",
    "Open the link on your phone to launch NetPay and choose a new password.",
    "This link expires in 1 hour.",
  ]
    .filter(Boolean)
    .join("\n");

  return { html, text };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createServiceClient();
    const admin = await requireAdmin(req, supabase);

    const { userId, reason } = await req.json();
    if (!userId || typeof userId !== "string") {
      throw new Error("userId is required");
    }

    if (userId === admin.id) {
      throw new Error("You cannot send a reset link for your own account through this action");
    }

    const { data: authData, error: authError } = await supabase.auth.admin.getUserById(userId);
    if (authError || !authData?.user) {
      throw new Error("User not found");
    }

    const authUser = authData.user;
    const email = authUser.email?.trim().toLowerCase();
    if (!email) {
      throw new Error("User does not have an email address");
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", userId)
      .maybeSingle();

    const redirectTo = authRedirectUrls.passwordReset(email);
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });

    if (linkError) {
      throw new Error(`Failed to generate reset link: ${linkError.message}`);
    }

    const resetLink = extractActionLink(linkData);
    if (!resetLink) {
      throw new Error("Supabase did not return a password reset link");
    }

    const fullName = profile?.full_name || authUser.user_metadata?.full_name || "";
    const trimmedReason = typeof reason === "string" ? reason.trim() : "";
    const { html, text } = buildPasswordResetLinkEmail({
      fullName: typeof fullName === "string" ? fullName : "",
      email,
      resetLink,
      reason: trimmedReason || null,
    });

    let resendId: string | null = null;

    try {
      const resendResult = await sendResendEmail({
        from: getResendFromAddress("NetPay Support <support@netppay.com>"),
        to: [email],
        subject: "Reset your NetPay password",
        html,
        text,
        tags: [{ name: "category", value: "admin_password_reset_link" }],
      });
      resendId = resendResult.id;
    } catch (emailError) {
      console.error("admin-send-password-reset-link email error:", emailError);
      if (emailError instanceof ResendApiError) {
        throw new Error(`Reset link created but email failed: ${parseResendErrorMessage(emailError.details)}`);
      }
      throw new Error("Reset link created but the notification email could not be sent");
    }

    console.log(`Admin ${admin.id} sent password reset link to user ${userId}`);

    return jsonResponse({
      success: true,
      message: `Password reset link emailed to ${email}.`,
      data: {
        userId,
        email,
        email_sent: true,
        resend_id: resendId,
        redirect_to: redirectTo,
      },
    });
  } catch (error) {
    console.error("admin-send-password-reset-link error:", error);
    return errorResponse(error);
  }
});
