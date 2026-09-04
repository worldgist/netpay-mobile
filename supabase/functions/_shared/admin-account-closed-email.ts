import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";
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

/**
 * HTML email template for account closure.
 * Activity details are intentionally omitted — they ship as a PDF attachment.
 */
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
  } = params;

  const greetingName = fullName.trim() || email;
  const logoUrl = Deno.env.get("NETPAY_LOGO_URL") || `${NETPAY_SITE_URL}/logo.png`;
  const activityLabel = transactionCount === 1 ? "1 activity" : `${transactionCount} activities`;

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

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Your NetPay account has been closed</title>
  <style>
    @media only screen and (max-width: 620px) {
      .container { width: 100% !important; }
      .content { padding: 28px 20px !important; }
      .title { font-size: 24px !important; line-height: 30px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f5f7fb;font-family:Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased;">

  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
    Your NetPay account has been closed. Your full account activity log is attached as a PDF.
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f7fb;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,0.08);">

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
            <td class="content" style="padding:0 40px 28px;">
              <h1 class="title" style="margin:0 0 12px;color:#111827;font-size:26px;line-height:32px;">Your NetPay account has been closed</h1>
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
                    <p style="margin:0 0 6px;color:#475569;font-size:14px;">Recorded activities: <strong style="color:#111827;">${escapeHtml(String(transactionCount))}</strong></p>
                    <p style="margin:0 0 6px;color:#475569;font-size:14px;">Account created: <strong style="color:#111827;">${escapeHtml(formatDate(createdAt))}</strong></p>
                    <p style="margin:0;color:#475569;font-size:14px;">Closed on: <strong style="color:#111827;">${escapeHtml(formatDate(closedAt))}</strong></p>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;background-color:#EEF2FF;border:1px solid #C7D2FE;border-radius:14px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 6px;color:#312E81;font-size:14px;font-weight:bold;">Account activity PDF</p>
                    <p style="margin:0;color:#3730A3;font-size:14px;line-height:22px;">
                      A PDF of your full account activity log (${escapeHtml(activityLabel)}) is attached to this email for your records.
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin:0;color:#4B5563;font-size:14px;line-height:22px;">
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

  const text = [
    "Your NetPay account has been closed",
    "",
    `Hello ${greetingName},`,
    "",
    "A NetPay administrator closed your account. You can no longer sign in or use NetPay services with this profile.",
    reason ? `Reason: ${reason}` : null,
    "",
    "Account summary",
    `Email: ${email}`,
    phone ? `Phone: ${phone}` : null,
    `Wallet balance at closure: ${formatNaira(balance)}`,
    `Recorded activities: ${transactionCount}`,
    `Account created: ${formatDate(createdAt)}`,
    `Closed on: ${formatDate(closedAt)}`,
    "",
    "Your full account activity log is attached to this email as a PDF.",
    "",
    "If you did not expect this, contact support@netppay.com.",
  ]
    .filter((line): line is string => line != null && line !== "")
    .join("\n");

  return { html, text };
}

