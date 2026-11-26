type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
  requestCount: number;
  lockedOut: boolean;
};

type SupabaseLike = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

export async function enforceAuthAbuseRateLimit(
  supabase: SupabaseLike,
  params: {
    bucket: string;
    rateKey: string;
    windowSeconds: number;
    maxRequests: number;
    lockoutSeconds?: number;
  },
): Promise<RateLimitResult> {
  const { data, error } = await supabase.rpc("enforce_auth_abuse_rate_limit", {
    p_bucket: params.bucket,
    p_rate_key: params.rateKey,
    p_window_seconds: params.windowSeconds,
    p_max_requests: params.maxRequests,
    p_lockout_seconds: params.lockoutSeconds ?? 0,
  });

  if (error) {
    console.error("enforce_auth_abuse_rate_limit error:", error);
    // Fail open only if the limiter is not migrated yet; still log loudly.
    const message = (error.message || "").toLowerCase();
    if (
      message.includes("does not exist") ||
      message.includes("enforce_auth_abuse_rate_limit") ||
      message.includes("schema cache")
    ) {
      return {
        allowed: true,
        retryAfterSeconds: 0,
        requestCount: 0,
        lockedOut: false,
      };
    }
    return {
      allowed: false,
      retryAfterSeconds: 60,
      requestCount: 0,
      lockedOut: false,
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  const record = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;

  return {
    allowed: Boolean(record.allowed),
    retryAfterSeconds: Number(record.retry_after_seconds || 0),
    requestCount: Number(record.request_count || 0),
    lockedOut: Boolean(record.locked_out),
  };
}

export function clientIpFromRequest(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "";
  const first = forwarded.split(",")[0]?.trim();
  if (first) return first.slice(0, 128);
  return "unknown";
}
