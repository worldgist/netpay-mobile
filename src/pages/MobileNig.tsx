import { useState, useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, Wallet, CreditCard, Building2, History, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface BalanceData {
  amount: number;
  currency: string;
}

interface AccountData {
  accountNumber: string;
  accountName: string;
  bankName: string;
  businessName: string;
}

interface Transaction {
  trans_id: string;
  type: 'DR' | 'CR';
  service: string;
  description: string;
  initial_balance: string;
  amount: string;
  final_balance: string;
  date: string;
}

export default function MobileNig() {
  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [account, setAccount] = useState<AccountData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [page, setPage] = useState(1);
  const [searchTransId, setSearchTransId] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    fetchMobileNigData();
    fetchWalletHistory();
  }, []);

  useEffect(() => {
    fetchWalletHistory();
  }, [page]);

  const fetchMobileNigData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-mobilenig-balance');

      if (error) throw error;

      if (data.success) {
        setBalance(data.balance);
        setAccount(data.account);
      } else {
        throw new Error('Failed to fetch MobileNig data');
      }
    } catch (error: any) {
      console.error('Error fetching MobileNig data:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to fetch MobileNig account information",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchWalletHistory = async (transId?: string) => {
    setLoadingTransactions(true);
    try {
      const payload = transId 
        ? { trans_id: transId }
        : { page, per_page: 10 };

      const { data, error } = await supabase.functions.invoke('fetch-mobilenig-wallet-history', {
        body: payload,
      });

      if (error) throw error;

      if (data.success) {
        setTransactions(data.transactions);
      } else {
        throw new Error('Failed to fetch wallet history');
      }
    } catch (error: any) {
      console.error('Error fetching wallet history:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to fetch wallet history",
        variant: "destructive",
      });
    } finally {
      setLoadingTransactions(false);
    }
  };

  const handleSearch = () => {
    if (searchTransId.trim()) {
      fetchWalletHistory(searchTransId);
    } else {
      fetchWalletHistory();
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchMobileNigData(), fetchWalletHistory()]);
    setRefreshing(false);
    toast({
      title: "Refreshed",
      description: "Account information has been updated",
    });
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex h-16 items-center gap-4 px-6">
              <SidebarTrigger />
              <h1 className="text-2xl font-bold">MobileNig API</h1>
            </div>
          </header>

          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground">
                View your MobileNig wallet balance and account information
              </p>
              <Button
                onClick={handleRefresh}
                disabled={refreshing}
                variant="outline"
                className="gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              {/* Balance Card */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Wallet className="h-5 w-5 text-primary" />
                    <CardTitle>Wallet Balance</CardTitle>
                  </div>
                  <CardDescription>Your current MobileNig wallet balance</CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <Skeleton className="h-12 w-full" />
                  ) : balance ? (
                    <div className="space-y-2">
                      <div className="text-3xl font-bold text-primary">
                        {balance.currency} {balance.amount.toLocaleString('en-NG', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Available for transactions
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Unable to fetch balance
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Account Info Card */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-primary" />
                    <CardTitle>Account Information</CardTitle>
                  </div>
                  <CardDescription>Your MobileNig account details</CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="space-y-3">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-3/4" />
                    </div>
                  ) : account ? (
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm text-muted-foreground">Business Name</p>
                        <p className="font-medium">{account.businessName}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Bank Name</p>
                        <p className="font-medium">{account.bankName}</p>
                      </div>
                      <div className="bg-primary/10 p-3 rounded-lg">
                        <p className="text-sm text-muted-foreground mb-1">Account Number</p>
                        <p className="text-xl font-bold font-mono">{account.accountNumber}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Unable to fetch account information
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Wallet History */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <History className="h-5 w-5 text-primary" />
                    <CardTitle>Wallet History</CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Search by Trans ID..."
                      value={searchTransId}
                      onChange={(e) => setSearchTransId(e.target.value)}
                      className="w-48"
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    />
                    <Button onClick={handleSearch} size="sm" variant="outline">
                      <Search className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <CardDescription>
                  Recent transactions and wallet activity
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingTransactions ? (
                  <div className="space-y-2">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ) : transactions.length > 0 ? (
                  <>
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Service</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead className="text-right">Balance</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {transactions.map((transaction) => (
                            <TableRow key={transaction.trans_id}>
                              <TableCell className="text-sm">
                                {new Date(transaction.date).toLocaleString('en-NG')}
                              </TableCell>
                              <TableCell>
                                <Badge variant={transaction.type === 'CR' ? 'default' : 'destructive'}>
                                  {transaction.type === 'CR' ? 'Credit' : 'Debit'}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm">{transaction.service}</TableCell>
                              <TableCell className="text-sm max-w-xs truncate">
                                {transaction.description}
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                ₦{parseFloat(transaction.amount).toLocaleString('en-NG', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </TableCell>
                              <TableCell className="text-right text-muted-foreground text-sm">
                                ₦{parseFloat(transaction.final_balance).toLocaleString('en-NG', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    {!searchTransId && (
                      <div className="flex items-center justify-between mt-4">
                        <Button
                          onClick={() => setPage(p => Math.max(1, p - 1))}
                          disabled={page === 1}
                          variant="outline"
                          size="sm"
                        >
                          Previous
                        </Button>
                        <span className="text-sm text-muted-foreground">Page {page}</span>
                        <Button
                          onClick={() => setPage(p => p + 1)}
                          disabled={transactions.length < 10}
                          variant="outline"
                          size="sm"
                        >
                          Next
                        </Button>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No transactions found
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
