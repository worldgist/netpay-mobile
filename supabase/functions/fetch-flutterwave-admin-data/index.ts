import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

interface FlutterwaveTransaction {
  id?: number | string;
  tx_ref?: string;
  flw_ref?: string;
  amount?: number | string;
  currency?: string;
  status?: string;
  payment_type?: string;
  created_at?: string;
  customer?: {
    name?: string;
    email?: string;
  };
  admin_identity?: {
    user_id?: string;
    account_number?: string | null;
    account_name?: string | null;
    nin?: string | null;
    bvn?: string | null;
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const flutterwaveSecret = Deno.env.get("FLW_SECRET_KEY") || Deno.env.get("FLUTTERWAVE_SECRET_KEY");

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return new Response(
        JSON.stringify({ success: false, error: "Supabase configuration missing" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!flutterwaveSecret) {
      return new Response(
        JSON.stringify({ success: false, error: "Flutterwave credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: roleData, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (roleError) {
      return new Response(
        JSON.stringify({ success: false, error: "Error verifying permissions" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!roleData) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized - Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let body: { page?: number; per_page?: number; reference?: string } = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const page = Number.isFinite(Number(body.page)) ? Number(body.page) : 1;
    const perPage = Number.isFinite(Number(body.per_page)) ? Number(body.per_page) : 10;
    const reference = typeof body.reference === "string" ? body.reference.trim() : "";

    const balancesResponse = await fetch("https://api.flutterwave.com/v3/balances", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${flutterwaveSecret}`,
      },
    });

    const balancesData = await balancesResponse.json();

    if (!balancesResponse.ok || balancesData?.status !== "success") {
      return new Response(
        JSON.stringify({
          success: false,
          error: balancesData?.message || "Failed to fetch Flutterwave balances",
          details: balancesData,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const ngnBalance = (Array.isArray(balancesData?.data) ? balancesData.data : []).find(
      (item: { currency?: string }) => String(item?.currency || "").toUpperCase() === "NGN",
    ) || (Array.isArray(balancesData?.data) ? balancesData.data[0] : null);

    const transactionsUrl = `https://api.flutterwave.com/v3/transactions?page=${page}&status=successful`;

    const transactionsResponse = await fetch(transactionsUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${flutterwaveSecret}`,
      },
    });

    const transactionsData = await transactionsResponse.json();

    if (!transactionsResponse.ok || transactionsData?.status !== "success") {
      return new Response(
        JSON.stringify({
          success: false,
          error: transactionsData?.message || "Failed to fetch Flutterwave transactions",
          details: transactionsData,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const flutterwaveTransactions: FlutterwaveTransaction[] = Array.isArray(transactionsData?.data)
      ? transactionsData.data
      : [];

    const normalizedReference = reference.toLowerCase();
    const filteredTransactions = normalizedReference
      ? flutterwaveTransactions.filter((item) => {
          const txRef = String(item.tx_ref || "").toLowerCase();
          const flwRef = String(item.flw_ref || "").toLowerCase();
          return txRef.includes(normalizedReference) || flwRef.includes(normalizedReference);
        })
      : flutterwaveTransactions;

    const { count: flutterwaveVirtualAccounts } = await supabase
      .from("virtual_accounts")
      .select("id", { count: "exact", head: true })
      .eq("bank_code", "FLW");

    const { data: latestFlutterwaveAccount } = await supabase
      .from("virtual_accounts")
      .select("created_at")
      .eq("bank_code", "FLW")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { count: localFlutterwaveFundingCount } = await supabase
      .from("funding_transactions")
      .select("id", { count: "exact", head: true })
      .or("bank_name.ilike.%flutterwave%,reference.like.FLW-VA-%");

    const emails = Array.from(
      new Set(
        filteredTransactions
          .map((item) => String(item.customer?.email || "").trim().toLowerCase())
          .filter((email) => email.length > 0),
      ),
    );

    const profileMap = new Map<string, string>();
    if (emails.length > 0) {
      const { data: profileRows } = await supabase
        .from("profiles")
        .select("id, email")
        .in("email", emails);

      for (const row of profileRows || []) {
        const email = String(row.email || "").trim().toLowerCase();
        if (email && row.id) {
          profileMap.set(email, row.id);
        }
      }
    }

    const userIds = Array.from(new Set(Array.from(profileMap.values())));

    let virtualAccountRows: Array<{
      user_id: string;
      account_number: string | null;
      account_name: string | null;
      nin: string | null;
      bvn: string | null;
    }> = [];

    if (userIds.length > 0) {
      const withBvnQuery = await supabase
        .from("virtual_accounts")
        .select("user_id, account_number, account_name, nin, bvn")
        .eq("bank_code", "FLW")
        .in("user_id", userIds);

      if (!withBvnQuery.error) {
        virtualAccountRows = (withBvnQuery.data || []).map((row) => ({
          user_id: row.user_id,
          account_number: row.account_number,
          account_name: row.account_name,
          nin: row.nin,
          bvn: row.bvn,
        }));
      } else {
        const withoutBvnQuery = await supabase
          .from("virtual_accounts")
          .select("user_id, account_number, account_name, nin")
          .eq("bank_code", "FLW")
          .in("user_id", userIds);

        virtualAccountRows = (withoutBvnQuery.data || []).map((row) => ({
          user_id: row.user_id,
          account_number: row.account_number,
          account_name: row.account_name,
          nin: row.nin,
          bvn: null,
        }));
      }
    }

    const identityByUserId = new Map<string, {
      account_number: string | null;
      account_name: string | null;
      nin: string | null;
      bvn: string | null;
    }>();

    for (const row of virtualAccountRows) {
      identityByUserId.set(row.user_id, {
        account_number: row.account_number,
        account_name: row.account_name,
        nin: row.nin,
        bvn: row.bvn,
      });
    }

    const enrichedTransactions = filteredTransactions.map((item) => {
      const email = String(item.customer?.email || "").trim().toLowerCase();
      const userId = profileMap.get(email);
      const identity = userId ? identityByUserId.get(userId) : null;

      return {
        ...item,
        admin_identity: identity
          ? {
              user_id: userId,
              account_number: identity.account_number,
              account_name: identity.account_name,
              nin: identity.nin,
              bvn: identity.bvn,
            }
          : undefined,
      } as FlutterwaveTransaction;
    });

    return new Response(
      JSON.stringify({
        success: true,
        balance: {
          amount: Number(ngnBalance?.available_balance ?? ngnBalance?.balance ?? 0),
          ledgerBalance: Number(ngnBalance?.ledger_balance ?? 0),
          currency: String(ngnBalance?.currency || "NGN").toUpperCase(),
        },
        account: {
          provider: "Flutterwave",
          mode: Deno.env.get("FLW_SECRET_KEY")?.startsWith("FLWSECK_TEST") ? "test" : "live",
          virtualAccounts: flutterwaveVirtualAccounts || 0,
          latestVirtualAccountCreatedAt: latestFlutterwaveAccount?.created_at || null,
          localFundingTransactions: localFlutterwaveFundingCount || 0,
        },
        transactions: enrichedTransactions.slice(0, perPage),
        pagination: transactionsData?.meta || null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("fetch-flutterwave-admin-data error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
