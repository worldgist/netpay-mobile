import { useState, useEffect, useRef } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Search, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { formatNaira } from "@/lib/currency";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";


interface EducationTransaction {
  id: string;
  user_id: string;
  amount: number;
  purchase_amount?: number | null;
  charge_fee?: number | null;
  balance_before: number;
  balance_after: number;
  exam_type: string;
  phone_number?: string | null;
  status: string;
  reference: string;
  created_at: string;
  profiles?: {
    full_name?: string | null;
    email?: string | null;
  } | null;
}

const VENDOR_PROVIDERS = ["mobilenig", "vtpass", "smeplug"] as const;

export default function EducationServices() {
  const [vendingProvider, setVendingProvider] = useState<'mobilenig' | 'vtpass' | 'smeplug'>('mobilenig');
  const [transactions, setTransactions] = useState<EducationTransaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [transactionSearchQuery, setTransactionSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [serviceAvailability, setServiceAvailability] = useState<{
    WAEC: boolean;
    NECO: boolean;
    JAMB: boolean;
  }>({
    WAEC: true,
    NECO: true,
    JAMB: true,
  });
  const prevAvailabilityRef = useRef(serviceAvailability);
  const { toast } = useToast();

  useEffect(() => {
    fetchEducationProvider();
    fetchTransactions();
    fetchServiceAvailability();
  }, [statusFilter]);

  const fetchServiceAvailability = async () => {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'education_service_availability')
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching service availability:', error);
        return;
      }

        if (data?.setting_value) {
          const availability = data.setting_value as { WAEC?: boolean; NECO?: boolean; JAMB?: boolean };
          const defaultAvailability = {
            WAEC: availability.WAEC ?? true,
            NECO: availability.NECO ?? true,
            JAMB: availability.JAMB ?? true,
          };
          setServiceAvailability(defaultAvailability);
          prevAvailabilityRef.current = defaultAvailability;
        } else {
          // If no settings exist, ensure defaults are set
          const defaultAvailability = {
            WAEC: true,
            NECO: true,
            JAMB: true,
          };
          setServiceAvailability(defaultAvailability);
          prevAvailabilityRef.current = defaultAvailability;
        }
    } catch (error) {
      console.error('Error fetching service availability:', error);
      // On error, use defaults
      setServiceAvailability({
        WAEC: true,
        NECO: true,
        JAMB: true,
      });
    }
  };

  const updateServiceAvailability = async (examType: 'WAEC' | 'NECO' | 'JAMB', available: boolean) => {
    try {
      // Store current state in ref before optimistic update
      prevAvailabilityRef.current = serviceAvailability;
      
      // Optimistically update UI
      const updatedAvailability = {
        ...serviceAvailability,
        [examType]: available,
      };
      setServiceAvailability(updatedAvailability);

      const { error } = await supabase
        .from('app_settings')
        .upsert({
          setting_key: 'education_service_availability',
          setting_value: updatedAvailability,
          setting_category: 'system',
          description: 'Availability settings for education services (WAEC, NECO, JAMB)'
        }, {
          onConflict: 'setting_key'
        });

      if (error) {
        throw error;
      }

      // Update ref after successful save
      prevAvailabilityRef.current = updatedAvailability;

      toast({
        title: "Success",
        description: `${examType} service ${available ? 'enabled' : 'disabled'} successfully`,
      });
    } catch (error: any) {
      console.error('Error updating service availability:', error);
      // Revert on error using the stored previous state from ref
      setServiceAvailability(prevAvailabilityRef.current);
      toast({
        title: "Error",
        description: error.message || "Failed to update service availability",
        variant: "destructive",
      });
    }
  };


  const fetchEducationProvider = async () => {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'education_provider')
        .maybeSingle();

      if (error) {
        console.error('Error fetching education provider setting:', error);
        return;
      }

      if (data?.setting_value) {
        const provider = (data.setting_value as any)?.provider || 'mobilenig';
        const validProviders = ['mobilenig', 'vtpass', 'smeplug'];
        const selectedProvider = validProviders.includes(provider) ? provider : 'mobilenig';
        setVendingProvider(selectedProvider as typeof vendingProvider);
      }
    } catch (error) {
      console.error('Error fetching education provider:', error);
    }
  };

  const updateEducationProvider = async (provider: typeof vendingProvider) => {
    try {
      const { error } = await supabase
        .from('app_settings')
        .upsert({
          setting_key: 'education_provider',
          setting_value: { provider },
          setting_category: 'system',
          description: 'Education vending provider: smeplug, vtpass, mobilenig, ebills.africa, or anyone'
        }, {
          onConflict: 'setting_key'
        });

      if (error) throw error;

      setVendingProvider(provider);
      toast({
        title: "Success",
        description: `Education provider updated to ${provider.toUpperCase()}`,
      });
    } catch (error: any) {
      console.error('Error updating education provider:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to update education provider",
        variant: "destructive",
      });
    }
  };


  const fetchTransactions = async () => {
    try {
      setLoadingTransactions(true);
      let query = supabase
        .from('education_transactions')
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
        description: error.message || "Failed to fetch education transactions",
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

  const filteredTransactions = transactions.filter((txn) => {
    const searchLower = transactionSearchQuery.toLowerCase();
    return (
      txn.reference?.toLowerCase().includes(searchLower) ||
      txn.exam_type?.toLowerCase().includes(searchLower) ||
      txn.phone_number?.toLowerCase().includes(searchLower) ||
      txn.profiles?.full_name?.toLowerCase().includes(searchLower) ||
      txn.profiles?.email?.toLowerCase().includes(searchLower)
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
              <h1 className="text-2xl font-bold">Education Services Management</h1>
            </div>
          </header>

          <div className="p-6 space-y-6">
            {/* Vending Provider Settings */}
            <Card>
              <CardHeader>
                <CardTitle>Vending Provider Settings</CardTitle>
                <CardDescription>
                  Select the education vending provider
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <Label htmlFor="vending-provider">Provider</Label>
                  <Select value={vendingProvider} onValueChange={(value: any) => updateEducationProvider(value)}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Select provider" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mobilenig">Mobilenig</SelectItem>
                      <SelectItem value="vtpass">VTpass</SelectItem>
                      <SelectItem value="smeplug">SMEPlug</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Service Availability Toggles */}
            <Card>
              <CardHeader>
                <CardTitle>Service Availability</CardTitle>
                <CardDescription>
                  Enable or disable education services for mobile app users
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between py-4 border-b">
                  <div className="space-y-0.5">
                    <Label htmlFor="waec-availability" className="text-base font-semibold">
                      WAEC
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      WAEC Result Checker PIN service
                    </p>
                  </div>
                  <Switch
                    id="waec-availability"
                    checked={serviceAvailability.WAEC}
                    onCheckedChange={(checked) => updateServiceAvailability('WAEC', checked)}
                  />
                </div>
                <div className="flex items-center justify-between py-4 border-b">
                  <div className="space-y-0.5">
                    <Label htmlFor="neco-availability" className="text-base font-semibold">
                      NECO
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      NECO Result Checker PIN service
                    </p>
                  </div>
                  <Switch
                    id="neco-availability"
                    checked={serviceAvailability.NECO}
                    onCheckedChange={(checked) => updateServiceAvailability('NECO', checked)}
                  />
                </div>
                <div className="flex items-center justify-between py-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="jamb-availability" className="text-base font-semibold">
                      JAMB
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      JAMB Registration service
                    </p>
                  </div>
                  <Switch
                    id="jamb-availability"
                    checked={serviceAvailability.JAMB}
                    onCheckedChange={(checked) => updateServiceAvailability('JAMB', checked)}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Education Transactions */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Education Transactions</CardTitle>
                    <CardDescription>
                      View all education purchase transactions
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
                </div>

                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Reference</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Exam Type</TableHead>
                        <TableHead>Phone Number</TableHead>
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
                            No education transactions found
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
                              <Badge variant="outline">{txn.exam_type}</Badge>
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {txn.phone_number || '-'}
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
