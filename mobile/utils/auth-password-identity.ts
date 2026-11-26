/**
 * Detect whether a Supabase user already has an email/password credential.
 * Google-only (and other OAuth-only) accounts typically have no `email` identity
 * until they set a password via recovery or updateUser.
 */

type AuthIdentity = {
  provider?: string | null;
  identity_id?: string | null;
};

type AuthUserLike = {
  identities?: AuthIdentity[] | null;
  app_metadata?: {
    providers?: string[] | null;
    provider?: string | null;
  } | null;
} | null | undefined;

function normalizeProviders(user: AuthUserLike): string[] {
  if (!user) return [];

  const fromIdentities = Array.isArray(user.identities)
    ? user.identities.map((identity) => String(identity?.provider || '').toLowerCase()).filter(Boolean)
    : [];

  const fromMeta = Array.isArray(user.app_metadata?.providers)
    ? user.app_metadata!.providers!.map((provider) => String(provider || '').toLowerCase()).filter(Boolean)
    : [];

  const single = String(user.app_metadata?.provider || '').toLowerCase();
  const all = [...fromIdentities, ...fromMeta];
  if (single) all.push(single);

  return Array.from(new Set(all));
}

export function userHasEmailPassword(user: AuthUserLike): boolean {
  return normalizeProviders(user).includes('email');
}

export function userIsOAuthOnly(user: AuthUserLike): boolean {
  if (!user) return false;
  const providers = normalizeProviders(user);
  if (providers.length === 0) {
    // Unknown identity set — treat as needing password setup rather than blocking.
    return true;
  }
  return !providers.includes('email');
}
