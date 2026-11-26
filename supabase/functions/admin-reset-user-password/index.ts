import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  createServiceClient,
  errorResponse,
  jsonResponse,
  requireAdmin,
} from "../_shared/admin-auth.ts";
import {
  buildAdminPasswordResetEmail,
  validateAdminNewPassword,
} from "../_shared/admin-password-reset-email.ts";
import {
  getResendFromAddress,
  parseResendErrorMessage,
  ResendApiError,
  sendResendEmail,
} from "../_shared/resend.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createServiceClient();
    const admin = await requireAdmin(req, supabase);

    const { userId, newPassword, reason } = await req.json();
    if (!userId || typeof userId !== "string") {
      throw new Error("userId is required");
    }

    if (userId === admin.id) {
      throw new Error("You cannot reset your own password through this action");
    }

    const trimmedPassword = validateAdminNewPassword(newPassword);

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

    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
      password: trimmedPassword,
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
    const { html, text } = buildAdminPasswordResetEmail({
      fullName: typeof fullName === "string" ? fullName : "",
      email,
      newPassword: trimmedPassword,
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
