import { useState, useEffect, useCallback } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, Pencil, Trash2, Download, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface CableTvPlan {
  id: string;
  provider: string;
  package_name: string;
  price: number;
  original_price: number | null;
  custom_price: number | null;
  api_code: string;
  is_active: boolean;
  vending_provider?: string;
}

const getCableLogo = (provider: string) => {
  const logos: Record<string, string> = {
    'DSTV': '/dstv.png',
    'GOTV': '/gotv.png',
    'STARTIMES': '/startimes.png'
  };
  return logos[provider.toUpperCase()] || '';
};

export default function CableTvPlans() {
  const [searchQuery, setSearchQuery] = useState("");
  const [plans, setPlans] = useState<CableTvPlan[]>([]);
  const [allPlans, setAllPlans] = useState<CableTvPlan[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<CableTvPlan | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string>("DSTV");
  const [isFetching, setIsFetching] = useState(false);
  const [vendingProvider, setVendingProvider] = useState<'smeplug' | 'anyone' | 'vtpass' | 'mobilenig' | 'ebills.africa'>('smeplug');
  const [isUpdatingProvider, setIsUpdatingProvider] = useState(false);
  const [formData, setFormData] = useState({
    provider: "",
    package_name: "",
    price: "",
    custom_price: "",
    api_code: "",
    is_active: true,
  });
  const { toast } = useToast();

  const fetchPlansForProvider = useCallback(async (provider: string) => {
    try {
      console.log('fetchPlansForProvider called with provider:', provider);
      
      // Build query with vending_provider filter
      let query = supabase
        .from("cable_tv_plans")
        .select("*");
      
      // Try to filter by vending_provider
      query = query.eq('vending_provider', provider);
      
      const { data, error } = await query.order("created_at", { ascending: false });

      if (error) {
        // If error is about missing column, try without vending_provider filter
        if (error.code === '42703' || error.message?.includes('vending_provider') || error.message?.includes('column') && error.message?.includes('vending_provider')) {
          console.warn('Vending provider column not found, fetching all plans and filtering in memory');
          const { data: allData, error: allError } = await supabase
            .from("cable_tv_plans")
            .select("*")
            .order("created_at", { ascending: false });
          
          if (allError) {
            console.error('Error fetching all plans:', allError);
            throw allError;
          }
          
          // Filter by vending_provider in memory (if plans have vending_provider field, otherwise show all)
          const filtered = (allData || []).filter((plan: any) => 
            !plan.vending_provider || plan.vending_provider === provider
          );
          
          console.log(`Filtered ${filtered.length} plans for provider ${provider} from ${allData?.length || 0} total plans`);
          setAllPlans(filtered);
          setPlans(filtered);
          return;
        }
        console.error('Database query error:', error);
        throw error;
      }

      console.log(`Fetched ${data?.length || 0} cable TV plans for provider: ${provider}`);
      setAllPlans(data || []);
      setPlans(data || []);
    } catch (err: any) {
      console.error('Error fetching cable TV plans:', err);
      toast({
        title: "Error",
        description: err.message || "Failed to fetch cable TV plans. Please check if you have admin access.",
        variant: "destructive",
      });
      setPlans([]);
      setAllPlans([]);
    }
  }, [toast]);

  const fetchCableProvider = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'cable_provider')
        .maybeSingle();

      if (error) {
        console.error('Error fetching cable provider setting:', error);
        setVendingProvider('smeplug');
        await fetchPlansForProvider('smeplug');
        return;
      }

      if (data?.setting_value) {
        const provider = (data.setting_value as any)?.provider || 'smeplug';
        const validProviders = ['smeplug', 'anyone', 'vtpass', 'mobilenig', 'ebills.africa'];
        const selectedProvider = validProviders.includes(provider) ? provider as any : 'smeplug';
        console.log('Setting cable vending provider to:', selectedProvider);
        setVendingProvider(selectedProvider);
        await fetchPlansForProvider(selectedProvider);
      } else {
        console.log('No cable provider setting found, defaulting to smeplug');
        setVendingProvider('smeplug');
        await fetchPlansForProvider('smeplug');
      }
    } catch (error) {
      console.error('Error fetching cable provider setting:', error);
      setVendingProvider('smeplug');
      await fetchPlansForProvider('smeplug');
    }
  }, [fetchPlansForProvider]);

  const fetchPlans = useCallback(async () => {
    await fetchPlansForProvider(vendingProvider);
  }, [vendingProvider, fetchPlansForProvider]);

  // Load cable provider setting and fetch plans on mount
  useEffect(() => {
    const loadData = async () => {
      console.log('CableTvPlans: Loading initial data...');
      await fetchCableProvider();
    };
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateCableProvider = async (newProvider: 'smeplug' | 'anyone' | 'vtpass' | 'mobilenig' | 'ebills.africa') => {
    setIsUpdatingProvider(true);
    try {
      const { error } = await supabase
        .from('app_settings')
        .upsert({
          setting_key: 'cable_provider',
          setting_value: { provider: newProvider },
          setting_category: 'system',
          description: 'Cable TV vending provider: smeplug, vtpass, mobilenig, ebills.africa, or anyone'
        }, {
          onConflict: 'setting_key'
        });

      if (error) throw error;

      console.log('Updating cable provider to:', newProvider);
      setVendingProvider(newProvider);
      
      // Refresh plans for the new provider from the table
      await fetchPlansForProvider(newProvider);
      
      toast({
        title: "Success",
        description: `Cable provider switched to ${newProvider === 'ebills.africa' ? 'eBills.Africa' : newProvider.toUpperCase()}. Showing ${plans.length} plans from ${newProvider === 'ebills.africa' ? 'eBills.Africa' : newProvider.toUpperCase()}.`,
      });
    } catch (error: any) {
      console.error('Error updating cable provider:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to update cable provider",
        variant: "destructive",
      });
    } finally {
      setIsUpdatingProvider(false);
    }
  };

  const fetchFromAPI = async () => {
    setIsFetching(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast({
          title: "Authentication Required",
          description: "You must be logged in to fetch packages",
          variant: "destructive",
        });
        return;
      }

      console.log('Fetching cable packages for provider:', selectedProvider, 'from vending provider:', vendingProvider);

      if (!vendingProvider) {
        toast({
          title: "Error",
          description: "Vending provider not set. Please select a provider.",
          variant: "destructive",
        });
        return;
      }

      // Determine which edge function to call based on selected vending provider
      let functionName = 'fetch-cable-packages';
      let requestBody: any = { 
        provider: selectedProvider,
        vending_provider: vendingProvider 
      };

      // Route to appropriate function based on vending provider
      // Similar to how data plans work with different functions per provider
      switch (vendingProvider) {
        case 'vtpass':
          functionName = 'fetch-vtpass-cable-packages';
          requestBody = { provider: selectedProvider };
          console.log('Calling VTpass cable function:', functionName, 'with body:', requestBody);
          break;
        case 'mobilenig':
        case 'smeplug':
        default:
          functionName = 'fetch-cable-packages';
          requestBody = { provider: selectedProvider, vending_provider: vendingProvider };
          break;
        case 'ebills.africa':
        case 'anyone':
          // TODO: Create specific functions for these providers
          functionName = 'fetch-cable-packages';
          requestBody = { provider: selectedProvider, vending_provider: vendingProvider };
          break;
      }

      console.log('Invoking function:', functionName, 'with request body:', requestBody);

      // Direct fetch call for better error handling
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      if (!supabaseUrl) {
        toast({
          title: "Configuration Error",
          description: "Supabase URL is not configured",
          variant: "destructive",
        });
        return;
      }
      const functionUrl = `${supabaseUrl}/functions/v1/${functionName}`;
      console.log('Calling function URL:', functionUrl);

      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const responseData = await response.json();
      
      console.log('Response from', functionName, ':', { 
        status: response.status,
        success: responseData?.success, 
        dataLength: responseData?.data?.length, 
        error: responseData?.error || responseData?.message,
        metadata: responseData?.metadata 
      });

      if (!response.ok) {
        const errorMessage = responseData?.error || responseData?.message || `HTTP ${response.status}: ${response.statusText}`;
        console.error('Edge function HTTP error:', response.status, errorMessage);
        throw new Error(errorMessage);
      }

      const data = responseData;

      if (!data?.success) {
        const errorMsg = data?.error || data?.message || "Failed to fetch packages from API";
        console.error('API returned error:', { data, status: response.status });
        toast({
          title: "API Error",
          description: errorMsg,
          variant: "destructive",
        });
        return;
      }

      if (!data.data || !Array.isArray(data.data) || data.data.length === 0) {
        const errorMsg = data?.error || `No packages available for ${selectedProvider} from ${vendingProvider}`;
        console.warn('No packages in response:', { data, selectedProvider, vendingProvider });
        toast({
          title: "No Packages Found",
          description: errorMsg,
          variant: "destructive",
        });
        return;
      }

      // Insert packages into database with vending_provider
      const packagesWithOriginalPrice = data.data
        .filter((pkg: any) => pkg && pkg.api_code && pkg.package_name) // Filter invalid packages
        .map((pkg: any) => ({
          provider: pkg.provider || selectedProvider,
          package_name: pkg.package_name,
          price: Number(pkg.price) || 0,
          original_price: Number(pkg.price) || 0,
          api_code: pkg.api_code,
          is_active: true,
          vending_provider: vendingProvider,
        }));

      console.log(`Upserting ${packagesWithOriginalPrice.length} packages for ${vendingProvider}:`, packagesWithOriginalPrice.slice(0, 3));

      // Try to upsert with vending_provider, fallback to api_code only if column doesn't exist
      let insertError;
      try {
        // Try with vending_provider in conflict resolution
        const { error } = await supabase
          .from('cable_tv_plans')
          .upsert(packagesWithOriginalPrice, { 
            onConflict: vendingProvider === 'vtpass' ? 'api_code' : 'api_code',
          });
        insertError = error;
        
        // If error is about vending_provider column, try without it
        if (insertError && (insertError.code === '42703' || insertError.message?.includes('vending_provider'))) {
          console.warn('Vending provider column not found, inserting without it');
          const packagesWithoutVendingProvider = data.data.map((pkg: any) => ({
            ...pkg,
            original_price: pkg.price,
          }));
          const { error: fallbackError } = await supabase
            .from('cable_tv_plans')
            .upsert(packagesWithoutVendingProvider, { 
              onConflict: 'api_code',
            });
          insertError = fallbackError;
        }
      } catch (e: any) {
        console.error('Upsert exception:', e);
        // If vending_provider column doesn't exist, try without it
        if (e.code === '42703' || e.message?.includes('vending_provider')) {
          console.warn('Vending provider column not found, inserting without it');
          const packagesWithoutVendingProvider = data.data
            .filter((pkg: any) => pkg && pkg.api_code && pkg.package_name)
            .map((pkg: any) => ({
              provider: pkg.provider || selectedProvider,
              package_name: pkg.package_name,
              price: Number(pkg.price) || 0,
              original_price: Number(pkg.price) || 0,
              api_code: pkg.api_code,
              is_active: true,
            }));
          const { error } = await supabase
            .from('cable_tv_plans')
            .upsert(packagesWithoutVendingProvider, { 
              onConflict: 'api_code',
            });
          insertError = error;
        } else {
          insertError = e;
        }
      }

      if (insertError) {
        console.error('Database insert error:', insertError);
        throw insertError;
      }

      toast({
        title: "Success",
        description: `Successfully fetched ${data.data.length} packages from ${selectedProvider}`,
      });

      // Refresh plans after import
      await fetchPlansForProvider(vendingProvider);
    } catch (error: any) {
      console.error('Failed to fetch packages:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to fetch packages from API",
        variant: "destructive",
      });
    } finally {
      setIsFetching(false);
    }
  };

  const resetCustomPrice = async (planId: string) => {
    const { error } = await supabase.rpc('reset_cable_plan_custom_prices', {
      plan_ids: [planId]
    });

    if (error) {
      toast({
        title: "Error",
        description: "Failed to reset custom price",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Success",
      description: "Custom price reset successfully",
    });

    await fetchPlansForProvider(vendingProvider);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const planData = {
      provider: formData.provider,
      package_name: formData.package_name,
      price: parseFloat(formData.price),
      original_price: parseFloat(formData.price),
      custom_price: formData.custom_price ? parseFloat(formData.custom_price) : null,
      api_code: formData.api_code,
      is_active: formData.is_active,
    };

    if (editingPlan) {
      const { error } = await supabase
        .from("cable_tv_plans")
        .update(planData)
        .eq("id", editingPlan.id);

      if (error) {
        toast({
          title: "Error",
          description: "Failed to update cable TV plan",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Success",
        description: "Cable TV plan updated successfully",
      });
    } else {
      const { error } = await supabase.from("cable_tv_plans").insert(planData);

      if (error) {
        toast({
          title: "Error",
          description: "Failed to create cable TV plan",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Success",
        description: "Cable TV plan created successfully",
      });
    }

    setIsDialogOpen(false);
    resetForm();
    await fetchPlansForProvider(vendingProvider);
  };

  const handleEdit = (plan: CableTvPlan) => {
    setEditingPlan(plan);
    setFormData({
      provider: plan.provider,
      package_name: plan.package_name,
      price: plan.price.toString(),
      custom_price: plan.custom_price?.toString() || "",
      api_code: plan.api_code,
      is_active: plan.is_active,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("cable_tv_plans").delete().eq("id", id);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to delete cable TV plan",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Success",
      description: "Cable TV plan deleted successfully",
    });

    await fetchPlansForProvider(vendingProvider);
  };

  const resetForm = () => {
    setFormData({
      provider: "",
      package_name: "",
      price: "",
      custom_price: "",
      api_code: "",
      is_active: true,
    });
    setEditingPlan(null);
  };

  const filteredPlans = plans.filter(
    (plan) =>
      plan.provider.toLowerCase().includes(searchQuery.toLowerCase()) ||
      plan.package_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex h-16 items-center gap-4 px-6">
              <SidebarTrigger />
              <h1 className="text-2xl font-bold">Cable TV Management</h1>
            </div>
          </header>

          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Search packages..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>

              <div className="flex gap-2 items-center">
                <div className="flex items-center gap-3 bg-card border rounded-lg px-4 py-2">
                  <Label htmlFor="cable-provider" className="text-sm font-medium">Vending Provider:</Label>
                  <Select
                    value={vendingProvider}
                    onValueChange={(value) => {
                      updateCableProvider(value as 'smeplug' | 'anyone' | 'vtpass' | 'mobilenig' | 'ebills.africa');
                    }}
                    disabled={isUpdatingProvider}
                  >
                    <SelectTrigger id="cable-provider" className="w-[180px]">
                      <SelectValue placeholder="Select provider" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="smeplug">SMEPLUG</SelectItem>
                      <SelectItem value="anyone">ANYONE</SelectItem>
                      <SelectItem value="vtpass">VTPASS</SelectItem>
                      <SelectItem value="mobilenig">MobileNig</SelectItem>
                      <SelectItem value="ebills.africa">eBills.Africa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <select
                  value={selectedProvider}
                  onChange={(e) => setSelectedProvider(e.target.value)}
                  className="border rounded-md px-3 py-2 text-sm"
                >
                  <option value="DSTV">DSTV</option>
                  <option value="GOTV">GOTV</option>
                  <option value="STARTIMES">STARTIMES</option>
                </select>
                <Button 
                  onClick={fetchFromAPI} 
                  disabled={isFetching}
                  className="gap-2"
                  variant="outline"
                >
                  <Download className="h-4 w-4" />
                  {isFetching ? "Fetching..." : "Fetch from API"}
                </Button>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                  <DialogTrigger asChild>
                    <Button onClick={resetForm} className="gap-2">
                      <Plus className="h-4 w-4" />
                      Add Package
                    </Button>
                  </DialogTrigger>
                <DialogContent className="sm:max-w-[500px]">
                  <DialogHeader>
                    <DialogTitle>
                      {editingPlan ? "Edit Cable TV Package" : "Add New Cable TV Package"}
                    </DialogTitle>
                    <DialogDescription>
                      Fill in the details for the cable TV package
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleSubmit}>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <Label htmlFor="provider">Provider</Label>
                        <Input
                          id="provider"
                          value={formData.provider}
                          onChange={(e) =>
                            setFormData({ ...formData, provider: e.target.value })
                          }
                          placeholder="e.g. DSTV, GOTV, Startimes"
                          required
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="package_name">Package Name</Label>
                        <Input
                          id="package_name"
                          value={formData.package_name}
                          onChange={(e) =>
                            setFormData({ ...formData, package_name: e.target.value })
                          }
                          placeholder="e.g. Compact Plus, Jinja"
                          required
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="price">Original Price</Label>
                        <Input
                          id="price"
                          type="number"
                          step="0.01"
                          value={formData.price}
                          onChange={(e) =>
                            setFormData({ ...formData, price: e.target.value })
                          }
                          placeholder="e.g. 7500.00"
                          required
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="custom_price">Custom Price (Optional)</Label>
                        <Input
                          id="custom_price"
                          type="number"
                          step="0.01"
                          value={formData.custom_price}
                          onChange={(e) =>
                            setFormData({ ...formData, custom_price: e.target.value })
                          }
                          placeholder="Leave empty to use original price"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="api_code">API Code</Label>
                        <Input
                          id="api_code"
                          value={formData.api_code}
                          onChange={(e) =>
                            setFormData({ ...formData, api_code: e.target.value })
                          }
                          placeholder="e.g. DSTV-COMPACT-PLUS"
                          required
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setIsDialogOpen(false);
                          resetForm();
                        }}
                      >
                        Cancel
                      </Button>
                      <Button type="submit">
                        {editingPlan ? "Update Package" : "Add Package"}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>All Cable TV Packages</CardTitle>
                <CardDescription>
                  Manage cable TV packages from {vendingProvider === 'ebills.africa' ? 'eBills.Africa' : vendingProvider.toUpperCase()}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Provider</TableHead>
                      <TableHead>Package Name</TableHead>
                      <TableHead>Original Price</TableHead>
                      <TableHead>Custom Price</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>API Code</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPlans.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground">
                          No cable TV packages found. Click "Fetch from API" to load packages.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredPlans.map((plan) => (
                        <TableRow key={plan.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <img 
                                src={getCableLogo(plan.provider)} 
                                alt={plan.provider}
                                className="w-6 h-6 object-contain"
                              />
                              <span>{plan.provider}</span>
                            </div>
                          </TableCell>
                          <TableCell>{plan.package_name}</TableCell>
                          <TableCell>₦{(plan.original_price || plan.price).toFixed(2)}</TableCell>
                          <TableCell>
                            {plan.custom_price ? (
                              <span className="text-primary font-medium">₦{plan.custom_price.toFixed(2)}</span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                              plan.is_active 
                                ? 'bg-green-50 text-green-700' 
                                : 'bg-gray-50 text-gray-700'
                            }`}>
                              {plan.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </TableCell>
                          <TableCell className="font-mono text-sm">{plan.api_code}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              {plan.custom_price && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => resetCustomPrice(plan.id)}
                                  title="Reset to original price"
                                >
                                  <RotateCcw className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEdit(plan)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDelete(plan.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
