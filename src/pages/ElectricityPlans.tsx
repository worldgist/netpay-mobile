import { useState, useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { formatNaira } from "@/lib/currency";

interface ElectricityTransaction {
  id: string;
  user_id: string;
  amount: number;
  purchase_amount?: number | null;
  charge_fee?: number | null;
  balance_before: number;
  balance_after: number;
  meter_number: string;
  provider: string;
  meter_type: string;
  customer_name?: string | null;
  token?: string | null;
  status: string;
  reference: string;
  created_at: string;
  profiles?: {
    full_name?: string | null;
    email?: string | null;
  } | null;
}

export default function ElectricityPlans() {
  const [vendingProvider, setVendingProvider] = useState<'vtpass' | 'mobilenig' | 'ebills'>('vtpass');
  const [isUpdatingProvider, setIsUpdatingProvider] = useState(false);
  const [transactions, setTransactions] = useState<ElectricityTransaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [transactionSearchQuery, setTransactionSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const { toast } = useToast();

  useEffect(() => {
    fetchElectricityProvider();
    fetchTransactions();
  }, [statusFilter]);

  const fetchElectricityProvider = async () => {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'electricity_provider')
        .maybeSingle();

      if (error) {
        console.error('Error fetching electricity provider setting:', error);
        setVendingProvider('vtpass');
        return;
      }

      if (data?.setting_value) {
        const provider = (data.setting_value as any)?.provider || 'vtpass';
        const validProviders = ['vtpass', 'mobilenig', 'ebills'];
        const selectedProvider = validProviders.includes(provider) ? provider as 'vtpass' | 'mobilenig' | 'ebills' : 'vtpass';
        console.log('Setting electricity vending provider to:', selectedProvider);
        setVendingProvider(selectedProvider);
      } else {
        console.log('No electricity provider setting found, defaulting to vtpass');
        setVendingProvider('vtpass');
      }
    } catch (error) {
      console.error('Error fetching electricity provider setting:', error);
      setVendingProvider('vtpass');
    }
  };

  const updateElectricityProvider = async (newProvider: 'vtpass' | 'mobilenig' | 'ebills') => {
    setIsUpdatingProvider(true);
    try {
      const { error } = await supabase
        .from('app_settings')
        .upsert({
          setting_key: 'electricity_provider',
          setting_value: { provider: newProvider },
          setting_category: 'system',
          description: 'Electricity vending provider: vtpass, mobilenig, or ebills'
        }, {
          onConflict: 'setting_key'
        });

      if (error) throw error;

      console.log('Updating electricity provider to:', newProvider);
      setVendingProvider(newProvider);
      
      toast({
        title: "Success",
        description: `Electricity vending provider switched to ${newProvider.toUpperCase()}. This will be used as the default for all electricity purchases.`,
      });
    } catch (error: any) {
      console.error('Error updating electricity provider:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to update electricity provider",
        variant: "destructive",
      });
    } finally {
      setIsUpdatingProvider(false);
    }
  };



  const fetchTransactions = async () => {
    try {
      setLoadingTransactions(true);
      let query = supabase
        .from('electricity_transactions')
        .select(`
          *,
          profiles (
            full_name,
            email
          )
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      setTransactions(data || []);
    } catch (error: any) {
      console.error('Error fetching transactions:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to fetch electricity transactions",
        variant: "destructive",
      });
    } finally {
      setLoadingTransactions(false);
    }
  };


  const getStatusBadgeVariant = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
        return 'default';
      case 'pending':
        return 'secondary';
      case 'failed':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const filteredTransactions = transactions.filter((txn) => {
    const searchLower = transactionSearchQuery.toLowerCase();
    return (
      txn.reference?.toLowerCase().includes(searchLower) ||
      txn.meter_number?.toLowerCase().includes(searchLower) ||
      txn.provider?.toLowerCase().includes(searchLower) ||
      txn.profiles?.full_name?.toLowerCase().includes(searchLower) ||
      txn.profiles?.email?.toLowerCase().includes(searchLower) ||
      txn.customer_name?.toLowerCase().includes(searchLower)
    );
  });

  const totalFilteredAmount = filteredTransactions.reduce(
    (sum, txn) => sum + Number(txn.amount || 0),
    0,
  );

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex h-16 items-center gap-4 px-6">
              <SidebarTrigger />
              <h1 className="text-2xl font-bold">Electricity Services Management</h1>
            </div>
          </header>

          <div className="p-6 space-y-6">
            {/* Vending Provider Selector */}
            <Card>
              <CardHeader>
                <CardTitle>Vending Provider Settings</CardTitle>
                <CardDescription>
                  Choose the default vending provider for electricity purchases
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <Label htmlFor="vending-provider" className="min-w-[150px]">
                    Vending Provider:
                  </Label>
                  <Select
                    value={vendingProvider}
                    onValueChange={(value) => updateElectricityProvider(value as 'vtpass' | 'mobilenig' | 'ebills')}
                    disabled={isUpdatingProvider}
                  >
                    <SelectTrigger id="vending-provider" className="w-[200px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="vtpass">VTpass</SelectItem>
                      <SelectItem value="mobilenig">MobileNig</SelectItem>
                      <SelectItem value="ebills">eBills Africa</SelectItem>
                    </SelectContent>
                  </Select>
                  {isUpdatingProvider && (
                    <span className="text-sm text-muted-foreground">Updating...</span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  This setting determines which vendor API will be used for electricity purchases when no specific provider is selected by the user.
                </p>
              </CardContent>
            </Card>


            {/* Electricity Transactions */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Electricity Transactions</CardTitle>
                    <CardDescription>
                      View all electricity purchase transactions
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchTransactions}
                    disabled={loadingTransactions}
                    className="gap-2"
                  >
                    <RefreshCw className={`h-4 w-4 ${loadingTransactions ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 mb-4">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                    <Input
                      placeholder="Search transactions..."
                      value={transactionSearchQuery}
                      onChange={(e) => setTransactionSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="mb-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Total Transaction Amount</CardTitle>
                      <CardDescription>
                        Sum of displayed electricity transactions
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{formatNaira(totalFilteredAmount)}</div>
                    </CardContent>
                  </Card>
                </div>

                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Reference</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Provider</TableHead>
                        <TableHead>Meter Number</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Charge Fee</TableHead>
                        <TableHead>Balance</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingTransactions ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center text-muted-foreground">
                            Loading transactions...
                          </TableCell>
                        </TableRow>
                      ) : filteredTransactions.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center text-muted-foreground">
                            No electricity transactions found
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredTransactions.map((txn) => (
                          <TableRow key={txn.id}>
                            <TableCell className="font-mono text-xs">{txn.reference}</TableCell>
                            <TableCell>
                              <div>
                                <div className="font-medium">
                                  {txn.profiles?.full_name || txn.customer_name || 'N/A'}
                                </div>
                                {txn.profiles?.email && (
                                  <div className="text-xs text-muted-foreground">{txn.profiles.email}</div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{txn.provider}</TableCell>
                            <TableCell className="font-mono text-sm">
                              <div>{txn.meter_number}</div>
                              <div className="text-xs text-muted-foreground">{txn.meter_type}</div>
                            </TableCell>
                            <TableCell>
                              <div className="font-semibold">{formatNaira(txn.amount || 0)}</div>
                              {txn.purchase_amount && (
                                <div className="text-xs text-muted-foreground">
                                  Base: {formatNaira(txn.purchase_amount)}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              {txn.charge_fee ? formatNaira(txn.charge_fee) : '-'}
                            </TableCell>
                            <TableCell className="text-xs">
                              <div>{formatNaira(txn.balance_before || 0)} → {formatNaira(txn.balance_after || 0)}</div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={getStatusBadgeVariant(txn.status)}>
                                {txn.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">
                              {format(new Date(txn.created_at), 'MMM dd, yyyy HH:mm')}
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
