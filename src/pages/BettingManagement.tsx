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

interface BettingTransaction {
  id: string;
  user_id: string;
  amount: number;
  purchase_amount?: number | null;
  charge_fee?: number | null;
  balance_before: number;
  balance_after: number;
  betting_provider: string;
  account_number?: string | null;
  phone_number?: string | null;
  bet_type?: string | null;
  game_type?: string | null;
  ticket_number?: string | null;
  vending_provider?: string | null;
  status: string;
  reference: string;
  created_at: string;
  profiles?: {
    full_name?: string | null;
    email?: string | null;
  } | null;
}

type BettingVendingProvider = 'vtpass' | 'mobilenig' | 'smeplug' | 'ebills';

export default function BettingManagement() {
  const [vendingProvider, setVendingProvider] = useState<BettingVendingProvider>('ebills');
  const [isUpdatingProvider, setIsUpdatingProvider] = useState(false);
  const [transactions, setTransactions] = useState<BettingTransaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [transactionSearchQuery, setTransactionSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [providerFilter, setProviderFilter] = useState("all");
  const { toast } = useToast();

  useEffect(() => {
    fetchBettingProvider();
    fetchTransactions();
  }, [statusFilter, providerFilter]);

  const fetchBettingProvider = async () => {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'betting_provider')
        .maybeSingle();

      if (error) {
        console.error('Error fetching betting provider setting:', error);
        setVendingProvider('ebills');
        return;
      }

      if (data?.setting_value) {
        const provider = (data.setting_value as any)?.provider || 'ebills';
        const validProviders: BettingVendingProvider[] = ['vtpass', 'mobilenig', 'smeplug', 'ebills'];
        const selectedProvider = validProviders.includes(provider as BettingVendingProvider) 
          ? (provider as BettingVendingProvider)
          : 'ebills';
        console.log('Setting betting vending provider to:', selectedProvider);
        setVendingProvider(selectedProvider);
      } else {
        console.log('No betting provider setting found, defaulting to ebills');
        setVendingProvider('ebills');
      }
    } catch (error) {
      console.error('Error fetching betting provider setting:', error);
      setVendingProvider('ebills');
    }
  };

  const updateBettingProvider = async (newProvider: BettingVendingProvider) => {
    setIsUpdatingProvider(true);
    try {
      const { error } = await supabase
        .from('app_settings')
        .upsert({
          setting_key: 'betting_provider',
          setting_value: { provider: newProvider },
          setting_category: 'system',
          description: 'Betting vending provider: vtpass, mobilenig, smeplug, or ebills'
        }, {
          onConflict: 'setting_key'
        });

      if (error) throw error;

      console.log('Updating betting provider to:', newProvider);
      setVendingProvider(newProvider);
      
      toast({
        title: "Success",
        description: `Betting vending provider switched to ${newProvider.toUpperCase()}. This will be used as the default for all betting purchases.`,
      });
    } catch (error: any) {
      console.error('Error updating betting provider:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to update betting provider",
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
        .from('betting_transactions')
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

      if (providerFilter !== 'all') {
        query = query.eq('betting_provider', providerFilter);
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
        description: error.message || "Failed to fetch betting transactions",
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

  const getBettingProviderLogo = (provider: string) => {
    const logos: Record<string, string> = {
      'BET9JA': '/bet9ja.png',
      'SPORTYBET': '/sportybet.png',
      'NAIRABET': '/nairabet.png',
      '1XBET': '/1xbet.png',
      'BETKING': '/betking.png',
      'BETWAY': '/betway.png',
      'ACCESSBET': '/accessbet.png',
      'MERRYBET': '/merrybet.png',
    };
    return logos[provider.toUpperCase()] || '';
  };

  const filteredTransactions = transactions.filter((txn) => {
    const searchLower = transactionSearchQuery.toLowerCase();
    return (
      txn.reference?.toLowerCase().includes(searchLower) ||
      txn.account_number?.toLowerCase().includes(searchLower) ||
      txn.betting_provider?.toLowerCase().includes(searchLower) ||
      txn.profiles?.full_name?.toLowerCase().includes(searchLower) ||
      txn.profiles?.email?.toLowerCase().includes(searchLower) ||
      txn.phone_number?.toLowerCase().includes(searchLower) ||
      txn.ticket_number?.toLowerCase().includes(searchLower)
    );
  });

  // Get unique betting providers for filter
  const uniqueProviders = Array.from(new Set(transactions.map(t => t.betting_provider))).sort();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex h-16 items-center gap-4 px-6">
              <SidebarTrigger />
              <h1 className="text-2xl font-bold">Betting Services Management</h1>
            </div>
          </header>

          <div className="p-6 space-y-6">
            {/* Vending Provider Selector */}
            <Card>
              <CardHeader>
                <CardTitle>Vending Provider Settings</CardTitle>
                <CardDescription>
                  Choose the default vending provider for betting purchases
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <Label htmlFor="vending-provider" className="min-w-[150px]">
                    Vending Provider:
                  </Label>
                  <Select
                    value={vendingProvider}
                    onValueChange={(value) => updateBettingProvider(value as BettingVendingProvider)}
                    disabled={isUpdatingProvider}
                  >
                    <SelectTrigger id="vending-provider" className="w-[200px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="vtpass">VTpass</SelectItem>
                      <SelectItem value="mobilenig">MobileNig</SelectItem>
                      <SelectItem value="smeplug">SMEPLUG</SelectItem>
                      <SelectItem value="ebills">eBills Africa</SelectItem>
                    </SelectContent>
                  </Select>
                  {isUpdatingProvider && (
                    <span className="text-sm text-muted-foreground">Updating...</span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  This setting determines which vendor API will be used for betting purchases when no specific provider is selected by the user.
                </p>
              </CardContent>
            </Card>

            {/* Betting Transactions */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Betting Transactions</CardTitle>
                    <CardDescription>
                      View all betting purchase transactions
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
                  <Select value={providerFilter} onValueChange={setProviderFilter}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Filter by provider" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Providers</SelectItem>
                      {uniqueProviders.map((provider) => (
                        <SelectItem key={provider} value={provider}>
                          {provider}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Reference</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Betting Provider</TableHead>
                        <TableHead>Account Number</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Charge Fee</TableHead>
                        <TableHead>Vending Provider</TableHead>
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
                            No betting transactions found
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredTransactions.map((txn) => (
                          <TableRow key={txn.id}>
                            <TableCell className="font-mono text-xs">{txn.reference}</TableCell>
                            <TableCell>
                              <div>
                                <div className="font-medium">
                                  {txn.profiles?.full_name || 'N/A'}
                                </div>
                                {txn.profiles?.email && (
                                  <div className="text-xs text-muted-foreground">{txn.profiles.email}</div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {getBettingProviderLogo(txn.betting_provider) && (
                                  <img 
                                    src={getBettingProviderLogo(txn.betting_provider)} 
                                    alt={txn.betting_provider}
                                    className="w-6 h-6 object-contain"
                                  />
                                )}
                                <span>{txn.betting_provider}</span>
                              </div>
                              {txn.bet_type && (
                                <div className="text-xs text-muted-foreground">
                                  {txn.bet_type} {txn.game_type && `• ${txn.game_type}`}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              <div>{txn.account_number || 'N/A'}</div>
                              {txn.phone_number && (
                                <div className="text-xs text-muted-foreground">{txn.phone_number}</div>
                              )}
                              {txn.ticket_number && (
                                <div className="text-xs text-muted-foreground">Ticket: {txn.ticket_number}</div>
                              )}
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
                            <TableCell>
                              <Badge variant="outline">
                                {txn.vending_provider?.toUpperCase() || 'N/A'}
                              </Badge>
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


