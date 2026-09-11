import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getEBillsToken, requeryEBillsOrder } from "../_shared/ebills-api.ts";
import {
  EBILLS_TABLES,
  isEbillsRow,
  isWalletStillDebited,
  reconcileEbillsTransactionRow,
} from "../_shared/ebills-reconcile.ts";
import { refundPurchaseWallet } from "../_shared/purchase-refund.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPEN_STATUSES = ["processing", "pending"];

async function requireAdmin(supabase: ReturnType<typeof createClient>, authHeader: string) {
  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) throw new Error("Unauthorized");

  const { data: roleData } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .limit(1);

  if (!roleData?.length) throw new Error("Admin access required");
  return user;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    await requireAdmin(supabase, authHeader);

    let body: Record<string, unknown> = {};
    try {
      const text = await req.text();
      if (text?.trim()) body = JSON.parse(text);
    } catch {
      body = {};
    }

    const referenceFilter = typeof body.reference === "string" ? body.reference.trim() : "";
    const limit = Math.min(Number(body.limit) || 100, 500);
    const staleHours = Math.max(Number(body.stale_hours) || 2, 1);
    const refundStaleNotFound = body.refund_stale_not_found !== false;

    const ebillsToken = await getEBillsToken();
    const results = {
      processed: 0,
      completed: 0,
      refunded: 0,
      wallet_credited: 0,
      still_processing: 0,
      errors: [] as string[],
      details: [] as Record<string, unknown>[],
    };

    for (const config of EBILLS_TABLES) {
      let query = supabase
        .from(config.table)
        .select("*")
        .order("created_at", { ascending: true })
        .limit(limit);

      if (referenceFilter) {
        query = query.eq("reference", referenceFilter);
      } else {
        query = query.in("status", OPEN_STATUSES);
      }

      const { data: rows, error } = await query;
      if (error) {
        results.errors.push(`${config.table}: ${error.message}`);
        continue;
      }

      for (const row of (rows || []) as Record<string, unknown>[]) {
        if (!isEbillsRow(row)) continue;

        const reference = String(row.reference ?? "");
        const userId = String(row.user_id ?? "");
        const amount = Number(row.amount) || 0;

        if (!reference || !userId || amount <= 0) {
          results.errors.push(`${config.table}/${row.id}: missing reference, user, or amount`);
          continue;
        }

        if (!referenceFilter && !OPEN_STATUSES.includes(String(row.status ?? "").toLowerCase())) {
          continue;
        }

        results.processed++;

        try {
          const requeryResult = await requeryEBillsOrder(ebillsToken, reference);
          const reconcileResult = await reconcileEbillsTransactionRow(
            supabase,
            config,
            row,
            requeryResult,
            "REQUERY-REF",
          );

          results.details.push(reconcileResult);

          if (reconcileResult.action === "completed") results.completed++;
          else if (reconcileResult.action === "refunded") {
            results.refunded++;
            if (reconcileResult.wallet_refunded) results.wallet_credited++;
          } else if (reconcileResult.action === "already_refunded") {
            results.refunded++;
          } else if (reconcileResult.action === "still_processing") {
            results.still_processing++;
          }
        } catch (requeryError) {
          const message = requeryError instanceof Error ? requeryError.message : String(requeryError);
          const createdAt = row.created_at ? new Date(String(row.created_at)).getTime() : 0;
          const ageHours = createdAt ? (Date.now() - createdAt) / (1000 * 60 * 60) : 0;
          const isNotFound = /not found/i.test(message);

          if (isNotFound && refundStaleNotFound && ageHours >= staleHours && isWalletStillDebited(row)) {
            const refunded = await refundPurchaseWallet({
              supabase,
              userId,
              amount,
              purchaseReference: reference,
              productLabel: config.productLabel,
              reason: "order not found at provider after waiting",
              refSuffix: "STALE-REF",
            });

            await supabase.from(config.table).update({
              status: config.failedStatus,
              balance_after: refunded ? Number(row.balance_before) || row.balance_after : row.balance_after,
              api_response: {
                ...(typeof row.api_response === "object" && row.api_response ? row.api_response : {}),
                requery_error: message,
                requeried_at: new Date().toISOString(),
                wallet_refunded: refunded,
              },
            }).eq("id", row.id);

            if (refunded) {
              results.refunded++;
              results.wallet_credited++;
              results.details.push({ reference, table: config.table, action: "refunded_stale_not_found" });
            } else {
              results.errors.push(`${reference}: stale not-found but refund failed`);
            }
            continue;
          }

          results.errors.push(`${reference}: ${message}`);
          results.details.push({ reference, table: config.table, action: "error", error: message });
        }
      }
    }

    return new Response(JSON.stringify({ success: true, ...results }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("process-pending-ebills-transactions error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("Unauthorized") || message.includes("Admin") ? 403 : 500;
    return new Response(JSON.stringify({ success: false, error: message }), {
      status,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
