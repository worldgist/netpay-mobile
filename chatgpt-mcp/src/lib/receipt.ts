import { env } from "../env.js";

export type ReceiptRow = { label: string; value: string };

export type TransactionReceipt = {
  title: string;
  amountText: string;
  status: string;
  rows: ReceiptRow[];
  fileName: string;
  reference?: string | null;
  datetime?: string | null;
  category?: string;
};

function escapeHtml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function str(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function formatAmount(amount: number, signed: "credit" | "debit" | "plain" = "plain"): string {
  const abs = Math.abs(Number(amount) || 0).toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (signed === "credit") return `+ NGN ${abs}`;
  if (signed === "debit") return `- NGN ${abs}`;
  return `NGN ${abs}`;
}

function formatDateTime(value: unknown): string {
  const raw = str(value);
  if (!raw) return new Date().toLocaleString("en-NG");
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString("en-NG", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(value: unknown): string {
  const status = str(value).toUpperCase();
  if (!status) return "COMPLETED";
  if (["SUCCESS", "SUCCESSFUL", "COMPLETED", "COMPLETE", "PAID"].includes(status)) return "SUCCESS";
  if (["FAILED", "FAILURE", "ERROR", "DECLINED"].includes(status)) return "FAILED";
  if (["PENDING", "PROCESSING", "INITIATED"].includes(status)) return "PENDING";
  return status;
}

function titleForCategory(category: string, row: Record<string, unknown>): string {
  switch (category) {
    case "airtime":
      return "Airtime Purchase";
    case "data":
      return "Data Bundle";
    case "electricity":
      return `${str(row.provider) || "Electricity"} Purchase`;
    case "cable":
      return `${str(row.provider) || "Cable TV"} Purchase`;
    case "education":
      return `${str(row.exam_type) || "Education"} Purchase`;
    case "betting":
      return `${str(row.provider) || "Betting"} Purchase`;
    case "transfer":
    case "transfer_sent":
      return "Transfer Sent";
    case "transfer_received":
      return "Transfer Received";
    case "funding":
      return "Wallet Funding";
    case "wallet":
      return str(row.description) || str(row.transaction_type) || "Wallet Transaction";
    default:
      return "Transaction Receipt";
  }
}

function pushRow(rows: ReceiptRow[], label: string, value: unknown) {
  const text = str(value);
  if (text) rows.push({ label, value: text });
}

function educationPinText(row: Record<string, unknown>): string {
  const pins = Array.isArray(row.pins) ? row.pins : [];
  if (pins.length) {
    return pins
      .map((entry: unknown, index: number) => {
        const item = (entry || {}) as { Pin?: string; pin?: string; Serial?: string; serial?: string };
        const pin = str(item.Pin || item.pin);
        if (!pin) return "";
        const serial = str(item.Serial || item.serial);
        const label = pins.length > 1 ? `PIN ${index + 1}` : "PIN";
        return serial ? `${label}: ${pin} (Serial ${serial})` : `${label}: ${pin}`;
      })
      .filter(Boolean)
      .join("\n");
  }
  return str(row.pin || row.education_pin || row.token);
}

/** Build a NetPay receipt model from a DB transaction row. */
export function buildReceiptFromTransaction(
  category: string,
  row: Record<string, unknown>,
  opts?: { userId?: string },
): TransactionReceipt {
  const amount = Number(row.amount || 0);
  const isCredit =
    category === "transfer_received" ||
    category === "funding" ||
    str(row.transaction_type).toLowerCase() === "credit" ||
    (category === "transfer" && opts?.userId && str(row.recipient_id) === opts.userId);

  const resolvedCategory =
    category === "transfer" && opts?.userId
      ? str(row.sender_id) === opts.userId
        ? "transfer_sent"
        : "transfer_received"
      : category;

  const rows: ReceiptRow[] = [];
  pushRow(rows, "Service", resolvedCategory.replace(/_/g, " "));
  pushRow(rows, "Provider", row.provider || row.network || row.exam_type);
  pushRow(rows, "Customer name", row.customer_name || row.customerName);
  pushRow(rows, "Customer address", row.customer_address || row.customerAddress);
  pushRow(rows, "Meter number", row.meter_number || row.meterNumber);
  pushRow(rows, "Meter type", row.meter_type || row.meterType);
  pushRow(rows, "Electricity token", row.token || row.electricity_token);
  pushRow(rows, "Phone number", row.phone_number || row.phone);
  pushRow(rows, "Smartcard", row.smartcard_number || row.smartcard);
  pushRow(rows, "Plan", row.plan_name || row.package_name || row.plan);
  pushRow(rows, "Exam", row.exam_type);
  pushRow(rows, "PIN", educationPinText(row));
  pushRow(rows, "Serial", row.serial || row.education_serial);
  pushRow(rows, "Sender", row.sender_email || row.sender_name || row.sender);
  pushRow(rows, "Recipient", row.recipient_email || row.recipient_name || row.recipient);
  pushRow(rows, "Account number", row.account_number || row.accountNumber);
  pushRow(rows, "Bank", row.bank_name || row.bankName);
  pushRow(rows, "Description", row.description);
  pushRow(rows, "Date", formatDateTime(row.created_at || row.datetime));
  pushRow(rows, "Reference", row.reference || row.provider_reference);
  pushRow(rows, "Provider ref", row.provider_reference || row.provider_ref);
  pushRow(rows, "Transaction ID", row.id);

  const reference = str(row.reference) || str(row.id) || "receipt";
  const safeName = reference.replace(/[^a-zA-Z0-9-]/g, "");

  return {
    title: titleForCategory(resolvedCategory, row),
    amountText: formatAmount(amount, isCredit ? "credit" : "debit"),
    status: statusLabel(row.status || row.transaction_type),
    rows,
    fileName: `NetPay-Receipt-${safeName}.pdf`,
    reference: str(row.reference) || null,
    datetime: formatDateTime(row.created_at || row.datetime),
    category: resolvedCategory,
  };
}

/** Build a receipt from a confirm_transaction outcome. */
export function buildReceiptFromConfirm(input: {
  title: string;
  amount: number;
  status: string;
  reference?: string | null;
  provider_reference?: string | null;
  message?: string | null;
  datetime?: string | null;
  summary_rows?: ReceiptRow[];
}): TransactionReceipt {
  const rows: ReceiptRow[] = [...(input.summary_rows || [])];
  pushRow(rows, "Date", formatDateTime(input.datetime || new Date().toISOString()));
  pushRow(rows, "Reference", input.reference);
  pushRow(rows, "Provider ref", input.provider_reference);
  if (input.message) pushRow(rows, "Note", input.message);

  const reference = str(input.reference) || "receipt";
  const safeName = reference.replace(/[^a-zA-Z0-9-]/g, "");

  return {
    title: input.title || "Transaction Receipt",
    amountText: formatAmount(input.amount, "debit"),
    status: statusLabel(input.status),
    rows,
    fileName: `NetPay-Receipt-${safeName}.pdf`,
    reference: input.reference || null,
    datetime: formatDateTime(input.datetime || new Date().toISOString()),
  };
}

/** Printable HTML matching the mobile PDF receipt layout. */
export function generateTransactionReceiptHtml(input: TransactionReceipt): string {
  const logoUrl = `${env.siteUrl}/logo.png`;
  const rowsHtml = input.rows
    .filter((row) => str(row.value))
    .map(
      (row) => `
        <div class="info-row">
          <span class="info-label">${escapeHtml(row.label)}</span>
          <span class="info-value">${escapeHtml(row.value).replace(/\n/g, "<br/>")}</span>
        </div>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(input.title)}</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        background: #fff;
        color: #1a2b4a;
        padding: 24px;
      }
      .receipt {
        max-width: 640px;
        margin: 0 auto;
        border: 1px solid #ece7e1;
        border-radius: 12px;
        overflow: hidden;
      }
      .header {
        background: #FF7F00;
        color: #fff;
        padding: 28px 24px;
        text-align: center;
      }
      .logo-wrap {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 72px;
        height: 72px;
        border-radius: 16px;
        background: #fff;
        margin-bottom: 12px;
        overflow: hidden;
      }
      .logo-wrap img {
        width: 60px;
        height: 60px;
        object-fit: contain;
        display: block;
      }
      .brand {
        font-size: 22px;
        font-weight: 700;
        letter-spacing: 0.04em;
      }
      .subtitle {
        margin-top: 6px;
        font-size: 12px;
        opacity: 0.95;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .title {
        margin-top: 14px;
        font-size: 20px;
        font-weight: 700;
      }
      .body { padding: 24px; }
      .amount {
        font-size: 28px;
        font-weight: 700;
        color: #1a2b4a;
      }
      .status {
        margin-top: 8px;
        display: inline-block;
        color: #FF7F00;
        font-size: 13px;
        font-weight: 700;
        text-transform: uppercase;
      }
      .info-row {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        padding: 14px 0;
        border-bottom: 1px solid #eee8e2;
      }
      .info-label {
        color: #FF7F00;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        min-width: 120px;
      }
      .info-value {
        text-align: right;
        font-size: 14px;
        font-weight: 600;
        color: #1a2b4a;
        word-break: break-word;
      }
      .footer {
        margin-top: 28px;
        color: #6b7280;
        font-size: 12px;
        line-height: 1.5;
        text-align: center;
      }
      .footer-logo {
        width: 36px;
        height: 36px;
        object-fit: contain;
        margin: 0 auto 8px;
        display: block;
      }
      @media print {
        body { padding: 0; }
        .receipt { border: none; border-radius: 0; }
        .no-print { display: none !important; }
      }
    </style>
  </head>
  <body>
    <div class="receipt">
      <div class="header">
        <div class="logo-wrap">
          <img src="${escapeHtml(logoUrl)}" alt="NetPay" />
        </div>
        <div class="brand">NETPAY</div>
        <div class="subtitle">Transaction Receipt</div>
        <div class="title">${escapeHtml(input.title)}</div>
      </div>
      <div class="body">
        <div class="amount">${escapeHtml(input.amountText || "NGN 0.00")}</div>
        <div class="status">${escapeHtml(input.status || "Completed")}</div>
        <div style="margin-top: 20px;">${rowsHtml}</div>
        <div class="footer">
          <img class="footer-logo" src="${escapeHtml(logoUrl)}" alt="NetPay" />
          <div>NetPay</div>
          <div>support@netppay.com</div>
          <div>www.netppay.com</div>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

export function buildShareMessage(input: TransactionReceipt): string {
  return [
    "NetPay Transaction Receipt",
    input.title,
    input.amountText,
    `Status: ${input.status}`,
    ...input.rows.filter((row) => str(row.value)).map((row) => `${row.label}: ${row.value}`),
  ].join("\n");
}

export function receiptStructured(input: TransactionReceipt) {
  const html = generateTransactionReceiptHtml(input);
  return {
    receipt_title: input.title,
    amount_text: input.amountText,
    amount_display: input.amountText,
    receipt_status: input.status,
    receipt_reference: input.reference,
    receipt_datetime: input.datetime,
    receipt_category: input.category,
    rows: input.rows,
    file_name: input.fileName,
    receipt_html: html,
    receipt_text: buildShareMessage(input),
    summary_rows: input.rows,
  };
}
