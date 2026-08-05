export type ResendTag = { name: string; value: string };

export type ResendAttachment = {
  filename: string;
  content: string;
};

export type ResendEmailOptions = {
  from?: string;
  to: string[];
  subject: string;
  html?: string;
  text?: string;
  reply_to?: string;
  tags?: ResendTag[];
  attachments?: ResendAttachment[];
};

export type ResendSendResult = {
  id: string;
};

export class ResendApiError extends Error {
  status: number;
  details: string;

  constructor(status: number, details: string) {
    super(`Resend API error (${status}): ${details}`);
    this.name = "ResendApiError";
    this.status = status;
    this.details = details;
  }
}

/** Reads RESEND_API_KEY from Supabase Edge Function secrets. */
export function getResendApiKey(): string {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured in Supabase Edge Function secrets");
  }
  return apiKey;
}

export function getResendFromAddress(fallback = "NetPay Notifications <support@netpayy.ng>"): string {
  return Deno.env.get("RESEND_FROM_EMAIL") ?? fallback;
}

export function getResendSupportInbox(fallback = "support@netpayy.ng"): string {
  return Deno.env.get("RESEND_TO_EMAIL") ?? fallback;
}

export async function sendResendEmail(options: ResendEmailOptions): Promise<ResendSendResult> {
  const apiKey = getResendApiKey();
  const from = options.from ?? getResendFromAddress();

  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      reply_to: options.reply_to,
      tags: options.tags,
      attachments: options.attachments,
    }),
  });

  if (!resendResponse.ok) {
    const errorText = await resendResponse.text();
    console.error("Resend API error:", errorText);
    throw new ResendApiError(resendResponse.status, errorText);
  }

  return (await resendResponse.json()) as ResendSendResult;
}
