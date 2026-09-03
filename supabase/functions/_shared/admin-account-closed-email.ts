import { NETPAY_SITE_URL } from "./site-url.ts";
import { escapeHtml } from "./admin-password-reset-email.ts";

export type AccountClosedActivity = {
  date: string;
  type: string;
  description: string;
  amount: number;
  balance_after: number | null;
  reference: string;
  status?: string;
};

export type AccountClosedEmailParams = {
  fullName: string;
  email: string;
  phone?: string | null;
  balance: number;
  transactionCount: number;
  createdAt?: string | null;
  closedAt: string;
  reason?: string | null;
  activities: AccountClosedActivity[];
};

function formatNaira(amount: number): string {
  return `NGN ${amount.toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatActivityType(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function buildAccountClosedEmail(params: AccountClosedEmailParams) {
  const {
    fullName,
    email,
    phone,
    balance,
    transactionCount,
    createdAt,
    closedAt,
    reason,
    activities,
  } = params;

  const greetingName = fullName.trim() || email;
  const logoUrl = Deno.env.get("NETPAY_LOGO_URL") || `${NETPAY_SITE_URL}/logo.png`;
  const shownActivities = activities.slice(0, 80);
  const extraCount = Math.max(0, activities.length - shownActivities.length, transactionCount - shownActivities.length);

  const reasonBlock = reason
    ? `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;background-color:#FFF7ED;border:1px solid #FED7AA;border-radius:14px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 6px;color:#9A3412;font-size:14px;font-weight:bold;">Reason</p>
                    <p style="margin:0;color:#7C2D12;font-size:14px;line-height:22px;">${escapeHtml(reason)}</p>
                  </td>
                </tr>
              </table>`
    : "";

  const activityRows = shownActivities.length
    ? shownActivities
        .map((activity) => {
          const amount = Number(activity.amount) || 0;
          const amountColor = amount < 0 ? "#B91C1C" : "#15803D";
          const status = activity.status ? formatActivityType(activity.status) : "—";
          return `
                    <tr>
                      <td style="padding:10px 6px;border-bottom:1px solid #F1F5F9;color:#475569;font-size:11px;white-space:nowrap;">${escapeHtml(formatDate(activity.date))}</td>
                      <td style="padding:10px 6px;border-bottom:1px solid #F1F5F9;color:#0F172A;font-size:11px;">${escapeHtml(formatActivityType(activity.type))}</td>
                      <td style="padding:10px 6px;border-bottom:1px solid #F1F5F9;color:#475569;font-size:11px;">${escapeHtml(activity.description || activity.reference || "—")}<br><span style="color:#94A3B8;">${escapeHtml(activity.reference || "")}</span></td>
                      <td style="padding:10px 6px;border-bottom:1px solid #F1F5F9;color:#475569;font-size:11px;">${escapeHtml(status)}</td>
                      <td style="padding:10px 6px;border-bottom:1px solid #F1F5F9;color:${amountColor};font-size:11px;font-weight:600;text-align:right;">${escapeHtml(formatNaira(amount))}</td>
                    </tr>`;
        })
        .join("")
    : `
                    <tr>
                      <td colspan="5" style="padding:16px 8px;color:#64748B;font-size:13px;text-align:center;">No account activity was found for this profile.</td>
                    </tr>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Your NetPay account has been closed</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f7fb;font-family:Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased;">

  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
    Your NetPay account has been closed. This email includes a copy of your recent account activity.
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f7fb;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,0.08);">

          <tr>
            <td style="padding:36px 40px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="left" valign="middle">
                    <img src="${escapeHtml(logoUrl)}" width="150" alt="NetPay" style="display:block;border:0;max-width:150px;height:auto;">
                  </td>
                  <td align="right" valign="middle" style="color:#888888;font-size:13px;font-weight:600;letter-spacing:0.5px;">
                    ACCOUNT CLOSED
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:0 40px 28px;">
              <h1 style="margin:0 0 12px;color:#111827;font-size:26px;line-height:32px;">Your NetPay account has been closed</h1>
              <p style="margin:0 0 18px;color:#4B5563;font-size:15px;line-height:24px;">
                Hello ${escapeHtml(greetingName)}, a NetPay administrator closed your account. You can no longer sign in or use NetPay services with this profile.
              </p>
              ${reasonBlock}

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;background-color:#F8FAFC;border:1px solid #E2E8F0;border-radius:14px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 10px;color:#222222;font-size:14px;font-weight:bold;">Account summary</p>
                    <p style="margin:0 0 6px;color:#475569;font-size:14px;">Email: <strong style="color:#111827;">${escapeHtml(email)}</strong></p>
                    ${phone ? `<p style="margin:0 0 6px;color:#475569;font-size:14px;">Phone: <strong style="color:#111827;">${escapeHtml(phone)}</strong></p>` : ""}
                    <p style="margin:0 0 6px;color:#475569;font-size:14px;">Wallet balance at closure: <strong style="color:#111827;">${escapeHtml(formatNaira(balance))}</strong></p>
                    <p style="margin:0 0 6px;color:#475569;font-size:14px;">Recorded activities: <strong style="color:#111827;">${transactionCount}</strong></p>
                    <p style="margin:0 0 6px;color:#475569;font-size:14px;">Account created: <strong style="color:#111827;">${escapeHtml(formatDate(createdAt))}</strong></p>
                    <p style="margin:0;color:#475569;font-size:14px;">Closed on: <strong style="color:#111827;">${escapeHtml(formatDate(closedAt))}</strong></p>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 10px;color:#222222;font-size:14px;font-weight:bold;">Account activity log</p>
              <p style="margin:0 0 12px;color:#64748B;font-size:13px;line-height:20px;">
                This is a copy of the activity recorded on your NetPay account. A CSV of the full log is also attached to this email.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;">
                <tr style="background-color:#F8FAFC;">
                  <th align="left" style="padding:10px 6px;color:#64748B;font-size:10px;text-transform:uppercase;letter-spacing:0.4px;">Date</th>
                  <th align="left" style="padding:10px 6px;color:#64748B;font-size:10px;text-transform:uppercase;letter-spacing:0.4px;">Type</th>
                  <th align="left" style="padding:10px 6px;color:#64748B;font-size:10px;text-transform:uppercase;letter-spacing:0.4px;">Details / Ref</th>
                  <th align="left" style="padding:10px 6px;color:#64748B;font-size:10px;text-transform:uppercase;letter-spacing:0.4px;">Status</th>
                  <th align="right" style="padding:10px 6px;color:#64748B;font-size:10px;text-transform:uppercase;letter-spacing:0.4px;">Amount</th>
                </tr>
                ${activityRows}
              </table>
              ${
                extraCount > 0
                  ? `<p style="margin:10px 0 0;color:#64748B;font-size:12px;">Showing the ${shownActivities.length} most recent activities in this email. The attached CSV contains all ${activities.length} recorded activities.</p>`
                  : `<p style="margin:10px 0 0;color:#64748B;font-size:12px;">A CSV copy of this activity log is attached for your records.</p>`
              }

              <p style="margin:24px 0 0;color:#4B5563;font-size:14px;line-height:22px;">
                If you did not expect this, contact
                <a href="mailto:support@netppay.com" style="color:#FF6B00;text-decoration:none;font-weight:600;">support@netppay.com</a>
                and we will review the request.
              </p>
            </td>
          </tr>

          <tr>
            <td style="background-color:#fafafa;padding:28px 40px;text-align:center;border-top:1px solid #f0f0f0;">
              <p style="margin:0 0 8px;color:#888888;font-size:14px;line-height:22px;">
                Need help?
                <a href="mailto:support@netppay.com" style="color:#FF6B00;text-decoration:none;font-weight:600;">support@netppay.com</a>
              </p>
              <p style="margin:0;color:#aaaaaa;font-size:12px;line-height:20px;">
                &copy; 2026 NetPay. All rights reserved.<br>
                <a href="${escapeHtml(NETPAY_SITE_URL)}" style="color:#aaaaaa;text-decoration:none;">${escapeHtml(NETPAY_SITE_URL)}</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textActivities = shownActivities.length
    ? shownActivities
        .map(
          (activity) =>
            `${formatDate(activity.date)} | ${formatActivityType(activity.type)} | ${activity.status || "—"} | ${activity.description || activity.reference || "—"} | ${formatNaira(Number(activity.amount) || 0)} | ${activity.reference || ""}`,
        )
        .join("\n")
    : "No account activity was found for this profile.";

  const text = [
    "Your NetPay account has been closed",
    "",
    `Hello ${greetingName},`,
    "",
    "A NetPay administrator closed your account. You can no longer sign in or use NetPay services with this profile.",
    reason ? `Reason: ${reason}` : "",
    "",
    "Account summary",
    `Email: ${email}`,
    phone ? `Phone: ${phone}` : "",
    `Wallet balance at closure: ${formatNaira(balance)}`,
    `Recorded activities: ${transactionCount}`,
    `Account created: ${formatDate(createdAt)}`,
    `Closed on: ${formatDate(closedAt)}`,
    "",
    "Account activity log",
    textActivities,
    extraCount > 0
      ? `Showing the ${shownActivities.length} most recent activities in this email. The attached CSV contains all ${activities.length} recorded activities.`
      : "A CSV copy of this activity log is attached.",
    "",
    "If you did not expect this, contact support@netppay.com.",
  ]
    .filter((line) => line !== "")
    .join("\n");

  return { html, text };
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildAccountActivityCsv(params: AccountClosedEmailParams): string {
  const header = [
    "Date",
    "Type",
    "Status",
    "Details",
    "Amount (NGN)",
    "Balance After (NGN)",
    "Reference",
  ].join(",");

  const rows = params.activities.map((activity) =>
    [
      csvEscape(formatDate(activity.date)),
      csvEscape(formatActivityType(activity.type)),
      csvEscape(activity.status ? formatActivityType(activity.status) : ""),
      csvEscape(activity.description || ""),
      (Number(activity.amount) || 0).toFixed(2),
      activity.balance_after == null ? "" : Number(activity.balance_after).toFixed(2),
      csvEscape(activity.reference || ""),
    ].join(","),
  );

  return [header, ...rows].join("\n");
}

export function encodeCsvAttachment(csv: string): string {
  const bytes = new TextEncoder().encode(csv);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
