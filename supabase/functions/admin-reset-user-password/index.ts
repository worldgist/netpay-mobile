import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  createServiceClient,
  errorResponse,
  jsonResponse,
  requireAdmin,
} from "../_shared/admin-auth.ts";
import { generateTemporaryPassword } from "../_shared/generate-password.ts";
import { NETPAY_SITE_URL } from "../_shared/site-url.ts";
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

function buildPasswordResetEmail(params: {
  fullName: string;
  email: string;
  temporaryPassword: string;
  reason?: string | null;
}) {
  const { fullName, email, temporaryPassword, reason } = params;
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
  <title>Your NetPay password has been reset</title>
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
              <h1 style="margin:0 0 16px;color:#222222;font-size:28px;font-weight:bold;">Password reset by NetPay support</h1>
              <p style="margin:0 0 16px;color:#666666;font-size:16px;line-height:26px;">
                Hello ${escapeHtml(greetingName)},<br><br>
                A NetPay administrator reset the password for <strong>${escapeHtml(email)}</strong>.
                Use the temporary password below to sign in, then change your password from the app.
              </p>
              ${reasonBlock}
              <p style="margin:0 0 14px;color:#666666;font-size:14px;line-height:22px;">Your temporary password:</p>
              <p style="margin:0 0 24px;padding:18px 24px;border:2px solid #FFE1CC;border-radius:14px;background-color:#FFFAF5;font-size:24px;font-weight:bold;letter-spacing:2px;color:#FF6B00;font-family:'Courier New',Courier,monospace;text-align:center;">
                ${escapeHtml(temporaryPassword)}
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFF7F2;border:1px solid #FFE1CC;border-radius:14px;">
                <tr>
                  <td style="padding:20px 22px;">
                    <p style="margin:0 0 8px;color:#222222;font-size:15px;font-weight:bold;">Keep your account secure</p>
                    <p style="margin:0;color:#666666;font-size:14px;line-height:24px;">
                      Sign in with this password, then update it immediately. Never share your password with anyone.
                      NetPay staff will never ask for your PIN.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color:#fafafa;padding:28px 40px;text-align:center;border-top:1px solid #f0f0f0;">
              <p style="margin:0;color:#888888;font-size:14px;line-height:22px;">
                Need help? <a href="mailto:support@netppay.com" style="color:#FF6B00;text-decoration:none;font-weight:600;">support@netppay.com</a>
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
    "Your NetPay password has been reset",
    "",
    `Hello ${greetingName},`,
    "",
    "A NetPay administrator reset your account password.",
    `Email: ${email}`,
    reason ? `Reason: ${reason}` : "",
    "",
    `Temporary password: ${temporaryPassword}`,
    "",
    "Sign in with this password, then change it from the app as soon as possible.",
    "",
    "If you did not request this change, contact support@netppay.com immediately.",
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
      throw new Error("You cannot reset your own password through this action");
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

    const temporaryPassword = generateTemporaryPassword(12);
    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
      password: temporaryPassword,
    });

    if (updateError) {
      throw new Error(`Failed to reset password: ${updateError.message}`);
    }

    try {
      await supabase.auth.admin.signOut(userId);
    } catch {
      // Continue even if sign-out fails.
    }

    const fullName = profile?.full_name || authUser.user_metadata?.full_name || "";
    const trimmedReason = typeof reason === "string" ? reason.trim() : "";
    const { html, text } = buildPasswordResetEmail({
      fullName: typeof fullName === "string" ? fullName : "",
      email,
      temporaryPassword,
      reason: trimmedReason || null,
    });

    let emailSent = false;
    let resendId: string | null = null;

    try {
      const resendResult = await sendResendEmail({
        from: getResendFromAddress("NetPay Support <support@netppay.com>"),
        to: [email],
        subject: "Your NetPay password has been reset",
        html,
        text,
        tags: [{ name: "category", value: "admin_password_reset" }],
      });
      emailSent = true;
      resendId = resendResult.id;
    } catch (emailError) {
      console.error("admin-reset-user-password email error:", emailError);
      if (emailError instanceof ResendApiError) {
        throw new Error(`Password was reset but email failed: ${parseResendErrorMessage(emailError.details)}`);
      }
      throw new Error("Password was reset but the notification email could not be sent");
    }

    console.log(`Admin ${admin.id} reset password for user ${userId}`);

    return jsonResponse({
      success: true,
      message: emailSent
        ? `Password reset successfully. The new password was emailed to ${email}.`
        : "Password reset successfully.",
      data: {
        userId,
        email,
        email_sent: emailSent,
        resend_id: resendId,
      },
    });
  } catch (error) {
    console.error("admin-reset-user-password error:", error);
    return errorResponse(error);
  }
});
