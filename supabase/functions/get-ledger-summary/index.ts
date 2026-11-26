import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  createServiceClient,
  errorResponse,
  jsonResponse,
  requireAdmin,
} from "../_shared/admin-auth.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const supabase = createServiceClient();
    await requireAdmin(req, supabase);

    let limit = 50;
    let includeEntries = false;
    let entriesLimit = 500;
    let startDate: string | undefined;
    let endDate: string | undefined;
    let typeFilter: string | undefined;
    let search: string | undefined;

    try {
      const body = req.method === "POST" ? await req.json() : {};
      if (body?.limit) limit = Number(body.limit) || 50;
      if (body?.include_entries || body?.includeEntries) includeEntries = true;
      if (body?.entries_limit || body?.entriesLimit) {
        entriesLimit = Math.min(Math.max(Number(body.entries_limit ?? body.entriesLimit) || 500, 1), 2000);
      }
      if (body?.startDate) startDate = String(body.startDate);
      if (body?.endDate) endDate = String(body.endDate);
      if (body?.type && body.type !== "all") typeFilter = String(body.type);
      if (body?.search) search = String(body.search).trim();
    } catch {
      // ignore empty body
    }

    let { data: summary, error: summaryError } = await supabase.rpc("get_ledger_balance_summary");
    if (summaryError) {
      console.error("get_ledger_balance_summary error:", summaryError);
      throw summaryError;
    }

    const mismatchCount = Number((summary as { mismatch_count?: number })?.mismatch_count) || 0;
    let autoSynced = false;

    if (mismatchCount > 0) {
      const { error: syncError } = await supabase.rpc("sync_profile_balances_from_ledger");
      if (syncError) {
        console.error("auto sync_profile_balances_from_ledger error:", syncError);
      } else {
        autoSynced = true;
        const refreshed = await supabase.rpc("get_ledger_balance_summary");
        if (!refreshed.error && refreshed.data) {
          summary = refreshed.data;
        }
      }
    }

    const { data: mismatches, error: mismatchError } = await supabase.rpc(
      "get_ledger_balance_mismatches",
      { p_limit: limit },
    );

    if (mismatchError) {
      console.error("get_ledger_balance_mismatches error:", mismatchError);
      throw mismatchError;
    }

    let entries: unknown[] = [];
    if (includeEntries) {
      let query = supabase
        .from("user_transactions")
        .select(`
          id,
          user_id,
          amount,
          balance_before,
          balance_after,
          transaction_type,
          description,
          reference,
          performed_by,
          created_at
        `)
        .order("created_at", { ascending: false })
        .limit(entriesLimit);

      if (startDate) query = query.gte("created_at", startDate);
      if (endDate) query = query.lte("created_at", endDate);
      if (typeFilter) query = query.eq("transaction_type", typeFilter);

      const { data: rows, error: entriesError } = await query;
      if (entriesError) {
        console.error("ledger entries error:", entriesError);
        throw entriesError;
      }

      const userIds = [...new Set((rows || []).map((r) => r.user_id).filter(Boolean))];
      const profileMap = new Map<string, { full_name?: string | null; email?: string | null }>();

      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", userIds);
        for (const profile of profiles || []) {
          profileMap.set(profile.id, {
            full_name: profile.full_name,
            email: profile.email,
          });
        }
      }

      entries = (rows || [])
        .map((row) => ({
          ...row,
          profiles: profileMap.get(row.user_id) || null,
        }))
        .filter((row) => {
          if (!search) return true;
          const q = search.toLowerCase();
          return (
            row.reference?.toLowerCase().includes(q) ||
            row.description?.toLowerCase().includes(q) ||
            row.transaction_type?.toLowerCase().includes(q) ||
            row.profiles?.full_name?.toLowerCase().includes(q) ||
            row.profiles?.email?.toLowerCase().includes(q)
          );
        });
    }

    return jsonResponse({
      success: true,
      summary,
      mismatches: mismatches ?? [],
      auto_synced: autoSynced,
      entries,
    });
  } catch (error) {
    console.error("get-ledger-summary error:", error);
    return errorResponse(error, 500);
  }
});
