import { useEffect, useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { History, RefreshCw, Search, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface FlutterwaveBalance {
  amount: number;
  ledgerBalance: number;
  currency: string;
}

interface FlutterwaveAccount {
  provider: string;
  mode: "test" | "live";
  virtualAccounts: number;
  latestVirtualAccountCreatedAt: string | null;
  localFundingTransactions: number;
}

interface FlutterwaveTransaction {
  id?: number | string;
  tx_ref?: string;
  flw_ref?: string;
  reference?: string;
  amount?: number;
  charged_amount?: number;
  app_fee?: number;
  merchant_fee?: number;
  currency?: string;
  status?: string;
  payment_type?: string;
  processor_response?: string;
  narration?: string;
  customer_id?: number | string;
  created_at?: string;
  customer?: {
    name?: string;
    email?: string;
    phone_number?: string;
  };
  admin_identity?: {
    user_id?: string;
    account_number?: string | null;
    account_name?: string | null;
    nin?: string | null;
    bvn?: string | null;
  };
  [key: string]: unknown;
}

export default function Flutterwave() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [balance, setBalance] = useState<FlutterwaveBalance | null>(null);
  const [account, setAccount] = useState<FlutterwaveAccount | null>(null);
  const [transactions, setTransactions] = useState<FlutterwaveTransaction[]>([]);
  const [selectedTransaction, setSelectedTransaction] = useState<FlutterwaveTransaction | null>(null);
  const [searchReference, setSearchReference] = useState("");
  const [page, setPage] = useState(1);
  const { toast } = useToast();

  const formatMoney = (amount: unknown, currency = "NGN") => {
    const value = Number(amount || 0);
    return `${currency.toUpperCase()} ${value.toLocaleString("en-NG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  useEffect(() => {
    void fetchAdminData();
  }, []);

  useEffect(() => {
    if (!searchReference.trim()) {
      void fetchAdminData(undefined, page);
    }
  }, [page]);

  const fetchAdminData = async (reference?: string, requestedPage = 1) => {
    setLoadingTransactions(true);
    if (!balance) {
      setLoading(true);
    }

    try {
      const { data, error } = await supabase.functions.invoke("fetch-flutterwave-admin-data", {
        body: {
          page: requestedPage,
          per_page: 10,
          reference: reference?.trim() || undefined,
        },
      });

      if (error) {
        throw new Error(error.message || "Failed to load Flutterwave management data");
      }

      if (!data?.success) {
        throw new Error(data?.error || "Flutterwave management request failed");
      }

      setBalance(data.balance || null);
      setAccount(data.account || null);
      setTransactions(Array.isArray(data.transactions) ? data.transactions : []);
    } catch (err) {
      console.error("Flutterwave admin fetch error:", err);
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Unable to fetch Flutterwave details",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setLoadingTransactions(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAdminData(searchReference || undefined, page);
    setRefreshing(false);
    toast({
      title: "Refreshed",
      description: "Flutterwave management data updated",
    });
  };

  const handleSearch = async () => {
    await fetchAdminData(searchReference || undefined, 1);
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex h-16 items-center gap-4 px-6">
              <SidebarTrigger />
              <h1 className="text-2xl font-bold">Flutterwave Management</h1>
            </div>
          </header>

          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground">Monitor Flutterwave balance, account details, and transaction activity</p>
              <Button onClick={handleRefresh} disabled={refreshing} variant="outline" className="gap-2">
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Wallet className="h-5 w-5 text-primary" />
                    <CardTitle>Wallet Balance</CardTitle>
                  </div>
                  <CardDescription>Current Flutterwave balance</CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <Skeleton className="h-12 w-full" />
                  ) : balance ? (
                    <div className="space-y-2">
                      <div className="text-3xl font-bold text-primary">
                        {balance.currency} {Number(balance.amount || 0).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Ledger balance: {balance.currency} {Number(balance.ledgerBalance || 0).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Unable to fetch balance</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Account Details</CardTitle>
                  <CardDescription>Flutterwave integration summary</CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="space-y-3">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-2/3" />
                    </div>
                  ) : account ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-muted-foreground">Mode</p>
                        <Badge variant={account.mode === "live" ? "default" : "secondary"}>{account.mode.toUpperCase()}</Badge>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Virtual Accounts</p>
                        <p className="font-medium">{account.virtualAccounts}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Recorded Funding Transactions</p>
                        <p className="font-medium">{account.localFundingTransactions}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Latest Virtual Account Created</p>
                        <p className="font-medium">
                          {account.latestVirtualAccountCreatedAt
                            ? new Date(account.latestVirtualAccountCreatedAt).toLocaleString("en-NG")
                            : "N/A"}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Unable to fetch account details</p>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <History className="h-5 w-5 text-primary" />
                    <CardTitle>Transaction Activity</CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Search by reference"
                      value={searchReference}
                      onChange={(e) => setSearchReference(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          void handleSearch();
                        }
                      }}
                      className="w-56"
                    />
                    <Button onClick={() => void handleSearch()} variant="outline" size="sm">
                      <Search className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <CardDescription>Recent Flutterwave transactions and activity</CardDescription>
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
                            <TableHead>Reference</TableHead>
                            <TableHead>Customer</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead className="text-right">Details</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {transactions.map((transaction, index) => {
                            const ref = transaction.tx_ref || transaction.flw_ref || String(transaction.id || index);
                            return (
                              <TableRow key={ref}>
                                <TableCell className="text-sm">{transaction.created_at ? new Date(transaction.created_at).toLocaleString("en-NG") : "N/A"}</TableCell>
                                <TableCell className="text-xs font-mono max-w-[220px] truncate">{ref}</TableCell>
                                <TableCell className="text-sm">
                                  {transaction.customer?.name || transaction.customer?.email || "N/A"}
                                </TableCell>
                                <TableCell className="text-sm">{transaction.payment_type || "N/A"}</TableCell>
                                <TableCell>
                                  <Badge variant={String(transaction.status || "").toLowerCase() === "successful" ? "default" : "secondary"}>
                                    {transaction.status || "unknown"}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right font-medium">
                                  {formatMoney(transaction.amount, transaction.currency || "NGN")}
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button variant="outline" size="sm" onClick={() => setSelectedTransaction(transaction)}>
                                    View
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>

                    <div className="flex justify-end gap-2 pt-4">
                      <Button variant="outline" size="sm" disabled={page === 1 || !!searchReference.trim()} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                        Previous
                      </Button>
                      <Button variant="outline" size="sm" disabled={!!searchReference.trim()} onClick={() => setPage((p) => p + 1)}>
                        Next
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">No Flutterwave transactions found.</p>
                )}
              </CardContent>
            </Card>

            <Dialog open={!!selectedTransaction} onOpenChange={(open) => !open && setSelectedTransaction(null)}>
              <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Flutterwave Transaction Details</DialogTitle>
                  <DialogDescription>Full details for selected activity record.</DialogDescription>
                </DialogHeader>

                {selectedTransaction && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground">TX Ref</p>
                        <p className="font-mono text-sm break-all">{selectedTransaction.tx_ref || "N/A"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Flutterwave Ref</p>
                        <p className="font-mono text-sm break-all">{selectedTransaction.flw_ref || selectedTransaction.reference || "N/A"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Amount</p>
                        <p className="text-sm font-medium">{formatMoney(selectedTransaction.amount, selectedTransaction.currency || "NGN")}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Charged Amount</p>
                        <p className="text-sm font-medium">{formatMoney(selectedTransaction.charged_amount, selectedTransaction.currency || "NGN")}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">App Fee</p>
                        <p className="text-sm font-medium">{formatMoney(selectedTransaction.app_fee, selectedTransaction.currency || "NGN")}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Merchant Fee</p>
                        <p className="text-sm font-medium">{formatMoney(selectedTransaction.merchant_fee, selectedTransaction.currency || "NGN")}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Status</p>
                        <Badge variant={String(selectedTransaction.status || "").toLowerCase() === "successful" ? "default" : "secondary"}>
                          {selectedTransaction.status || "unknown"}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Payment Type</p>
                        <p className="text-sm font-medium">{selectedTransaction.payment_type || "N/A"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Customer Name</p>
                        <p className="text-sm font-medium">{selectedTransaction.customer?.name || "N/A"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Customer Email</p>
                        <p className="text-sm font-medium break-all">{selectedTransaction.customer?.email || "N/A"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Customer Phone</p>
                        <p className="text-sm font-medium">{selectedTransaction.customer?.phone_number || "N/A"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Virtual Account Number</p>
                        <p className="text-sm font-medium">{selectedTransaction.admin_identity?.account_number || "N/A"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Virtual Account Name</p>
                        <p className="text-sm font-medium">{selectedTransaction.admin_identity?.account_name || "N/A"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">NIN</p>
                        <p className="text-sm font-medium">{selectedTransaction.admin_identity?.nin || "N/A"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">BVN</p>
                        <p className="text-sm font-medium">{selectedTransaction.admin_identity?.bvn || "N/A"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Created At</p>
                        <p className="text-sm font-medium">
                          {selectedTransaction.created_at ? new Date(selectedTransaction.created_at).toLocaleString("en-NG") : "N/A"}
                        </p>
                      </div>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Processor Response</p>
                      <p className="text-sm">{selectedTransaction.processor_response || selectedTransaction.narration || "N/A"}</p>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Raw Payload</p>
                      <pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto">
                        {JSON.stringify(selectedTransaction, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
