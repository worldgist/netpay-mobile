# NetPay ChatGPT MCP

ChatGPT Apps SDK / MCP server for NetPay. Reuses existing Supabase Auth, wallet ledger, and edge purchase/transfer APIs. No second financial backend.

- **MCP:** `https://mcp.netppay.com/mcp`
- **Consent UI:** `https://mcp.netppay.com/oauth/consent` (Expo mirrors: `/open/chatgpt-consent`, `/chatgpt/oauth/consent`)
- **Brand:** NetPay orange `#FF7F00`

## Architecture

1. ChatGPT connects via OAuth 2.1 + PKCE to this Node service (Vercel).
2. User signs in on NetPay web and approves scopes on the consent page.
3. MCP stores an **encrypted Supabase refresh token** and issues short-lived MCP JWTs.
4. Tool calls refresh the user session and invoke existing edge functions with `Authorization: Bearer <user JWT>`.
5. Money tools use **prepare → confirm_transaction(pin)** with single-use confirmations, required 4-digit NetPay PIN, and `idempotency_key`.

## Tools

| Tool | Mode |
|------|------|
| `get_profile` | read |
| `get_wallet_balance` | read |
| `get_funding_details` | read |
| `list_transactions` / `get_transaction` / `get_transaction_receipt` | read (+ HTML/PDF receipt) |
| `prepare_airtime_purchase` | prepare |
| `prepare_data_purchase` | prepare |
| `prepare_electricity_payment` | prepare |
| `prepare_cable_payment` | prepare |
| `prepare_education_purchase` | prepare |
| `prepare_transfer` | prepare |
| `confirm_transaction` | write (idempotent; requires 4-digit PIN) |
| `disconnect_account` | revoke OAuth |

Widgets: connect, balance, confirmation, receipt, transactions (`text/html+skybridge`).

## Setup

### 1. Database

Apply migration:

```bash
# from repo root
supabase db push
# or run supabase/migrations/20261126010000_chatgpt_oauth_integration.sql
```

### 2. Env secrets (Vercel project `chatgpt-mcp`)

Copy `.env.example` → set in Vercel:

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `MCP_TOKEN_SIGNING_SECRET`, `MCP_ENCRYPTION_KEY`
- `MCP_PUBLIC_URL=https://mcp.netppay.com`
- `NETPAY_SITE_URL=https://netppay.com`
- `CHATGPT_REDIRECT_URIS` (from ChatGPT connector UI, comma-separated)

### 3. Deploy MCP to Vercel

```bash
cd chatgpt-mcp
npm install
npx vercel --prod
```

Attach custom domain **`mcp.netppay.com`** to the project.

Verify:

- `GET https://mcp.netppay.com/health`
- `GET https://mcp.netppay.com/.well-known/oauth-authorization-server`
- `GET https://mcp.netppay.com/.well-known/oauth-protected-resource`

### 4. Deploy consent routes

Expo web routes under `mobile/app/chatgpt/oauth/` ship with the existing netppay.com web deploy (`consent`, `success`, `error`).

### 5. Connect in ChatGPT

1. ChatGPT → Settings → Connectors / Apps → Add custom MCP server  
2. URL: `https://mcp.netppay.com/mcp`  
3. Complete OAuth (opens NetPay consent)  
4. Test prompts:
   - “What’s my NetPay balance?”
   - “Prepare ₦1000 MTN airtime for 0803…”
   - Confirm the widget, then “confirm the purchase”

### 6. Local dev

```bash
cd chatgpt-mcp
cp .env.example .env   # fill secrets
npm install
npm run dev
```

Use MCP Inspector or ngrok against `http://localhost:3100/mcp`.

## ChatGPT connector checklist

MCP URL to paste in ChatGPT:

`https://mcp.netppay.com/mcp`

Discovery endpoints that must return `200` + `application/json`:

- `https://mcp.netppay.com/.well-known/oauth-protected-resource`
- `https://mcp.netppay.com/.well-known/oauth-protected-resource/mcp`
- `https://mcp.netppay.com/.well-known/oauth-authorization-server`

Client registration: **CIMD preferred** (`client_id_metadata_document_supported: true`) plus **DCR** at `/oauth/register`.  
Redirect allowlist includes `https://chatgpt.com/connector_platform_oauth_redirect` and legacy callback patterns.  
PKCE: **S256 only**. Token auth method: **none** (public client).

## Security notes

- Prepare never debits; only `confirm_transaction` calls purchase/transfer edges, and only after verifying the user's 4-digit NetPay PIN (wrong PIN keeps the confirmation pending; 5 failures suspend the account).
- Confirmations expire in ~10 minutes and are single-use; edge allowlist enforced on confirm.
- Client `vending_provider` is stripped before edge calls.
- OAuth redirect URIs must match the **global ChatGPT allowlist** (or `CHATGPT_REDIRECT_URIS`); attacker-controlled redirects are rejected.
- Consent UI posts tokens only to `EXPO_PUBLIC_MCP_URL` / `https://mcp.netppay.com` (never a query-string URL).
- Auth codes and refresh tokens are consumed atomically (single-use).
- Data plan amounts come from the NetPay catalog (service-role lookup), not model-supplied prices.
- OAuth tables are RLS-denied to anon/authenticated; MCP uses service role for token storage only.
- Never return passwords, PINs, OTPs, or raw tokens in tool results.
- Per-user/IP in-memory rate limits on prepare/confirm; audit every tool call.

## Rate limits

Default in-process limits (per MCP instance):

- Prepare tools: 20 / minute / user+IP  
- Confirm: 15 / minute / user+IP  

For multi-instance production, prefer a shared Redis/DB limiter later.
