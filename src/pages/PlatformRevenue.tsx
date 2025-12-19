import { useState, useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, RefreshCw, TrendingUp, DollarSign, Calendar } from "lucide-react";
import { format } from "date-fns";
import { formatNaira } from "@/lib/currency";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PlatformRevenue {
  id: string;
  transaction_id: string;
  transaction_type: string;
  transaction_table: string;
  revenue_amount: number;
  purchase_amount: number;
  charge_fee_rate: number;
  user_id: string;
  transaction_reference: string;
  transaction_status: string;
  metadata: any;
  created_at: string;
  profiles?: {
    full_name?: string | null;
    email?: string | null;
  } | null;
}

interface RevenueStats {
  totalRevenue: number;
  educationRevenue: number;
  electricityRevenue: number;
  dataRevenue: number;
  totalTransactions: number;
  educationTransactions: number;
  electricityTransactions: number;
  dataTransactions: number;
  averageRevenuePerTransaction: number;
}

export default function PlatformRevenue() {
  const [revenue, setRevenue] = useState<PlatformRevenue[]>([]);
  const [stats, setStats] = useState<RevenueStats>({
    totalRevenue: 0,
    educationRevenue: 0,
    electricityRevenue: 0,
    dataRevenue: 0,
    totalTransactions: 0,
    educationTransactions: 0,
    electricityTransactions: 0,
    dataTransactions: 0,
    averageRevenuePerTransaction: 0,
  });
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all"); // all, today, week, month, year
  const { toast } = useToast();

  useEffect(() => {
    fetchRevenue();
    fetchStats();
  }, [typeFilter, dateFilter]);

  const fetchRevenue = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('platform_revenue')
        .select(`
          *,
          profiles (
            full_name,
            email
          )
        `)
        .order('created_at', { ascending: false })
        .limit(500);

      if (typeFilter !== 'all') {
        query = query.eq('transaction_type', typeFilter);
      }

      // Apply date filter
      if (dateFilter !== 'all') {
        const now = new Date();
        let startDate: Date;
        
        switch (dateFilter) {
          case 'today':
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            break;
          case 'week':
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case 'month':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
          case 'year':
            startDate = new Date(now.getFullYear(), 0, 1);
            break;
          default:
            startDate = new Date(0);
        }
        
        query = query.gte('created_at', startDate.toISOString());
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      setRevenue(data || []);
    } catch (error: any) {
      console.error('Error fetching platform revenue:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to fetch platform revenue",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      let query = supabase
        .from('platform_revenue')
        .select('revenue_amount, transaction_type');

      // Apply date filter to stats too
      if (dateFilter !== 'all') {
        const now = new Date();
        let startDate: Date;
        
        switch (dateFilter) {
          case 'today':
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            break;
          case 'week':
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case 'month':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
          case 'year':
            startDate = new Date(now.getFullYear(), 0, 1);
            break;
          default:
            startDate = new Date(0);
        }
        
        query = query.gte('created_at', startDate.toISOString());
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      const revenueData = data || [];
      const totalRevenue = revenueData.reduce((sum, r) => sum + Number(r.revenue_amount || 0), 0);
      const educationRevenue = revenueData
        .filter(r => r.transaction_type === 'education')
        .reduce((sum, r) => sum + Number(r.revenue_amount || 0), 0);
      const electricityRevenue = revenueData
        .filter(r => r.transaction_type === 'electricity')
        .reduce((sum, r) => sum + Number(r.revenue_amount || 0), 0);
      const dataRevenue = revenueData
        .filter(r => r.transaction_type === 'data')
        .reduce((sum, r) => sum + Number(r.revenue_amount || 0), 0);
      const totalTransactions = revenueData.length;
      const educationTransactions = revenueData.filter(r => r.transaction_type === 'education').length;
      const electricityTransactions = revenueData.filter(r => r.transaction_type === 'electricity').length;
      const dataTransactions = revenueData.filter(r => r.transaction_type === 'data').length;
      const averageRevenuePerTransaction = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

      setStats({
        totalRevenue,
        educationRevenue,
        electricityRevenue,
        dataRevenue,
        totalTransactions,
        educationTransactions,
        electricityTransactions,
        dataTransactions,
        averageRevenuePerTransaction,
      });
    } catch (error: any) {
      console.error('Error fetching revenue stats:', error);
    }
  };

  const filteredRevenue = revenue.filter((r) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      r.transaction_reference?.toLowerCase().includes(searchLower) ||
      r.profiles?.full_name?.toLowerCase().includes(searchLower) ||
      r.profiles?.email?.toLowerCase().includes(searchLower) ||
      r.transaction_type?.toLowerCase().includes(searchLower)
    );
  });

  const getTypeBadgeVariant = (type: string) => {
    switch (type.toLowerCase()) {
      case 'education':
        return 'default';
      case 'electricity':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex h-16 items-center gap-4 px-6">
              <SidebarTrigger />
              <h1 className="text-2xl font-bold">Platform Revenue</h1>
            </div>
          </header>

          <div className="p-6 space-y-6">
            {/* Revenue Statistics */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatNaira(stats.totalRevenue)}</div>
                  <p className="text-xs text-muted-foreground">
                    From {stats.totalTransactions} transactions
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Education Revenue</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatNaira(stats.educationRevenue)}</div>
                  <p className="text-xs text-muted-foreground">
                    {stats.educationTransactions} transactions (7% fee)
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Electricity Revenue</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatNaira(stats.electricityRevenue)}</div>
                  <p className="text-xs text-muted-foreground">
                    {stats.electricityTransactions} transactions (10% fee)
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Data Revenue</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatNaira(stats.dataRevenue)}</div>
                  <p className="text-xs text-muted-foreground">
                    {stats.dataTransactions} transactions (markup)
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Avg Revenue/Transaction</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatNaira(stats.averageRevenuePerTransaction)}</div>
                  <p className="text-xs text-muted-foreground">
                    Average charge fee per transaction
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Revenue Records */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Revenue Records</CardTitle>
                    <CardDescription>
                      Detailed breakdown of all platform revenue from charge fees
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      fetchRevenue();
                      fetchStats();
                    }}
                    disabled={loading}
                    className="gap-2"
                  >
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 mb-4">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                    <Input
                      placeholder="Search revenue records..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Filter by type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="education">Education</SelectItem>
                      <SelectItem value="electricity">Electricity</SelectItem>
                      <SelectItem value="data">Data</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={dateFilter} onValueChange={setDateFilter}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Filter by date" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Time</SelectItem>
                      <SelectItem value="today">Today</SelectItem>
                      <SelectItem value="week">Last 7 Days</SelectItem>
                      <SelectItem value="month">This Month</SelectItem>
                      <SelectItem value="year">This Year</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead>Purchase Amount</TableHead>
                        <TableHead>Revenue (Fee)</TableHead>
                        <TableHead>Fee Rate</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-muted-foreground">
                            Loading revenue records...
                          </TableCell>
                        </TableRow>
                      ) : filteredRevenue.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-muted-foreground">
                            No revenue records found
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredRevenue.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="text-sm">
                              {format(new Date(r.created_at), 'MMM dd, yyyy HH:mm')}
                            </TableCell>
                            <TableCell>
                              <Badge variant={getTypeBadgeVariant(r.transaction_type)}>
                                {r.transaction_type}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div>
                                <div className="font-medium">
                                  {r.profiles?.full_name || 'N/A'}
                                </div>
                                {r.profiles?.email && (
                                  <div className="text-xs text-muted-foreground">{r.profiles.email}</div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-xs">{r.transaction_reference}</TableCell>
                            <TableCell>{formatNaira(r.purchase_amount || 0)}</TableCell>
                            <TableCell className="font-semibold text-green-600">
                              {formatNaira(r.revenue_amount || 0)}
                            </TableCell>
                            <TableCell>
                              {(Number(r.charge_fee_rate) * 100).toFixed(1)}%
                            </TableCell>
                            <TableCell>
                              <Badge variant={r.transaction_status === 'completed' ? 'default' : 'secondary'}>
                                {r.transaction_status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}

