import { useCallback, useEffect, useMemo, useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, Wallet, History, Search, Copy, Link2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { formatNaira } from "@/lib/currency";

interface BalanceData {
  amount: number;
  ledgerBalance?: number;
  currency: string;
}

interface FundingTransaction {
  id: string;
  reference: string | null;
  amount: number;
  status: string;
  bank_name: string | null;
  account_name: string | null;
  account_number: string | null;
  created_at: string;
  profiles?: {
    full_name?: string | null;
    email?: string | null;
  } | null;
}

export default function Flutterwave() {
  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [transactions, setTransactions] = useState<FundingTransaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const { toast } = useToast();
  const flutterwaveWebhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/flutterwave-webhook`;

  const copyWebhookUrl = async () => {
    try {
      await navigator.clipboard.writeText(flutterwaveWebhookUrl);
      toast({ title: "Copied", description: "Flutterwave webhook URL copied to clipboard" });
    } catch {
      toast({ title: "Copy failed", description: "Could not copy webhook URL", variant: "destructive" });
    }
  };

  const fetchBalance = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke("fetch-flutterwave-balance");
      if (error) throw error;
      if (!data?.success) {
        throw new Error(data?.error || "Failed to fetch Flutterwave balance");
      }
      setBalance(data.balance);
    } catch (error) {
      console.error("Error fetching Flutterwave balance:", error);
      setBalance(null);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to fetch Flutterwave balance",
        variant: "destructive",
      });
    }
  }, [toast]);

  const fetchFundingTransactions = useCallback(async () => {
    setLoadingTransactions(true);
    try {
      const { data, error } = await supabase
        .from("funding_transactions")
        .select(`
          id,
          reference,
          amount,
          status,
          bank_name,
          account_name,
          account_number,
          created_at,
          profiles:user_id (
            full_name,
            email
          )
        `)
        .ilike("bank_name", "%flutterwave%")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setTransactions((data as FundingTransaction[]) || []);
    } catch (error) {
      console.error("Error fetching Flutterwave funding transactions:", error);
      toast({
        title: "Error",
        description: "Failed to load Flutterwave funding history",
        variant: "destructive",
      });
    } finally {
      setLoadingTransactions(false);
    }
  }, [toast]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchBalance(), fetchFundingTransactions()]);
      setLoading(false);
    };
    void load();
  }, [fetchBalance, fetchFundingTransactions]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchBalance(), fetchFundingTransactions()]);
    setRefreshing(false);
    toast({ title: "Refreshed", description: "Flutterwave data updated" });
  };

  const filteredTransactions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return transactions;
    return transactions.filter(
      (txn) =>
        txn.reference?.toLowerCase().includes(query) ||
        txn.profiles?.full_name?.toLowerCase().includes(query) ||
        txn.profiles?.email?.toLowerCase().includes(query) ||
        txn.status?.toLowerCase().includes(query),
    );
  }, [transactions, searchQuery]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, pageSize]);

  const totalFilteredCount = filteredTransactions.length;
  const totalPages = Math.max(1, Math.ceil(totalFilteredCount / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedTransactions = filteredTransactions.slice(
    (safeCurrentPage - 1) * pageSize,
    safeCurrentPage * pageSize,
  );
  const pageStart = totalFilteredCount === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1;
  const pageEnd = Math.min(safeCurrentPage * pageSize, totalFilteredCount);

  const totalFunded = useMemo(
    () =>
      transactions
        .filter((txn) => txn.status === "completed" || txn.status === "success")
        .reduce((sum, txn) => sum + Number(txn.amount || 0), 0),
    [transactions],
  );

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex h-16 items-center gap-4 px-6">
              <SidebarTrigger />
              <h1 className="text-2xl font-bold">Flutterwave</h1>
            </div>
          </header>

          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground">
                Card, bank transfer, and USSD wallet funding via Flutterwave
              </p>
              <Button onClick={handleRefresh} disabled={refreshing} variant="outline" className="gap-2">
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Wallet className="h-5 w-5 text-primary" />
                    <CardTitle>Available Balance</CardTitle>
                  </div>
                  <CardDescription>Flutterwave NGN wallet (live API)</CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <Skeleton className="h-12 w-full" />
                  ) : balance ? (
                    <div className="space-y-2">
                      <div className="text-3xl font-bold text-primary">
                        {balance.currency}{" "}
                        {balance.amount.toLocaleString("en-NG", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </div>
                      {balance.ledgerBalance != null && balance.ledgerBalance !== balance.amount && (
                        <p className="text-sm text-muted-foreground">
                          Ledger: {formatNaira(balance.ledgerBalance)}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Balance unavailable</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Platform Funding</CardTitle>
                  <CardDescription>Completed Flutterwave top-ups on NetPay</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{formatNaira(totalFunded)}</div>
                  <p className="text-sm text-muted-foreground mt-2">
                    {transactions.length} funding record{transactions.length === 1 ? "" : "s"}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Integration</CardTitle>
                  <CardDescription>Checkout + webhook funding</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p>• Mobile/web Add Money uses checkout redirect</p>
                  <p>• Webhook credits wallets after successful payment</p>
                  <p>• Secret: <code className="text-xs">FLUTTERWAVE_SECRET_KEY</code></p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Link2 className="h-5 w-5 text-primary" />
                  <CardTitle>Webhook URL</CardTitle>
                </div>
                <CardDescription>
                  Register in Flutterwave Dashboard → Settings → Webhooks
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <code className="flex-1 break-all rounded-md border bg-muted px-3 py-2 text-sm">
                    {flutterwaveWebhookUrl}
                  </code>
                  <Button onClick={copyWebhookUrl} variant="outline" className="gap-2 shrink-0">
                    <Copy className="h-4 w-4" />
                    Copy URL
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Set <code className="text-xs">FLUTTERWAVE_SECRET_HASH</code> in Supabase to verify webhook signatures.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <History className="h-5 w-5 text-primary" />
                    <div>
                      <CardTitle>Funding Transactions</CardTitle>
                      <CardDescription>User wallet top-ups via Flutterwave</CardDescription>
                    </div>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="relative max-w-xs w-full">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search reference, user..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                    <Select
                      value={String(pageSize)}
                      onValueChange={(value) => {
                        setPageSize(Number(value));
                        setCurrentPage(1);
                      }}
                    >
                      <SelectTrigger className="w-full sm:w-[120px]">
                        <SelectValue placeholder="Rows" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10 / page</SelectItem>
                        <SelectItem value="25">25 / page</SelectItem>
                        <SelectItem value="50">50 / page</SelectItem>
                        <SelectItem value="100">100 / page</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {loadingTransactions ? (
                  <div className="space-y-2">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ) : totalFilteredCount === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">No Flutterwave funding transactions found</p>
                ) : (
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Reference</TableHead>
                          <TableHead>User</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedTransactions.map((txn) => (
                          <TableRow key={txn.id}>
                            <TableCell className="text-sm whitespace-nowrap">
                              {format(new Date(txn.created_at), "MMM d, yyyy HH:mm")}
                            </TableCell>
                            <TableCell className="font-mono text-xs">{txn.reference || txn.id.slice(0, 8)}</TableCell>
                            <TableCell>
                              <div className="font-medium text-sm">{txn.profiles?.full_name || "User"}</div>
                              {txn.profiles?.email && (
                                <div className="text-xs text-muted-foreground">{txn.profiles.email}</div>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-medium">{formatNaira(txn.amount)}</TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  txn.status === "completed" || txn.status === "success" ? "default" : "secondary"
                                }
                              >
                                {txn.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {!loadingTransactions && totalFilteredCount > 0 ? (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-2 border-t">
                    <p className="text-sm text-muted-foreground">
                      Showing {pageStart}-{pageEnd} of {totalFilteredCount}
                    </p>
                    {totalPages > 1 ? (
                      <Pagination>
                        <PaginationContent>
                          <PaginationItem>
                            <PaginationPrevious
                              href="#"
                              onClick={(event) => {
                                event.preventDefault();
                                setCurrentPage((page) => Math.max(1, page - 1));
                              }}
                              className={safeCurrentPage <= 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                            />
                          </PaginationItem>
                          {Array.from({ length: totalPages }, (_, index) => index + 1)
                            .filter((page) => {
                              if (totalPages <= 7) return true;
                              return Math.abs(page - safeCurrentPage) <= 2 || page === 1 || page === totalPages;
                            })
                            .map((page, index, visiblePages) => {
                              const previousPage = visiblePages[index - 1];
                              const showEllipsis = previousPage != null && page - previousPage > 1;

                              return (
                                <span key={page} className="flex items-center">
                                  {showEllipsis ? (
                                    <PaginationItem>
                                      <span className="px-2 text-muted-foreground">…</span>
                                    </PaginationItem>
                                  ) : null}
                                  <PaginationItem>
                                    <PaginationLink
                                      href="#"
                                      isActive={page === safeCurrentPage}
                                      onClick={(event) => {
                                        event.preventDefault();
                                        setCurrentPage(page);
                                      }}
                                      className="cursor-pointer"
                                    >
                                      {page}
                                    </PaginationLink>
                                  </PaginationItem>
                                </span>
                              );
                            })}
                          <PaginationItem>
                            <PaginationNext
                              href="#"
                              onClick={(event) => {
                                event.preventDefault();
                                setCurrentPage((page) => Math.min(totalPages, page + 1));
                              }}
                              className={
                                safeCurrentPage >= totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"
                              }
                            />
                          </PaginationItem>
                        </PaginationContent>
                      </Pagination>
                    ) : null}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
