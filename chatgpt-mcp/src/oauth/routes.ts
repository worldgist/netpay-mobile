import type { Express, Request, Response } from "express";
import { env, isOAuthFullyConfigured } from "../env.js";
import {
  authorizationServerMetadata,
  mcpCanonicalResource,
  openIdConfiguration,
  protectedResourceMetadata,
} from "./metadata.js";
import {
  assertClientRedirect,
  findClient,
  getOrRegisterClient,
  isRedirectGloballyAllowed,
} from "./clients.js";
import {
  AuthError,
  OAuthError,
  exchangeAuthCode,
  issueAuthCode,
  rotateRefreshToken,
  revokeToken,
} from "./tokens.js";
import { getServiceClient } from "../lib/supabase.js";
import { renderConsentPageHtml } from "./consent-page.js";

function clientIp(req: Request): string | null {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length) return forwarded.split(",")[0].trim();
  return req.socket.remoteAddress || null;
}

function sendJson(res: Response, status: number, body: unknown): void {
  res.status(status).type("application/json").send(JSON.stringify(body));
}

function safeRedirectTarget(redirectUri: string, state: string, params: Record<string, string>) {
  if (!isRedirectGloballyAllowed(redirectUri)) {
    throw new Error("redirect_uri not allowed");
  }
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  // RFC 9207 issuer identification — required when AS advertises support
  url.searchParams.set("iss", env.mcpPublicUrl);
  if (state) url.searchParams.set("state", state);
  return url.toString();
}

function normalizeResource(raw?: string | null): string {
  const value = String(raw || "").trim();
  if (!value) return mcpCanonicalResource();
  const allowed = new Set([env.mcpPublicUrl, mcpCanonicalResource()]);
  if (!allowed.has(value)) {
    throw new OAuthError("invalid_target", `Unsupported resource: ${value}`);
  }
  return value;
}

