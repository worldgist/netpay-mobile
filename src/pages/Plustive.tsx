import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RefreshCw, Search, Wallet } from 'lucide-react';
import { format } from 'date-fns';
import { formatNaira } from '@/lib/currency';

interface BalanceData {
  balance: number;
  currency: string;
}

interface PlustiveActivity {
  id: string;
  reference: string;
  service: string;
  description: string;
  amount: number;
  status: string;
  createdAt: string;
  userName: string;
  userEmail: string;
}

const SERVICE_TABLES = [
  { table: 'airtime_transactions', service: 'Airtime' },
  { table: 'data_transactions', service: 'Data' },
  { table: 'electricity_transactions', service: 'Electricity' },
  { table: 'cable_tv_transactions', service: 'Cable TV' },
  { table: 'education_transactions', service: 'Education' },
  { table: 'betting_transactions', service: 'Betting' },
] as const;

function activityDetail(row: Record<string, unknown>): string {
  const detail =
    row.phone_number ||
    row.meter_number ||
    row.smartcard_number ||
    row.account_number ||
    row.customer_name ||
    row.plan_name ||
    row.network ||
    row.exam_type ||
    row.betting_provider;
  return detail ? String(detail) : '—';
}

async function fetchPlustiveActivities(): Promise<PlustiveActivity[]> {
  const results = await Promise.all(
    SERVICE_TABLES.map(async ({ table, service }) => {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq('vending_provider', 'plustive')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) {
        console.warn(`Plustive ${table} lookup failed:`, error.message);
        return [] as Array<Record<string, unknown> & { service: string }>;
      }

      return (data || []).map((row) => ({
        ...(row as Record<string, unknown>),
        service,
      }));
    }),
  );

  const rows = results.flat();
  const userIds = [...new Set(rows.map((row) => String(row.user_id || '')).filter(Boolean))];
  const profilesById = new Map<string, { full_name?: string | null; email?: string | null }>();

  if (userIds.length > 0) {
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', userIds);

    if (error) {
      console.warn('Plustive profile lookup failed:', error.message);
    } else {
      for (const profile of profiles || []) {
        profilesById.set(profile.id, profile);
      }
    }
  }

  return rows
    .map((record) => {
      const profile = profilesById.get(String(record.user_id || ''));
      return {
        id: `${record.service}-${String(record.id)}`,
        reference: String(record.reference || record.id),
        service: String(record.service),
        description: activityDetail(record),
        amount: Number(record.amount ?? record.purchase_amount ?? 0),
        status: String(record.status || 'unknown'),
        createdAt: String(record.created_at),
        userName: profile?.full_name || '—',
        userEmail: profile?.email || '',
      };
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' {
  if (status === 'success' || status === 'completed') return 'default';
  if (status === 'failed' || status === 'refunded') return 'destructive';
  return 'secondary';
}

async function readInvokeError(error: unknown): Promise<string | null> {
  const context = (error as { context?: Response })?.context;
  if (!context || typeof context.json !== 'function') return null;
  try {
    const body = await context.json();
    const message = body?.error || body?.message;
    return typeof message === 'string' && message.trim() ? message : null;
  } catch {
    return null;
  }
}

export default function Plustive() {
  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [activities, setActivities] = useState<PlustiveActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingActivities, setLoadingActivities] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [checkingReference, setCheckingReference] = useState<string | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  const fetchBalance = useCallback(async (showToast = false) => {
    setRefreshing(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        throw new Error('Session expired. Please sign in again.');
      }

      const { data, error } = await supabase.functions.invoke('fetch-plustive-balance', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (error) {
        const body = await readInvokeError(error);
        throw new Error(body || error.message || 'Failed to fetch Plustive balance');
      }
      if (!data?.success) {
        throw new Error(data?.error || 'Failed to fetch Plustive balance');
      }
      setBalance(data.data);
      if (showToast) {
        toast({
          title: 'Success',
          description: 'Plustive balance retrieved successfully',
        });
      }
    } catch (error: unknown) {
      console.error('Error fetching Plustive balance:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to fetch Plustive account information',
        variant: 'destructive',
      });
      setBalance(null);
    } finally {
      setRefreshing(false);
    }
  }, [toast]);

  const loadActivities = useCallback(async () => {
    setLoadingActivities(true);
    try {
      setActivities(await fetchPlustiveActivities());
    } catch (error) {
      console.error('Error fetching Plustive activities:', error);
      toast({
        title: 'Error',
        description: 'Failed to load Plustive transactions',
        variant: 'destructive',
      });
    } finally {
      setLoadingActivities(false);
    }
  }, [toast]);

  const checkWithPlustive = useCallback(async (row?: PlustiveActivity) => {
    const key = row?.reference || '*pending';
    setCheckingReference(key);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        throw new Error('Session expired. Please sign in again.');
      }

      const { data, error } = await supabase.functions.invoke('check-plustive-transaction', {
        body: row ? { reference: row.reference, service: row.service } : {},
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (error) {
        const body = await readInvokeError(error);
        throw new Error(body || error.message || 'Failed to check the Plustive transaction');
      }
      if (!data?.success) {
        throw new Error(data?.error || 'Failed to check the Plustive transaction');
      }

      const result = data.data as { message?: string; checked?: number } | undefined;
      toast({
        title: 'Plustive',
        description: row
          ? result?.message || 'Transaction checked'
          : `Checked ${result?.checked ?? 0} open purchases`,
      });
      await loadActivities();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to check the Plustive transaction',
        variant: 'destructive',
      });
    } finally {
      setCheckingReference(null);
    }
  }, [loadActivities, toast]);

  const filteredActivities = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return activities;
    return activities.filter((row) =>
      [row.reference, row.service, row.description, row.status, row.userName, row.userEmail]
        .join(' ')
        .toLowerCase()
        .includes(query),
    );
  }, [activities, searchQuery]);

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

        await Promise.all([fetchBalance(false), loadActivities()]);
        setLoading(false);
      } catch (error) {
        console.error('Error in Plustive admin check:', error);
        setLoading(false);
      }
    };

    checkAdminAndFetch();
  }, [navigate, toast, fetchBalance, loadActivities]);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex h-16 items-center justify-between gap-4 px-6">
              <div className="flex items-center gap-4">
                <SidebarTrigger />
                <h1 className="text-2xl font-bold">Plustive Impact</h1>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void fetchBalance(true);
                  void loadActivities();
                }}
                disabled={refreshing}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </header>

          <div className="p-6 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="h-5 w-5" />
                  Wallet Balance
                </CardTitle>
                <CardDescription>
                  Prepaid Plustive wallet used for airtime, data, and bill payments
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-muted-foreground">Loading balance…</p>
                ) : balance ? (
                  <div className="text-3xl font-semibold">
                    {formatNaira(balance.balance)}
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      {balance.currency || 'NGN'}
                    </span>
                  </div>
                ) : (
                  <p className="text-muted-foreground">
                    Balance unavailable. Confirm the API key is configured.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <CardTitle>Transaction activity</CardTitle>
                    <CardDescription>
                      Purchases fulfilled through Plustive Impact. Check asks Plustive for the current status.
                    </CardDescription>
                  </div>
                  <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center">
                    <Button
                      variant="outline"
                      disabled={checkingReference !== null}
                      onClick={() => void checkWithPlustive()}
                    >
                      Check open purchases
                    </Button>
                  <div className="relative w-full md:w-72">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      placeholder="Search reference, user, or service"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                    />
                  </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loadingActivities ? (
                  <p className="text-muted-foreground">Loading transactions…</p>
                ) : filteredActivities.length === 0 ? (
                  <p className="text-muted-foreground">No Plustive transactions found</p>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>User</TableHead>
                          <TableHead>Service</TableHead>
                          <TableHead>Details</TableHead>
                          <TableHead>Reference</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredActivities.map((row) => (
                          <TableRow key={row.id}>
                            <TableCell className="whitespace-nowrap text-sm">
                              {format(new Date(row.createdAt), 'MMM dd, yyyy HH:mm')}
                            </TableCell>
                            <TableCell>
                              <div className="font-medium">{row.userName}</div>
                              {row.userEmail ? (
                                <div className="text-xs text-muted-foreground">{row.userEmail}</div>
                              ) : null}
                            </TableCell>
                            <TableCell>{row.service}</TableCell>
                            <TableCell className="font-mono text-sm">{row.description}</TableCell>
                            <TableCell className="font-mono text-xs">{row.reference}</TableCell>
                            <TableCell className="text-right font-medium">{formatNaira(row.amount)}</TableCell>
                            <TableCell>
                              <Badge variant={statusVariant(row.status)}>
                                {row.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              {row.service === 'Betting' ? null : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={checkingReference !== null}
                                  onClick={() => void checkWithPlustive(row)}
                                >
                                  {checkingReference === row.reference ? 'Checking…' : 'Check'}
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
