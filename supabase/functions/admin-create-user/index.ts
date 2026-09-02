import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  createServiceClient,
  errorResponse,
  jsonResponse,
  requireAdmin,
} from "../_shared/admin-auth.ts";
import { validateAdminNewPassword } from "../_shared/admin-password-reset-email.ts";
import { buildAdminCreatedAccountEmail } from "../_shared/admin-create-user-email.ts";
import {
  getResendFromAddress,
  parseResendErrorMessage,
  ResendApiError,
  sendResendEmail,
} from "../_shared/resend.ts";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function normalizePhone(value: unknown): string {
  if (typeof value !== "string") return "";
  let digits = value.replace(/[^0-9]/g, "");
  if (digits.startsWith("234") && digits.length === 13) {
    digits = `0${digits.slice(3)}`;
  }
  return digits;
}

function escapeIlikeExact(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createServiceClient();
    const admin = await requireAdmin(req, supabase);

    const body = await req.json();
    const fullName = typeof body?.full_name === "string" ? body.full_name.trim() : "";
    const email = normalizeEmail(body?.email);
    const phone = normalizePhone(body?.phone);
    const note = typeof body?.note === "string" ? body.note.trim() : "";
    const sendEmail = body?.send_email !== false;
    const password = validateAdminNewPassword(body?.password);

    if (fullName.length < 2) {
      throw new Error("full_name is required");
    }
    if (!email || !EMAIL_REGEX.test(email)) {
      throw new Error("A valid email address is required");
    }
    if (!phone || !/^0[0-9]{10}$/.test(phone)) {
      throw new Error("Phone number must be 11 digits and start with 0");
    }

    const { data: emailMatches, error: emailLookupError } = await supabase
      .from("profiles")
      .select("id")
      .ilike("email", escapeIlikeExact(email))
      .limit(1);

    if (emailLookupError) {
      console.error("admin-create-user email lookup error:", emailLookupError);
    }

    if (emailMatches && emailMatches.length > 0) {
      throw new Error("An account with this email already exists");
    }

    try {
      const { data: existingAuth, error: authLookupError } = await supabase.auth.admin.getUserByEmail(email);
      if (!authLookupError && existingAuth?.user) {
        throw new Error("An account with this email already exists");
      }
    } catch (lookupError) {
      if (lookupError instanceof Error && lookupError.message.includes("already exists")) {
        throw lookupError;
      }
    }

    const { data: phoneRpc, error: phoneRpcError } = await supabase.rpc("check_duplicate_signup_phone", {
      p_input: phone,
    });

    let phoneExists = typeof phoneRpc === "boolean" ? phoneRpc : false;
    if (phoneRpcError) {
      const { data: phoneMatches, error: phoneError } = await supabase
        .from("profiles")
        .select("id")
        .eq("phone", phone)
        .limit(1);
      if (phoneError) {
        throw new Error("Unable to verify phone number availability");
      }
      phoneExists = Boolean(phoneMatches && phoneMatches.length > 0);
    }

    if (phoneExists) {
      throw new Error("An account with this phone number already exists");
    }

    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        phone,
        created_by_admin_id: admin.id,
      },
    });

    if (createError || !created?.user) {
      const message = createError?.message || "Failed to create user";
      if (/already/i.test(message) || /registered/i.test(message)) {
        throw new Error("An account with this email already exists");
      }
      throw new Error(message);
    }

    const userId = created.user.id;

    const { error: profileError } = await supabase.from("profiles").upsert(
      {
        id: userId,
        email,
        full_name: fullName,
        phone,
        balance: 0,
        status: "active",
      },
      { onConflict: "id" },
    );

    if (profileError) {
      console.error("admin-create-user profile upsert error:", profileError);
    }

    let emailSent = false;
    let emailErrorMessage: string | null = null;

    if (sendEmail) {
      try {
        const { html, text } = buildAdminCreatedAccountEmail({
          fullName,
          email,
          password,
          phone,
          note: note || null,
        });

        await sendResendEmail({
          from: getResendFromAddress("NetPay Support <support@netppay.com>"),
          to: [email],
          subject: "Your NetPay account is ready",
          html,
          text,
          tags: [{ name: "category", value: "admin_create_user" }],
        });
        emailSent = true;
      } catch (emailError) {
        console.error("admin-create-user email error:", emailError);
        emailErrorMessage =
          emailError instanceof ResendApiError
            ? parseResendErrorMessage(emailError.details)
            : "Account was created but the welcome email could not be sent";
      }
    }

    console.log(`Admin ${admin.id} created user ${userId}`);

    return jsonResponse({
      success: true,
      message: emailSent
        ? `Account created. Sign-in details were emailed to ${email}.`
        : sendEmail
          ? `Account created, but the welcome email failed${emailErrorMessage ? `: ${emailErrorMessage}` : "."}`
          : "Account created successfully.",
      data: {
        userId,
        email,
        full_name: fullName,
        phone,
        email_verified: true,
        email_sent: emailSent,
      },
    });
  } catch (error) {
    console.error("admin-create-user error:", error);
    return errorResponse(error);
  }
});
