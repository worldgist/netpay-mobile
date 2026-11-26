import { useEffect, useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  TrendingUp,
  DollarSign,
  Users,
  Circle,
  Activity,
  Smartphone,
  Wifi,
  Zap,
  Tv,
  GraduationCap,
  Dices,
  Receipt,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

const BILL_FEATURES = [
  { key: "airtime", label: "Airtime", icon: Smartphone, color: "hsl(var(--primary))" },
  { key: "data", label: "Data", icon: Wifi, color: "hsl(var(--chart-2))" },
  { key: "electricity", label: "Electricity", icon: Zap, color: "hsl(var(--chart-3))" },
  { key: "cable_tv", label: "Cable TV", icon: Tv, color: "hsl(var(--chart-4))" },
  { key: "education", label: "Education", icon: GraduationCap, color: "hsl(var(--chart-5))" },
  { key: "betting", label: "Betting", icon: Dices, color: "hsl(142 76% 36%)" },
] as const;

type BillFeatureKey = (typeof BILL_FEATURES)[number]["key"];

type BillFeatureStats = {
  revenue: number;
  transactions: number;
  volume: number;
};

const emptyBillStats = (): Record<BillFeatureKey, BillFeatureStats> =>
  Object.fromEntries(
    BILL_FEATURES.map((f) => [f.key, { revenue: 0, transactions: 0, volume: 0 }])
  ) as Record<BillFeatureKey, BillFeatureStats>;

const PIE_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(142 76% 36%)",
];

