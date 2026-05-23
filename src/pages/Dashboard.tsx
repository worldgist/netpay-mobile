import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, Users, TrendingUp, CreditCard, Circle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const Dashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [onlineAdmins, setOnlineAdmins] = useState<any[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<any[]>([]);
  const [stats, setStats] = useState({
    totalRevenue: 0,
    activeUsers: 0,
    totalTransactions: 0,
    growth: 0,
  });
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
      } else {
        setCurrentUser(session.user);
        setLoading(false);
        
        // Fetch initial data
        fetchStats();
        fetchRecentTransactions();
      }
    };
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        navigate("/auth");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  // Realtime: Admin presence tracking
  useEffect(() => {
    if (!currentUser) return;

    const channel = supabase.channel('admin-presence');

    channel
      .on('presence', { event: 'sync' }, () => {
        const presenceState = channel.presenceState();
        const admins = Object.values(presenceState).flat();
        setOnlineAdmins(admins);
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        console.log('Admin joined:', newPresences);
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        console.log('Admin left:', leftPresences);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: currentUser.id,
            email: currentUser.email,
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      channel.unsubscribe();
    };
  }, [currentUser]);

  // Realtime: Listen to transaction changes
  useEffect(() => {
    if (!currentUser) return;

    const channel = supabase
      .channel('dashboard-transactions')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_transactions',
        },
        (payload) => {
          console.log('Transaction change:', payload);
          fetchRecentTransactions();
          fetchStats();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser]);

  const fetchStats = async () => {
    try {
      // Fetch total users
      const { count: userCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      // Fetch total transactions
      const { count: transactionCount } = await supabase
        .from('user_transactions')
        .select('*', { count: 'exact', head: true });

      // Calculate platform revenue from charge fees/markup records plus funding fees.
      const { data: revenueData, error: revenueError } = await supabase
        .from('platform_revenue')
        .select('revenue_amount, transaction_status')
        .eq('transaction_status', 'completed');

      if (revenueError) {
        throw revenueError;
      }

      const { data: fundingFeeData, error: fundingFeeError } = await supabase
        .from('user_transactions')
        .select('amount')
        .eq('transaction_type', 'funding_fee');

      if (fundingFeeError) {
        throw fundingFeeError;
      }

      const platformRevenue =
        revenueData?.reduce((sum, row) => sum + Number(row.revenue_amount || 0), 0) || 0;
      const fundingFeeRevenue =
        fundingFeeData?.reduce((sum, row) => sum + Number(row.amount || 0), 0) || 0;
      const totalRevenue = platformRevenue + fundingFeeRevenue;

      setStats({
        totalRevenue,
        activeUsers: userCount || 0,
        totalTransactions: transactionCount || 0,
        growth: 23.5, // This would need historical data calculation
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const fetchRecentTransactions = async () => {
    try {
      const { data } = await supabase
        .from('user_transactions')
        .select(`
          *,
          profiles:user_id (
            full_name,
            email
          )
        `)
        .order('created_at', { ascending: false })
        .limit(5);

      setRecentTransactions(data || []);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

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
      change: "+15.2%",
      icon: Users,
      trend: "up",
    },
    {
      title: "Transactions",
      value: stats.totalTransactions.toString(),
      change: "+12.5%",
      icon: CreditCard,
      trend: "up",
    },
    {
      title: "Growth",
      value: `${stats.growth}%`,
      change: "+4.3%",
      icon: TrendingUp,
      trend: "up",
    },
  ];

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <header className="sticky top-0 z-10 backdrop-blur-sm bg-background/80 border-b border-border px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <SidebarTrigger />
                <div>
                  <h1 className="text-2xl font-bold">Dashboard</h1>
                  <p className="text-sm text-muted-foreground">Welcome back to NetPay</p>
                </div>
              </div>
              
              {/* Online Admins */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Circle className="h-2 w-2 fill-green-500 text-green-500 animate-pulse" />
                  <span className="text-sm text-muted-foreground">
                    {onlineAdmins.length} admin{onlineAdmins.length !== 1 ? 's' : ''} online
                  </span>
                </div>
                <div className="flex -space-x-2">
                  {onlineAdmins.slice(0, 3).map((admin: any, index: number) => (
                    <Avatar key={index} className="border-2 border-background w-8 h-8">
                      <AvatarFallback className="bg-primary/10 text-primary text-xs">
                        {admin.email?.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                  {onlineAdmins.length > 3 && (
                    <Avatar className="border-2 border-background w-8 h-8">
                      <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                        +{onlineAdmins.length - 3}
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>
              </div>
            </div>
          </header>

          <div className="p-6 space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {statsCards.map((stat) => (
                <Card key={stat.title} className="shadow-elegant border-border/50 transition-smooth hover:shadow-glow">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                    <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center">
                      <stat.icon className="h-5 w-5 text-primary" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stat.value}</div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <span className="text-primary font-medium">{stat.change}</span>
                      from last month
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <Card className="shadow-elegant border-border/50">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Recent Activity</CardTitle>
                      <CardDescription>Latest transactions - Live updates</CardDescription>
                    </div>
                    <Badge variant="outline" className="gap-1">
                      <Circle className="h-2 w-2 fill-green-500 text-green-500 animate-pulse" />
                      Live
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {recentTransactions.length > 0 ? (
                      recentTransactions.map((transaction) => (
                        <div key={transaction.id} className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted/50 transition-smooth">
                          <div className={`h-10 w-10 ${transaction.transaction_type === 'credit' ? 'bg-green-500/10' : 'bg-red-500/10'} rounded-full flex items-center justify-center`}>
                            <DollarSign className={`h-5 w-5 ${transaction.transaction_type === 'credit' ? 'text-green-500' : 'text-red-500'}`} />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium">
                              {transaction.transaction_type === 'credit' ? 'Credit' : 'Debit'} Transaction
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {transaction.profiles?.full_name || transaction.profiles?.email || 'Unknown'}
                            </p>
                          </div>
                          <span className={`text-sm font-medium ${transaction.transaction_type === 'credit' ? 'text-green-500' : 'text-red-500'}`}>
                            {transaction.transaction_type === 'credit' ? '+' : '-'}₦{Number(transaction.amount).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">No recent transactions</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-elegant border-border/50">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Online Admins</CardTitle>
                      <CardDescription>Currently active administrators</CardDescription>
                    </div>
                    <Badge variant="outline" className="gap-1">
                      <Circle className="h-2 w-2 fill-green-500 text-green-500 animate-pulse" />
                      {onlineAdmins.length} Online
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {onlineAdmins.length > 0 ? (
                      onlineAdmins.map((admin: any, index: number) => (
                        <div key={index} className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-smooth">
                          <Avatar className="w-10 h-10">
                            <AvatarFallback className="bg-primary/10 text-primary">
                              {admin.email?.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <p className="text-sm font-medium">{admin.email}</p>
                            <p className="text-xs text-muted-foreground">
                              Active now
                            </p>
                          </div>
                          <Circle className="h-2 w-2 fill-green-500 text-green-500" />
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">No other admins online</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};

export default Dashboard;
