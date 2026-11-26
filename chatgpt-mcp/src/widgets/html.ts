/** NetPay-branded ChatGPT Apps SDK widgets (inline HTML + skybridge). */

const BRAND = "#FF7F00";
const BG = "#0f1115";
const CARD = "#1a1d24";
const TEXT = "#f5f5f5";
const MUTED = "#9aa3b2";

function shell(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: dark; --brand:${BRAND}; --bg:${BG}; --card:${CARD}; --text:${TEXT}; --muted:${MUTED}; }
    * { box-sizing: border-box; }
    body { margin:0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: linear-gradient(160deg,#1a1208 0%, var(--bg) 45%, #0b0d12 100%); color: var(--text); padding: 16px; }
    .brand { display:flex; align-items:center; gap:10px; margin-bottom:14px; }
    .mark { width:28px; height:28px; border-radius:8px; background: var(--brand); display:grid; place-items:center; font-weight:800; color:#111; }
    .brand-name { font-size:18px; font-weight:700; letter-spacing:-0.02em; }
    .panel { background: rgba(26,29,36,0.92); border:1px solid rgba(255,127,0,0.22); border-radius:16px; padding:16px; }
    .label { color: var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:4px; }
    .value { font-size:20px; font-weight:650; }
    .row { display:flex; justify-content:space-between; gap:12px; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.06); }
    .row:last-child { border-bottom:none; }
    .muted { color: var(--muted); font-size:13px; }
    .status { display:inline-block; padding:4px 10px; border-radius:999px; font-size:12px; font-weight:600; background:rgba(255,127,0,0.15); color: var(--brand); }
    .status.ok { background:rgba(34,197,94,0.15); color:#4ade80; }
    .status.fail { background:rgba(239,68,68,0.15); color:#f87171; }
    .status.pending { background:rgba(234,179,8,0.15); color:#facc15; }
    button { appearance:none; border:0; border-radius:12px; padding:12px 16px; font-weight:650; cursor:pointer; background: var(--brand); color:#111; width:100%; margin-top:12px; }
    button.secondary { background: transparent; border:1px solid rgba(255,255,255,0.18); color: var(--text); }
    .list-item { padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.06); }
  </style>
</head>
<body>
  <div class="brand"><div class="mark">N</div><div class="brand-name">NetPay</div></div>
  ${body}
  <script>
    function readOutput() {
      try { return window.openai?.toolOutput || {}; } catch { return {}; }
    }
    function render() {
      const data = readOutput();
      const root = document.getElementById('root');
      if (!root || typeof window.__netpayRender !== 'function') return;
      window.__netpayRender(root, data);
    }
    window.addEventListener('openai:set_globals', render);
    document.addEventListener('DOMContentLoaded', render);
  </script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const WIDGETS = {
  connect: {
    uri: "ui://widget/netpay-connect.html",
    name: "NetPay Connect",
    html: shell(
      "Connect NetPay",
      `<div class="panel" id="root"></div>
<script>
window.__netpayRender = (root, data) => {
  const connected = Boolean(data.connected);
  root.innerHTML = connected
    ? '<div class="label">Account</div><div class="value">Connected</div><p class="muted">Your NetPay wallet is linked to ChatGPT.</p>'
    : '<div class="label">Account</div><div class="value">Connect NetPay</div><p class="muted">Link your NetPay account to check balance, buy airtime, pay bills, and transfer.</p>';
};
</script>`,
    ),
  },
  balance: {
    uri: "ui://widget/netpay-balance.html",
    name: "Wallet Balance",
    html: shell(
      "NetPay Balance",
      `<div class="panel" id="root"></div>
<script>
window.__netpayRender = (root, data) => {
  const bal = Number(data.balance ?? data.wallet_balance ?? 0);
  const name = data.full_name || data.email || 'Wallet';
  root.innerHTML = '<div class="label">Available balance</div><div class="value">₦' + bal.toLocaleString('en-NG', { minimumFractionDigits: 2 }) + '</div><p class="muted">' + String(name) + '</p>';
};
</script>`,
    ),
  },
  confirmation: {
    uri: "ui://widget/netpay-confirmation.html",
    name: "Confirm Transaction",
    html: shell(
      "Confirm Payment",
      `<div class="panel" id="root"></div>
<style>
  .pin-error { color:#f87171; font-size:13px; margin-top:8px; min-height:18px; }
  .pin-modal-backdrop {
    position: fixed; inset: 0; background: rgba(0,0,0,0.62); display:none; align-items:center; justify-content:center;
    padding: 16px; z-index: 50;
  }
  .pin-modal-backdrop.open { display:flex; }
  .pin-modal {
    width: min(360px, 100%); background: #1a1d24; border: 1px solid rgba(255,127,0,0.35);
    border-radius: 18px; padding: 18px 16px 16px; box-shadow: 0 18px 50px rgba(0,0,0,0.45);
  }
  .pin-modal h3 { margin: 0 0 6px; font-size: 18px; }
  .pin-modal p { margin: 0 0 12px; color: var(--muted); font-size: 13px; line-height: 1.4; }
  .pin-modal label { display:block; color: var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:6px; }
  .pin-modal input {
    width:100%; padding:14px 12px; border-radius:12px; border:1px solid rgba(255,127,0,0.4);
    background: rgba(0,0,0,0.28); color: var(--text); font-size:24px; letter-spacing:0.4em; text-align:center;
  }
  .pin-modal .actions { display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-top:12px; }
  .pin-modal .actions button { margin-top:0; }
  .secure-note { margin-top:10px; color: var(--muted); font-size:12px; }
</style>
<script>
async function sha256Hex(text) {
  const data = new TextEncoder().encode(String(text));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
window.__netpayRender = (root, data) => {
  const rows = data.summary_rows || [];
  const htmlRows = rows.map(r => '<div class="row"><span class="muted">' + (r.label||'') + '</span><span>' + (r.value||'') + '</span></div>').join('');
  root.innerHTML = '<div class="label">Confirm</div><div class="value">' + (data.title || 'Confirm transaction') + '</div>' +
    htmlRows +
    '<p class="secure-note">Your PIN is entered in a secure modal and hashed on-device. ChatGPT never receives the raw PIN.</p>' +
    '<button id="openPinBtn" type="button">Enter PIN to confirm</button>' +
    '<div class="pin-modal-backdrop" id="pinModal" role="dialog" aria-modal="true" aria-labelledby="pinModalTitle">' +
      '<div class="pin-modal">' +
        '<h3 id="pinModalTitle">Enter NetPay PIN</h3>' +
        '<p>Authorize this payment. Your PIN is hashed locally (SHA-256) before confirmation.</p>' +
        '<label for="pinInput">4-digit PIN</label>' +
        '<input id="pinInput" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="one-time-code" placeholder="••••" />' +
        '<div class="pin-error" id="pinError"></div>' +
        '<div class="actions">' +
          '<button type="button" class="secondary" id="cancelPinBtn">Cancel</button>' +
          '<button type="button" id="confirmPinBtn">Confirm</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  const openBtn = document.getElementById('openPinBtn');
  const modal = document.getElementById('pinModal');
  const pinInput = document.getElementById('pinInput');
  const pinError = document.getElementById('pinError');
  const confirmBtn = document.getElementById('confirmPinBtn');
  const cancelBtn = document.getElementById('cancelPinBtn');

  const closeModal = () => {
    if (modal) modal.classList.remove('open');
    if (pinInput) pinInput.value = '';
    if (pinError) pinError.textContent = '';
  };
  const openModal = () => {
    if (modal) modal.classList.add('open');
    setTimeout(() => { try { pinInput && pinInput.focus(); } catch (_) {} }, 40);
  };

  if (openBtn) openBtn.onclick = openModal;
  if (cancelBtn) cancelBtn.onclick = closeModal;
  if (modal) modal.addEventListener('click', (ev) => { if (ev.target === modal) closeModal(); });

  const submit = async () => {
    let pin = String(pinInput && pinInput.value || '').trim();
    if (!/^[0-9]{4}$/.test(pin)) {
      if (pinError) pinError.textContent = 'Enter your 4-digit NetPay PIN.';
      return;
    }
    if (pinError) pinError.textContent = '';
    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Hashing…'; }
    if (openBtn) openBtn.disabled = true;
    try {
      const pinHash = await sha256Hex(pin);
      // Scrub plaintext PIN from memory ASAP
      pin = '';
      if (pinInput) pinInput.value = '';
      if (confirmBtn) confirmBtn.textContent = 'Confirming…';
      await window.openai?.callTool('confirm_transaction', {
        confirmation_id: data.confirmation_id,
        pin_hash: pinHash,
      });
      closeModal();
    } catch (e) {
      if (pinError) pinError.textContent = (e && e.message) ? String(e.message) : 'Confirmation failed. Check your PIN and try again.';
      if (pinInput) { pinInput.value = ''; pinInput.focus(); }
    } finally {
      if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Confirm'; }
      if (openBtn) openBtn.disabled = false;
    }
  };

  if (confirmBtn) confirmBtn.onclick = submit;
  if (pinInput) pinInput.onkeydown = (ev) => { if (ev.key === 'Enter') submit(); };
};
</script>`,
    ),
  },
  receipt: {
    uri: "ui://widget/netpay-receipt.html",
    name: "Receipt",
    html: shell(
      "NetPay Receipt",
      `<div id="root"></div>
<style>
  .pdf-receipt { background:#fff; color:#1a2b4a; border-radius:12px; overflow:hidden; border:1px solid rgba(255,127,0,0.25); }
  .pdf-header { background:#FF7F00; color:#fff; padding:20px 16px; text-align:center; }
  .pdf-header .brand { font-size:18px; font-weight:800; letter-spacing:0.04em; }
  .pdf-header .sub { margin-top:4px; font-size:11px; letter-spacing:0.08em; text-transform:uppercase; opacity:0.95; }
  .pdf-header .ttl { margin-top:10px; font-size:17px; font-weight:700; }
  .pdf-body { padding:16px; }
  .pdf-amount { font-size:24px; font-weight:800; color:#1a2b4a; }
  .pdf-status { margin-top:6px; color:#FF7F00; font-size:12px; font-weight:700; text-transform:uppercase; }
  .pdf-row { display:flex; justify-content:space-between; gap:12px; padding:10px 0; border-bottom:1px solid #eee8e2; }
  .pdf-row .k { color:#FF7F00; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; min-width:100px; }
  .pdf-row .v { text-align:right; font-size:13px; font-weight:600; word-break:break-word; color:#1a2b4a; white-space:pre-wrap; }
  .pdf-actions { display:grid; gap:8px; margin-top:12px; }
  .pdf-actions button { margin-top:0; }
  @media print {
    body { background:#fff !important; padding:0 !important; }
    .brand, .pdf-actions { display:none !important; }
    .pdf-receipt { border:none !important; border-radius:0 !important; }
  }
</style>
<script>
function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function openReceiptHtml(html, fileName) {
  if (!html) return;
  try {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (win) {
      const trigger = () => { try { win.focus(); win.print(); } catch (_) {} };
      setTimeout(trigger, 500);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return;
    }
  } catch (_) {}
  // Fallback: download HTML (user can Print → Save as PDF)
  try {
    const a = document.createElement('a');
    a.href = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
    a.download = String(fileName || 'NetPay-Receipt.html').replace(/\\.pdf$/i, '.html');
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (_) {}
}
window.__netpayRender = (root, data) => {
  const receipt = data.receipt || data;
  const st = String(receipt.status || data.status || 'PENDING').toUpperCase();
  const title = receipt.title || data.title || 'Transaction';
  const amountText = receipt.amount_display || receipt.amount_text || receipt.amountText || data.amount_display || data.amount_text ||
    (typeof data.amount === 'number' ? ('₦' + Number(data.amount || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })) : (data.amount || '₦0.00'));
  const rows = Array.isArray(receipt.rows) ? receipt.rows
    : Array.isArray(receipt.summary_rows) ? receipt.summary_rows
    : Array.isArray(data.rows) ? data.rows
    : Array.isArray(data.summary_rows) ? data.summary_rows
    : [];
  const fallbackRows = rows.length ? rows : [
    { label: 'Reference', value: receipt.reference || data.reference || '—' },
    { label: 'Provider ref', value: receipt.provider_reference || data.provider_reference || '—' },
    { label: 'When', value: receipt.datetime || data.datetime || new Date().toLocaleString() },
  ];
  const rowsHtml = fallbackRows
    .filter((r) => String(r && r.value || '').trim())
    .map((r) => '<div class="pdf-row"><span class="k">' + esc(r.label) + '</span><span class="v">' + esc(r.value) + '</span></div>')
    .join('');
  root.innerHTML =
    '<div class="pdf-receipt">' +
      '<div class="pdf-header">' +
        '<div class="brand">NETPAY</div>' +
        '<div class="sub">Transaction Receipt</div>' +
        '<div class="ttl">' + esc(title) + '</div>' +
      '</div>' +
      '<div class="pdf-body">' +
        '<div class="pdf-amount">' + esc(amountText) + '</div>' +
        '<div class="pdf-status">' + esc(st) + '</div>' +
        '<div style="margin-top:12px">' + rowsHtml + '</div>' +
        (data.message || receipt.message ? '<p class="muted" style="margin-top:12px;color:#6b7280">' + esc(data.message || receipt.message) + '</p>' : '') +
      '</div>' +
    '</div>' +
    '<div class="pdf-actions">' +
      '<button type="button" id="printPdfBtn">Save / print PDF receipt</button>' +
      '<button type="button" class="secondary" id="downloadHtmlBtn">Download HTML receipt</button>' +
    '</div>';
  const html = data.receipt_html || receipt.receipt_html || '';
  const fileName = data.file_name || receipt.file_name || 'NetPay-Receipt.pdf';
  const printBtn = document.getElementById('printPdfBtn');
  if (printBtn) printBtn.onclick = () => {
    if (html) openReceiptHtml(html, fileName);
    else window.print();
  };
  const dlBtn = document.getElementById('downloadHtmlBtn');
  if (dlBtn) dlBtn.onclick = () => {
    if (!html) { window.print(); return; }
    try {
      const a = document.createElement('a');
      a.href = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
      a.download = String(fileName).replace(/\\.pdf$/i, '.html');
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (_) { openReceiptHtml(html, fileName); }
  };
};
</script>`,
    ),
  },
  transactions: {
    uri: "ui://widget/netpay-transactions.html",
    name: "Transactions",
    html: shell(
      "Recent Transactions",
      `<div class="panel" id="root"></div>
<script>
window.__netpayRender = (root, data) => {
  const items = Array.isArray(data.transactions) ? data.transactions : [];
  if (!items.length) {
    root.innerHTML = '<div class="label">Activity</div><div class="value">No recent transactions</div>';
    return;
  }
  root.innerHTML = '<div class="label">Recent activity</div>' + items.slice(0, 8).map((tx, i) =>
    '<div class="list-item" data-idx="' + i + '" style="cursor:pointer">' +
      '<div style="display:flex;justify-content:space-between"><strong>' + (tx.description || tx.category || 'Transaction') + '</strong><span>₦' + Number(tx.amount||0).toLocaleString('en-NG') + '</span></div>' +
      '<div class="muted">' + (tx.status || '') + ' · ' + (tx.created_at || tx.formattedDateTime || '') + '</div>' +
      '<div class="muted" style="margin-top:4px;color:var(--brand)">View receipt</div>' +
    '</div>'
  ).join('');
  root.querySelectorAll('.list-item').forEach((el) => {
    el.onclick = async () => {
      const idx = Number(el.getAttribute('data-idx'));
      const tx = items[idx];
      if (!tx || !tx.id) return;
      try {
        await window.openai?.callTool('get_transaction_receipt', { id: tx.id, category: tx.category });
      } catch (_) {}
    };
  });
};
</script>`,
    ),
  },
} as const;

export type WidgetKey = keyof typeof WIDGETS;
