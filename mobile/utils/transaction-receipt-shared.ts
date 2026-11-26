import { NETPAY_LOGO_DATA_URI } from '@/utils/netpay-logo-data-uri';

export type ReceiptPdfRow = {
  label: string;
  value: string;
};

export type TransactionReceiptPdf = {
  title: string;
  amountText: string;
  status: string;
  rows: ReceiptPdfRow[];
  fileName: string;
};

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function generateTransactionReceiptHtml(input: TransactionReceiptPdf) {
  const rowsHtml = input.rows
    .filter((row) => String(row.value || '').trim())
    .map(
      (row) => `
        <div class="info-row">
          <span class="info-label">${escapeHtml(row.label)}</span>
          <span class="info-value">${escapeHtml(row.value)}</span>
        </div>
      `,
    )
    .join('');

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
      }
    </style>
  </head>
  <body>
    <div class="receipt">
      <div class="header">
        <div class="logo-wrap">
          <img src="${NETPAY_LOGO_DATA_URI}" alt="NetPay" />
        </div>
        <div class="brand">NETPAY</div>
        <div class="subtitle">Transaction Receipt</div>
        <div class="title">${escapeHtml(input.title)}</div>
      </div>
      <div class="body">
        <div class="amount">${escapeHtml(input.amountText || 'NGN 0.00')}</div>
        <div class="status">${escapeHtml(input.status || 'Completed')}</div>
        <div style="margin-top: 20px;">${rowsHtml}</div>
        <div class="footer">
          <img class="footer-logo" src="${NETPAY_LOGO_DATA_URI}" alt="NetPay" />
          <div>NetPay</div>
          <div>support@netppay.com</div>
          <div>www.netppay.com</div>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

export function buildShareMessage(input: TransactionReceiptPdf) {
  const lines = [
    'NetPay Transaction Receipt',
    input.title,
    input.amountText,
    `Status: ${input.status}`,
    ...input.rows
      .filter((row) => String(row.value || '').trim())
      .map((row) => `${row.label}: ${row.value}`),
  ];
  return lines.join('\n');
}
