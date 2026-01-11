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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { formatNaira } from "@/lib/currency";

interface CableTvTransaction {
  id: string;
  user_id: string;
  amount: number;
  purchase_amount?: number | null;
  charge_fee?: number | null;
  balance_before: number;
  balance_after: number;
  smartcard_number: string;
  provider: string;
  plan_name?: string | null;
  customer_name?: string | null;
  status: string;
  reference: string;
  created_at: string;
  profiles?: {
    full_name?: string | null;
    email?: string | null;
  } | null;
}

type CableVendingProvider = 'vtpass' | 'anyone' | 'ebills' | 'mobilenig';

export default function CableTvPlans() {
  const [vendingProvider, setVendingProvider] = useState<CableVendingProvider>('ebills');
  const [isUpdatingProvider, setIsUpdatingProvider] = useState(false);
  const [transactions, setTransactions] = useState<CableTvTransaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [transactionSearchQuery, setTransactionSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const { toast } = useToast();

  useEffect(() => {
    fetchCableProvider();
    fetchTransactions();
  }, [statusFilter]);

  const fetchCableProvider = async () => {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'cable_provider')
        .maybeSingle();

      if (error) {
        console.error('Error fetching cable provider setting:', error);
        setVendingProvider('ebills');
        return;
      }

      if (data?.setting_value) {
        const provider = (data.setting_value as any)?.provider || 'ebills';
        // Handle both "ebills" and "ebills.africa" for backward compatibility
        const normalizedProvider = provider === 'ebills.africa' ? 'ebills' : provider;
        const validProviders: CableVendingProvider[] = ['vtpass', 'anyone', 'ebills', 'mobilenig'];
        const selectedProvider = validProviders.includes(normalizedProvider as CableVendingProvider) 
          ? (normalizedProvider as CableVendingProvider)
          : 'ebills';
        console.log('Setting cable vending provider to:', selectedProvider);
        setVendingProvider(selectedProvider);
      } else {
        console.log('No cable provider setting found, defaulting to ebills');
        setVendingProvider('ebills');
      }
    } catch (error) {
      console.error('Error fetching cable provider setting:', error);
      setVendingProvider('ebills');
    }
  };

  const updateCableProvider = async (newProvider: CableVendingProvider) => {
    setIsUpdatingProvider(true);
    try {
      const { error } = await supabase
        .from('app_settings')
        .upsert({
          setting_key: 'cable_provider',
          setting_value: { provider: newProvider },
          setting_category: 'system',
          description: 'Cable TV vending provider: vtpass, ebills, mobilenig, or anyone'
        }, {
          onConflict: 'setting_key'
        });

      if (error) throw error;

      console.log('Updating cable provider to:', newProvider);
      setVendingProvider(newProvider);
      
      const providerDisplayName = getProviderDisplayName(newProvider);
      toast({
        title: "Success",
        description: `Cable TV vending provider switched to ${providerDisplayName}. This will be used as the default for all cable TV purchases.`,
      });
    } catch (error: any) {
      console.error('Error updating cable provider:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to update cable provider",
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
        .from('cable_tv_transactions')
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
        description: error.message || "Failed to fetch cable TV transactions",
        variant: "destructive",
      });
    } finally {
      setLoadingTransactions(false);
    }
  };

  const getProviderDisplayName = (provider: CableVendingProvider): string => {
    switch (provider) {
      case 'vtpass':
        return 'VTpass';
      case 'ebills':
        return 'eBills Africa';
      case 'mobilenig':
        return 'MobileNig';
      case 'anyone':
        return 'ANYONE';
      default:
        return provider.toUpperCase();
    }
  };

  const getProviderDescription = (provider: CableVendingProvider): string => {
    switch (provider) {
      case 'vtpass':
        return 'VTpass API - Reliable cable TV service provider';
      case 'ebills':
        return 'eBills Africa API - Modern cable TV service provider';
      case 'mobilenig':
        return 'MobileNig API - Enterprise cable TV service provider';
      case 'anyone':
        return 'ANYONE API';
      default:
        return '';
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
      case 'success':
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
      txn.smartcard_number?.toLowerCase().includes(searchLower) ||
      txn.provider?.toLowerCase().includes(searchLower) ||
      txn.plan_name?.toLowerCase().includes(searchLower) ||
      txn.profiles?.full_name?.toLowerCase().includes(searchLower) ||
      txn.profiles?.email?.toLowerCase().includes(searchLower) ||
      txn.customer_name?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex h-16 items-center gap-4 px-6">
              <SidebarTrigger />
              <h1 className="text-2xl font-bold">Cable TV Services Management</h1>
            </div>
          </header>

          <div className="p-6 space-y-6">
            {/* Vending Provider Selector */}
            <Card>
              <CardHeader>
                <CardTitle>Vending Provider Settings</CardTitle>
                <CardDescription>
                  Choose the default vending provider for cable TV purchases. This affects all new cable TV transactions.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <Label htmlFor="vending-provider" className="min-w-[150px] font-semibold">
                    Active Provider:
                  </Label>
                  <Select
                    value={vendingProvider}
                    onValueChange={(value) => updateCableProvider(value as CableVendingProvider)}
                    disabled={isUpdatingProvider}
                  >
                    <SelectTrigger id="vending-provider" className="w-[250px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mobilenig">
                        <div className="flex flex-col">
                          <span>MobileNig</span>
                          <span className="text-xs text-muted-foreground">Enterprise service</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="vtpass">
                        <div className="flex flex-col">
                          <span>VTpass</span>
                          <span className="text-xs text-muted-foreground">Reliable service</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="ebills">
                        <div className="flex flex-col">
                          <span>eBills Africa</span>
                          <span className="text-xs text-muted-foreground">Modern API</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="anyone">
                        <div className="flex flex-col">
                          <span>ANYONE</span>
                          <span className="text-xs text-muted-foreground">Alternative provider</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {isUpdatingProvider && (
                    <span className="text-sm text-muted-foreground flex items-center gap-2">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Updating...
                    </span>
                  )}
                </div>
                <div className="bg-muted/50 rounded-lg p-4 border">
                  <div className="flex items-start gap-3">
                    <div className="flex-1">
                      <p className="font-medium text-sm mb-1">
                        Current Provider: <span className="text-primary">{getProviderDisplayName(vendingProvider)}</span>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {getProviderDescription(vendingProvider)}
                      </p>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  This setting determines which vendor API will be used for all cable TV purchases (DSTV, GOTV, STARTIMES). 
                  The selected provider will be used system-wide for package fetching and transaction processing.
                </p>
              </CardContent>
            </Card>

            {/* Cable TV Transactions */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Cable TV Transactions</CardTitle>
                <CardDescription>
                      View all cable TV purchase transactions
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
                      <SelectItem value="success">Success</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                        <TableHead>Reference</TableHead>
                        <TableHead>User</TableHead>
                      <TableHead>Provider</TableHead>
                        <TableHead>Smartcard</TableHead>
                        <TableHead>Plan</TableHead>
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
                          <TableCell colSpan={10} className="text-center text-muted-foreground">
                            Loading transactions...
                          </TableCell>
                        </TableRow>
                      ) : filteredTransactions.length === 0 ? (
                      <TableRow>
                          <TableCell colSpan={10} className="text-center text-muted-foreground">
                            No cable TV transactions found
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
                              {txn.smartcard_number}
                            </TableCell>
                            <TableCell>{txn.plan_name || '-'}</TableCell>
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
