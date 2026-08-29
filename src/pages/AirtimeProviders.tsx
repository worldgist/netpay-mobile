import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { formatNaira } from "@/lib/currency";
import { Plus, Trash2, Pencil, RefreshCw } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast as sonnerToast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface AirtimeProvider {
  id: string;
  network_name: string;
  api_code: string;
  min_amount: number;
  max_amount: number;
  commission: number;
  is_active: boolean;
  created_at: string;
}

type AirtimeVendingProvider = 'smeplug' | 'ebills' | 'mobilenig' | 'flutterwave';

const AIRTIME_PROVIDER_LABELS: Record<AirtimeVendingProvider, string> = {
  smeplug: 'SMEPLUG',
  ebills: 'eBills Africa',
  mobilenig: 'MobileNig',
  flutterwave: 'Flutterwave',
};

const VALID_AIRTIME_PROVIDERS: AirtimeVendingProvider[] = [
  'smeplug',
  'ebills',
  'mobilenig',
  'flutterwave',
];

const AirtimeProviders = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState<AirtimeProvider[]>([]);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [editingProvider, setEditingProvider] = useState<AirtimeProvider | null>(null);
  const [airtimeProvider, setAirtimeProvider] = useState<AirtimeVendingProvider>('smeplug');
  const [isUpdatingProvider, setIsUpdatingProvider] = useState(false);
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    network_name: "",
    api_code: "",
    min_amount: "",
    max_amount: "",
    commission: "",
    is_active: true
  });

  useEffect(() => {
    checkAdminAndFetch();
  }, [navigate]);

  const fetchAirtimeProvider = async () => {
    try {
      const { data } = await supabase
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'airtime_provider')
        .maybeSingle();

      const settingValue = data?.setting_value;
      let currentProvider: string | null = null;

      if (typeof settingValue === 'string') {
        currentProvider = settingValue.trim().toLowerCase();
      } else if (settingValue && typeof settingValue === 'object' && 'provider' in settingValue) {
        currentProvider = String((settingValue as { provider?: string }).provider || '').trim().toLowerCase();
      }

      const normalized = currentProvider === 'ebills.africa'
        ? 'ebills'
        : currentProvider === 'flutter-wave' || currentProvider === 'flw'
          ? 'flutterwave'
          : currentProvider;
      if (normalized && VALID_AIRTIME_PROVIDERS.includes(normalized as AirtimeVendingProvider)) {
        setAirtimeProvider(normalized as AirtimeVendingProvider);
      } else {
        setAirtimeProvider('smeplug');
      }
    } catch (error) {
      console.error('Error fetching airtime provider:', error);
    }
  };

  const updateAirtimeProvider = async (newProvider: AirtimeVendingProvider) => {
    if (airtimeProvider === newProvider) return;

    setIsUpdatingProvider(true);
    try {
      const { error } = await supabase
        .from('app_settings')
        .upsert({
          setting_key: 'airtime_provider',
          setting_value: { provider: newProvider },
          setting_category: 'system',
          description: 'Airtime vending provider: smeplug, ebills, mobilenig, or flutterwave',
        }, { onConflict: 'setting_key' });

      if (error) throw error;

      setAirtimeProvider(newProvider);
      toast({
        title: 'Success',
        description: `Airtime provider switched to ${AIRTIME_PROVIDER_LABELS[newProvider]}`,
      });
    } catch (error: any) {
      console.error('Error updating airtime provider:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update airtime provider',
        variant: 'destructive',
      });
    } finally {
      setIsUpdatingProvider(false);
    }
  };

  const checkAdminAndFetch = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        navigate('/auth');
        return;
      }

      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', session.user.id)
        .eq('role', 'admin')
        .single();

      if (!roles) {
        toast({
          title: "Access Denied",
          description: "You don't have permission to access this page",
          variant: "destructive",
        });
        navigate('/dashboard');
        return;
      }

      await fetchProviders();
      await fetchAirtimeProvider();
      setLoading(false);
    } catch (error) {
      console.error('Error:', error);
      setLoading(false);
    }
  };

  const fetchProviders = async () => {
    try {
      const { data, error } = await supabase
        .from('airtime_providers')
        .select('*')
        .order('network_name', { ascending: true });

      if (error) throw error;
      setProviders(data || []);
    } catch (error) {
      console.error('Error fetching providers:', error);
      toast({
        title: "Error",
        description: "Failed to load airtime providers",
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setForm({
      network_name: "",
      api_code: "",
      min_amount: "",
      max_amount: "",
      commission: "",
      is_active: true
    });
  };

  const handleFormChange = (field: string, value: string | boolean) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const validateForm = () => {
    if (!form.network_name.trim()) {
      toast({
        title: "Validation Error",
        description: "Network name cannot be empty",
        variant: "destructive",
      });
      return false;
    }

    if (!form.api_code.trim()) {
      toast({
        title: "Validation Error",
        description: "API code cannot be empty",
        variant: "destructive",
      });
      return false;
    }

    const minAmount = parseFloat(form.min_amount);
    const maxAmount = parseFloat(form.max_amount);
    const commission = parseFloat(form.commission);

    if (isNaN(minAmount) || minAmount < 0) {
      toast({
        title: "Validation Error",
        description: "Minimum amount must be a valid positive number",
        variant: "destructive",
      });
      return false;
    }

    if (isNaN(maxAmount) || maxAmount < 0) {
      toast({
        title: "Validation Error",
        description: "Maximum amount must be a valid positive number",
        variant: "destructive",
      });
      return false;
    }

    if (minAmount > maxAmount) {
      toast({
        title: "Validation Error",
        description: "Minimum amount cannot be greater than maximum amount",
        variant: "destructive",
      });
      return false;
    }

    if (isNaN(commission) || commission < 0) {
      toast({
        title: "Validation Error",
        description: "Commission must be a valid positive number",
        variant: "destructive",
      });
      return false;
    }

    return true;
  };

  const addProvider = async () => {
    if (!validateForm()) return;

    try {
      const { error } = await supabase
        .from('airtime_providers')
        .insert({
          network_name: form.network_name.trim(),
          api_code: form.api_code.trim(),
          min_amount: parseFloat(form.min_amount),
          max_amount: parseFloat(form.max_amount),
          commission: parseFloat(form.commission),
          is_active: form.is_active
        });

      if (error) throw error;

      await fetchProviders();
      setIsAddDialogOpen(false);
      resetForm();
      
      toast({
        title: "Success",
        description: "Airtime provider added successfully",
      });
    } catch (error) {
      console.error('Error adding provider:', error);
      toast({
        title: "Error",
        description: "Failed to add airtime provider",
        variant: "destructive",
      });
    }
  };

  const openEditDialog = (provider: AirtimeProvider) => {
    setEditingProvider(provider);
    setForm({
      network_name: provider.network_name,
      api_code: provider.api_code,
      min_amount: String(provider.min_amount),
      max_amount: String(provider.max_amount),
      commission: String(provider.commission),
      is_active: provider.is_active
    });
    setIsEditDialogOpen(true);
  };

  const updateProvider = async () => {
    if (!editingProvider || !validateForm()) return;

    try {
      const { error } = await supabase
        .from('airtime_providers')
        .update({
          network_name: form.network_name.trim(),
          api_code: form.api_code.trim(),
          min_amount: parseFloat(form.min_amount),
          max_amount: parseFloat(form.max_amount),
          commission: parseFloat(form.commission),
          is_active: form.is_active
        })
        .eq('id', editingProvider.id);

      if (error) throw error;

      await fetchProviders();
      setIsEditDialogOpen(false);
      setEditingProvider(null);
      resetForm();
      
      toast({
        title: "Success",
        description: "Airtime provider updated successfully",
      });
    } catch (error) {
      console.error('Error updating provider:', error);
      toast({
        title: "Error",
        description: "Failed to update airtime provider",
        variant: "destructive",
      });
    }
  };

  const handleClearAll = async () => {
    setIsClearing(true);
    try {
      const { error } = await supabase
        .from('airtime_providers')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

      if (error) throw error;

      sonnerToast.success('All providers cleared successfully');
      queryClient.invalidateQueries({ queryKey: ['airtime-providers'] });
    } catch (error: any) {
      console.error('Error clearing providers:', error);
      sonnerToast.error(error.message || 'Failed to clear providers');
    } finally {
      setIsClearing(false);
    }
  };

  const fetchProvidersFromAPI = async () => {
    setIsFetching(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-smeplug-airtime-providers');
      if (error) throw error;

      if (!data?.success || !data?.data) {
        toast({ title: 'No Providers Found', description: 'The API returned no airtime providers.' });
        return;
      }

      const providersArray = Array.isArray(data.data) ? data.data : [];
      if (!providersArray.length) {
        toast({ title: 'No Providers Found', description: 'The API returned no airtime providers.' });
        return;
      }

      const providersToInsert = providersArray.map((provider: any) => ({
        network_name: provider.network || provider.name || 'Unknown',
        api_code: String(provider.network_id ?? provider.code ?? provider.api_code ?? provider.id ?? ''),
        min_amount: parseFloat(provider.min_amount) || 50,
        max_amount: parseFloat(provider.max_amount) || 50000,
        commission: parseFloat(provider.commission) || 0,
        is_active: provider.is_active !== undefined ? provider.is_active : true,
      }));

      const { error: insertError } = await supabase
        .from('airtime_providers')
        .upsert(providersToInsert, { onConflict: 'api_code', ignoreDuplicates: false });

      if (insertError) throw insertError;

      await fetchProviders();
      setIsImportDialogOpen(false);

      toast({
        title: "Success",
        description: `Imported ${providersToInsert.length} airtime providers from SMEPLUG`,
      });
    } catch (error: any) {
      console.error('Error fetching providers from API:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to fetch providers from API",
        variant: "destructive",
      });
    } finally {
      setIsFetching(false);
    }
  };

  const fetchEbillsProvidersFromAPI = async () => {
    setIsFetching(true);
    try {
      const ebillsNetworks = [
        { network_name: 'MTN', api_code: 'mtn', min_amount: 10, max_amount: 50000 },
        { network_name: 'Airtel', api_code: 'airtel', min_amount: 50, max_amount: 50000 },
        { network_name: 'Glo', api_code: 'glo', min_amount: 50, max_amount: 50000 },
        { network_name: '9Mobile', api_code: '9mobile', min_amount: 50, max_amount: 50000 },
      ];

      const providersToInsert = ebillsNetworks.map((provider) => ({
        ...provider,
        commission: 0,
        is_active: true,
      }));

      const { error: insertError } = await supabase
        .from('airtime_providers')
        .upsert(providersToInsert, { onConflict: 'api_code', ignoreDuplicates: false });

      if (insertError) throw insertError;

      await fetchProviders();
      setIsImportDialogOpen(false);

      toast({
        title: 'Success',
        description: `Imported ${providersToInsert.length} airtime providers for eBills Africa`,
      });
    } catch (error: any) {
      console.error('Error importing eBills airtime providers:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to import eBills airtime providers',
        variant: 'destructive',
      });
    } finally {
      setIsFetching(false);
    }
  };

  const fetchFlutterwaveProvidersFromAPI = async () => {
    setIsFetching(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-flutterwave-airtime-billers');
      if (error) {
        throw new Error(data?.error || error.message || 'Failed to fetch Flutterwave airtime billers');
      }

      if (!data?.success || !Array.isArray(data?.data) || !data.data.length) {
        toast({
          title: 'No Providers Found',
          description: data?.error || 'Flutterwave returned no airtime billers.',
          variant: 'destructive',
        });
        return;
      }

      await fetchProviders();
      setIsImportDialogOpen(false);

      const storedCount = data.metadata?.stored ?? data.data.length;
      toast({
        title: 'Success',
        description: `Saved ${storedCount} airtime provider${storedCount === 1 ? '' : 's'} to the database from Flutterwave`,
      });
    } catch (error: any) {
      console.error('Error importing Flutterwave airtime providers:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to import Flutterwave airtime providers',
        variant: 'destructive',
      });
    } finally {
      setIsFetching(false);
    }
  };

  const deleteProvider = async (id: string) => {
    try {
      const { error } = await supabase
        .from('airtime_providers')
        .delete()
        .eq('id', id);

      if (error) throw error;

      await fetchProviders();
      toast({
        title: "Success",
        description: "Airtime provider deleted successfully",
      });
    } catch (error) {
      console.error('Error deleting provider:', error);
      toast({
        title: "Error",
        description: "Failed to delete airtime provider",
        variant: "destructive",
      });
    }
  };

  const apiCodeLabel = airtimeProvider === 'flutterwave'
    ? 'Bill Code (biller|item|network)'
    : 'API Code';

  const apiCodePlaceholder = airtimeProvider === 'flutterwave'
    ? 'e.g., BIL099|AT099|MTN'
    : airtimeProvider === 'mobilenig'
      ? 'e.g., MTN'
      : 'e.g., mtn-ng';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1">
          <div className="p-8">
            <div className="flex items-center gap-2 mb-8">
              <SidebarTrigger />
              <div className="flex-1 flex justify-between items-center">
                <div>
                  <h1 className="text-3xl font-bold">Airtime Providers Management</h1>
                  <p className="text-muted-foreground">Manage airtime network providers and commissions</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Vending Provider:</span>
                    <Select
                      value={airtimeProvider}
                      onValueChange={(value) => updateAirtimeProvider(value as AirtimeVendingProvider)}
                      disabled={isUpdatingProvider}
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="smeplug">SMEPLUG</SelectItem>
                        <SelectItem value="ebills">eBills Africa</SelectItem>
                        <SelectItem value="mobilenig">MobileNig</SelectItem>
                        <SelectItem value="flutterwave">Flutterwave</SelectItem>
                      </SelectContent>
                    </Select>
                    {isUpdatingProvider && (
                      <span className="text-sm text-muted-foreground">Updating...</span>
                    )}
                  </div>
                <div className="flex gap-2">
                  <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline">
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Import from API
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Import Airtime Network Providers</DialogTitle>
                        <DialogDescription>
                          Import network providers (MTN, Airtel, Glo, 9Mobile) with their API codes
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <p className="text-sm text-muted-foreground">
                          {airtimeProvider === 'ebills'
                            ? 'Import network providers for eBills Africa (MTN, Airtel, Glo, 9Mobile).'
                            : airtimeProvider === 'flutterwave'
                              ? 'Import airtime billers from Flutterwave (MTN, Airtel, Glo, 9Mobile) with biller and item codes.'
                              : airtimeProvider === 'mobilenig'
                                ? `Network providers for ${AIRTIME_PROVIDER_LABELS[airtimeProvider]} must be added manually.`
                                : 'Import network providers from SMEPLUG using SMEPLUG_SECRET_KEY.'}
                        </p>
                        {airtimeProvider === 'ebills' ? (
                          <Button
                            onClick={() => fetchEbillsProvidersFromAPI()}
                            disabled={isFetching}
                            className="w-full"
                            variant="outline"
                          >
                            {isFetching ? (
                              <>
                                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                                Fetching...
                              </>
                            ) : (
                              'Import from eBills Africa'
                            )}
                          </Button>
                        ) : airtimeProvider === 'flutterwave' ? (
                          <Button
                            onClick={() => fetchFlutterwaveProvidersFromAPI()}
                            disabled={isFetching}
                            className="w-full"
                            variant="outline"
                          >
                            {isFetching ? (
                              <>
                                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                                Fetching...
                              </>
                            ) : (
                              'Import from Flutterwave'
                            )}
                          </Button>
                        ) : airtimeProvider === 'mobilenig' ? (
                          <p className="text-sm text-muted-foreground">
                            Use &quot;Add Provider&quot; to configure network API codes for {AIRTIME_PROVIDER_LABELS[airtimeProvider]}.
                          </p>
                        ) : (
                        <Button
                          onClick={() => fetchProvidersFromAPI()}
                          disabled={isFetching}
                          className="w-full"
                          variant="outline"
                        >
                          {isFetching ? (
                            <>
                              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                              Fetching...
                            </>
                          ) : (
                            'Import from SMEPLUG'
                          )}
                        </Button>
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>
                  <Button
                    onClick={handleClearAll}
                    variant="destructive"
                    disabled={isClearing}
                  >
                    {isClearing ? 'Clearing...' : 'Clear All'}
                  </Button>
                  <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                    <DialogTrigger asChild>
                      <Button onClick={resetForm}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add Provider
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Airtime Provider</DialogTitle>
                      <DialogDescription>
                        Add a new airtime provider with commission settings
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="add-network-name">Network Name</Label>
                        <Input
                          id="add-network-name"
                          value={form.network_name}
                          onChange={(e) => handleFormChange('network_name', e.target.value)}
                          placeholder="e.g., MTN"
                          maxLength={100}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="add-api-code">{apiCodeLabel}</Label>
                        <Input
                          id="add-api-code"
                          value={form.api_code}
                          onChange={(e) => handleFormChange('api_code', e.target.value)}
                          placeholder={apiCodePlaceholder}
                          maxLength={100}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="add-min-amount">Min Amount (₦)</Label>
                          <Input
                            id="add-min-amount"
                            type="number"
                            step="0.01"
                            min="0"
                            value={form.min_amount}
                            onChange={(e) => handleFormChange('min_amount', e.target.value)}
                            placeholder="e.g., 50"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="add-max-amount">Max Amount (₦)</Label>
                          <Input
                            id="add-max-amount"
                            type="number"
                            step="0.01"
                            min="0"
                            value={form.max_amount}
                            onChange={(e) => handleFormChange('max_amount', e.target.value)}
                            placeholder="e.g., 10000"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="add-commission">Commission (₦)</Label>
                        <Input
                          id="add-commission"
                          type="number"
                          step="0.01"
                          min="0"
                          value={form.commission}
                          onChange={(e) => handleFormChange('commission', e.target.value)}
                          placeholder="e.g., 5"
                        />
                      </div>
                      <div className="flex items-center space-x-2">
                        <Switch
                          id="add-is-active"
                          checked={form.is_active}
                          onCheckedChange={(checked) => handleFormChange('is_active', checked)}
                        />
                        <Label htmlFor="add-is-active">Active</Label>
                      </div>
                      <Button onClick={addProvider} className="w-full">
                        Add Provider
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
                </div>
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Airtime Providers</CardTitle>
                <CardDescription>
                  {airtimeProvider === 'flutterwave'
                    ? 'Configure Flutterwave airtime networks. Import billers from Flutterwave or enter biller|item codes manually. Set FLUTTERWAVE_SECRET_KEY in Supabase secrets.'
                    : 'Configure airtime providers and their commission rates'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {providers.length > 0 ? (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Network</TableHead>
                          <TableHead>{apiCodeLabel}</TableHead>
                          <TableHead>Min Amount</TableHead>
                          <TableHead>Max Amount</TableHead>
                          <TableHead>Commission</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {providers.map((provider) => (
                          <TableRow key={provider.id}>
                            <TableCell className="font-medium">{provider.network_name}</TableCell>
                            <TableCell className="font-mono text-sm">{provider.api_code}</TableCell>
                            <TableCell>{formatNaira(provider.min_amount)}</TableCell>
                            <TableCell>{formatNaira(provider.max_amount)}</TableCell>
                            <TableCell>{formatNaira(provider.commission)}</TableCell>
                            <TableCell>
                              <Badge variant={provider.is_active ? "default" : "secondary"}>
                                {provider.is_active ? "Active" : "Inactive"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openEditDialog(provider)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => deleteProvider(provider.id)}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16">
                    <p className="text-muted-foreground mb-4">No airtime providers found</p>
                    <Button onClick={() => setIsAddDialogOpen(true)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Provider
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Edit Dialog */}
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit Airtime Provider</DialogTitle>
                  <DialogDescription>
                    Update the airtime provider details
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-network-name">Network Name</Label>
                    <Input
                      id="edit-network-name"
                      value={form.network_name}
                      onChange={(e) => handleFormChange('network_name', e.target.value)}
                      placeholder="e.g., MTN"
                      maxLength={100}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-api-code">{apiCodeLabel}</Label>
                    <Input
                      id="edit-api-code"
                      value={form.api_code}
                      onChange={(e) => handleFormChange('api_code', e.target.value)}
                      placeholder={apiCodePlaceholder}
                      maxLength={100}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-min-amount">Min Amount (₦)</Label>
                      <Input
                        id="edit-min-amount"
                        type="number"
                        step="0.01"
                        min="0"
                        value={form.min_amount}
                        onChange={(e) => handleFormChange('min_amount', e.target.value)}
                        placeholder="e.g., 50"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-max-amount">Max Amount (₦)</Label>
                      <Input
                        id="edit-max-amount"
                        type="number"
                        step="0.01"
                        min="0"
                        value={form.max_amount}
                        onChange={(e) => handleFormChange('max_amount', e.target.value)}
                        placeholder="e.g., 10000"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-commission">Commission (₦)</Label>
                    <Input
                      id="edit-commission"
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.commission}
                      onChange={(e) => handleFormChange('commission', e.target.value)}
                      placeholder="e.g., 5"
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="edit-is-active"
                      checked={form.is_active}
                      onCheckedChange={(checked) => handleFormChange('is_active', checked)}
                    />
                    <Label htmlFor="edit-is-active">Active</Label>
                  </div>
                  <Button onClick={updateProvider} className="w-full">
                    Save Changes
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default AirtimeProviders;
