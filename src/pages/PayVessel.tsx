import { useState, useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, Wallet, History, Search } from "lucide-react";
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
  businessName: string;
  businessId?: string;
}

interface Transaction {
  transaction_id?: string;
  trans_id?: string;
  id?: string;
  type?: 'DR' | 'CR' | 'debit' | 'credit';
  service?: string;
  description?: string;
  amount?: string;
  balance?: string;
  date?: string;
  created_at?: string;
  status?: string;
  reference?: string;
}

export default function PayVessel() {
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
    fetchPayVesselData();
    fetchTransactionHistory();
  }, []);

  useEffect(() => {
    if (!searchTransId) {
      fetchTransactionHistory();
    }
  }, [page]);

  const fetchPayVesselData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-payvessel-balance');

      if (error) {
        // Log the full error structure
        console.error('Edge function error:', error);
        console.error('Error type:', typeof error);
        console.error('Error constructor:', error.constructor?.name);
        
        // Try to extract error message from error object
        let errorMessage = error.message || 'Failed to invoke PayVessel balance function';
        
        // Check if error has a response property (Supabase FunctionsHttpError)
        if ((error as any).response) {
          try {
            const response = (error as any).response;
            const responseText = await response.text();
            console.error('Error response text:', responseText);
            try {
              const errorBody = JSON.parse(responseText);
              errorMessage = errorBody.error || errorBody.message || errorMessage;
              console.error('Parsed error body:', errorBody);
            } catch (e) {
              // If not JSON, use the text as error message
              errorMessage = responseText || errorMessage;
            }
          } catch (e) {
            console.error('Failed to read error response:', e);
          }
        }
        
        // Try multiple ways to extract the error message
        if ((error as any).context) {
          const context = (error as any).context;
          console.error('Error context:', context);
          
          // Check if error has a response body
          if (context.body) {
            try {
              const errorBody = typeof context.body === 'string' 
                ? JSON.parse(context.body) 
                : context.body;
              console.error('Parsed error body from context:', errorBody);
              errorMessage = errorBody.error || errorBody.message || errorMessage;
            } catch (e) {
              console.error('Failed to parse error body from context:', e);
            }
          }
          
          // Check if error has message in context
          if (context.message) {
            errorMessage = context.message;
          }
        }
        
        // If we have data even with an error, check if it contains error info
        if (data && !data.success) {
          errorMessage = data.error || data.message || errorMessage;
        }
        
        throw new Error(errorMessage);
      }

      if (!data) {
        throw new Error('No data returned from PayVessel API');
      }

      if (data.success) {
        setBalance(data.balance);
        setAccount(data.account);
      } else {
        const errorMsg = data.error || data.message || 'Failed to fetch PayVessel data';
        console.error('PayVessel API error:', data);
        throw new Error(errorMsg);
      }
    } catch (error: any) {
      console.error('Error fetching PayVessel data:', error);
      const errorMessage = error.message || error.error || "Failed to fetch PayVessel account information. Please check the API endpoints and credentials.";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchTransactionHistory = async (transId?: string) => {
    setLoadingTransactions(true);
    try {
      const payload = transId 
        ? { trans_id: transId }
        : { page, per_page: 10 };

      const { data, error } = await supabase.functions.invoke('fetch-payvessel-transactions', {
        body: payload,
      });

      if (error) {
        console.error('Edge function error (full object):', JSON.stringify(error, null, 2));
        console.error('Error keys:', Object.keys(error));
        console.error('Error context:', error.context);
        
        // Try to extract error message from error object
        let errorMessage = error.message || 'Failed to invoke PayVessel transactions function';
        
        // Try multiple ways to extract the error message
        if (error.context) {
          console.error('Error context keys:', Object.keys(error.context));
          
          // Check if error has a response body
          if (error.context.body) {
            try {
              const errorBody = typeof error.context.body === 'string' 
                ? JSON.parse(error.context.body) 
                : error.context.body;
              console.error('Parsed error body:', errorBody);
              errorMessage = errorBody.error || errorBody.message || errorMessage;
            } catch (e) {
              console.error('Failed to parse error body:', e);
            }
          }
          
          // Check if error has message in context
          if (error.context.message) {
            errorMessage = error.context.message;
          }
        }
        
        // If we have data even with an error, check if it contains error info
        if (data && !data.success) {
          errorMessage = data.error || data.message || errorMessage;
        }
        
        throw new Error(errorMessage);
      }

      if (!data) {
        throw new Error('No data returned from PayVessel API');
      }

      if (data.success) {
        setTransactions(data.transactions || []);
      } else {
        const errorMsg = data.error || data.message || 'Failed to fetch transaction history';
        console.error('PayVessel API error:', data);
        throw new Error(errorMsg);
      }
    } catch (error: any) {
      console.error('Error fetching transaction history:', error);
      const errorMessage = error.message || error.error || "Failed to fetch transaction history. Please check the API endpoints and credentials.";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoadingTransactions(false);
    }
  };

  const handleSearch = () => {
    if (searchTransId.trim()) {
      fetchTransactionHistory(searchTransId);
    } else {
      fetchTransactionHistory();
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchPayVesselData(), fetchTransactionHistory()]);
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
              <h1 className="text-2xl font-bold">PayVessel API</h1>
            </div>
          </header>

          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground">
                View your PayVessel wallet balance and account information
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
                  <CardDescription>Your current PayVessel wallet balance</CardDescription>
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
                  <CardTitle>Account Information</CardTitle>
                  <CardDescription>Your PayVessel account details</CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="space-y-3">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-3/4" />
                    </div>
                  ) : account ? (
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm text-muted-foreground">Business Name</p>
                        <p className="font-medium">{account.businessName}</p>
                      </div>
                      {account.businessId && (
                        <div>
                          <p className="text-sm text-muted-foreground">Business ID</p>
                          <p className="font-mono text-sm">{account.businessId}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Unable to fetch account information
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Transaction History */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <History className="h-5 w-5 text-primary" />
                    <CardTitle>Transaction History</CardTitle>
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
                            <TableHead>Description</TableHead>
                            <TableHead>Reference</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {transactions.map((transaction, index) => {
                            const transId = transaction.transaction_id || transaction.trans_id || transaction.id || `txn-${index}`;
                            const transType = transaction.type || 'CR';
                            const isDebit = transType === 'DR' || transType === 'debit';
                            const amount = parseFloat(transaction.amount || '0');
                            const date = transaction.date || transaction.created_at || new Date().toISOString();
                            
                            return (
                              <TableRow key={transId}>
                                <TableCell className="text-sm">
                                  {new Date(date).toLocaleString('en-NG')}
                                </TableCell>
                                <TableCell>
                                  <Badge variant={isDebit ? "destructive" : "default"}>
                                    {isDebit ? 'Debit' : 'Credit'}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-sm">
                                  {transaction.description || 'Transaction'}
                                </TableCell>
                                <TableCell className="text-sm font-mono">
                                  {transaction.reference || transId}
                                </TableCell>
                                <TableCell className={`text-right font-medium ${isDebit ? 'text-red-600' : 'text-green-600'}`}>
                                  {isDebit ? '-' : '+'}₦{amount.toLocaleString('en-NG', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
                                </TableCell>
                                <TableCell>
                                  <Badge variant={transaction.status === 'success' || transaction.status === 'completed' ? "default" : "secondary"}>
                                    {transaction.status || 'Completed'}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                    {!searchTransId && (
                      <div className="flex items-center justify-between mt-4">
                        <Button
                          variant="outline"
                          onClick={() => setPage(p => Math.max(1, p - 1))}
                          disabled={page === 1}
                        >
                          Previous
                        </Button>
                        <span className="text-sm text-muted-foreground">Page {page}</span>
                        <Button
                          variant="outline"
                          onClick={() => setPage(p => p + 1)}
                          disabled={transactions.length < 10}
                        >
                          Next
                        </Button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No transactions found</p>
                    {searchTransId && (
                      <Button
                        variant="link"
                        onClick={() => {
                          setSearchTransId('');
                          fetchTransactionHistory();
                        }}
                        className="mt-2"
                      >
                        Clear search
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* API Information */}
            <Card>
              <CardHeader>
                <CardTitle>API Integration</CardTitle>
                <CardDescription>
                  Real-time data from PayVessel API
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>• Balance is fetched in real-time from PayVessel API</p>
                  <p>• Account details show your business information</p>
                  <p>• Transaction history shows all wallet activities</p>
                  <p>• Click refresh to update the latest data</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}

