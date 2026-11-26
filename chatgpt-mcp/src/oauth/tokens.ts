import { SignJWT, jwtVerify } from "jose";
import { env } from "../env.js";
import { createHash } from "node:crypto";
import { encryptSecret, decryptSecret, randomToken, sha256Hex } from "../lib/crypto.js";
import { getServiceClient, refreshSupabaseSession } from "../lib/supabase.js";
import { mcpCanonicalResource } from "./metadata.js";

function tokenAudiences(): string[] {
  return [mcpCanonicalResource(), env.mcpPublicUrl];
}

const ACCESS_TTL_SEC = 15 * 60;
const REFRESH_TTL_SEC = 30 * 24 * 60 * 60;
const AUTH_CODE_TTL_SEC = 10 * 60;

function signingKey() {
  return new TextEncoder().encode(env.tokenSigningSecret());
}

export type McpAccessClaims = {
  sub: string;
  client_id: string;
  jti: string;
  typ: "access";
};

export async function issueAuthCode(params: {
  userId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope: string;
  supabaseRefreshToken: string;
  resource?: string;
}): Promise<string> {
  const code = randomToken(32);
  const db = getServiceClient();
  const expiresAt = new Date(Date.now() + AUTH_CODE_TTL_SEC * 1000).toISOString();
  // Encode resource into scope metadata prefix so we don't need a schema migration
  const scope = params.resource
    ? `${params.scope || "netpay"}|resource:${params.resource}`
    : params.scope || "netpay";
  const { error } = await db.from("chatgpt_oauth_auth_codes").insert({
    code_hash: sha256Hex(code),
    user_id: params.userId,
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    code_challenge: params.codeChallenge,
    code_challenge_method: params.codeChallengeMethod || "S256",
    scope,
    encrypted_supabase_refresh: encryptSecret(params.supabaseRefreshToken),
    expires_at: expiresAt,
    used: false,
  });
  if (error) throw new Error(error.message);
  return code;
}

function parseScopeResource(scope: string): { scope: string; resource: string } {
  const match = scope.match(/\|resource:(.+)$/);
  if (!match) {
    return { scope: scope || "netpay", resource: mcpCanonicalResource() };
  }
  return {
    scope: scope.replace(/\|resource:.+$/, "") || "netpay",
    resource: match[1],
  };
}

export async function exchangeAuthCode(params: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
  resource?: string;
}): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: "Bearer";
  scope: string;
}> {
  const db = getServiceClient();
  const codeHash = sha256Hex(params.code);

  // Atomic single-use: only one concurrent exchange can flip used=false → true
  const { data: row, error } = await db
    .from("chatgpt_oauth_auth_codes")
    .update({ used: true })
    .eq("code_hash", codeHash)
    .eq("used", false)
    .gt("expires_at", new Date().toISOString())
    .select("*")
    .maybeSingle();

  if (error || !row) {
    throw new OAuthError("invalid_grant", "Invalid, expired, or already-used authorization code");
  }
  if (row.client_id !== params.clientId) {
    throw new OAuthError("invalid_grant", "Client mismatch");
  }
  if (row.redirect_uri !== params.redirectUri) {
    throw new OAuthError("invalid_grant", "Redirect URI mismatch");
  }

  const challenge = sha256Base64Url(params.codeVerifier);
  if (row.code_challenge_method !== "S256" || challenge !== row.code_challenge) {
    throw new OAuthError("invalid_grant", "PKCE verification failed");
  }

  const parsed = parseScopeResource(row.scope || "netpay");
  const resource = params.resource || parsed.resource;
  if (params.resource && parsed.resource && params.resource !== parsed.resource) {
    // Allow either canonical MCP URL form
    const allowed = new Set(tokenAudiences());
    if (!allowed.has(params.resource) || !allowed.has(parsed.resource)) {
      throw new OAuthError("invalid_target", "resource mismatch");
    }
  }

  return mintTokenPair({
    userId: row.user_id,
    clientId: row.client_id,
    scope: parsed.scope,
    supabaseRefreshToken: decryptSecret(row.encrypted_supabase_refresh),
    resource,
  });
}

