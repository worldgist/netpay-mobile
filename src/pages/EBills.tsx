import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, Wallet, AlertCircle, Search, History } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { format } from 'date-fns';
import { formatNaira } from '@/lib/currency';
import { fetchEbillsApiTransactions, type EBillsApiTransaction } from '@/lib/ebills-transactions';

interface BalanceData {
  balance: number;
  currency: string;
}

type EBillsTransaction = EBillsApiTransaction;

const SERVICE_OPTIONS = [
  { value: 'all', label: 'All Services' },
  { value: 'airtime', label: 'Airtime' },
  { value: 'data', label: 'Data' },
  { value: 'electricity', label: 'Electricity' },
  { value: 'cable_tv', label: 'Cable TV' },
  { value: 'betting', label: 'Betting' },
] as const;

export default function EBills() {
  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [transactions, setTransactions] = useState<EBillsTransaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [processingPending, setProcessingPending] = useState(false);
  const [transactionSearchQuery, setTransactionSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const { toast } = useToast();
  const navigate = useNavigate();

  const fetchEBillsBalance = useCallback(async (showToast = false) => {
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-ebills-balance');

      if (error) throw error;

      if (data.success) {
        setBalance(data.data);
        if (showToast) {
          toast({
            title: 'Success',
            description: 'eBills balance retrieved successfully',
          });
        }
      } else {
        throw new Error(data.error || 'Failed to fetch eBills balance');
      }
    } catch (error: unknown) {
      console.error('Error fetching eBills balance:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to fetch eBills account information',
        variant: 'destructive',
      });
      setBalance(null);
    } finally {
      setRefreshing(false);
    }
  }, [toast]);

  const fetchEBillsTransactions = useCallback(async () => {
    setLoadingTransactions(true);
    try {
      const rows = await fetchEbillsApiTransactions();
      setTransactions(rows);
    } catch (error: unknown) {
      console.error('Error fetching eBills transactions:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to fetch eBills transactions',
        variant: 'destructive',
      });
      setTransactions([]);
    } finally {
      setLoadingTransactions(false);
    }
  }, [toast]);

  useEffect(() => {
    const checkAdminAndFetch = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
          setLoading(false);
          navigate('/auth');
          return;
        }

        const { data: roles } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', session.user.id)
          .eq('role', 'admin')
          .maybeSingle();

        if (!roles) {
          setLoading(false);
          toast({
            title: 'Access Denied',
            description: "You don't have permission to access this page",
            variant: 'destructive',
          });
          navigate('/dashboard');
          return;
        }

        await Promise.all([fetchEBillsBalance(false), fetchEBillsTransactions()]);
        setLoading(false);
      } catch (error) {
        console.error('Error in checkAdminAndFetch:', error);
        setLoading(false);
      }
    };

    checkAdminAndFetch();
  }, [navigate, toast, fetchEBillsBalance, fetchEBillsTransactions]);

  const formatCurrency = (amount: number, currency: string = 'NGN') => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
      case 'completed-api':
      case 'success':
        return 'default';
      case 'pending':
      case 'processing':
      case 'processing-api':
        return 'secondary';
      case 'failed':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const getServiceTypeLabel = (serviceType: string) => {
    switch (serviceType) {
      case 'airtime':
        return 'Airtime';
      case 'electricity':
        return 'Electricity';
      case 'betting':
        return 'Betting';
      case 'cable_tv':
        return 'Cable TV';
      case 'data':
        return 'Data';
      default:
        return serviceType;
    }
  };

  const filteredTransactions = useMemo(() => {
    const searchLower = transactionSearchQuery.toLowerCase().trim();

    return transactions.filter((txn) => {
      const matchesSearch =
        !searchLower ||
        txn.reference?.toLowerCase().includes(searchLower) ||
        txn.meter_number?.toLowerCase().includes(searchLower) ||
        txn.account_number?.toLowerCase().includes(searchLower) ||
        txn.smartcard_number?.toLowerCase().includes(searchLower) ||
        txn.phone_number?.toLowerCase().includes(searchLower) ||
        txn.network?.toLowerCase().includes(searchLower) ||
        txn.plan_name?.toLowerCase().includes(searchLower) ||
        txn.betting_provider?.toLowerCase().includes(searchLower) ||
        txn.profiles?.full_name?.toLowerCase().includes(searchLower) ||
        txn.profiles?.email?.toLowerCase().includes(searchLower) ||
        txn.customer_name?.toLowerCase().includes(searchLower);

      const matchesStatus =
        statusFilter === 'all' || txn.status.toLowerCase() === statusFilter.toLowerCase();
      const matchesService = serviceFilter === 'all' || txn.service_type === serviceFilter;

      return matchesSearch && matchesStatus && matchesService;
    });
  }, [transactions, transactionSearchQuery, statusFilter, serviceFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [transactionSearchQuery, statusFilter, serviceFilter, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedTransactions = filteredTransactions.slice(
    (safeCurrentPage - 1) * pageSize,
    safeCurrentPage * pageSize,
  );
  const pageStart = filteredTransactions.length === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1;
  const pageEnd = Math.min(safeCurrentPage * pageSize, filteredTransactions.length);

  const completedAmount = useMemo(
    () =>
      transactions
        .filter((txn) => {
          const status = txn.status.toLowerCase();
          return status === 'completed' || status === 'completed-api' || status === 'success';
        })
        .reduce((sum, txn) => sum + Number(txn.amount || 0), 0),
    [transactions],
  );

  const handleRefresh = async () => {
    await Promise.all([fetchEBillsBalance(true), fetchEBillsTransactions()]);
  };

  const processPendingEbills = async (reference?: string) => {
    setProcessingPending(true);
    try {
      const { data, error } = await supabase.functions.invoke('process-pending-ebills-transactions', {
        body: {
          limit: 100,
          ...(reference ? { reference } : {}),
        },
      });

      if (error) throw error;
      if (!data?.success) {
        throw new Error(data?.error || 'Failed to reconcile pending eBills orders');
      }

      toast({
        title: 'eBills reconciliation complete',
        description: `Processed ${data.processed}. Completed: ${data.completed}, Refunded: ${data.refunded}, Still processing: ${data.still_processing}`,
      });

      await fetchEBillsTransactions();
    } catch (error: unknown) {
      console.error('process-pending-ebills-transactions error:', error);
      toast({
        title: 'Reconciliation failed',
        description: error instanceof Error ? error.message : 'Could not reconcile pending eBills orders',
        variant: 'destructive',
      });
    } finally {
      setProcessingPending(false);
    }
  };

  if (loading) {
    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full bg-background">
          <AppSidebar />
          <main className="flex-1 overflow-auto">
            <div className="flex items-center justify-center min-h-[400px]">
              <div className="text-center">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-orange-500" />
                <p className="text-muted-foreground">Loading eBills account information...</p>
              </div>
            </div>
          </main>
        </div>
      </SidebarProvider>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex h-16 items-center gap-4 px-6">
              <SidebarTrigger />
              <h1 className="text-2xl font-bold">eBills Africa</h1>
            </div>
          </header>

          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground">
                Wallet balance and every purchase processed through the eBills API
              </p>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => processPendingEbills()}
                  disabled={processingPending || loadingTransactions}
                  variant="default"
                  className="flex items-center gap-2"
                >
                  <RefreshCw className={`h-4 w-4 ${processingPending ? 'animate-spin' : ''}`} />
                  {processingPending ? 'Reconciling...' : 'Reconcile pending'}
                </Button>
                <Button
                  onClick={handleRefresh}
                  disabled={refreshing || loadingTransactions}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  <RefreshCw className={`h-4 w-4 ${refreshing || loadingTransactions ? 'animate-spin' : ''}`} />
                  {refreshing || loadingTransactions ? 'Refreshing...' : 'Refresh'}
                </Button>
              </div>
            </div>

            {balance ? (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Wallet className="h-5 w-5 text-orange-500" />
                      Wallet Balance
                    </CardTitle>
                    <CardDescription>Current eBills account balance</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Available Balance</p>
                        <p className="text-4xl font-bold">
                          {formatCurrency(balance.balance, balance.currency)}
                        </p>
                      </div>
                      <div className="pt-4 border-t">
                        <p className="text-sm text-muted-foreground">
                          Currency: <span className="font-medium text-foreground">{balance.currency}</span>
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <History className="h-5 w-5 text-primary" />
                      API Transactions
                    </CardTitle>
                    <CardDescription>Purchases fulfilled by eBills Africa</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-4xl font-bold">{transactions.length.toLocaleString()}</div>
                    <p className="text-sm text-muted-foreground mt-2">
                      Completed volume {formatNaira(completedAmount)}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Account Information</CardTitle>
                    <CardDescription>eBills vendor account details</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Vendor</p>
                        <p className="text-lg font-semibold">eBills Africa</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">API Base URL</p>
                        <p className="text-sm font-mono break-all">
                          https://ebills.africa/wp-json
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Unable to fetch eBills balance. Please check your credentials and try again.
                </AlertDescription>
              </Alert>
            )}

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <CardTitle>Transaction Activities</CardTitle>
                    <CardDescription>
                      {loadingTransactions
                        ? 'Loading transactions...'
                        : filteredTransactions.length === 0
                          ? 'No eBills API transactions match your filters'
                          : `Showing ${pageStart}–${pageEnd} of ${filteredTransactions.length} eBills API transaction${filteredTransactions.length === 1 ? '' : 's'}`}
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchEBillsTransactions}
                    disabled={loadingTransactions}
                    className="gap-2"
                  >
                    <RefreshCw className={`h-4 w-4 ${loadingTransactions ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 mb-4 flex-wrap">
                  <div className="relative flex-1 min-w-[220px] max-w-sm">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                    <Input
                      placeholder="Search reference, user, phone, meter..."
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
                      <SelectItem value="processing">Processing</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={serviceFilter} onValueChange={setServiceFilter}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Filter by service" />
                    </SelectTrigger>
                    <SelectContent>
                      {SERVICE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Reference</TableHead>
                        <TableHead>Service</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Details</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Charge Fee</TableHead>
                        <TableHead>Balance</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingTransactions ? (
                        <TableRow>
                          <TableCell colSpan={10} className="text-center text-muted-foreground">
                            Loading transactions...
                          </TableCell>
                        </TableRow>
                      ) : paginatedTransactions.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={10} className="text-center text-muted-foreground">
                            No eBills transactions found
                          </TableCell>
                        </TableRow>
                      ) : (
                        paginatedTransactions.map((txn) => (
                          <TableRow key={`${txn.service_type}-${txn.id}`}>
                            <TableCell className="font-mono text-xs">{txn.reference}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{getServiceTypeLabel(txn.service_type)}</Badge>
                            </TableCell>
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
                            <TableCell className="text-sm">
                              {txn.service_type === 'airtime' && (
                                <div>
                                  <div className="font-mono">{txn.phone_number}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {txn.network || txn.provider}
                                  </div>
                                </div>
                              )}
                              {txn.service_type === 'electricity' && (
                                <div>
                                  <div className="font-mono">{txn.meter_number}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {txn.provider} • {txn.meter_type?.toUpperCase()}
                                  </div>
                                </div>
                              )}
                              {txn.service_type === 'betting' && (
                                <div>
                                  <div>{txn.betting_provider}</div>
                                  <div className="text-xs text-muted-foreground font-mono">
                                    {txn.account_number}
                                  </div>
                                </div>
                              )}
                              {txn.service_type === 'cable_tv' && (
                                <div>
                                  <div className="font-mono">{txn.smartcard_number}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {txn.provider} • {txn.plan_name}
                                  </div>
                                </div>
                              )}
                              {txn.service_type === 'data' && (
                                <div>
                                  <div className="font-mono">{txn.phone_number}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {txn.network || txn.provider}
                                    {txn.plan_name ? ` • ${txn.plan_name}` : ''}
                                  </div>
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="font-semibold">{formatNaira(txn.amount || 0)}</div>
                              {txn.purchase_amount ? (
                                <div className="text-xs text-muted-foreground">
                                  Base: {formatNaira(txn.purchase_amount)}
                                </div>
                              ) : null}
                            </TableCell>
                            <TableCell>
                              {txn.charge_fee ? formatNaira(txn.charge_fee) : '-'}
                            </TableCell>
                            <TableCell className="text-xs">
                              <div>
                                {formatNaira(txn.balance_before || 0)} → {formatNaira(txn.balance_after || 0)}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={getStatusBadgeVariant(txn.status)}>
                                {txn.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm whitespace-nowrap">
                              {format(new Date(txn.created_at), 'MMM dd, yyyy HH:mm')}
                            </TableCell>
                            <TableCell className="text-right">
                              {['processing', 'pending'].includes(txn.status.toLowerCase()) ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={processingPending}
                                  onClick={() => processPendingEbills(txn.reference)}
                                >
                                  Sync & refund
                                </Button>
                              ) : null}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                {!loadingTransactions && filteredTransactions.length > 0 && (
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pt-4 border-t mt-4">
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <span>
                        Page {safeCurrentPage} of {totalPages}
                      </span>
                      <Select
                        value={String(pageSize)}
                        onValueChange={(value) => setPageSize(Number(value))}
                      >
                        <SelectTrigger className="w-[110px] h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="10">10 / page</SelectItem>
                          <SelectItem value="25">25 / page</SelectItem>
                          <SelectItem value="50">50 / page</SelectItem>
                          <SelectItem value="100">100 / page</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {totalPages > 1 && (
                      <Pagination>
                        <PaginationContent>
                          <PaginationItem>
                            <PaginationPrevious
                              href="#"
                              onClick={(e) => {
                                e.preventDefault();
                                setCurrentPage((page) => Math.max(1, page - 1));
                              }}
                              className={safeCurrentPage <= 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                            />
                          </PaginationItem>
                          {Array.from({ length: Math.min(totalPages, 7) }, (_, index) => {
                            let pageNumber = index + 1;
                            if (totalPages > 7) {
                              if (safeCurrentPage <= 4) pageNumber = index + 1;
                              else if (safeCurrentPage >= totalPages - 3) pageNumber = totalPages - 6 + index;
                              else pageNumber = safeCurrentPage - 3 + index;
                            }
                            return (
                              <PaginationItem key={pageNumber}>
                                <PaginationLink
                                  href="#"
                                  isActive={pageNumber === safeCurrentPage}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    setCurrentPage(pageNumber);
                                  }}
                                  className="cursor-pointer"
                                >
                                  {pageNumber}
                                </PaginationLink>
                              </PaginationItem>
                            );
                          })}
                          <PaginationItem>
                            <PaginationNext
                              href="#"
                              onClick={(e) => {
                                e.preventDefault();
                                setCurrentPage((page) => Math.min(totalPages, page + 1));
                              }}
                              className={safeCurrentPage >= totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                            />
                          </PaginationItem>
                        </PaginationContent>
                      </Pagination>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>About eBills</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>
                    eBills Africa provides API access for airtime, data, electricity, cable TV, and betting.
                    This page lists every NetPay purchase routed through that API.
                  </p>
                  <p>
                    <strong>Note:</strong> JWT tokens expire after 7 days. The system automatically
                    refreshes tokens when needed.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
