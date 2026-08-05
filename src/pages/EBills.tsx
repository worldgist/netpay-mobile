import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, Wallet, AlertCircle, Search } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { formatNaira } from '@/lib/currency';

interface BalanceData {
  balance: number;
  currency: string;
}

interface EBillsTransaction {
  id: string;
  service_type: string;
  user_id: string;
  amount: number;
  purchase_amount?: number | null;
  charge_fee?: number | null;
  balance_before: number;
  balance_after: number;
  status: string;
  reference: string;
  created_at: string;
  // Service-specific fields
  meter_number?: string;
  provider?: string;
  meter_type?: string;
  customer_name?: string;
  betting_provider?: string;
  account_number?: string;
  smartcard_number?: string;
  plan_name?: string;
  profiles?: {
    full_name?: string | null;
    email?: string | null;
  } | null;
}

export default function EBills() {
  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [transactions, setTransactions] = useState<EBillsTransaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [transactionSearchQuery, setTransactionSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [serviceFilter, setServiceFilter] = useState('all');
  const { toast } = useToast();
  const navigate = useNavigate();

  const checkAdminAndFetch = useCallback(async () => {
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
          title: "Access Denied",
          description: "You don't have permission to access this page",
          variant: "destructive",
        });
        navigate('/dashboard');
        return;
      }

      await fetchEBillsBalance();
      await fetchEBillsTransactions();
      setLoading(false);
    } catch (error) {
      console.error('Error in checkAdminAndFetch:', error);
      setLoading(false);
    }
  }, [navigate, toast]);

  useEffect(() => {
    checkAdminAndFetch();
  }, [checkAdminAndFetch]);

  const fetchEBillsBalance = async () => {
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-ebills-balance');

      if (error) throw error;

      if (data.success) {
        setBalance(data.data);
        toast({
          title: "Success",
          description: "eBills balance retrieved successfully",
        });
      } else {
        throw new Error(data.error || 'Failed to fetch eBills balance');
      }
    } catch (error: any) {
      console.error('Error fetching eBills balance:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to fetch eBills account information",
        variant: "destructive",
      });
      setBalance(null);
    } finally {
      setRefreshing(false);
    }
  };

  const formatCurrency = (amount: number, currency: string = 'NGN') => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const fetchEBillsTransactions = async () => {
    setLoadingTransactions(true);
    try {
      // Fetch transactions from all tables that use eBills
      const [electricityData, bettingData, cableData, educationData, dataData] = await Promise.all([
        // Electricity transactions
        supabase
          .from('electricity_transactions')
          .select(`
            *,
            profiles (
              full_name,
              email
            )
          `)
          .eq('vending_provider', 'ebills')
          .order('created_at', { ascending: false })
          .limit(100),
        
        // Betting transactions
        supabase
          .from('betting_transactions')
          .select(`
            *,
            profiles (
              full_name,
              email
            )
          `)
          .eq('vending_provider', 'ebills')
          .order('created_at', { ascending: false })
          .limit(100),
        
        // Cable TV transactions
        supabase
          .from('cable_tv_transactions')
          .select(`
            *,
            profiles (
              full_name,
              email
            )
          `)
          .eq('vending_provider', 'ebills')
          .order('created_at', { ascending: false })
          .limit(100),
        
        // Education transactions
        supabase
          .from('education_transactions')
          .select(`
            *,
            profiles (
              full_name,
              email
            )
          `)
          .eq('vending_provider', 'ebills')
          .order('created_at', { ascending: false })
          .limit(100),
        
        // Data transactions
        supabase
          .from('data_transactions')
          .select(`
            *,
            profiles (
              full_name,
              email
            )
          `)
          .eq('vending_provider', 'ebills')
          .order('created_at', { ascending: false })
          .limit(100),
      ]);

      const allTransactions: EBillsTransaction[] = [];

      // Map electricity transactions
      if (electricityData.data) {
        electricityData.data.forEach((tx: any) => {
          allTransactions.push({
            ...tx,
            service_type: 'electricity',
          });
        });
      }

      // Map betting transactions
      if (bettingData.data) {
        bettingData.data.forEach((tx: any) => {
          allTransactions.push({
            ...tx,
            service_type: 'betting',
          });
        });
      }

      // Map cable TV transactions
      if (cableData.data) {
        cableData.data.forEach((tx: any) => {
          allTransactions.push({
            ...tx,
            service_type: 'cable_tv',
          });
        });
      }

      // Map education transactions
      if (educationData.data) {
        educationData.data.forEach((tx: any) => {
          allTransactions.push({
            ...tx,
            service_type: 'education',
          });
        });
      }

      // Map data transactions
      if (dataData.data) {
        dataData.data.forEach((tx: any) => {
          allTransactions.push({
            ...tx,
            service_type: 'data',
          });
        });
      }

      // Sort by created_at descending
      allTransactions.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setTransactions(allTransactions.slice(0, 200)); // Limit to 200 most recent
    } catch (error: any) {
      console.error('Error fetching eBills transactions:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to fetch eBills transactions",
        variant: "destructive",
      });
    } finally {
      setLoadingTransactions(false);
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
      case 'completed-api':
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
      case 'electricity':
        return 'Electricity';
      case 'betting':
        return 'Betting';
      case 'cable_tv':
        return 'Cable TV';
      case 'education':
        return 'Education';
      case 'data':
        return 'Data';
      default:
        return serviceType;
    }
  };

  const filteredTransactions = transactions.filter((txn) => {
    const searchLower = transactionSearchQuery.toLowerCase();
    const matchesSearch = 
      txn.reference?.toLowerCase().includes(searchLower) ||
      txn.meter_number?.toLowerCase().includes(searchLower) ||
      txn.account_number?.toLowerCase().includes(searchLower) ||
      txn.smartcard_number?.toLowerCase().includes(searchLower) ||
      txn.profiles?.full_name?.toLowerCase().includes(searchLower) ||
      txn.profiles?.email?.toLowerCase().includes(searchLower) ||
      txn.customer_name?.toLowerCase().includes(searchLower);
    
    const matchesStatus = statusFilter === 'all' || txn.status.toLowerCase() === statusFilter.toLowerCase();
    const matchesService = serviceFilter === 'all' || txn.service_type === serviceFilter;
    
    return matchesSearch && matchesStatus && matchesService;
  });

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-orange-500" />
            <p className="text-gray-600">Loading eBills account information...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">eBills Account</h1>
          <p className="text-gray-600 mt-1">Manage and monitor your eBills vendor account</p>
        </div>
        <Button
          onClick={fetchEBillsBalance}
          disabled={refreshing}
          variant="outline"
          className="flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing...' : 'Refresh Balance'}
        </Button>
      </div>

      {balance ? (
        <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
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
                  <p className="text-sm text-gray-600 mb-1">Available Balance</p>
                  <p className="text-4xl font-bold text-gray-900">
                    {formatCurrency(balance.balance, balance.currency)}
                  </p>
                </div>
                <div className="pt-4 border-t">
                  <p className="text-sm text-gray-600">
                    Currency: <span className="font-medium">{balance.currency}</span>
                  </p>
                  <p className="text-xs text-gray-500 mt-2">
                    Last updated: {new Date().toLocaleString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Account Information</CardTitle>
              <CardDescription>eBills vendor account details</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Vendor</p>
                  <p className="text-lg font-semibold text-gray-900">eBills Africa</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Status</p>
                  <p className="text-lg font-semibold text-green-600">Active</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Authentication</p>
                  <p className="text-sm font-mono text-gray-700 break-all">
                    POST https://ebills.africa/wp-json/jwt-auth/v1/token
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    JWT via EBILLS_USERNAME + EBILLS_PASSWORD (Supabase secrets). Token expires after 7 days; a fresh token is fetched for each API call.
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">API Base URL</p>
                  <p className="text-sm font-mono text-gray-700 break-all">
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

      {/* Transaction Activities */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Transaction Activities</CardTitle>
              <CardDescription>
                All transactions processed through eBills vendor
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
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={serviceFilter} onValueChange={setServiceFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by service" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Services</SelectItem>
                <SelectItem value="electricity">Electricity</SelectItem>
                <SelectItem value="betting">Betting</SelectItem>
                <SelectItem value="cable_tv">Cable TV</SelectItem>
                <SelectItem value="education">Education</SelectItem>
                <SelectItem value="data">Data</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border">
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
                      No eBills transactions found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTransactions.map((txn) => (
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
                        {txn.service_type === 'education' && (
                          <div>
                            <div>{txn.provider}</div>
                            {txn.plan_name && (
                              <div className="text-xs text-muted-foreground">{txn.plan_name}</div>
                            )}
                          </div>
                        )}
                        {txn.service_type === 'data' && (
                          <div>
                            <div>{txn.provider}</div>
                            {txn.plan_name && (
                              <div className="text-xs text-muted-foreground">{txn.plan_name}</div>
                            )}
                          </div>
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

      <Card>
        <CardHeader>
          <CardTitle>About eBills</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm text-gray-600">
            <p>
              eBills Africa provides API access for various services including airtime, data,
              electricity, cable TV, and education PINs.
            </p>
            <p>
              <strong>Note:</strong> JWT tokens expire after 7 days. The system automatically
              refreshes tokens when needed.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}








