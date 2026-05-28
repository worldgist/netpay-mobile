import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { checkIpAccess, CORS_HEADERS } from "../_shared/ip-access-check.ts";
import { enforceWebHostAccess } from "../_shared/web-host-access.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed" }),
      { status: 405, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  try {
    let body: Record<string, unknown> = {};
    if (req.method === "POST") {
      try {
        body = (await req.json()) as Record<string, unknown>;
      } catch {
        body = {};
      }
    }

    const hostBlock = enforceWebHostAccess(body);
    if (hostBlock.blocked) {
      return new Response(
        JSON.stringify({
          success: true,
          allowed: false,
          blocked: true,
          reason: hostBlock.reason ?? null,
          code: "WEB_HOST_BLOCKED",
        }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const result = await checkIpAccess(req);

    return new Response(
      JSON.stringify({
        success: true,
        allowed: result.allowed && !result.blocked,
        blocked: result.blocked,
        reason: result.reason ?? null,
        ip: result.ip ?? null,
        detection: result.detection ?? null,
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("check-network-access error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Network verification failed",
      }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
});
