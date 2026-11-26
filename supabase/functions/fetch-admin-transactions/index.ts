import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  createServiceClient,
  errorResponse,
  jsonResponse,
  requireAdmin,
} from "../_shared/admin-auth.ts";

type TxRow = Record<string, unknown>;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const supabase = createServiceClient();
    const admin = await requireAdmin(req, supabase);

    let startDate: string | undefined;
    let endDate: string | undefined;
    let status: string | null = null;
    let type: string | undefined;
    let limit = 2000;

    try {
      if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
        const bodyText = await req.text();
        if (bodyText?.trim()) {
          const body = JSON.parse(bodyText);
          startDate = body.startDate || undefined;
          endDate = body.endDate || undefined;
          status = body.status ?? null;
          type = body.type || undefined;
          if (body.limit) limit = Math.min(Math.max(Number(body.limit) || 2000, 1), 5000);
        }
      } else {
        const url = new URL(req.url);
        startDate = url.searchParams.get("startDate") || undefined;
        endDate = url.searchParams.get("endDate") || undefined;
        status = url.searchParams.get("status");
        type = url.searchParams.get("type") || undefined;
      }
    } catch (parseError) {
      console.warn("Failed to parse request body, using defaults:", parseError);
    }

    console.log(`Admin ${admin.id} fetching transactions`, { startDate, endDate, status, type, limit });

    const applyCommonFilters = <T extends { gte: Function; lte: Function; eq: Function; limit: Function }>(
      query: T,
      opts: { statusColumn?: boolean } = {},
    ) => {
      let q = query.limit(limit);
      if (startDate) q = q.gte("created_at", startDate);
      if (endDate) q = q.lte("created_at", endDate);
      if (opts.statusColumn && status && status !== "all") q = q.eq("status", status);
      return q;
    };

    let userTxQuery = supabase
      .from("user_transactions")
      .select("id, user_id, amount, balance_before, balance_after, transaction_type, description, reference, created_at")
      .order("created_at", { ascending: false });
    userTxQuery = applyCommonFilters(userTxQuery);
    if (type && type !== "all") userTxQuery = userTxQuery.eq("transaction_type", type);

    const [
      userTxRes,
      airtimeRes,
      dataRes,
      transferRes,
      fundingRes,
      electricityRes,
      cableRes,
      educationRes,
      bettingRes,
    ] = await Promise.all([
      userTxQuery,
      applyCommonFilters(
        supabase
          .from("airtime_transactions")
          .select("id, user_id, amount, balance_before, balance_after, phone_number, network, status, reference, created_at")
          .order("created_at", { ascending: false }),
        { statusColumn: true },
      ),
      applyCommonFilters(
        supabase
          .from("data_transactions")
          .select("id, user_id, amount, balance_before, balance_after, phone_number, network, plan_name, status, reference, created_at")
          .order("created_at", { ascending: false }),
        { statusColumn: true },
      ),
      applyCommonFilters(
        supabase
          .from("transfer_transactions")
          .select("id, sender_id, recipient_id, amount, description, reference, status, sender_balance_before, sender_balance_after, created_at")
          .order("created_at", { ascending: false }),
        { statusColumn: true },
      ),
      applyCommonFilters(
        supabase
          .from("funding_transactions")
          .select("id, user_id, amount, account_name, account_number, bank_name, reference, status, created_at")
          .order("created_at", { ascending: false }),
        { statusColumn: true },
      ),
      applyCommonFilters(
        supabase
          .from("electricity_transactions")
          .select("id, user_id, amount, balance_before, balance_after, meter_number, provider, meter_type, status, reference, token, customer_name, created_at")
          .order("created_at", { ascending: false }),
        { statusColumn: true },
      ),
      applyCommonFilters(
        supabase
          .from("cable_tv_transactions")
          .select("id, user_id, amount, balance_before, balance_after, smartcard_number, provider, plan_name, status, reference, created_at")
          .order("created_at", { ascending: false }),
        { statusColumn: true },
      ),
      applyCommonFilters(
        supabase
          .from("education_transactions")
          .select("id, user_id, amount, balance_before, balance_after, phone_number, exam_type, status, reference, created_at")
          .order("created_at", { ascending: false }),
        { statusColumn: true },
      ),
      applyCommonFilters(
        supabase
          .from("betting_transactions")
          .select("id, user_id, amount, balance_before, balance_after, account_number, betting_provider, status, reference, created_at")
          .order("created_at", { ascending: false }),
        { statusColumn: true },
      ),
    ]);

    if (userTxRes.error) {
      console.error("User transactions error:", userTxRes.error);
      throw new Error("Failed to fetch user transactions");
    }

    const userTransactions = (userTxRes.data || []) as TxRow[];
    const airtimeTransactions = airtimeRes.error ? [] : ((airtimeRes.data || []) as TxRow[]);
    const dataTransactions = dataRes.error ? [] : ((dataRes.data || []) as TxRow[]);
    const transferTransactions = transferRes.error ? [] : ((transferRes.data || []) as TxRow[]);
    const fundingTransactions = fundingRes.error ? [] : ((fundingRes.data || []) as TxRow[]);
    const electricityTransactions = electricityRes.error ? [] : ((electricityRes.data || []) as TxRow[]);
    const cableTvTransactions = cableRes.error ? [] : ((cableRes.data || []) as TxRow[]);
    const educationTransactions = educationRes.error ? [] : ((educationRes.data || []) as TxRow[]);
    const bettingTransactions = bettingRes.error ? [] : ((bettingRes.data || []) as TxRow[]);

    if (airtimeRes.error) console.error("Airtime transactions error:", airtimeRes.error);
    if (dataRes.error) console.error("Data transactions error:", dataRes.error);
    if (transferRes.error) console.error("Transfer transactions error:", transferRes.error);
    if (fundingRes.error) console.error("Funding transactions error:", fundingRes.error);
    if (electricityRes.error) console.error("Electricity transactions error:", electricityRes.error);
    if (cableRes.error) console.error("Cable TV transactions error:", cableRes.error);
    if (educationRes.error) console.error("Education transactions error:", educationRes.error);
    if (bettingRes.error) console.error("Betting transactions error:", bettingRes.error);

    const allUserIds = [
      ...userTransactions.map((tx) => tx.user_id as string),
      ...airtimeTransactions.map((tx) => tx.user_id as string),
      ...dataTransactions.map((tx) => tx.user_id as string),
      ...transferTransactions.flatMap((tx) => [tx.sender_id as string, tx.recipient_id as string]),
      ...fundingTransactions.map((tx) => tx.user_id as string),
      ...electricityTransactions.map((tx) => tx.user_id as string),
      ...cableTvTransactions.map((tx) => tx.user_id as string),
      ...educationTransactions.map((tx) => tx.user_id as string),
      ...bettingTransactions.map((tx) => tx.user_id as string),
    ].filter((id, index, self) => id && self.indexOf(id) === index);

    const profileMap = new Map<string, { full_name?: string | null; email?: string | null }>();
    if (allUserIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", allUserIds);
      for (const profile of profiles || []) {
        profileMap.set(profile.id, { full_name: profile.full_name, email: profile.email });
      }
    }

    const displayName = (userId: string) => {
      const profile = profileMap.get(userId);
      return profile?.full_name || profile?.email || "Unknown";
    };

    const allTransactions = [
      ...userTransactions.map((tx) => ({
        id: tx.id,
        reference: tx.reference,
        user: displayName(tx.user_id as string),
        email: profileMap.get(tx.user_id as string)?.email,
        type: tx.transaction_type,
        amount: tx.amount,
        balanceBefore: tx.balance_before,
        balanceAfter: tx.balance_after,
        description: tx.description,
        status: "completed",
        date: tx.created_at,
        category: "user_transaction",
      })),
      ...airtimeTransactions.map((tx) => ({
        id: tx.id,
        reference: tx.reference,
        user: displayName(tx.user_id as string),
        email: profileMap.get(tx.user_id as string)?.email,
        type: "Airtime Purchase",
        amount: tx.amount,
        balanceBefore: tx.balance_before,
        balanceAfter: tx.balance_after,
        description: `${tx.network} - ${tx.phone_number}`,
        status: tx.status,
        date: tx.created_at,
        category: "airtime",
      })),
      ...dataTransactions.map((tx) => ({
        id: tx.id,
        reference: tx.reference,
        user: displayName(tx.user_id as string),
        email: profileMap.get(tx.user_id as string)?.email,
        type: "Data Purchase",
        amount: tx.amount,
        balanceBefore: tx.balance_before,
        balanceAfter: tx.balance_after,
        description: `${tx.network} - ${tx.plan_name}`,
        status: tx.status,
        date: tx.created_at,
        category: "data",
      })),
      ...transferTransactions.map((tx) => {
        const recipient = profileMap.get(tx.recipient_id as string);
        return {
          id: tx.id,
          reference: tx.reference,
          user: displayName(tx.sender_id as string),
          email: profileMap.get(tx.sender_id as string)?.email,
          type: "Transfer",
          amount: tx.amount,
          balanceBefore: tx.sender_balance_before,
          balanceAfter: tx.sender_balance_after,
          description: `Transfer to ${recipient?.full_name || recipient?.email || "User"}${tx.description ? ` - ${tx.description}` : ""}`,
          status: tx.status,
          date: tx.created_at,
          category: "transfer",
        };
      }),
      ...fundingTransactions.map((tx) => ({
        id: tx.id,
        reference: tx.reference,
        user: displayName(tx.user_id as string),
        email: profileMap.get(tx.user_id as string)?.email,
        type: "Wallet Funding",
        amount: tx.amount,
        balanceBefore: 0,
        balanceAfter: 0,
        description: `${tx.bank_name || "Bank"} - ${tx.account_number || "N/A"}`,
        status: tx.status,
        date: tx.created_at,
        category: "funding",
      })),
      ...electricityTransactions.map((tx) => ({
        id: tx.id,
        reference: tx.reference,
        user: displayName(tx.user_id as string),
        email: profileMap.get(tx.user_id as string)?.email,
        type: "Electricity Purchase",
        amount: tx.amount,
        balanceBefore: tx.balance_before,
        balanceAfter: tx.balance_after,
        description: `${tx.provider} - ${String(tx.meter_type || "").toUpperCase()} - ${tx.meter_number || "N/A"}${tx.customer_name ? ` (${tx.customer_name})` : ""}${tx.token ? ` - Token: ${tx.token}` : ""}`,
        status: tx.status,
        date: tx.created_at,
        category: "electricity",
        token: tx.token,
      })),
      ...cableTvTransactions.map((tx) => ({
        id: tx.id,
        reference: tx.reference,
        user: displayName(tx.user_id as string),
        email: profileMap.get(tx.user_id as string)?.email,
        type: "Cable TV Purchase",
        amount: tx.amount,
        balanceBefore: tx.balance_before,
        balanceAfter: tx.balance_after,
        description: `${tx.provider} - ${tx.plan_name || "N/A"} - ${tx.smartcard_number || "N/A"}`,
        status: tx.status,
        date: tx.created_at,
        category: "cable_tv",
      })),
      ...educationTransactions.map((tx) => ({
        id: tx.id,
        reference: tx.reference,
        user: displayName(tx.user_id as string),
        email: profileMap.get(tx.user_id as string)?.email,
        type: "Education Payment",
        amount: tx.amount,
        balanceBefore: tx.balance_before,
        balanceAfter: tx.balance_after,
        description: `${tx.exam_type || "Education"} - ${tx.phone_number || "N/A"}`,
        status: tx.status,
        date: tx.created_at,
        category: "education",
      })),
      ...bettingTransactions.map((tx) => ({
        id: tx.id,
        reference: tx.reference,
        user: displayName(tx.user_id as string),
        email: profileMap.get(tx.user_id as string)?.email,
        type: "Betting Funding",
        amount: tx.amount,
        balanceBefore: tx.balance_before,
        balanceAfter: tx.balance_after,
        description: `${tx.betting_provider || "Betting"} - ${tx.account_number || "N/A"}`,
        status: tx.status,
        date: tx.created_at,
        category: "betting",
      })),
    ];

    allTransactions.sort(
      (a, b) => new Date(String(b.date)).getTime() - new Date(String(a.date)).getTime(),
    );

    console.log(`Fetched ${allTransactions.length} total transactions`);

    return jsonResponse({
      success: true,
      data: allTransactions,
      meta: {
        count: allTransactions.length,
        startDate: startDate || null,
        endDate: endDate || null,
      },
    });
  } catch (error) {
    console.error("Fetch transactions error:", error);
    return errorResponse(error, 500);
  }
});
