function required(name: string, fallback?: string): string {
  const value = process.env[name]?.trim() || fallback;
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT || 3100),
  mcpPublicUrl: (process.env.MCP_PUBLIC_URL || "https://mcp.netppay.com").replace(/\/$/, ""),
  // Production Expo web is served on www (apex 308s there)
  siteUrl: (process.env.NETPAY_SITE_URL || "https://app.netppay.com").replace(/\/$/, ""),
  supabaseUrl: () => required("SUPABASE_URL"),
  supabaseAnonKey: () => required("SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),
  tokenSigningSecret: () => required("MCP_TOKEN_SIGNING_SECRET"),
  encryptionKey: () => required("MCP_ENCRYPTION_KEY"),
  chatgptRedirectUris: () =>
    (process.env.CHATGPT_REDIRECT_URIS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
};

export function mcpResourceUrl(): string {
  return env.mcpPublicUrl;
}

export function mcpEndpointUrl(): string {
  return `${env.mcpPublicUrl}/mcp`;
}

/** Non-secret readiness flags for /health (never returns values). */
export function envReadiness(): Record<string, boolean> {
  return {
    SUPABASE_URL: Boolean(process.env.SUPABASE_URL?.trim()),
    SUPABASE_ANON_KEY: Boolean(process.env.SUPABASE_ANON_KEY?.trim()),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
    MCP_TOKEN_SIGNING_SECRET: Boolean(process.env.MCP_TOKEN_SIGNING_SECRET?.trim()),
    MCP_ENCRYPTION_KEY: Boolean(process.env.MCP_ENCRYPTION_KEY?.trim()),
    MCP_PUBLIC_URL: Boolean(process.env.MCP_PUBLIC_URL?.trim()),
    NETPAY_SITE_URL: Boolean(process.env.NETPAY_SITE_URL?.trim()),
  };
}

export function isOAuthFullyConfigured(): boolean {
  const flags = envReadiness();
  return (
    flags.SUPABASE_URL &&
    flags.SUPABASE_ANON_KEY &&
    flags.SUPABASE_SERVICE_ROLE_KEY &&
    flags.MCP_TOKEN_SIGNING_SECRET &&
    flags.MCP_ENCRYPTION_KEY
  );
}
