import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  createServiceClient,
  errorResponse,
  jsonResponse,
  requireAdmin,
} from "../_shared/admin-auth.ts";
import { deleteUserAccount } from "../_shared/delete-user-core.ts";
import {
  buildAccountActivityCsv,
  buildAccountClosedEmail,
  encodeCsvAttachment,
} from "../_shared/admin-account-closed-email.ts";
import {
  getResendFromAddress,
  parseResendErrorMessage,
  ResendApiError,
  sendResendEmail,
} from "../_shared/resend.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createServiceClient();
    const admin = await requireAdmin(req, supabase);

    let userId = "";
    let deletionReason = "Deleted by admin";
    try {
      const body = await req.json();
      userId = typeof body?.userId === "string" ? body.userId.trim() : "";
      if (typeof body?.deletion_reason === "string" && body.deletion_reason.trim()) {
        deletionReason = body.deletion_reason.trim();
      }
    } catch {
      userId = "";
    }

    if (!userId) {
      return jsonResponse({ success: false, error: "userId is required" });
    }

    if (userId === admin.id) {
      return jsonResponse({ success: false, error: "You cannot delete your own admin account" });
    }

    const { data: targetRoles, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .limit(1);

    if (roleError) {
      console.warn("admin-delete-user role lookup warning:", roleError.message);
    }

    if (targetRoles?.length) {
      return jsonResponse({
        success: false,
        error: "Admin accounts cannot be deleted from user management",
      });
    }

    const { data: authUserData, error: authError } = await supabase.auth.admin.getUserById(userId);
    if (authError || !authUserData?.user) {
      return jsonResponse({ success: false, error: "User not found" });
    }

    const snapshot = await deleteUserAccount(supabase, {
      userId,
      deletedBy: admin.id,
      deletionReason,
      source: "admin",
      metadata: {
        deleted_by_email: admin.email ?? null,
        deleted_by_admin_id: admin.id,
      },
    });

    let emailSent = false;
    let emailError: string | null = null;
    let resendId: string | null = null;

    if (snapshot.email) {
      try {
        const emailParams = {
          fullName: snapshot.fullName,
          email: snapshot.email,
          phone: snapshot.phone,
          balance: snapshot.balance,
          transactionCount: snapshot.transactionCount,
          createdAt: snapshot.createdAt,
          closedAt: snapshot.closedAt,
          reason: deletionReason,
          activities: snapshot.activities,
        };
        const { html, text } = buildAccountClosedEmail(emailParams);
        const csv = buildAccountActivityCsv(emailParams);
        const closedDay = snapshot.closedAt.slice(0, 10);

        const emailPayload = {
          from: getResendFromAddress("NetPay Support <support@netppay.com>"),
          to: [snapshot.email],
          subject: "Your NetPay account has been closed",
          html,
          text,
          tags: [{ name: "category", value: "admin_account_closed" }],
        };

        let resendResult;
        try {
          resendResult = await sendResendEmail({
            ...emailPayload,
            attachments: [
              {
                filename: `netpay-account-activity-${closedDay}.csv`,
                content: encodeCsvAttachment(csv),
                content_type: "text/csv",
              },
            ],
          });
        } catch (attachmentError) {
          console.warn("admin-delete-user CSV attachment failed, sending activity email without file:", attachmentError);
          resendResult = await sendResendEmail(emailPayload);
        }
        emailSent = true;
        resendId = resendResult.id;
      } catch (sendError) {
        console.error("admin-delete-user email error:", sendError);
        emailError = sendError instanceof ResendApiError
          ? parseResendErrorMessage(sendError.details)
          : "The account was deleted but the closure email could not be sent";
      }
    } else {
      emailError = "The account was deleted but no email address was available to notify the user";
    }

    console.log(`Admin ${admin.id} deleted user ${userId}; email_sent=${emailSent}`);

    return jsonResponse({
      success: true,
      message: emailSent
        ? "User deleted and notified by email with their account activity"
        : "User deleted and archived successfully",
      data: {
        userId,
        deletionRecordId: snapshot.deletionRecordId,
        email: snapshot.email,
        email_sent: emailSent,
        email_error: emailError,
        resend_id: resendId,
        activity_count: snapshot.transactionCount,
      },
    });
  } catch (error) {
    console.error("admin-delete-user error:", error);
    return errorResponse(error);
  }
});
