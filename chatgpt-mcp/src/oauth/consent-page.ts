import { env } from "../env.js";

type ConsentQuery = Record<string, unknown>;

function first(value: unknown): string {
  if (Array.isArray(value)) return String(value[0] || "");
  return value == null ? "" : String(value);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Self-contained NetPay consent UI hosted on the MCP origin.
 * Matches app/website login branding (light shell, orange CTAs, logo).
 */
export function renderConsentPageHtml(query: ConsentQuery): string {
  const params = {
    client_id: first(query.client_id),
    redirect_uri: first(query.redirect_uri),
    response_type: first(query.response_type) || "code",
    state: first(query.state),
    scope: first(query.scope) || "netpay",
    code_challenge: first(query.code_challenge),
    code_challenge_method: first(query.code_challenge_method) || "S256",
    resource: first(query.resource) || `${env.mcpPublicUrl}/mcp`,
  };

  const siteBase = (env.siteUrl || "https://netppay.com").replace(/\/$/, "");
  const logoUrl = `${siteBase}/logo.png`;

  const boot = {
    supabaseUrl: env.supabaseUrl(),
    supabaseAnonKey: env.supabaseAnonKey(),
    completeUrl: `${env.mcpPublicUrl}/oauth/consent/complete`,
    params,
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#FF7F00" />
  <title>Authorize ChatGPT · NetPay</title>
  <link rel="icon" href="${escapeHtml(logoUrl)}" />
  <style>
    :root {
      --brand: #FF7F00;
      --brand-deep: #E86F00;
      --brand-soft: #FFF3E8;
      --navy: #1A2B4A;
      --bg: #F8F9FC;
      --card: #FFFFFF;
      --text: #333333;
      --muted: #666666;
      --border: #E0E0E0;
      --input: #F5F5F5;
      --err: #D32F2F;
      --ok: #2E7D32;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background:
        radial-gradient(1200px 500px at 10% -10%, rgba(255,127,0,0.12), transparent 55%),
        radial-gradient(900px 420px at 100% 0%, rgba(26,43,74,0.06), transparent 50%),
        var(--bg);
      color: var(--text);
    }
    .page {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 28px 16px 40px;
    }
    .panel {
      width: 100%;
      max-width: 440px;
      background: var(--card);
      border-radius: 20px;
      box-shadow: 0 10px 30px rgba(26, 43, 74, 0.08);
      padding: 36px 28px 28px;
    }
    .logo-wrap { text-align: center; margin-bottom: 8px; }
    .logo {
      width: 112px;
      height: 112px;
      object-fit: contain;
      display: inline-block;
    }
    h1 {
      margin: 12px 0 0;
      text-align: center;
      font-size: 24px;
      line-height: 1.25;
      color: var(--navy);
      font-weight: 700;
    }
    .sub {
      color: var(--muted);
      font-size: 15px;
      line-height: 1.45;
      text-align: center;
      margin: 8px 0 0;
    }
    .card {
      background: var(--brand-soft);
      border: 1px solid #FFE0C2;
      border-radius: 14px;
      padding: 16px;
      margin: 22px 0 16px;
    }
    .card h2 {
      margin: 0 0 10px;
      font-size: 15px;
      color: var(--navy);
      font-weight: 700;
    }
    .card ul { margin: 0; padding-left: 18px; }
    .card li {
      color: var(--text);
      margin: 0 0 8px;
      line-height: 1.4;
      font-size: 14px;
    }
    .card li:last-child { margin-bottom: 0; }
    .note {
      color: var(--muted);
      font-size: 12px;
      margin: 12px 0 0;
      line-height: 1.4;
    }
    .error { color: var(--err); text-align: center; margin: 0 0 12px; font-size: 14px; }
    .ok { color: var(--ok); text-align: center; margin: 0 0 12px; font-size: 14px; }
    label { display: block; color: var(--muted); font-size: 13px; margin: 0 0 6px; font-weight: 600; }
    .field { margin-bottom: 12px; }
    input {
      width: 100%;
      border-radius: 12px;
      border: 1px solid var(--border);
      background: var(--input);
      color: var(--text);
      padding: 14px 16px;
      font-size: 16px;
      outline: none;
      transition: border-color .15s ease, box-shadow .15s ease;
    }
    input:focus {
      border-color: var(--brand);
      box-shadow: 0 0 0 3px rgba(255,127,0,0.18);
      background: #fff;
    }
    button {
      width: 100%;
      border: 0;
      border-radius: 12px;
      padding: 15px 14px;
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
      transition: transform .08s ease, background .15s ease, opacity .15s ease;
    }
    button:active { transform: translateY(1px); }
    button:disabled { opacity: .55; cursor: not-allowed; }
    .primary {
      background: var(--brand);
      color: #fff;
      margin-bottom: 10px;
    }
    .primary:hover:not(:disabled) { background: var(--brand-deep); }
    .secondary {
      background: #fff;
      color: var(--navy);
      border: 1.5px solid var(--border) !important;
    }
    .secondary:hover:not(:disabled) { border-color: var(--brand) !important; color: var(--brand); }
    .hidden { display: none !important; }
    .center {
      text-align: center;
      color: var(--muted);
      padding: 64px 16px;
    }
    .spinner {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      border: 3px solid #FFE0C2;
      border-top-color: var(--brand);
      margin: 0 auto 12px;
      animation: spin .8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .footer {
      margin-top: 18px;
      text-align: center;
      color: var(--muted);
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="page">
    <div id="boot" class="center">
      <div class="spinner" aria-hidden="true"></div>
      Preparing secure ChatGPT connect…
    </div>
    <div id="app" class="panel hidden">
      <div class="logo-wrap">
        <img class="logo" src="${escapeHtml(logoUrl)}" alt="NetPay" width="112" height="112" />
      </div>
      <h1>Authorize ChatGPT</h1>
      <p id="subtitle" class="sub">Review what ChatGPT can do with your NetPay account.</p>

      <div class="card">
        <h2>ChatGPT is requesting</h2>
        <ul>
          <li>View your profile, wallet balance, and funding details</li>
          <li>View recent transactions</li>
          <li>Prepare airtime, data, bills, education, and transfers</li>
          <li>Complete payments only after you confirm in ChatGPT</li>
        </ul>
        <p class="note">Scope: ${escapeHtml(params.scope)} · Money never moves on this screen alone.</p>
      </div>

      <div id="loginBox" class="hidden">
        <div class="field">
          <label for="email">Email address</label>
          <input id="email" type="email" autocomplete="username" placeholder="Email address" />
        </div>
        <div class="field">
          <label for="password">Password</label>
          <input id="password" type="password" autocomplete="current-password" placeholder="Password" />
        </div>
        <button id="signInBtn" class="primary" type="button">Sign in to continue</button>
      </div>

      <p id="error" class="error hidden"></p>
      <p id="status" class="ok hidden"></p>

      <button id="authorizeBtn" class="primary" type="button">Authorize</button>
      <button id="cancelBtn" class="secondary" type="button">Cancel</button>
      <p class="footer">Secured by NetPay</p>
    </div>
  </div>

  <script type="application/json" id="netpay-boot">${JSON.stringify(boot).replace(/</g, "\\u003c")}</script>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.80.0/dist/umd/supabase.min.js"></script>
  <script>
    (function () {
      var boot = JSON.parse(document.getElementById("netpay-boot").textContent);
      var params = boot.params || {};
      function redirectAllowed(uri) {
        try {
          var u = new URL(uri);
          if (u.protocol !== "https:") return false;
          var host = u.hostname;
          var path = u.pathname;
          if (host !== "chatgpt.com" && host !== "chat.openai.com" && !host.endsWith(".chatgpt.com") && !host.endsWith(".openai.com")) {
            return false;
          }
          return (
            path === "/connector_platform_oauth_redirect" ||
            path === "/connector/oauth/callback" ||
            /^\\/connector\\/oauth\\/[^/]+\\/callback$/.test(path) ||
            /^\\/aip\\/[^/]+\\/oauth\\/callback$/.test(path)
          );
        } catch (e) {
          return false;
        }
      }

      function $(id) { return document.getElementById(id); }
      function show(el, on) { el.classList.toggle("hidden", !on); }
      function setError(msg) {
        var el = $("error");
        el.textContent = msg || "";
        show(el, !!msg);
      }
      function setStatus(msg) {
        var el = $("status");
        el.textContent = msg || "";
        show(el, !!msg);
      }

      var paramError = null;
      if (!params.client_id) paramError = "Missing client_id. Restart connect from ChatGPT.";
      else if (!params.redirect_uri) paramError = "Missing redirect_uri. Restart connect from ChatGPT.";
      else if (!redirectAllowed(params.redirect_uri)) paramError = "This redirect_uri is not allowed for NetPay ChatGPT linking.";
      else if (params.response_type && params.response_type !== "code") paramError = "Unsupported response_type. NetPay only supports authorization code.";
      else if (!params.code_challenge) paramError = "Missing PKCE code_challenge. Restart connect from ChatGPT.";
      else if (params.code_challenge_method !== "S256") paramError = "PKCE code_challenge_method must be S256.";

      show($("boot"), false);
      show($("app"), true);

      if (paramError) {
        setError(paramError);
        $("authorizeBtn").disabled = true;
        $("cancelBtn").disabled = true;
        return;
      }

      var supabase = window.supabase.createClient(boot.supabaseUrl, boot.supabaseAnonKey);
      var session = null;
      var busy = false;

      function setBusy(on) {
        busy = on;
        $("authorizeBtn").disabled = on || !session;
        $("cancelBtn").disabled = on;
        $("signInBtn").disabled = on;
      }

      function applySession(next) {
        session = next;
        if (session && session.user) {
          show($("loginBox"), false);
          $("subtitle").textContent = "Signed in as " + (session.user.email || session.user.id) + ". Review what ChatGPT can do with your NetPay account.";
          $("authorizeBtn").disabled = false;
        } else {
          show($("loginBox"), true);
          $("subtitle").textContent = "Sign in to NetPay, then authorize ChatGPT.";
          $("authorizeBtn").disabled = true;
        }
      }

      async function complete(approved) {
        if (busy) return;
        if (!approved && !redirectAllowed(params.redirect_uri)) {
          setError("Cannot cancel: redirect_uri is not allowed.");
          return;
        }
        if (approved && (!session || !session.access_token || !session.refresh_token)) {
          setError("Sign in to NetPay before authorizing.");
          return;
        }
        setBusy(true);
        setError("");
        setStatus(approved ? "Authorizing…" : "Cancelling…");
        try {
          var body = {
            approved: !!approved,
            client_id: params.client_id,
            redirect_uri: params.redirect_uri,
            state: params.state,
            code_challenge: params.code_challenge,
            code_challenge_method: params.code_challenge_method,
            scope: params.scope,
            resource: params.resource
          };
          if (approved) {
            body.supabase_access_token = session.access_token;
            body.supabase_refresh_token = session.refresh_token;
          }
          var res = await fetch(boot.completeUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
          });
          var payload = await res.json();
          if (!res.ok || !payload.redirect_to) {
            throw new Error(payload.error_description || payload.error || "Consent failed");
          }
          var target = new URL(payload.redirect_to);
          var hostOk =
            target.protocol === "https:" &&
            (target.hostname === "chatgpt.com" ||
              target.hostname.endsWith(".chatgpt.com") ||
              target.hostname === "chat.openai.com" ||
              target.hostname.endsWith(".openai.com"));
          if (!hostOk) throw new Error("OAuth redirect target rejected for safety.");
          window.location.href = payload.redirect_to;
        } catch (err) {
          setStatus("");
          setError(err && err.message ? err.message : "Unable to complete consent");
          setBusy(false);
        }
      }

      $("signInBtn").addEventListener("click", async function () {
        setError("");
        setBusy(true);
        try {
          var email = $("email").value.trim();
          var password = $("password").value;
          var result = await supabase.auth.signInWithPassword({ email: email, password: password });
          if (result.error) throw result.error;
          applySession(result.data.session);
          setStatus("Signed in.");
        } catch (err) {
          setError(err && err.message ? err.message : "Sign-in failed");
        } finally {
          setBusy(false);
        }
      });

      $("authorizeBtn").addEventListener("click", function () { complete(true); });
      $("cancelBtn").addEventListener("click", function () { complete(false); });
      $("password").addEventListener("keydown", function (e) {
        if (e.key === "Enter") $("signInBtn").click();
      });

      supabase.auth.getSession().then(function (result) {
        applySession(result.data.session || null);
      });
    })();
  </script>
</body>
</html>`;
}