export async function mintTokenPair(params: {
  userId: string;
  clientId: string;
  scope: string;
  supabaseRefreshToken: string;
  resource?: string;
}): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: "Bearer";
  scope: string;
}> {
  const accessJti = randomToken(16);
  const refreshJti = randomToken(16);
  const refreshToken = randomToken(40);
  const now = Math.floor(Date.now() / 1000);
  const audience = params.resource || mcpCanonicalResource();
  const scope = params.scope.includes("|resource:")
    ? params.scope
    : `${params.scope || "netpay"}|resource:${audience}`;

  const accessToken = await new SignJWT({
    sub: params.userId,
    client_id: params.clientId,
    typ: "access",
    resource: audience,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(now + ACCESS_TTL_SEC)
    .setJti(accessJti)
    .setIssuer(env.mcpPublicUrl)
    .setAudience(audience)
    .sign(signingKey());

  const db = getServiceClient();
  const { error } = await db.from("chatgpt_oauth_tokens").insert({
    user_id: params.userId,
    client_id: params.clientId,
    access_jti_hash: sha256Hex(accessJti),
    refresh_token_hash: sha256Hex(refreshToken),
    refresh_jti_hash: sha256Hex(refreshJti),
    encrypted_supabase_refresh: encryptSecret(params.supabaseRefreshToken),
    scope,
    access_expires_at: new Date((now + ACCESS_TTL_SEC) * 1000).toISOString(),
    refresh_expires_at: new Date((now + REFRESH_TTL_SEC) * 1000).toISOString(),
  });
  if (error) throw new Error(error.message);

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: ACCESS_TTL_SEC,
    token_type: "Bearer",
    scope: parseScopeResource(scope).scope,
  };
}

export async function rotateRefreshToken(params: {
  refreshToken: string;
  clientId: string;
  resource?: string;
}): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: "Bearer";
  scope: string;
}> {
  const db = getServiceClient();
  const hash = sha256Hex(params.refreshToken);
  // Atomic rotate: only one concurrent refresh can revoke the row
  const { data: row, error } = await db
    .from("chatgpt_oauth_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("refresh_token_hash", hash)
    .is("revoked_at", null)
    .gt("refresh_expires_at", new Date().toISOString())
    .select("*")
    .maybeSingle();
  if (error || !row) throw new OAuthError("invalid_grant", "Invalid or expired refresh token");
  if (row.client_id !== params.clientId) {
    throw new OAuthError("invalid_grant", "Client mismatch");
  }

  let supabaseRefresh = decryptSecret(row.encrypted_supabase_refresh);
  try {
    const refreshed = await refreshSupabaseSession(supabaseRefresh);
    supabaseRefresh = refreshed.refresh_token;
  } catch {
    // Keep previous encrypted refresh; tool calls will fail clearly later
  }

  const parsed = parseScopeResource(row.scope || "netpay");
  return mintTokenPair({
    userId: row.user_id,
    clientId: row.client_id,
    scope: parsed.scope,
    supabaseRefreshToken: supabaseRefresh,
    resource: params.resource || parsed.resource,
  });
}

export async function revokeToken(token: string): Promise<void> {
  const db = getServiceClient();
  const hash = sha256Hex(token);
  // Try as refresh token first
  const { data: byRefresh } = await db
    .from("chatgpt_oauth_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("refresh_token_hash", hash)
    .is("revoked_at", null)
    .select("id");
  if (byRefresh?.length) return;

  try {
    const { payload } = await jwtVerify(token, signingKey(), {
      issuer: env.mcpPublicUrl,
      audience: env.mcpPublicUrl,
    });
    const jti = String(payload.jti || "");
    if (!jti) return;
    await db
      .from("chatgpt_oauth_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("access_jti_hash", sha256Hex(jti));
  } catch {
    // ignore invalid tokens on revoke
  }
}

export async function revokeAllForUser(userId: string): Promise<void> {
  const db = getServiceClient();
  await db
    .from("chatgpt_oauth_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("revoked_at", null);
}

export type AuthedSession = {
  userId: string;
  clientId: string;
  accessToken: string; // Supabase user access token
  mcpJti: string;
};

export async function resolveBearerSession(authorizationHeader?: string): Promise<AuthedSession> {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    throw new AuthError("missing_token", "Authorization Bearer token required");
  }
  const mcpToken = authorizationHeader.slice("Bearer ".length).trim();
  let claims: McpAccessClaims;
  try {
    const { payload } = await jwtVerify(mcpToken, signingKey(), {
      issuer: env.mcpPublicUrl,
      audience: tokenAudiences(),
    });
    if (payload.typ !== "access" || !payload.sub || !payload.jti || !payload.client_id) {
      throw new Error("invalid claims");
    }
    claims = {
      sub: String(payload.sub),
      client_id: String(payload.client_id),
      jti: String(payload.jti),
      typ: "access",
    };
  } catch {
    throw new AuthError("invalid_token", "Invalid or expired access token");
  }

  const db = getServiceClient();
  const { data: row, error } = await db
    .from("chatgpt_oauth_tokens")
    .select("*")
    .eq("access_jti_hash", sha256Hex(claims.jti))
    .eq("user_id", claims.sub)
    .is("revoked_at", null)
    .maybeSingle();
  if (error || !row) {
    throw new AuthError("invalid_token", "Token revoked or unknown");
  }

  const supabaseRefresh = decryptSecret(row.encrypted_supabase_refresh);
  const session = await refreshSupabaseSession(supabaseRefresh);

  // Persist rotated supabase refresh if changed
  if (session.refresh_token !== supabaseRefresh) {
    await db
      .from("chatgpt_oauth_tokens")
      .update({ encrypted_supabase_refresh: encryptSecret(session.refresh_token) })
      .eq("id", row.id);
  }

  return {
    userId: claims.sub,
    clientId: claims.client_id,
    accessToken: session.access_token,
    mcpJti: claims.jti,
  };
}

function sha256Base64Url(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

export class OAuthError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "OAuthError";
  }
}

export class AuthError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}
