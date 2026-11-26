import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  createServiceClient,
  errorResponse,
  jsonResponse,
  requireAdmin,
} from "../_shared/admin-auth.ts";

type RevenueRow = {
  id: string;
  transaction_id?: string | null;
  transaction_type: string;
  transaction_table?: string | null;
  revenue_amount: number;
  purchase_amount?: number | null;
  charge_fee_rate?: number | null;
  user_id: string;
  transaction_reference?: string | null;
  transaction_status?: string | null;
  metadata?: unknown;
  created_at: string;
  profiles?: { full_name?: string | null; email?: string | null } | null;
};

function emptyStats() {
  return {
    totalRevenue: 0,
    fundingFeeRevenue: 0,
    educationRevenue: 0,
    electricityRevenue: 0,
    dataRevenue: 0,
    airtimeRevenue: 0,
    bettingRevenue: 0,
    cableTvRevenue: 0,
    totalTransactions: 0,
    fundingFeeTransactions: 0,
    educationTransactions: 0,
    electricityTransactions: 0,
    dataTransactions: 0,
    airtimeTransactions: 0,
    bettingTransactions: 0,
    cableTvTransactions: 0,
    averageRevenuePerTransaction: 0,
  };
}

function isCableType(type: string) {
  return type === "cable_tv" || type === "cable";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const supabase = createServiceClient();
    await requireAdmin(req, supabase);

    let typeFilter = "all";
    let dateFilter = "all";
    let limit = 1000;

    try {
      const body = req.method === "POST" ? await req.json() : {};
      if (body?.typeFilter) typeFilter = String(body.typeFilter);
      if (body?.dateFilter) dateFilter = String(body.dateFilter);
      if (body?.limit) limit = Math.min(Math.max(Number(body.limit) || 1000, 1), 5000);
    } catch {
      // empty body
    }

    const now = new Date();
    let startDate: string | null = null;
    switch (dateFilter) {
      case "today":
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        break;
      case "week":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        break;
      case "month":
        startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        break;
      case "year":
        startDate = new Date(now.getFullYear(), 0, 1).toISOString();
        break;
      default:
        startDate = null;
    }

    // Full stats query (not limited) for accurate totals
    let statsQuery = supabase
      .from("platform_revenue")
      .select("revenue_amount, transaction_type, transaction_status");
    if (startDate) statsQuery = statsQuery.gte("created_at", startDate);

    let fundingStatsQuery = supabase
      .from("user_transactions")
      .select("amount")
      .eq("transaction_type", "funding_fee");
    if (startDate) fundingStatsQuery = fundingStatsQuery.gte("created_at", startDate);

    // List query for table rows
    let listQuery = supabase
      .from("platform_revenue")
      .select(`
        id,
        transaction_id,
        transaction_type,
        transaction_table,
        revenue_amount,
        purchase_amount,
        charge_fee_rate,
        user_id,
        transaction_reference,
        transaction_status,
        metadata,
        created_at
      `)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (startDate) listQuery = listQuery.gte("created_at", startDate);
    if (typeFilter !== "all" && typeFilter !== "funding_fee") {
      if (typeFilter === "cable_tv") {
        listQuery = listQuery.in("transaction_type", ["cable_tv", "cable"]);
      } else {
        listQuery = listQuery.eq("transaction_type", typeFilter);
      }
    }

    let fundingListQuery = supabase
      .from("user_transactions")
      .select("id, user_id, amount, reference, description, created_at")
      .eq("transaction_type", "funding_fee")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (startDate) fundingListQuery = fundingListQuery.gte("created_at", startDate);

    const includePlatformList = typeFilter !== "funding_fee";
    const includeFundingList = typeFilter === "all" || typeFilter === "funding_fee";

    const [statsRes, fundingStatsRes, listRes, fundingListRes] = await Promise.all([
      statsQuery,
      fundingStatsQuery,
      includePlatformList ? listQuery : Promise.resolve({ data: [], error: null }),
      includeFundingList ? fundingListQuery : Promise.resolve({ data: [], error: null }),
    ]);

    if (statsRes.error) throw statsRes.error;
    if (fundingStatsRes.error) throw fundingStatsRes.error;
    if (listRes.error) throw listRes.error;
    if (fundingListRes.error) throw fundingListRes.error;

    const revenueData = statsRes.data || [];
    const fundingFeeRows = fundingStatsRes.data || [];
    const fundingFeeRevenue = fundingFeeRows.reduce((sum, r) => sum + Number(r.amount || 0), 0);

    const sumByType = (type: string) =>
      revenueData
        .filter((r) => String(r.transaction_type) === type)
        .reduce((sum, r) => sum + Number(r.revenue_amount || 0), 0);

    const countByType = (type: string) =>
      revenueData.filter((r) => String(r.transaction_type) === type).length;

    const cableRevenue = revenueData
      .filter((r) => isCableType(String(r.transaction_type)))
      .reduce((sum, r) => sum + Number(r.revenue_amount || 0), 0);
    const cableCount = revenueData.filter((r) => isCableType(String(r.transaction_type))).length;

    const platformTotal = revenueData.reduce((sum, r) => sum + Number(r.revenue_amount || 0), 0);
    const totalRevenue = platformTotal + fundingFeeRevenue;
    const totalTransactions = revenueData.length + fundingFeeRows.length;

    const stats = {
      ...emptyStats(),
      totalRevenue,
      fundingFeeRevenue,
      educationRevenue: sumByType("education"),
      electricityRevenue: sumByType("electricity"),
      dataRevenue: sumByType("data"),
      airtimeRevenue: sumByType("airtime"),
      bettingRevenue: sumByType("betting"),
      cableTvRevenue: cableRevenue,
      totalTransactions,
      fundingFeeTransactions: fundingFeeRows.length,
      educationTransactions: countByType("education"),
      electricityTransactions: countByType("electricity"),
      dataTransactions: countByType("data"),
      airtimeTransactions: countByType("airtime"),
      bettingTransactions: countByType("betting"),
      cableTvTransactions: cableCount,
      averageRevenuePerTransaction: totalTransactions > 0 ? totalRevenue / totalTransactions : 0,
    };

    const platformRows = (listRes.data || []) as RevenueRow[];
    const fundingRows = (fundingListRes.data || []) as Array<{
      id: string;
      user_id: string;
      amount: number;
      reference?: string | null;
      description?: string | null;
      created_at: string;
    }>;

    const userIds = [
      ...platformRows.map((r) => r.user_id),
      ...fundingRows.map((r) => r.user_id),
    ].filter((id, index, self) => id && self.indexOf(id) === index);

    const profileMap = new Map<string, { full_name?: string | null; email?: string | null }>();
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);
      for (const profile of profiles || []) {
        profileMap.set(profile.id, { full_name: profile.full_name, email: profile.email });
      }
    }

    const fundingFeeRevenueRows: RevenueRow[] = fundingRows.map((item) => ({
      id: `funding-fee-${item.id}`,
      transaction_id: item.id,
      transaction_type: "funding_fee",
      transaction_table: "user_transactions",
      revenue_amount: Number(item.amount || 0),
      purchase_amount: Number(item.amount || 0),
      charge_fee_rate: 0.05,
      user_id: item.user_id,
      transaction_reference: item.reference || null,
      transaction_status: "completed",
      metadata: { description: item.description, source: "flutterwave_funding_fee" },
      created_at: item.created_at,
      profiles: profileMap.get(item.user_id) || null,
    }));

    const combined = [
      ...platformRows.map((row) => ({
        ...row,
        profiles: profileMap.get(row.user_id) || null,
      })),
      ...fundingFeeRevenueRows,
    ]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, limit);

    return jsonResponse({
      success: true,
      data: combined,
      stats,
      meta: {
        count: combined.length,
        typeFilter,
        dateFilter,
        startDate,
      },
    });
  } catch (error) {
    console.error("fetch-admin-platform-revenue error:", error);
    return errorResponse(error, 500);
  }
});
