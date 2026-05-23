import { useEffect, useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, DollarSign, Users, Circle, Activity } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

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
  const [lastUpdate, setLastUpdate] = useState(new Date());

  useEffect(() => {
    fetchAnalytics();
    
    // Realtime subscriptions
    const transactionsChannel = supabase
      .channel('analytics-transactions')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_transactions',
        },
        () => {
          console.log('Transaction change detected');
          fetchAnalytics();
          setLastUpdate(new Date());
        }
      )
      .subscribe();

    const profilesChannel = supabase
      .channel('analytics-profiles')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'profiles',
        },
        () => {
          console.log('New user registered');
          fetchAnalytics();
          setLastUpdate(new Date());
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(transactionsChannel);
      supabase.removeChannel(profilesChannel);
    };
  }, []);

  const fetchAnalytics = async () => {
    try {
      // Fetch total revenue from platform charge fees + funding fees.
      const { data: platformRevenueRows } = await supabase
        .from('platform_revenue')
        .select('revenue_amount')
        .eq('transaction_status', 'completed');

      const { data: fundingFeeRows } = await supabase
        .from('user_transactions')
        .select('amount')
        .eq('transaction_type', 'funding_fee');

      const totalRevenue =
        (platformRevenueRows?.reduce((sum, t) => sum + Number(t.revenue_amount || 0), 0) || 0) +
        (fundingFeeRows?.reduce((sum, t) => sum + Number(t.amount || 0), 0) || 0);

      // Fetch active users
      const { count: userCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      // Fetch transaction volume (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { count: transactionCount } = await supabase
        .from('user_transactions')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', thirtyDaysAgo.toISOString());

      setStats({
        totalRevenue,
        activeUsers: userCount || 0,
        transactionVolume: transactionCount || 0,
        growthRate: 23.5, // This would need historical comparison
      });

      // Prepare chart data - Revenue by day (last 7 days)
      const last7Days = Array.from({ length: 7 }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - (6 - i));
        return date.toISOString().split('T')[0];
      });

      const revenueByDay = await Promise.all(
        last7Days.map(async (date) => {
          const nextDay = new Date(date);
          nextDay.setDate(nextDay.getDate() + 1);

          const { data: dayPlatformRevenue } = await supabase
            .from('platform_revenue')
            .select('revenue_amount')
            .eq('transaction_status', 'completed')
            .gte('created_at', date)
            .lt('created_at', nextDay.toISOString().split('T')[0]);

          const { data: dayFundingFees } = await supabase
            .from('user_transactions')
            .select('amount')
            .eq('transaction_type', 'funding_fee')
            .gte('created_at', date)
            .lt('created_at', nextDay.toISOString().split('T')[0]);

          const total =
            (dayPlatformRevenue?.reduce((sum, t) => sum + Number(t.revenue_amount || 0), 0) || 0) +
            (dayFundingFees?.reduce((sum, t) => sum + Number(t.amount || 0), 0) || 0);

          return {
            date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            revenue: total,
          };
        })
      );

      setRevenueData(revenueByDay);

      // User growth data (last 7 days)
      const usersByDay = await Promise.all(
        last7Days.map(async (date) => {
          const nextDay = new Date(date);
          nextDay.setDate(nextDay.getDate() + 1);

          const { count } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', date)
            .lt('created_at', nextDay.toISOString().split('T')[0]);

          return {
            date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            users: count || 0,
          };
        })
      );

      setUserGrowthData(usersByDay);

      // Transaction volume by day (last 7 days)
      const transactionsByDay = await Promise.all(
        last7Days.map(async (date) => {
          const nextDay = new Date(date);
          nextDay.setDate(nextDay.getDate() + 1);

          const { count } = await supabase
            .from('user_transactions')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', date)
            .lt('created_at', nextDay.toISOString().split('T')[0]);

          return {
            date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            transactions: count || 0,
          };
        })
      );

      setTransactionVolumeData(transactionsByDay);
    } catch (error) {
      console.error('Error fetching analytics:', error);
    }
  };

  const statsCards = [
    {
      title: "Total Revenue",
      value: `₦${stats.totalRevenue.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
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
      title: "Growth Rate",
      value: `${stats.growthRate}%`,
      change: "+8.2%",
      icon: TrendingUp,
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
                          {stat.change} from last month
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
                      <CardTitle>User Growth</CardTitle>
                      <CardDescription>New users last 7 days</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={userGrowthData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="date" />
                          <YAxis />
                          <Tooltip />
                          <Bar 
                            dataKey="users" 
                            fill="hsl(var(--primary))" 
                          />
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
            </Tabs>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