export default function Analytics() {
  const [stats, setStats] = useState({
    totalRevenue: 0,
    activeUsers: 0,
    transactionVolume: 0,
    growthRate: 0,
  });
  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [userGrowthData, setUserGrowthData] = useState<any[]>([]);
  const [transactionVolumeData, setTransactionVolumeData] = useState<any[]>([]);
  const [billStats, setBillStats] = useState<Record<BillFeatureKey, BillFeatureStats>>(emptyBillStats);
  const [billRevenueByDay, setBillRevenueByDay] = useState<any[]>([]);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  useEffect(() => {
    fetchAnalytics();

    const transactionsChannel = supabase
      .channel("analytics-transactions")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_transactions",
        },
        () => {
          fetchAnalytics();
          setLastUpdate(new Date());
        }
      )
      .subscribe();

    const revenueChannel = supabase
      .channel("analytics-platform-revenue")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "platform_revenue",
        },
        () => {
          fetchAnalytics();
          setLastUpdate(new Date());
        }
      )
      .subscribe();

    const profilesChannel = supabase
      .channel("analytics-profiles")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "profiles",
        },
        () => {
          fetchAnalytics();
          setLastUpdate(new Date());
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(transactionsChannel);
      supabase.removeChannel(revenueChannel);
      supabase.removeChannel(profilesChannel);
    };
  }, []);

  const fetchAnalytics = async () => {
    try {
      const { data: platformRevenueRows } = await supabase
        .from("platform_revenue")
        .select("revenue_amount, transaction_type, created_at")
        .eq("transaction_status", "completed");

      const { data: fundingFeeRows } = await supabase
        .from("user_transactions")
        .select("amount")
        .eq("transaction_type", "funding_fee");

      const totalRevenue =
        (platformRevenueRows?.reduce((sum, t) => sum + Number(t.revenue_amount || 0), 0) || 0) +
        (fundingFeeRows?.reduce((sum, t) => sum + Number(t.amount || 0), 0) || 0);

      const { count: userCount } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true });

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { count: transactionCount } = await supabase
        .from("user_transactions")
        .select("*", { count: "exact", head: true })
        .gte("created_at", thirtyDaysAgo.toISOString());

      setStats({
        totalRevenue,
        activeUsers: userCount || 0,
        transactionVolume: transactionCount || 0,
        growthRate: 23.5,
      });

      // Bill payment feature stats from platform_revenue
      const nextBillStats = emptyBillStats();
      for (const row of platformRevenueRows || []) {
        const type = String(row.transaction_type || "").toLowerCase() as BillFeatureKey;
        if (type in nextBillStats) {
          nextBillStats[type].revenue += Number(row.revenue_amount || 0);
          nextBillStats[type].transactions += 1;
        }
      }

      // Bill payment volume (gross amount) from user_transactions
      const billKeys = BILL_FEATURES.map((f) => f.key);
      const { data: billVolumeRows } = await supabase
        .from("user_transactions")
        .select("amount, transaction_type")
        .in("transaction_type", billKeys as unknown as string[]);

      for (const row of billVolumeRows || []) {
        const type = String(row.transaction_type || "").toLowerCase() as BillFeatureKey;
        if (type in nextBillStats) {
          nextBillStats[type].volume += Math.abs(Number(row.amount || 0));
        }
      }

      setBillStats(nextBillStats);

      const last7Days = Array.from({ length: 7 }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - (6 - i));
        return date.toISOString().split("T")[0];
      });

      const revenueByDay = await Promise.all(
        last7Days.map(async (date) => {
          const nextDay = new Date(date);
          nextDay.setDate(nextDay.getDate() + 1);
          const nextDayStr = nextDay.toISOString().split("T")[0];

          const dayPlatformRevenue = (platformRevenueRows || []).filter((t) => {
            const created = String(t.created_at || "").slice(0, 10);
            return created >= date && created < nextDayStr;
          });

          const { data: dayFundingFees } = await supabase
            .from("user_transactions")
            .select("amount")
            .eq("transaction_type", "funding_fee")
            .gte("created_at", date)
            .lt("created_at", nextDayStr);

          const total =
            dayPlatformRevenue.reduce((sum, t) => sum + Number(t.revenue_amount || 0), 0) +
            (dayFundingFees?.reduce((sum, t) => sum + Number(t.amount || 0), 0) || 0);

          return {
            date: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
            revenue: total,
          };
        })
      );

      setRevenueData(revenueByDay);

      // Bill revenue by day (stacked categories)
      const billByDay = last7Days.map((date) => {
        const nextDay = new Date(date);
        nextDay.setDate(nextDay.getDate() + 1);
        const nextDayStr = nextDay.toISOString().split("T")[0];
        const entry: Record<string, string | number> = {
          date: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        };
        for (const feature of BILL_FEATURES) {
          entry[feature.key] = (platformRevenueRows || [])
            .filter((t) => {
              const created = String(t.created_at || "").slice(0, 10);
              return (
                String(t.transaction_type || "").toLowerCase() === feature.key &&
                created >= date &&
                created < nextDayStr
              );
            })
            .reduce((sum, t) => sum + Number(t.revenue_amount || 0), 0);
        }
        return entry;
      });
      setBillRevenueByDay(billByDay);

      const usersByDay = await Promise.all(
        last7Days.map(async (date) => {
          const nextDay = new Date(date);
          nextDay.setDate(nextDay.getDate() + 1);

          const { count } = await supabase
            .from("profiles")
            .select("*", { count: "exact", head: true })
            .gte("created_at", date)
            .lt("created_at", nextDay.toISOString().split("T")[0]);

          return {
            date: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
            users: count || 0,
          };
        })
      );

      setUserGrowthData(usersByDay);

      const transactionsByDay = await Promise.all(
        last7Days.map(async (date) => {
          const nextDay = new Date(date);
          nextDay.setDate(nextDay.getDate() + 1);

          const { count } = await supabase
            .from("user_transactions")
            .select("*", { count: "exact", head: true })
            .gte("created_at", date)
            .lt("created_at", nextDay.toISOString().split("T")[0]);

          return {
            date: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
            transactions: count || 0,
          };
        })
      );

      setTransactionVolumeData(transactionsByDay);
    } catch (error) {
      console.error("Error fetching analytics:", error);
    }
  };

  const formatNaira = (value: number) =>
    `₦${value.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const totalBillRevenue = BILL_FEATURES.reduce((sum, f) => sum + billStats[f.key].revenue, 0);
  const totalBillTransactions = BILL_FEATURES.reduce((sum, f) => sum + billStats[f.key].transactions, 0);
  const totalBillVolume = BILL_FEATURES.reduce((sum, f) => sum + billStats[f.key].volume, 0);

  const billBarData = BILL_FEATURES.map((f) => ({
    name: f.label,
    revenue: billStats[f.key].revenue,
    transactions: billStats[f.key].transactions,
    volume: billStats[f.key].volume,
  }));

  const billPieData = BILL_FEATURES.filter((f) => billStats[f.key].revenue > 0).map((f) => ({
    name: f.label,
    value: billStats[f.key].revenue,
  }));

  const statsCards = [
    {
      title: "Total Revenue",
      value: formatNaira(stats.totalRevenue),
      change: "+20.1%",
      icon: DollarSign,
      trend: "up",
    },
    {
      title: "Active Users",
      value: stats.activeUsers.toString(),
      change: "+12.5%",
      icon: Users,
      trend: "up",
    },
    {
      title: "Transaction Volume",
      value: stats.transactionVolume.toString(),
      change: "+8.3%",
      icon: Activity,
      trend: "up",
    },
    {
      title: "Bill Payments",
      value: totalBillTransactions.toString(),
      change: formatNaira(totalBillRevenue),
      icon: Receipt,
      trend: "up",
    },
  ];

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex h-16 items-center justify-between px-6">
              <div className="flex items-center gap-4">
                <SidebarTrigger />
                <div>
                  <h1 className="text-2xl font-bold">Analytics</h1>
                  <p className="text-xs text-muted-foreground">
                    Last updated: {lastUpdate.toLocaleTimeString()}
                  </p>
                </div>
              </div>
              <Badge variant="outline" className="gap-1">
                <Circle className="h-2 w-2 fill-green-500 text-green-500 animate-pulse" />
                Live Updates
              </Badge>
            </div>
          </header>

          <div className="p-6 space-y-6">
            <Tabs defaultValue="overview">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="bills">Bill Payments</TabsTrigger>
                <TabsTrigger value="revenue">Revenue</TabsTrigger>
                <TabsTrigger value="users">Users</TabsTrigger>
                <TabsTrigger value="performance">Performance</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  {statsCards.map((stat, index) => (
                    <Card key={index}>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                        <stat.icon className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{stat.value}</div>
                        <p className={`text-xs ${stat.trend === "up" ? "text-primary" : "text-destructive"}`}>
                          {stat.title === "Bill Payments"
                            ? `${stat.change} platform fees`
                            : `${stat.change} from last month`}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>Revenue Trends</CardTitle>
                      <CardDescription>Last 7 days revenue</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={revenueData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="date" />
                          <YAxis />
                          <Tooltip />
                          <Line
                            type="monotone"
                            dataKey="revenue"
                            stroke="hsl(var(--primary))"
                            strokeWidth={2}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Bill Payment Revenue</CardTitle>
                      <CardDescription>Platform fees by feature</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={billBarData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" />
                          <YAxis tickFormatter={(v) => `₦${Number(v).toLocaleString()}`} />
                          <Tooltip
                            formatter={(value: number) => [
                              formatNaira(Number(value)),
                              "Revenue",
                            ]}
                          />
                          <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Transaction Volume</CardTitle>
                    <CardDescription>Daily transaction activity (last 7 days)</CardDescription>
                  </CardHeader>
                  <CardContent className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={transactionVolumeData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip />
                        <Line
                          type="monotone"
                          dataKey="transactions"
                          stroke="hsl(var(--chart-2))"
                          strokeWidth={2}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="bills" className="space-y-6">
                <div className="grid gap-4 md:grid-cols-3">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Bill Payment Fees</CardTitle>
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">{formatNaira(totalBillRevenue)}</div>
                      <p className="text-xs text-muted-foreground mt-1">Platform revenue from bills</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Bill Transactions</CardTitle>
                      <Receipt className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">{totalBillTransactions.toLocaleString()}</div>
                      <p className="text-xs text-muted-foreground mt-1">Completed bill payments</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Gross Bill Volume</CardTitle>
                      <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">{formatNaira(totalBillVolume)}</div>
                      <p className="text-xs text-muted-foreground mt-1">Total amount paid by users</p>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {BILL_FEATURES.map((feature) => {
                    const Icon = feature.icon;
                    const featureStats = billStats[feature.key];
                    return (
                      <Card key={feature.key}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <CardTitle className="text-sm font-medium">{feature.label}</CardTitle>
                          <Icon className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent className="space-y-1">
                          <div className="text-2xl font-bold">{formatNaira(featureStats.revenue)}</div>
                          <p className="text-xs text-muted-foreground">
                            {featureStats.transactions.toLocaleString()} txns · volume{" "}
                            {formatNaira(featureStats.volume)}
                          </p>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>Revenue by Feature</CardTitle>
                      <CardDescription>Platform fees from each bill payment service</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[360px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={billBarData} layout="vertical" margin={{ left: 16 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" tickFormatter={(v) => `₦${Number(v).toLocaleString()}`} />
                          <YAxis type="category" dataKey="name" width={90} />
                          <Tooltip
                            formatter={(value: number) => [formatNaira(Number(value)), "Revenue"]}
                          />
                          <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Revenue Mix</CardTitle>
                      <CardDescription>Share of bill payment platform fees</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[360px]">
                      {billPieData.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                          No bill payment revenue yet
                        </div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={billPieData}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              outerRadius={110}
                              label={({ name, percent }) =>
                                `${name} ${(percent * 100).toFixed(0)}%`
                              }
                            >
                              {billPieData.map((_, index) => (
                                <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value: number) => formatNaira(Number(value))} />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Bill Payment Trends</CardTitle>
                    <CardDescription>Daily platform fees by feature (last 7 days)</CardDescription>
                  </CardHeader>
                  <CardContent className="h-[360px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={billRevenueByDay}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis tickFormatter={(v) => `₦${Number(v).toLocaleString()}`} />
                        <Tooltip
                          formatter={(value: number, name: string) => [
                            formatNaira(Number(value)),
                            BILL_FEATURES.find((f) => f.key === name)?.label || name,
                          ]}
                        />
                        <Legend
                          formatter={(value) =>
                            BILL_FEATURES.find((f) => f.key === value)?.label || value
                          }
                        />
                        {BILL_FEATURES.map((feature, index) => (
                          <Bar
                            key={feature.key}
                            dataKey={feature.key}
                            stackId="bills"
                            fill={PIE_COLORS[index % PIE_COLORS.length]}
                          />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Transaction Counts</CardTitle>
                    <CardDescription>Completed bill payments by feature</CardDescription>
                  </CardHeader>
                  <CardContent className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={billBarData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis allowDecimals={false} />
                        <Tooltip formatter={(value: number) => [value, "Transactions"]} />
                        <Bar dataKey="transactions" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="revenue" className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">{formatNaira(stats.totalRevenue)}</div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Platform fees + funding fees (all time)
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">7-Day Revenue</CardTitle>
                      <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">
                        {formatNaira(revenueData.reduce((sum, d) => sum + (d.revenue || 0), 0))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Last 7 days combined</p>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Revenue Trends</CardTitle>
                    <CardDescription>Daily revenue over the last 7 days</CardDescription>
                  </CardHeader>
                  <CardContent className="h-[360px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={revenueData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis tickFormatter={(v) => `₦${Number(v).toLocaleString()}`} />
                        <Tooltip
                          formatter={(value: number) => [
                            formatNaira(Number(value)),
                            "Revenue",
                          ]}
                        />
                        <Line
                          type="monotone"
                          dataKey="revenue"
                          stroke="hsl(var(--primary))"
                          strokeWidth={2}
                          dot={{ r: 4 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="users" className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                      <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">{stats.activeUsers.toLocaleString()}</div>
                      <p className="text-xs text-muted-foreground mt-1">Registered accounts</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">New Users (7 days)</CardTitle>
                      <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">
                        {userGrowthData.reduce((sum, d) => sum + (d.users || 0), 0).toLocaleString()}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Sign-ups in the last week</p>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>User Growth</CardTitle>
                    <CardDescription>New registrations per day (last 7 days)</CardDescription>
                  </CardHeader>
                  <CardContent className="h-[360px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={userGrowthData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis allowDecimals={false} />
                        <Tooltip formatter={(value: number) => [value, "New users"]} />
                        <Bar dataKey="users" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="performance" className="space-y-6">
                <div className="grid gap-4 md:grid-cols-3">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Transactions (30d)</CardTitle>
                      <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">{stats.transactionVolume.toLocaleString()}</div>
                      <p className="text-xs text-muted-foreground mt-1">Last 30 days</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Transactions (7d)</CardTitle>
                      <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">
                        {transactionVolumeData
                          .reduce((sum, d) => sum + (d.transactions || 0), 0)
                          .toLocaleString()}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Last 7 days</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Bill Payment Share</CardTitle>
                      <Receipt className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">
                        {stats.totalRevenue > 0
                          ? `${((totalBillRevenue / stats.totalRevenue) * 100).toFixed(1)}%`
                          : "0%"}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Of total platform revenue</p>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Transaction Volume</CardTitle>
                    <CardDescription>Daily transaction count (last 7 days)</CardDescription>
                  </CardHeader>
                  <CardContent className="h-[360px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={transactionVolumeData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis allowDecimals={false} />
                        <Tooltip formatter={(value: number) => [value, "Transactions"]} />
                        <Line
                          type="monotone"
                          dataKey="transactions"
                          stroke="hsl(var(--chart-2))"
                          strokeWidth={2}
                          dot={{ r: 4 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