export async function buildAccountActivityPdf(params: AccountClosedEmailParams): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;
  const bottomMargin = 52;
  const orange = rgb(1, 0.5, 0);
  const dark = rgb(0.12, 0.12, 0.12);
  const muted = rgb(0.42, 0.45, 0.5);
  const softBg = rgb(0.98, 0.98, 0.985);
  const headerBg = rgb(0.97, 0.97, 0.98);
  const border = rgb(0.88, 0.9, 0.93);
  const white = rgb(1, 1, 1);
  const debit = rgb(0.72, 0.11, 0.11);
  const credit = rgb(0.09, 0.48, 0.24);

  const sanitize = (text: string) => text.replace(/₦/g, "NGN").replace(/[^\x20-\x7E]/g, " ");

  // Column layout (A4 portrait) — keeps headers/values aligned.
  const columns = [
    { key: "date", label: "Date", x: margin, width: 88 },
    { key: "type", label: "Type", x: margin + 90, width: 78 },
    { key: "details", label: "Details / Reference", x: margin + 172, width: 168 },
    { key: "status", label: "Status", x: margin + 344, width: 62 },
    { key: "amount", label: "Amount", x: margin + 410, width: 105, align: "right" as const },
  ];

  let logoImage: Awaited<ReturnType<typeof pdfDoc.embedPng>> | null = null;
  try {
    const logoUrl = Deno.env.get("NETPAY_LOGO_URL") || `${NETPAY_SITE_URL}/logo.png`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const response = await fetch(logoUrl, { signal: controller.signal });
    clearTimeout(timeout);
    if (response.ok) {
      const bytes = new Uint8Array(await response.arrayBuffer());
      try {
        logoImage = await pdfDoc.embedPng(bytes);
      } catch {
        try {
          logoImage = await pdfDoc.embedJpg(bytes);
        } catch {
          console.warn("Could not embed NetPay logo in activity PDF");
        }
      }
    }
  } catch (error) {
    console.warn("Failed to fetch NetPay logo for activity PDF:", error);
  }

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight;
  let pageNumber = 1;

  const drawText = (
    text: string,
    x: number,
    textY: number,
    size: number,
    font: typeof boldFont,
    color = dark,
    maxWidth?: number,
  ) => {
    let value = sanitize(text);
    if (maxWidth) {
      while (font.widthOfTextAtSize(value, size) > maxWidth && value.length > 1) {
        value = `${value.slice(0, -2)}…`;
      }
    }
    page.drawText(value, { x, y: textY, size, font, color });
  };

  const drawRightText = (
    text: string,
    rightX: number,
    textY: number,
    size: number,
    font: typeof boldFont,
    color = dark,
  ) => {
    const value = sanitize(text);
    const width = font.widthOfTextAtSize(value, size);
    page.drawText(value, { x: rightX - width, y: textY, size, font, color });
  };

  const drawFooter = () => {
    page.drawLine({
      start: { x: margin, y: 38 },
      end: { x: pageWidth - margin, y: 38 },
      thickness: 0.8,
      color: border,
    });
    drawText(`NetPay · Account activity log · Page ${pageNumber}`, margin, 22, 8, regularFont, muted);
    drawRightText(params.email, pageWidth - margin, 22, 8, regularFont, muted);
  };

  const drawPageHeader = (isFirstPage: boolean) => {
    const headerHeight = isFirstPage ? 92 : 72;
    page.drawRectangle({
      x: 0,
      y: pageHeight - headerHeight,
      width: pageWidth,
      height: headerHeight,
      color: orange,
    });

    let titleX = margin;
    if (logoImage) {
      const logoHeight = isFirstPage ? 36 : 28;
      const scale = logoHeight / logoImage.height;
      const logoWidth = logoImage.width * scale;
      page.drawImage(logoImage, {
        x: margin,
        y: pageHeight - headerHeight / 2 - logoHeight / 2,
        width: logoWidth,
        height: logoHeight,
      });
      titleX = margin + logoWidth + 14;
    }

    drawText("NETPAY", titleX, pageHeight - (isFirstPage ? 38 : 32), isFirstPage ? 22 : 18, boldFont, white);
    drawText(
      "Account Activity Log",
      titleX,
      pageHeight - (isFirstPage ? 58 : 50),
      isFirstPage ? 12 : 10,
      boldFont,
      white,
    );
    drawRightText(
      formatDate(params.closedAt),
      pageWidth - margin,
      pageHeight - (isFirstPage ? 42 : 36),
      9,
      regularFont,
      white,
    );

    y = pageHeight - headerHeight - 24;
  };

  const drawTableHeader = () => {
    page.drawRectangle({
      x: margin,
      y: y - 8,
      width: contentWidth,
      height: 24,
      color: headerBg,
      borderColor: border,
      borderWidth: 1,
    });

    for (const column of columns) {
      const labelY = y;
      if (column.align === "right") {
        drawRightText(column.label, column.x + column.width - 6, labelY, 8, boldFont, muted);
      } else {
        drawText(column.label, column.x + 6, labelY, 8, boldFont, muted, column.width - 10);
      }
    }
    y -= 28;
  };

  const ensureSpace = (needed: number) => {
    if (y - needed >= bottomMargin) return;
    drawFooter();
    page = pdfDoc.addPage([pageWidth, pageHeight]);
    pageNumber += 1;
    drawPageHeader(false);
    drawTableHeader();
  };

  drawPageHeader(true);

  // Summary card
  const summaryRows: Array<[string, string]> = [
    ["Account name", params.fullName.trim() || "—"],
    ["Email", params.email],
    ...(params.phone ? [["Phone", params.phone] as [string, string]] : []),
    ["Wallet balance at closure", formatNaira(params.balance)],
    ["Recorded activities", String(params.transactionCount)],
    ["Account created", formatDate(params.createdAt)],
    ["Closed on", formatDate(params.closedAt)],
    ...(params.reason ? [["Reason", params.reason] as [string, string]] : []),
  ];

  const summaryHeight = 28 + summaryRows.length * 16;
  page.drawRectangle({
    x: margin,
    y: y - summaryHeight,
    width: contentWidth,
    height: summaryHeight,
    color: softBg,
    borderColor: border,
    borderWidth: 1,
  });

  drawText("Account closure summary", margin + 12, y - 16, 11, boldFont, orange);
  let summaryY = y - 34;
  const labelWidth = 150;
  for (const [label, value] of summaryRows) {
    drawText(`${label}:`, margin + 12, summaryY, 9, regularFont, muted, labelWidth);
    drawText(value, margin + 12 + labelWidth, summaryY, 9, boldFont, dark, contentWidth - labelWidth - 28);
    summaryY -= 16;
  }
  y -= summaryHeight + 22;

  drawText("Activity history", margin, y, 12, boldFont, dark);
  y -= 18;
  drawTableHeader();

  if (!params.activities.length) {
    page.drawRectangle({
      x: margin,
      y: y - 28,
      width: contentWidth,
      height: 36,
      color: softBg,
      borderColor: border,
      borderWidth: 1,
    });
    drawText("No account activity was found for this profile.", margin + 12, y - 14, 10, regularFont, muted);
    y -= 44;
  } else {
    let rowIndex = 0;
    for (const activity of params.activities) {
      ensureSpace(30);
      const rowHeight = 26;
      const rowTop = y + 10;

      if (rowIndex % 2 === 0) {
        page.drawRectangle({
          x: margin,
          y: rowTop - rowHeight,
          width: contentWidth,
          height: rowHeight,
          color: softBg,
        });
      }

      const amount = Number(activity.amount) || 0;
      const details = [activity.description, activity.reference].filter(Boolean).join(" · ") || "—";
      const cells = {
        date: formatDate(activity.date),
        type: formatActivityType(activity.type),
        details,
        status: activity.status ? formatActivityType(activity.status) : "—",
        amount: formatNaira(amount),
      };

      for (const column of columns) {
        const value = cells[column.key as keyof typeof cells];
        if (column.align === "right") {
          drawRightText(
            value,
            column.x + column.width - 6,
            y,
            8,
            regularFont,
            column.key === "amount" ? (amount < 0 ? debit : credit) : dark,
          );
        } else {
          drawText(value, column.x + 6, y, 8, regularFont, dark, column.width - 10);
        }
      }

      page.drawLine({
        start: { x: margin, y: rowTop - rowHeight },
        end: { x: pageWidth - margin, y: rowTop - rowHeight },
        thickness: 0.5,
        color: border,
      });

      y -= rowHeight;
      rowIndex += 1;
    }
  }

  drawFooter();
  return await pdfDoc.save();
}

export function encodePdfAttachment(pdfBytes: Uint8Array): string {
  let binary = "";
  for (const byte of pdfBytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/** @deprecated Prefer PDF attachment via buildAccountActivityPdf */
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

  const rows = params.activities.map((activity) => {
    const escape = (value: string) =>
      /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
    return [
      escape(formatDate(activity.date)),
      escape(formatActivityType(activity.type)),
      escape(activity.status ? formatActivityType(activity.status) : ""),
      escape(activity.description || ""),
      (Number(activity.amount) || 0).toFixed(2),
      activity.balance_after == null ? "" : Number(activity.balance_after).toFixed(2),
      escape(activity.reference || ""),
    ].join(",");
  });

  return [header, ...rows].join("\n");
}

/** @deprecated Prefer encodePdfAttachment */
export function encodeCsvAttachment(csv: string): string {
  const bytes = new TextEncoder().encode(csv);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
