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
<script>
window.__netpayRender = (root, data) => {
  const rows = data.summary_rows || [];
  const htmlRows = rows.map(r => '<div class="row"><span class="muted">' + (r.label||'') + '</span><span>' + (r.value||'') + '</span></div>').join('');
  root.innerHTML = '<div class="label">Confirm</div><div class="value">' + (data.title || 'Confirm transaction') + '</div>' +
    htmlRows +
    '<p class="muted" style="margin-top:10px">Confirmation ID: ' + (data.confirmation_id || '') + '</p>' +
    '<button id="confirmBtn">Confirm payment</button>';
  const btn = document.getElementById('confirmBtn');
  if (btn) btn.onclick = async () => {
    btn.disabled = true; btn.textContent = 'Confirming…';
    try {
      await window.openai?.callTool('confirm_transaction', { confirmation_id: data.confirmation_id });
    } catch (e) {
      btn.disabled = false; btn.textContent = 'Confirm payment';
    }
  };
};
</script>`,
    ),
  },
  receipt: {
    uri: "ui://widget/netpay-receipt.html",
    name: "Receipt",
    html: shell(
      "NetPay Receipt",
      `<div class="panel" id="root"></div>
<script>
window.__netpayRender = (root, data) => {
  const st = String(data.status || 'PENDING').toUpperCase();
  const cls = st === 'SUCCESS' ? 'ok' : st === 'FAILED' ? 'fail' : 'pending';
  root.innerHTML = '<div class="label">Receipt</div><div class="value">' + (data.title || 'Transaction') + '</div>' +
    '<p><span class="status ' + cls + '">' + st + '</span></p>' +
    '<div class="row"><span class="muted">Amount</span><span>₦' + Number(data.amount||0).toLocaleString('en-NG') + '</span></div>' +
    '<div class="row"><span class="muted">Reference</span><span>' + (data.reference || '—') + '</span></div>' +
    '<div class="row"><span class="muted">Provider ref</span><span>' + (data.provider_reference || '—') + '</span></div>' +
    '<div class="row"><span class="muted">When</span><span>' + (data.datetime || new Date().toLocaleString()) + '</span></div>' +
    (data.message ? '<p class="muted" style="margin-top:10px">' + data.message + '</p>' : '');
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
  root.innerHTML = '<div class="label">Recent activity</div>' + items.slice(0, 8).map(tx =>
    '<div class="list-item"><div style="display:flex;justify-content:space-between"><strong>' + (tx.description || tx.category || 'Transaction') + '</strong><span>₦' + Number(tx.amount||0).toLocaleString('en-NG') + '</span></div><div class="muted">' + (tx.status || '') + ' · ' + (tx.created_at || tx.formattedDateTime || '') + '</div></div>'
  ).join('');
};
</script>`,
    ),
  },
} as const;

export type WidgetKey = keyof typeof WIDGETS;
