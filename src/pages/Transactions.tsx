import { useState, useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Download, Calendar } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import { formatNaira } from "@/lib/currency";

interface Transaction {
  id: string;
  reference: string;
  user: string;
  email?: string;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  description?: string;
  status: string;
  date: string;
  category: string;
  token?: string | null;
}

export default function Transactions() {
  const [searchQuery, setSearchQuery] = useState("");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: new Date(new Date().setDate(new Date().getDate() - 30)),
    to: new Date(),
  });
  const [statusFilter, setStatusFilter] = useState("all");
  const [processingPending, setProcessingPending] = useState(false);
  const [updatingNullTokens, setUpdatingNullTokens] = useState(false);
  const [recoveringTransactions, setRecoveringTransactions] = useState(false);
  const { toast } = useToast();

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke('fetch-admin-transactions', {
        body: {
          startDate: dateRange.from.toISOString(),
          endDate: dateRange.to.toISOString(),
          status: statusFilter === 'all' ? null : statusFilter,
        },
      });

      if (error) throw error;

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch transactions');
      }

      setTransactions(data.data || []);
    } catch (error: any) {
      console.error('Fetch transactions error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to fetch transactions",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, [dateRange, statusFilter]);

  const filteredTransactions = transactions.filter(txn => {
    const searchLower = searchQuery.toLowerCase();
    return (
      txn.reference?.toLowerCase().includes(searchLower) ||
      txn.user?.toLowerCase().includes(searchLower) ||
      txn.email?.toLowerCase().includes(searchLower) ||
      txn.type?.toLowerCase().includes(searchLower) ||
      txn.description?.toLowerCase().includes(searchLower)
    );
  });

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
        return 'secondary';
    }
  };

  const exportTransactions = () => {
    const csv = [
      ['Reference', 'User', 'Type', 'Amount', 'Status', 'Date', 'Description'].join(','),
      ...filteredTransactions.map(txn => [
        txn.reference,
        txn.user,
        txn.type,
        txn.amount,
        txn.status,
        format(new Date(txn.date), 'yyyy-MM-dd HH:mm:ss'),
        txn.description || '',
      ].join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
  };

  const processPendingTransactions = async () => {
    try {
      setProcessingPending(true);
      const { data, error } = await supabase.functions.invoke('process-pending-electricity', {
        body: {
          limit: 100,
        },
      });

      if (error) throw error;

      if (!data.success) {
        throw new Error(data.error || 'Failed to process pending transactions');
      }

      toast({
        title: "Success",
        description: `Processed ${data.processed} transactions. Updated: ${data.updated}, Failed: ${data.failed}`,
        variant: "default",
      });

      // Refresh transactions after processing
      await fetchTransactions();
    } catch (error: any) {
      console.error('Process pending transactions error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to process pending transactions",
        variant: "destructive",
      });
    } finally {
      setProcessingPending(false);
    }
  };

  const pendingCount = transactions.filter(txn => txn.status === 'pending' && txn.category === 'electricity').length;
  const nullTokenCount = transactions.filter(txn => 
    txn.status === 'completed' && 
    txn.category === 'electricity' && 
    (!txn.token || txn.token === 'null' || txn.token === null)
  ).length;

  const updateNullTokens = async () => {
    try {
      setUpdatingNullTokens(true);
      const { data, error } = await supabase.functions.invoke('update-null-tokens', {
        body: {
          limit: 100,
        },
      });

      if (error) throw error;

      if (!data.success) {
        throw new Error(data.error || 'Failed to update null tokens');
      }

      const message = data.errors && data.errors.length > 0
        ? `Processed ${data.processed} transactions. Updated: ${data.updated}, Failed: ${data.failed}. Errors: ${data.errors.slice(0, 3).join('; ')}${data.errors.length > 3 ? '...' : ''}`
        : `Processed ${data.processed} transactions. Updated: ${data.updated}, Failed: ${data.failed}`;

      toast({
        title: data.updated > 0 ? "Success" : "Partial Success",
        description: message,
        variant: data.updated > 0 ? "default" : "destructive",
      });

      // Refresh transactions after processing
      await fetchTransactions();
    } catch (error: any) {
      console.error('Update null tokens error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to update null tokens",
        variant: "destructive",
      });
    } finally {
      setUpdatingNullTokens(false);
    }
  };

  const recoverMissingTransactions = async () => {
    try {
      setRecoveringTransactions(true);
      const { data, error } = await supabase.functions.invoke('recover-electricity-transactions', {
        body: {
          limit: 100,
        },
      });

      if (error) throw error;

      if (!data.success) {
        throw new Error(data.error || 'Failed to recover transactions');
      }

      toast({
        title: "Success",
        description: `Recovered ${data.recovered} transactions. Skipped: ${data.skipped}, Errors: ${data.errors}`,
        variant: "default",
      });

      // Refresh transactions after recovery
      await fetchTransactions();
    } catch (error: any) {
      console.error('Recover transactions error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to recover transactions",
        variant: "destructive",
      });
    } finally {
      setRecoveringTransactions(false);
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
              <h1 className="text-2xl font-bold">Transactions</h1>
            </div>
          </header>

          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Search transactions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex items-center gap-2">
                {pendingCount > 0 && (
                  <Button 
                    variant="default" 
                    className="gap-2" 
                    onClick={processPendingTransactions}
                    disabled={processingPending}
                  >
                    {processingPending ? 'Processing...' : `Process ${pendingCount} Pending`}
                  </Button>
                )}
                {nullTokenCount > 0 && (
                  <Button 
                    variant="outline" 
                    className="gap-2" 
                    onClick={updateNullTokens}
                    disabled={updatingNullTokens}
                  >
                    {updatingNullTokens ? 'Updating...' : `Update ${nullTokenCount} Null Tokens`}
                  </Button>
                )}
                <Button 
                  variant="secondary" 
                  className="gap-2" 
                  onClick={recoverMissingTransactions}
                  disabled={recoveringTransactions}
                >
                  {recoveringTransactions ? 'Recovering...' : 'Recover Missing Electricity Transactions'}
                </Button>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="gap-2">
                      <Calendar className="h-4 w-4" />
                      {format(dateRange.from, "MMM dd")} - {format(dateRange.to, "MMM dd, yyyy")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <div className="p-4 space-y-4">
                      <div>
                        <p className="text-sm font-medium mb-2">From</p>
                        <CalendarComponent
                          mode="single"
                          selected={dateRange.from}
                          onSelect={(date) => date && setDateRange({ ...dateRange, from: date })}
                        />
                      </div>
                      <div>
                        <p className="text-sm font-medium mb-2">To</p>
                        <CalendarComponent
                          mode="single"
                          selected={dateRange.to}
                          onSelect={(date) => date && setDateRange({ ...dateRange, to: date })}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => setDateRange({
                          from: new Date(),
                          to: new Date(),
                        })}>Today</Button>
                        <Button size="sm" variant="outline" onClick={() => setDateRange({
                          from: new Date(new Date().setDate(new Date().getDate() - 7)),
                          to: new Date(),
                        })}>Last 7 days</Button>
                        <Button size="sm" variant="outline" onClick={() => setDateRange({
                          from: new Date(new Date().setDate(new Date().getDate() - 30)),
                          to: new Date(),
                        })}>Last 30 days</Button>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
                <Button variant="outline" className="gap-2" onClick={exportTransactions}>
                  <Download className="h-4 w-4" />
                  Export
                </Button>
              </div>
            </div>

            <Tabs value={statusFilter} onValueChange={setStatusFilter}>
              <TabsList>
                <TabsTrigger value="all">All ({transactions.length})</TabsTrigger>
                <TabsTrigger value="completed">Completed ({transactions.filter(t => t.status === 'completed').length})</TabsTrigger>
                <TabsTrigger value="pending">Pending ({transactions.filter(t => t.status === 'pending').length})</TabsTrigger>
                <TabsTrigger value="failed">Failed ({transactions.filter(t => t.status === 'failed').length})</TabsTrigger>
              </TabsList>

              <TabsContent value={statusFilter} className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Transaction History</CardTitle>
                    <CardDescription>
                      {loading ? "Loading transactions..." : `Showing ${filteredTransactions.length} transaction${filteredTransactions.length !== 1 ? 's' : ''}`}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {loading ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                      </div>
                    ) : filteredTransactions.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        No transactions found
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Reference</TableHead>
                            <TableHead>User</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Balance Change</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Date</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredTransactions.map((txn) => (
                            <TableRow key={txn.id}>
                              <TableCell className="font-mono text-xs">{txn.reference}</TableCell>
                              <TableCell>
                                <div>
                                  <div className="font-medium">{txn.user}</div>
                                  {txn.email && (
                                    <div className="text-xs text-muted-foreground">{txn.email}</div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div>
                                  <div className="font-medium">{txn.type}</div>
                                  {txn.description && (
                                    <div className="text-xs text-muted-foreground">{txn.description}</div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="font-semibold">{formatNaira(txn.amount)}</TableCell>
                              <TableCell>
                                <div className="text-xs">
                                  <div>{formatNaira(txn.balanceBefore)} → {formatNaira(txn.balanceAfter)}</div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant={getStatusBadgeVariant(txn.status)}>
                                  {txn.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm">
                                {format(new Date(txn.date), 'MMM dd, yyyy HH:mm')}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
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