export function mountOAuthRoutes(app: Express): void {
  // RFC 9728 — root + path-specific (ChatGPT discovers /mcp variant first)
  const sendProtectedResource = (req: Request, res: Response) => {
    const resource =
      req.path.endsWith("/mcp") || req.path.includes("oauth-protected-resource/mcp")
        ? mcpCanonicalResource()
        : mcpCanonicalResource();
    sendJson(res, 200, protectedResourceMetadata(resource));
  };

  app.get("/.well-known/oauth-protected-resource", sendProtectedResource);
  app.get("/.well-known/oauth-protected-resource/mcp", sendProtectedResource);

  // RFC 8414 + OIDC discovery
  app.get("/.well-known/oauth-authorization-server", (_req, res) => {
    sendJson(res, 200, authorizationServerMetadata());
  });
  app.get("/.well-known/openid-configuration", (_req, res) => {
    sendJson(res, 200, openIdConfiguration());
  });
  // Some clients look under issuer path prefixes
  app.get("/.well-known/oauth-authorization-server/mcp", (_req, res) => {
    sendJson(res, 200, authorizationServerMetadata());
  });

  // DCR: only allowlisted ChatGPT redirect URIs may be registered
  app.post("/oauth/register", async (req, res) => {
    try {
      if (!isOAuthFullyConfigured()) {
        return sendJson(res, 503, {
          error: "temporarily_unavailable",
          error_description:
            "OAuth storage is not configured. Set SUPABASE_* and MCP_* secrets on the Vercel project for mcp.netppay.com.",
        });
      }
      const redirectUris = Array.isArray(req.body?.redirect_uris)
        ? req.body.redirect_uris.map(String)
        : [];
      if (!redirectUris.length) {
        return sendJson(res, 400, {
          error: "invalid_client_metadata",
          error_description: "redirect_uris required",
        });
      }
      for (const uri of redirectUris) {
        if (!isRedirectGloballyAllowed(uri)) {
          return sendJson(res, 400, {
            error: "invalid_redirect_uri",
            error_description: `redirect_uri not on allowlist: ${uri}`,
          });
        }
      }
      const client = await getOrRegisterClient({
        redirectUris,
        clientName: req.body?.client_name ? String(req.body.client_name) : "ChatGPT",
        clientId: req.body?.client_id ? String(req.body.client_id) : undefined,
      });
      return sendJson(res, 201, {
        client_id: client.client_id,
        redirect_uris: client.redirect_uris,
        client_name: client.client_name,
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
      });
    } catch (error) {
      return sendJson(res, 500, {
        error: "server_error",
        error_description: error instanceof Error ? error.message : "Registration failed",
      });
    }
  });

  /**
   * Authorization endpoint — redirects user to NetPay Expo web consent page.
   */
  app.get("/oauth/authorize", async (req, res) => {
    try {
      const clientId = String(req.query.client_id || "");
      const redirectUri = String(req.query.redirect_uri || "");
      const responseType = String(req.query.response_type || "");
      const state = String(req.query.state || "");
      const codeChallenge = String(req.query.code_challenge || "");
      const codeChallengeMethod = String(req.query.code_challenge_method || "S256");
      const scope = String(req.query.scope || "netpay");
      let resource: string;
      try {
        resource = normalizeResource(
          typeof req.query.resource === "string" ? req.query.resource : null,
        );
      } catch (error) {
        return res.status(400).send(error instanceof Error ? error.message : "invalid resource");
      }

      if (responseType !== "code") {
        return res.status(400).send("unsupported response_type");
      }
      if (!clientId || !redirectUri || !codeChallenge) {
        return res.status(400).send("client_id, redirect_uri, and code_challenge are required");
      }
      if (codeChallengeMethod !== "S256") {
        return res.status(400).send("code_challenge_method must be S256");
      }

      try {
        await assertClientRedirect(clientId, redirectUri);
      } catch (error) {
        if (isRedirectGloballyAllowed(redirectUri) && state) {
          return res.redirect(
            302,
            safeRedirectTarget(redirectUri, state, {
              error: "invalid_client",
              error_description: error instanceof Error ? error.message : "invalid_client",
            }),
          );
        }
        return res.status(400).send(error instanceof Error ? error.message : "invalid_client");
      }

      // Host consent on the MCP origin so ChatGPT connect works even when Expo www is stale.
      // Expo routes (/open/chatgpt-consent, /chatgpt/oauth/consent) remain available as mirrors.
      const consentUrl = new URL(`${env.mcpPublicUrl}/oauth/consent`);
      consentUrl.searchParams.set("client_id", clientId);
      consentUrl.searchParams.set("redirect_uri", redirectUri);
      consentUrl.searchParams.set("response_type", "code");
      consentUrl.searchParams.set("state", state);
      consentUrl.searchParams.set("code_challenge", codeChallenge);
      consentUrl.searchParams.set("code_challenge_method", codeChallengeMethod);
      consentUrl.searchParams.set("scope", scope);
      consentUrl.searchParams.set("resource", resource);
      return res.redirect(302, consentUrl.toString());
    } catch (error) {
      return res.status(500).send(error instanceof Error ? error.message : "authorize failed");
    }
  });

  /**
   * NetPay-branded consent + sign-in UI (MCP-hosted).
   */
  app.get("/oauth/consent", async (req, res) => {
    try {
      if (!isOAuthFullyConfigured()) {
        return res.status(503).type("html").send("<h1>OAuth not configured</h1>");
      }
      return res.status(200).type("html").send(renderConsentPageHtml(req.query as Record<string, unknown>));
    } catch (error) {
      return res.status(500).send(error instanceof Error ? error.message : "consent page failed");
    }
  });

  /**
   * Called by NetPay consent page after user approves.
   */
  app.post("/oauth/consent/complete", async (req, res) => {
    try {
      const body = req.body || {};
      const approved = Boolean(body.approved);
      const redirectUri = String(body.redirect_uri || "");
      const state = String(body.state || "");
      const clientId = String(body.client_id || "");
      const codeChallenge = String(body.code_challenge || "");
      const codeChallengeMethod = String(body.code_challenge_method || "S256");
      const resource = normalizeResource(body.resource ? String(body.resource) : null);

      if (!clientId || !redirectUri) {
        return sendJson(res, 400, {
          error: "invalid_request",
          error_description: "client_id and redirect_uri required",
        });
      }

      try {
        await assertClientRedirect(clientId, redirectUri);
      } catch (error) {
        return sendJson(res, 400, {
          error: "invalid_client",
          error_description: error instanceof Error ? error.message : "invalid_client",
        });
      }

      if (!approved) {
        return sendJson(res, 200, {
          redirect_to: safeRedirectTarget(redirectUri, state, { error: "access_denied" }),
        });
      }

      if (!codeChallenge || codeChallengeMethod !== "S256") {
        return sendJson(res, 400, {
          error: "invalid_request",
          error_description: "PKCE S256 code_challenge required",
        });
      }

      const accessToken = String(body.supabase_access_token || "");
      const refreshToken = String(body.supabase_refresh_token || "");
      if (!accessToken || !refreshToken) {
        return sendJson(res, 400, { error: "missing_supabase_session" });
      }

      const db = getServiceClient();
      const { data: userData, error: userError } = await db.auth.getUser(accessToken);
      if (userError || !userData.user) {
        return sendJson(res, 401, { error: "invalid_supabase_session" });
      }

      // Ensure client row exists for token FK / audit (CIMD clients included)
      await getOrRegisterClient({
        clientId,
        redirectUris: [redirectUri],
        clientName: "ChatGPT",
      });

      const code = await issueAuthCode({
        userId: userData.user.id,
        clientId,
        redirectUri,
        codeChallenge,
        codeChallengeMethod,
        scope: String(body.scope || "netpay"),
        supabaseRefreshToken: refreshToken,
        resource,
      });

      return sendJson(res, 200, {
        redirect_to: safeRedirectTarget(redirectUri, state, { code }),
      });
    } catch (error) {
      console.error("consent complete error", error instanceof Error ? error.message : error, clientIp(req));
      return sendJson(res, 500, {
        error: "server_error",
        error_description: error instanceof Error ? error.message : "consent failed",
      });
    }
  });

  app.post("/oauth/token", async (req, res) => {
    try {
      const grantType = String(req.body?.grant_type || "");
      const clientId = String(req.body?.client_id || "");
      const resource = normalizeResource(req.body?.resource ? String(req.body.resource) : null);

      if (grantType === "authorization_code") {
        const tokens = await exchangeAuthCode({
          code: String(req.body?.code || ""),
          clientId,
          redirectUri: String(req.body?.redirect_uri || ""),
          codeVerifier: String(req.body?.code_verifier || ""),
          resource,
        });
        return sendJson(res, 200, tokens);
      }

      if (grantType === "refresh_token") {
        const tokens = await rotateRefreshToken({
          refreshToken: String(req.body?.refresh_token || ""),
          clientId,
          resource,
        });
        return sendJson(res, 200, tokens);
      }

      return sendJson(res, 400, { error: "unsupported_grant_type" });
    } catch (error) {
      if (error instanceof OAuthError) {
        return sendJson(res, 400, { error: error.code, error_description: error.message });
      }
      return sendJson(res, 500, {
        error: "server_error",
        error_description: error instanceof Error ? error.message : "token error",
      });
    }
  });

  app.post("/oauth/revoke", async (req, res) => {
    try {
      const token = String(req.body?.token || "");
      if (token) await revokeToken(token);
      return sendJson(res, 200, { revoked: true });
    } catch {
      return sendJson(res, 200, { revoked: true });
    }
  });
}

export function oauthWwwAuthenticate(res: Response, error = "invalid_token"): void {
  // Point ChatGPT at path-specific protected-resource metadata for /mcp
  const resourceMetadata = `${env.mcpPublicUrl}/.well-known/oauth-protected-resource/mcp`;
  res.setHeader(
    "WWW-Authenticate",
    `Bearer FAKESECRET_g3h4i5j6k7l8m9n0o1p2="${resourceMetadata}", error="${error}", scope="netpay"`,
  );
}

export { AuthError, findClient };
