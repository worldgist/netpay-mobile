import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SupportEmailPayload {
  name?: string;
  email?: string;
  subject?: string;
  message?: string;
}

const normalize = (value?: string | null) => {
  if (typeof value !== "string") return "";
  return value.trim();
};

const buildEmailMarkup = (payload: Required<SupportEmailPayload>) => {
  const { name, email, subject, message } = payload;
  const escapedMessage = message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br />");

  return `
    <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.5;">
      <h2 style="margin-bottom: 16px;">New Support Message</h2>
      <p><strong>From:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Subject:</strong> ${subject}</p>
      <p><strong>Message:</strong></p>
      <div style="padding: 12px; border-left: 3px solid #ff7f00; background-color: #f9f9f9;">
        ${escapedMessage}
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
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY environment variable is not configured");
    }

    const SUPPORT_INBOX = Deno.env.get("RESEND_TO_EMAIL") ?? "support@netpay.com";
    const FROM_ADDRESS = Deno.env.get("RESEND_FROM_EMAIL") ?? "NetPay Support <support@netpay.com>";

    const body = (await req.json()) as SupportEmailPayload;
    const name = normalize(body.name);
    const email = normalize(body.email);
    const subject = normalize(body.subject);
    const message = normalize(body.message);

    if (!name || !email || !subject || !message) {
      return new Response(
        JSON.stringify({ success: false, error: "name, email, subject, and message are required" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const payload = {
      name,
      email,
      subject,
      message,
    };

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [SUPPORT_INBOX],
        reply_to: email,
        subject: `[Support] ${subject}`,
        html: buildEmailMarkup(payload),
        text: `Support message from ${name} <${email}>\n\nSubject: ${subject}\n\n${message}`,
      }),
    });

    if (!resendResponse.ok) {
      const errorText = await resendResponse.text();
      console.error("Resend API error:", errorText);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to send email", details: errorText }),
        { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const resendJson = await resendResponse.json();

    return new Response(
      JSON.stringify({ success: true, data: resendJson }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("send-support-email error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unexpected error",
      }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
});


