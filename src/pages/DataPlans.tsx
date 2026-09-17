import { useState, useEffect, useCallback, useMemo } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatNaira } from "@/lib/currency";
import { MOBILENIG_GATEWAY_FUNCTION, mobilenigActions } from "@/lib/mobilenig-gateway";
import { Plus, Trash2, RefreshCw, Pencil, X, RotateCcw, DollarSign, Search, Filter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DataPlan {
  id: string;
  network: string;
  plan_name: string;
  price: number;
  validity: string;
  api_code: string;
  provider?: string;
  created_at: string;
  custom_price?: number | null;
  original_price?: number | null;
  // New vendor-based fields
  plan_type?: string | null;
  size?: string | null;
  vendor_price?: number | null;
  user_price?: number | null;
  vtpass_code?: string | null;
  smeplug_code?: string | null;
  mobilenig_code?: string | null;
  is_active?: boolean | null;
}

interface Network {
  id: string;
  name: string;
  network_id: string;
}

const NETWORK_TABS = ['Airtel', 'MTN', 'Glo', 'T2'] as const;

const normalizeNetworkTab = (network: string) => {
  const upper = network.toUpperCase().trim();
  if (upper.includes('MTN')) return 'MTN';
  if (upper.includes('AIRTEL')) return 'Airtel';
  if (upper.includes('GLO')) return 'Glo';
  if (upper.includes('T2') || upper.includes('9MOBILE') || upper.includes('ETISALAT') || upper.includes('9 MOBILE')) return 'T2';
  return network;
};

const formatVendorLabel = (provider?: string | null) => {
  if (!provider) return 'N/A';
  const normalized = provider.toLowerCase();
  if (normalized === 'ebills' || normalized === 'ebills.africa') return 'eBills Africa';
  if (normalized === 'smeplug') return 'SMEPlug';
  if (normalized === 'mobilenig') return 'MobileNig';
  if (normalized === 'flutterwave') return 'Flutterwave';
  if (normalized === 'vtpass') return 'VTPass';
  if (normalized === 'anyone') return 'ANYONE';
  return provider;
};

const formatRelativeSyncTime = (date: Date | null) => {
  if (!date) return 'Never';
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins === 1) return '1 min ago';
  if (diffMins < 60) return `${diffMins} mins ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours === 1) return '1 hour ago';
  return `${diffHours} hours ago`;
};

const inferPlanType = (planName: string, explicitType?: string | null) => {
  if (explicitType && explicitType.trim()) {
    return explicitType.trim();
  }

  const normalized = planName.toUpperCase();
  if (normalized.includes('T2')) return 'T2';
  if (normalized.includes('GIFTING') || normalized.includes('GIFT')) return 'Gifting';
  if (normalized.includes('VTU')) return 'VTU';
  if (normalized.includes('CORPORATE')) return 'Corporate';
  if (normalized.includes('DIRECT')) return 'Direct';
  if (normalized.includes('SME')) return 'SME';
  return 'SME';
};

type DataVendingProvider = 'smeplug' | 'mobilenig' | 'ebills' | 'flutterwave';

const DataPlans = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [dataPlans, setDataPlans] = useState<DataPlan[]>([]);
  const [networks, setNetworks] = useState<Network[]>([]);
  const [selectedNetwork, setSelectedNetwork] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<DataPlan | null>(null);
  const [editForm, setEditForm] = useState({
    plan_name: "",
    price: "",
    validity: "",
    api_code: "",
    custom_price: "",
    plan_type: "",
    size: "",
    vendor_price: "",
    user_price: "",
    vtpass_code: "",
    smeplug_code: "",
    mobilenig_code: "",
    is_active: true
  });
  const [dataProvider, setDataProvider] = useState<DataVendingProvider>('smeplug');
  const [isUpdatingProvider, setIsUpdatingProvider] = useState(false);
  const [filterNetwork, setFilterNetwork] = useState<string | null>(null);
  const [activeNetworkTab, setActiveNetworkTab] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [planFilter, setPlanFilter] = useState<'all' | 'active' | 'custom_price'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [isSyncingAll, setIsSyncingAll] = useState(false);

  // Define fetchDataPlansForProvider first (before it's used)
  const fetchDataPlansForProvider = useCallback(async (provider: string) => {
    try {
      console.log('fetchDataPlansForProvider called with provider:', provider);
      
      // Check if provider column exists by trying to query with it
      // If it doesn't exist, fall back to fetching all plans
      let query = supabase
        .from('data_plans')
        .select('*');
      
      // Try to filter by provider, but handle if column doesn't exist
      try {
        query = query.eq('provider', provider);
      } catch (e) {
        console.warn('Provider column may not exist, fetching all plans');
        // If provider column doesn't exist, we'll filter in JavaScript
      }
      
      const { data, error } = await query.order('network', { ascending: true });

      if (error) {
        // If error is about missing column, try without provider filter
        if (error.code === '42703' || error.message?.includes('provider')) {
          console.warn('Provider column not found, fetching all plans and filtering in memory');
          const { data: allData, error: allError } = await supabase
            .from('data_plans')
            .select('*')
            .order('network', { ascending: true });
          
          if (allError) throw allError;
          
          // Filter by provider in memory (if plans have provider field, otherwise show all)
          const filtered = (allData || []).filter((plan: any) => 
            !plan.provider || plan.provider === provider
          );
          
          const sortedData = filtered.sort((a: any, b: any) => {
            if (a.network !== b.network) {
              return a.network.localeCompare(b.network);
            }
            return (a.price || 0) - (b.price || 0);
          });
          
          console.log('Fetched data plans (fallback):', sortedData.length, 'plans');
          setDataPlans(sortedData);
          setLastSyncedAt(new Date());
          return;
        }
        throw error;
      }
      
      // Sort by price as secondary sort in JavaScript
      const sortedData = (data || []).sort((a, b) => {
        if (a.network !== b.network) {
          return a.network.localeCompare(b.network);
        }
        return (a.price || 0) - (b.price || 0);
      });
      
      console.log('Fetched data plans:', sortedData.length, 'plans');
      setDataPlans(sortedData);
      setLastSyncedAt(new Date());
    } catch (error: any) {
      console.error('Error fetching data plans:', error);
      // Don't show toast for empty results, only for actual errors
      if (error?.code !== 'PGRST116') {
        toast({
          title: "Error",
          description: error?.message || "Failed to load data plans",
          variant: "destructive",
        });
      }
      // Set empty array on error so UI can still render
      setDataPlans([]);
    }
  }, [toast]);

  const fetchDataPlans = useCallback(async () => {
    await fetchDataPlansForProvider(dataProvider);
  }, [dataProvider, fetchDataPlansForProvider]);

  // Function to fetch all plans regardless of provider (for after import)
  const fetchAllDataPlans = useCallback(async (networkFilter?: string | null) => {
    try {
      const { data, error } = await supabase
        .from('data_plans')
        .select('*')
        .order('network', { ascending: true })
        .order('price', { ascending: true });

      if (error) throw error;

      // Apply network filter if set
      const filterToUse = networkFilter || filterNetwork;
      const filtered = filterToUse
        ? (data || []).filter((p: any) => normalizeNetworkTab(p.network) === normalizeNetworkTab(filterToUse))
        : (data || []);

      const sortedData = filtered.sort((a: any, b: any) => {
        if (a.network !== b.network) {
          return a.network.localeCompare(b.network);
        }
        return (a.price || 0) - (b.price || 0);
      });

      console.log('Fetched all data plans:', sortedData.length, 'plans');
      setDataPlans(sortedData);
      setLastSyncedAt(new Date());
    } catch (error: any) {
      console.error('Error fetching all data plans:', error);
      toast({
        title: "Error",
        description: error?.message || "Failed to load data plans",
        variant: "destructive",
      });
      setDataPlans([]);
    }
  }, [filterNetwork, toast]);

  const syncAllProviderPlans = useCallback(async () => {
    setIsSyncingAll(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Session expired. Please sign in again.');
      }

      const { data, error } = await supabase.functions.invoke('sync-data-plans', {
        body: { providers: ['smeplug', 'ebills', 'mobilenig'] },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (error) throw error;
      if (!data?.success) {
        throw new Error(data?.error || 'Failed to sync data plans');
      }

      const summary = data.summary || {};
      const parts = Object.entries(summary).map(([provider, info]: [string, any]) => {
        const count = info?.planCount ?? 0;
        const errs = Array.isArray(info?.errors) ? info.errors.length : 0;
        return `${provider}: ${count} plans${errs ? ` (${errs} errors)` : ''}`;
      });

      toast({
        title: 'Data plans synced',
        description: parts.length
          ? `Stored for instant app loading — ${parts.join(' · ')}`
          : 'Providers synced into the database.',
      });

      setLastSyncedAt(new Date());
      await fetchAllDataPlans(filterNetwork);
      await fetchDataPlans();
    } catch (error: any) {
      console.error('syncAllProviderPlans failed:', error);
      toast({
        title: 'Sync failed',
        description: error?.message || 'Unable to sync data plans from providers',
        variant: 'destructive',
      });
    } finally {
      setIsSyncingAll(false);
    }
  }, [toast, fetchAllDataPlans, fetchDataPlans, filterNetwork]);

  const fetchNetworks = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('fetch-smeplug-networks');
      
      if (error) throw error;
      
      if (data?.success && data?.data) {
        setNetworks(data.data);
      }
    } catch (error) {
      console.error('Error fetching networks:', error);
    }
  }, []);

  const fetchDataProvider = useCallback(async () => {
    console.log('fetchDataProvider called');
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'data_provider')
        .maybeSingle();

      if (error) {
        console.error('Error fetching data provider setting:', error);
        // Default to smeplug on error
        setDataProvider('smeplug');
        return;
      }

      if (data?.setting_value) {
        // Handle both string and object formats (for backward compatibility)
        let provider: string;
        if (typeof data.setting_value === 'string') {
          provider = data.setting_value;
        } else if (typeof data.setting_value === 'object' && data.setting_value !== null && 'provider' in data.setting_value) {
          provider = (data.setting_value as any).provider;
        } else {
          provider = 'smeplug'; // Default fallback
        }
        
        const normalizedProvider = provider === 'ebills.africa' ? 'ebills' : provider;
        const validProviders: DataVendingProvider[] = ['smeplug', 'mobilenig', 'ebills', 'flutterwave'];
        const selectedProvider = validProviders.includes(normalizedProvider as DataVendingProvider)
          ? normalizedProvider as DataVendingProvider
          : 'smeplug';
        console.log('Setting data provider to:', selectedProvider);
        setDataProvider(selectedProvider);
      } else {
        console.log('No data provider setting found, defaulting to smeplug');
        // Default to smeplug if no setting found
        setDataProvider('smeplug');
      }
    } catch (error) {
      console.error('Error fetching data provider setting:', error);
      // Default to smeplug on error
      setDataProvider('smeplug');
    }
  }, []);

  const checkAdminAndFetch = useCallback(async () => {
    console.log('checkAdminAndFetch called');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        console.log('No session, redirecting to auth');
        setLoading(false);
        navigate('/auth');
        return;
      }

      console.log('Session found, checking admin role');
      // Check if user is admin
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', session.user.id)
        .eq('role', 'admin')
        .maybeSingle();

      // Handle 406 errors gracefully
      if (rolesError && (rolesError.code === '406' || rolesError.message?.includes('406'))) {
        console.warn('406 error checking admin role, trying alternative query:', rolesError);
        // Try alternative query without maybeSingle
        const { data: altRoles } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', session.user.id)
          .eq('role', 'admin');
        
        if (!altRoles || altRoles.length === 0) {
          console.log('Not admin, redirecting');
          setLoading(false);
          toast({
            title: "Access Denied",
            description: "You don't have permission to access this page",
            variant: "destructive",
          });
          navigate('/dashboard');
          return;
        }
      } else if (rolesError) {
        console.error('Error checking admin role:', rolesError);
        setLoading(false);
        toast({
          title: "Error",
          description: "Failed to verify admin access",
          variant: "destructive",
        });
        navigate('/dashboard');
        return;
      } else if (!roles) {
        console.log('Not admin, redirecting');
        setLoading(false);
        toast({
          title: "Access Denied",
          description: "You don't have permission to access this page",
          variant: "destructive",
        });
        navigate('/dashboard');
        return;
      }

      console.log('Admin confirmed, fetching data');
      console.log('User ID:', session.user.id);
      
      // Verify admin role exists
      const { data: roleCheck } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', session.user.id)
        .eq('role', 'admin')
        .maybeSingle();
      
      console.log('Admin role check:', roleCheck);
      
      if (!roleCheck) {
        console.warn('WARNING: User does not have admin role in user_roles table!');
        toast({
          title: "Warning",
          description: "Your account may not have admin permissions. Please contact an administrator.",
          variant: "destructive",
        });
      }
      
      await Promise.all([fetchDataProvider(), fetchNetworks()]);
      console.log('Data fetched, fetching data plans');
      // Fetch data plans after provider and networks are loaded
      // Use a small delay to ensure dataProvider state is updated from fetchDataProvider
      await new Promise(resolve => setTimeout(resolve, 150));
      await fetchDataPlans();
      console.log('Data plans fetched, setting loading to false');
      setLoading(false);
    } catch (error) {
      console.error('Error in checkAdminAndFetch:', error);
      setLoading(false);
    }
  }, [navigate, toast, fetchNetworks, fetchDataPlans]);

  useEffect(() => {
    checkAdminAndFetch();
  }, [checkAdminAndFetch]);

  const updateDataProvider = async (newProvider: DataVendingProvider) => {
    if (dataProvider === newProvider) {
      return;
    }
    
    setIsUpdatingProvider(true);
    try {
      const { error } = await supabase
        .from('app_settings')
        .upsert({
          setting_key: 'data_provider',
          setting_value: { provider: newProvider },
          setting_category: 'system',
          description: 'Data vending provider: smeplug, mobilenig, ebills, or flutterwave'
        }, {
          onConflict: 'setting_key'
        });

      if (error) throw error;

      setDataProvider(newProvider);
      await fetchDataPlansForProvider(newProvider);
      setFilterNetwork(null);
      setActiveNetworkTab('all');
      setCurrentPage(1);
      
      toast({
        title: "Success",
        description: `Data provider switched to ${newProvider === 'ebills' ? 'eBills Africa' : newProvider.toUpperCase()}.`,
      });
    } catch (error: any) {
      console.error('Error updating data provider:', error);
      // Revert state on error
      setDataProvider(dataProvider);
      toast({
        title: "Error",
        description: error.message || "Failed to update data provider",
        variant: "destructive",
      });
    } finally {
      setIsUpdatingProvider(false);
    }
  };

  const fetchPlansFromAllVendors = async () => {
    if (!selectedNetwork) {
      toast({
        title: "Error",
        description: "Please select a network first",
        variant: "destructive",
      });
      return;
    }

    setIsFetching(true);
    try {
      const network = networks.find(n => n.id === selectedNetwork);
      if (!network) {
        toast({
          title: "Error",
          description: "Selected network not found",
          variant: "destructive",
        });
        return;
      }

      const normalizedNetworkName = network.name.trim().toUpperCase();
      const vendors = ['smeplug', 'mobilenig'];
      let totalImported = 0;
      let totalUpdated = 0;

      for (const vendor of vendors) {
        try {
          let functionName = 'fetch-smeplug-data-plans';
          let requestBody: any = {};

          if (vendor === 'vtpass') {
            functionName = 'fetch-vtpass-data-plans';
            requestBody = { network: normalizedNetworkName };
          } else if (vendor === 'smeplug') {
            functionName = 'fetch-smeplug-data-plans';
            if (!network.network_id) {
              console.warn(`Skipping ${vendor} - network_id required`);
              continue;
            }
            requestBody = { network_id: network.network_id };
          } else if (vendor === 'mobilenig') {
            functionName = MOBILENIG_GATEWAY_FUNCTION;
            requestBody = mobilenigActions.dataPlans(normalizedNetworkName);
          }

          const { data: { session } } = await supabase.auth.getSession();
          if (!session) {
            throw new Error('Not authenticated');
          }

          const { data: plansData, error: plansError } = await supabase.functions.invoke(functionName, {
            body: requestBody,
            headers: { Authorization: `Bearer ${session.access_token}` },
          });

          if (plansError || !plansData?.success) {
            console.warn(`Failed to fetch from ${vendor}:`, plansError || plansData?.error);
            console.warn(`Full response from ${vendor}:`, plansData);
            if (plansData?.debug) {
              console.warn(`Debug info from ${vendor}:`, plansData.debug);
            }
            continue;
          }

          const plansArray = Array.isArray(plansData.data) ? plansData.data : [];
          if (plansArray.length === 0) {
            console.warn(`No plans found from ${vendor} for ${network.name}`);
            continue;
          }

          // Process and merge plans (similar to existing logic)
          const { data: existingPlans } = await supabase
            .from('data_plans')
            .select('id, network, plan_name, vtpass_code, smeplug_code, mobilenig_code, api_code, provider, price, size')
            .eq('network', network.name);

          const processedPlans = plansArray.map((plan: any) => {
            // Handle different vendor response formats
            const apiCode =
              plan.api_code ||
              plan.variation_id ||
              plan.variation_code ||
              plan.code ||
              plan.productCode ||
              plan.id ||
              plan.plan_id ||
              '';
            const planName =
              plan.data_plan ||
              plan.plan ||
              plan.plan_name ||
              plan.name ||
              plan.variation_name ||
              plan.fixedPriceDescription ||
              plan.planName ||
              'Unknown Plan';
            const price = parseFloat(plan.variation_amount || plan.amount || plan.fixedPrice || plan.price || 0);
            const validity = plan.validity || plan.duration || 'N/A';

            const planObj: any = {
              network: network.name,
              plan_name: planName.trim(),
              price,
              vendor_price: price,
              user_price: price,
              original_price: price,
              validity: validity.trim(),
              api_code: apiCode,
              provider: vendor,
            };

            if (vendor === 'vtpass') {
              planObj.vtpass_code = apiCode;
            } else if (vendor === 'smeplug') {
              planObj.smeplug_code = apiCode;
            } else if (vendor === 'mobilenig') {
              planObj.mobilenig_code = apiCode;
            } else if (vendor === 'ebills') {
              planObj.api_code = String(apiCode);
            }

            // Extract size
            const sizeMatch = planName.match(/(\d+\s*(GB|MB|TB))/i);
            if (sizeMatch) {
              planObj.size = sizeMatch[1];
            }
            planObj.plan_type = inferPlanType(planName);

            return planObj;
          }).filter((p: any) => p.api_code && Number.isFinite(p.price));

          // Merge with existing plans
          for (const newPlan of processedPlans) {
            const matchingPlan = existingPlans?.find((existing: any) => {
              const networkMatch = existing.network === newPlan.network;
              const nameMatch = existing.plan_name.toLowerCase().trim() === newPlan.plan_name.toLowerCase().trim();
              const priceMatch = existing.price && newPlan.price && 
                Math.abs(existing.price - newPlan.price) / Math.max(existing.price, newPlan.price) < 0.05;
              return networkMatch && nameMatch && priceMatch;
            });

            if (matchingPlan) {
              const updates: any = {};
              if (vendor === 'vtpass' && newPlan.vtpass_code && !matchingPlan.vtpass_code) {
                updates.vtpass_code = newPlan.vtpass_code;
                // Also update api_code if it's missing
                if (!matchingPlan.api_code) {
                  updates.api_code = newPlan.api_code;
                }
              } else if (vendor === 'smeplug' && newPlan.smeplug_code && !matchingPlan.smeplug_code) {
                updates.smeplug_code = newPlan.smeplug_code;
                // Also update api_code if it's missing
                if (!matchingPlan.api_code) {
                  updates.api_code = newPlan.api_code;
                }
              } else if (vendor === 'mobilenig' && newPlan.mobilenig_code && !matchingPlan.mobilenig_code) {
                updates.mobilenig_code = newPlan.mobilenig_code;
                // Also update api_code if it's missing
                if (!matchingPlan.api_code) {
                  updates.api_code = newPlan.api_code;
                }
              }

              if (Object.keys(updates).length > 0) {
                await supabase.from('data_plans').update(updates).eq('id', matchingPlan.id);
                totalUpdated++;
              }
            } else {
              // Use upsert with column names (Supabase format)
              const { error: upsertError } = await supabase
                .from('data_plans')
                .upsert(newPlan, { 
                  onConflict: 'provider,api_code',
                  ignoreDuplicates: false 
                });
              
              if (upsertError) {
                // If constraint doesn't exist, fallback to manual insert/update
                if (upsertError.message?.includes('no unique or exclusion constraint')) {
                  console.warn('Unique constraint not found, using manual insert/update:', upsertError.message);
                  const { data: existing } = await supabase
                    .from('data_plans')
                    .select('id')
                    .eq('provider', newPlan.provider)
                    .eq('api_code', newPlan.api_code)
                    .maybeSingle();
                  
                  if (!existing) {
                    const { error: insertError } = await supabase.from('data_plans').insert(newPlan);
                    if (!insertError) {
                      totalImported++;
                    } else {
                      console.warn('Insert error:', insertError);
                    }
                  }
                } else {
                  console.warn('Upsert error:', upsertError);
                }
              } else {
                totalImported++;
              }
            }
          }
        } catch (vendorError) {
          console.error(`Error fetching from ${vendor}:`, vendorError);
        }
      }

      // Refresh plans - fetch all plans regardless of provider to show newly imported ones
      await fetchAllDataPlans(network.name);
      
      setIsDialogOpen(false);
      setFilterNetwork(network.name);
      setActiveNetworkTab(network.name);
      setIsFetching(false);
      
      toast({
        title: "Success",
        description: `Imported ${totalImported} new plans and updated ${totalUpdated} existing plans from all vendors for ${network.name}. Showing all plans.`,
      });
    } catch (error: any) {
      console.error('Error fetching plans from all vendors:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to fetch plans from all vendors",
        variant: "destructive",
      });
    } finally {
      setIsFetching(false);
    }
  };

  const fetchPlansFromAPI = async () => {
    if (!selectedNetwork) {
      toast({
        title: "Error",
        description: "Please select a network first",
        variant: "destructive",
      });
      return;
    }

    setIsFetching(true);
    try {
      const network = networks.find(n => n.id === selectedNetwork);
      if (!network) {
        toast({
          title: "Error",
          description: "Selected network not found",
          variant: "destructive",
        });
        return;
      }

      // Determine which edge function to call based on selected provider
      let functionName = 'fetch-smeplug-data-plans';
      let requestBody: any = {};

      switch (dataProvider) {
        case 'mobilenig':
          functionName = MOBILENIG_GATEWAY_FUNCTION;
          if (!network.name || !network.name.trim()) {
            throw new Error('Network name is required for MobileNig. Please ensure the network is properly configured.');
          }
          const normalizedNetworkName = network.name.trim().toUpperCase();
          requestBody = mobilenigActions.dataPlans(normalizedNetworkName);
          break;
        case 'ebills.africa':
        case 'ebills':
          functionName = 'fetch-ebills-data-plans';
          if (!network.name || !network.name.trim()) {
            throw new Error('Network name is required for eBills Africa.');
          }
          requestBody = { network: network.name.trim().toUpperCase() };
          break;
        case 'flutterwave':
          functionName = 'fetch-ebills-data-plans';
          if (!network.name || !network.name.trim()) {
            throw new Error('Network name is required for Flutterwave data import.');
          }
          requestBody = { network: network.name.trim().toUpperCase() };
          break;
        case 'smeplug':
        default:
          functionName = 'fetch-smeplug-data-plans';
          if (!network.network_id) {
            throw new Error('Network ID is required for SMEPLUG. Please ensure the network has a valid network_id.');
          }
          requestBody = { network_id: network.network_id };
          break;
      }

      console.log(`Fetching data plans from ${dataProvider} using function: ${functionName}`, {
        network: network.name,
        network_id: network.network_id,
        requestBody
      });

      // Get session for authentication
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Session expired. Please sign in again.');
      }

      // Try using Supabase function invoke first (better error handling)
      let responseData: any;
      let useDirectFetch = false;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      
      try {
        console.log(`Calling ${functionName} with Supabase invoke:`, requestBody);
        
        const { data, error: invokeError } = await supabase.functions.invoke(functionName, {
          body: requestBody,
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (invokeError) {
          // If invoke fails with network error, try direct fetch
          if (invokeError.message?.includes('Failed to fetch') || 
              invokeError.message?.includes('network') ||
              invokeError.message?.includes('ECONNREFUSED') ||
              invokeError.message?.includes('ENOTFOUND')) {
            console.warn('Supabase invoke failed with network error, trying direct fetch:', invokeError);
            useDirectFetch = true;
          } else {
            console.error('Supabase invoke error:', invokeError);
            throw invokeError;
          }
        } else {
          console.log('Supabase invoke successful, response data:', {
            hasData: !!data,
            dataType: typeof data,
            dataKeys: data ? Object.keys(data) : [],
            success: data?.success,
            error: data?.error,
            dataLength: data?.data?.length,
            metadata: data?.metadata,
            fullData: JSON.stringify(data).substring(0, 1000)
          });
          
          // Check if response indicates failure
          if (data && typeof data === 'object' && 'success' in data && !data.success) {
            const errorMsg = data.error || data.message || 'Unknown error from API';
            console.error('API returned failure:', errorMsg, data);
            throw new Error(errorMsg);
          }
          
          responseData = data;
        }
      } catch (invokeError: any) {
        // If invoke completely fails, try direct fetch
        if (invokeError.message?.includes('Failed to fetch') || 
            invokeError.message?.includes('network') ||
            invokeError.name === 'TypeError') {
          console.warn('Supabase invoke failed, trying direct fetch:', invokeError);
          useDirectFetch = true;
        } else {
          throw invokeError;
        }
      }

      // Fallback to direct fetch if invoke fails
      if (useDirectFetch) {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        if (!supabaseUrl) {
          throw new Error('Supabase URL is not configured');
        }
        
        const functionUrl = `${supabaseUrl}/functions/v1/${functionName}`;
        
        // Create AbortController for timeout (reduced to 30 seconds for VTpass)
        const controller = new AbortController();
        const timeoutDuration = 60000;
        timeoutId = setTimeout(() => {
          controller.abort();
          console.error('Request timeout after', timeoutDuration / 1000, 'seconds');
        }, timeoutDuration);

        try {
          console.log(`Calling ${functionName} with direct fetch:`, requestBody);
          
          let response: Response;
          try {
            response = await fetch(functionUrl, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(requestBody),
              signal: controller.signal,
            });
          } catch (fetchError: any) {
            if (timeoutId) clearTimeout(timeoutId);
            // Handle network-level errors (connection refused, DNS failure, etc.)
            if (fetchError.name === 'TypeError' && fetchError.message?.includes('fetch')) {
              throw new Error('Unable to connect to the server. Please check your internet connection and try again.');
            }
            if (fetchError.name === 'AbortError') {
              throw new Error(`Request timeout after ${timeoutDuration / 1000} seconds. The server may be slow or unavailable.`);
            }
            throw fetchError;
          }

          if (timeoutId) clearTimeout(timeoutId);

          // Check if response is ok before parsing
          if (!response.ok) {
            const errorText = await response.text();
            let errorData;
            try {
              errorData = JSON.parse(errorText);
            } catch {
              errorData = { error: errorText || `HTTP ${response.status}: ${response.statusText}` };
            }
            throw new Error(errorData.error || errorData.message || `HTTP ${response.status}: ${response.statusText}`);
          }

          // Parse response with better error handling
          try {
            const responseText = await response.text();
            console.log('Raw response text (first 500 chars):', responseText.substring(0, 500));
            
            if (!responseText || !responseText.trim()) {
              throw new Error('Empty response from edge function');
            }
            
            responseData = JSON.parse(responseText);
          } catch (parseError) {
            console.error('Error parsing response:', parseError);
            throw new Error(`Failed to parse response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
          }
          
        console.log('Edge function response:', {
          status: response.status,
          success: responseData?.success,
          error: responseData?.error,
          dataLength: responseData?.data?.length,
          metadata: responseData?.metadata,
          fullResponse: JSON.stringify(responseData).substring(0, 1000),
        });

          if (!response.ok) {
            const errorMessage = responseData?.error || responseData?.message || `HTTP ${response.status}: ${response.statusText}`;
            console.error('Edge function HTTP error:', response.status, errorMessage);
            throw new Error(errorMessage);
          }
        } catch (fetchError: any) {
          if (timeoutId) clearTimeout(timeoutId);
          // Re-throw fetch errors to be handled by outer catch
          throw fetchError;
        }
      }

      // At this point, responseData should be set (either from invoke or direct fetch)
      if (!responseData) {
        throw new Error('No response data received from server');
      }

      console.log('Processing responseData:', {
        hasSuccess: !!responseData.success,
        hasError: !!responseData.error,
        error: responseData.error,
        hasData: !!responseData.data,
        dataType: typeof responseData.data,
        isArray: Array.isArray(responseData.data),
        dataLength: Array.isArray(responseData.data) ? responseData.data.length : 'not array',
        keys: responseData.data && typeof responseData.data === 'object' ? Object.keys(responseData.data) : [],
        metadata: responseData.metadata,
        sample: JSON.stringify(responseData).substring(0, 1000)
      });

      const data = responseData;

      // Check for success flag
      if (data && typeof data === 'object' && 'success' in data && !data.success) {
        const errorMsg = data.error || data.message || "Failed to fetch data plans from API";
        console.error('API returned error:', { 
          error: errorMsg,
          fullResponse: data,
          dataProvider,
          network: network.name 
        });
        throw new Error(errorMsg);
      }

      // If no success flag but has error, treat as failure
      if (data?.error && !data?.success) {
        console.error('API response contains error:', data.error);
        throw new Error(data.error);
      }

      // If no success flag and no data, might be a different response format
      if (!data?.success && !data?.data && !data?.error) {
        console.warn('Response missing success flag and data field. Full response:', data);
        // Try to continue anyway - might be a different format
      }

        // Normalize various possible response shapes into an array
        const raw = (data as any)?.data;
        console.log('Raw data extracted:', {
          rawType: typeof raw,
          isArray: Array.isArray(raw),
          rawLength: Array.isArray(raw) ? raw.length : 'not array',
          rawKeys: raw && typeof raw === 'object' ? Object.keys(raw) : [],
          sampleRaw: Array.isArray(raw) && raw.length > 0 ? JSON.stringify(raw[0]).substring(0, 200) : JSON.stringify(raw).substring(0, 200)
        });
        let plansArray: any[] = [];

        if (Array.isArray(raw)) {
          plansArray = raw;
        } else if (raw && typeof raw === 'object') {
          // Handle different provider response formats
          if (dataProvider === 'vtpass') {
            // VTpass returns array directly in data.data
            // Check if it's already an array or needs extraction
            if (Array.isArray(raw)) {
              plansArray = raw;
            } else if (raw.content && Array.isArray(raw.content.varations)) {
              // Handle VTpass nested format if present
              plansArray = raw.content.varations;
            } else {
              plansArray = [];
            }
          } else {
            // SMEPLUG and others might have nested structure
            const keyed = (raw as any)[network.network_id] ?? (raw as any)[String(network.network_id)];
            if (Array.isArray(keyed)) {
              plansArray = keyed;
            } else if (Array.isArray((raw as any).plans)) {
              plansArray = (raw as any).plans;
            } else {
              const values = Object.values(raw as any);
              const arrays = values.filter((v) => Array.isArray(v)) as any[];
              if (arrays.length) {
                plansArray = arrays.flat();
              } else {
                plansArray = values.filter((v) => v && typeof v === 'object') as any[];
              }
            }
          }
        } else if (Array.isArray((data as any).plans)) {
          plansArray = (data as any).plans;
        }

        if (!plansArray.length) {
          console.warn('No plans found in response:', {
            dataProvider,
            network: network.name,
            network_id: network.network_id,
            rawData: raw,
            rawDataType: typeof raw,
            rawDataIsArray: Array.isArray(raw),
            rawDataKeys: raw && typeof raw === 'object' ? Object.keys(raw) : [],
            responseData: data,
            responseDataKeys: data ? Object.keys(data) : [],
            fullResponse: JSON.stringify(data).substring(0, 2000)
          });
          
          // Provide more helpful error message
          let errorMessage = `The ${dataProvider.toUpperCase()} provider returned no plans for ${network.name}.`;
          if (data?.error) {
            errorMessage += ` Error: ${data.error}`;
          } else if (data?.details) {
            errorMessage += ` Details: ${JSON.stringify(data.details).substring(0, 200)}`;
          }
          
          toast({
            title: 'No Plans Found',
            description: errorMessage + ' Check the browser console for more details.',
            variant: 'destructive',
          });
          return;
        }

        console.log(`Found ${plansArray.length} plans from ${dataProvider} for ${network.name}`);

        const normalizedNetwork = normalizeNetworkTab(network.name);

        const normalizePrice = (value: any) => {
          if (value == null) return 0;
          const numeric = typeof value === 'number'
            ? value
            : typeof value === 'string'
            ? Number(value.replace(/[^0-9.-]/g, ''))
            : Number(value);
          if (!Number.isFinite(numeric) || numeric < 0) return 0;
          return Number(numeric.toFixed(2));
        };

        // Map plans based on provider format and sanitize inputs
        const plansToInsert = plansArray
          .map((plan: any) => {
            const apiCodeCandidate =
              plan.api_code ||
              plan.variation_id ||
              plan.variation_code ||
              plan.id ||
              plan.code ||
              plan.plan_id;
            const normalizedApiCode = typeof apiCodeCandidate === 'string'
              ? apiCodeCandidate.trim()
              : String(apiCodeCandidate ?? '');

            const planName =
              plan.data_plan ||
              plan.plan ||
              plan.name ||
              plan.plan_name ||
              plan.variation_name ||
              plan.fixedPriceDescription ||
              plan.title ||
              'Unknown Plan';

            const validityValue =
              plan.validity ||
              plan.duration ||
              plan.validity_period ||
              (typeof planName === 'string' && planName.includes('-')
                ? planName.split('-').slice(1).join('-').trim()
                : 'N/A');
            const priceValue = normalizePrice(
              plan.price ??
                plan.amount ??
                plan.variation_amount ??
                plan.fixedPrice ??
                plan.variationAmount ??
                plan.fixedPriceAmount
            );

            // Build plan object with vendor-specific codes
            const planObj: any = {
              network: normalizedNetwork,
              plan_name: typeof planName === 'string' ? planName.trim() || 'Unknown Plan' : 'Unknown Plan',
              price: priceValue,
              vendor_price: priceValue, // Store vendor price
              user_price: priceValue, // Default user price same as vendor price
              original_price: priceValue, // Set original_price to the imported price (for backward compatibility)
              validity: typeof validityValue === 'string' ? validityValue.trim() || 'N/A' : 'N/A',
              api_code: normalizedApiCode || `${network.name}-${Date.now()}`,
              provider: dataProvider, // Keep provider for backward compatibility
            };

            // Store vendor code in the appropriate vendor-specific column
            if (dataProvider === 'vtpass') {
              planObj.vtpass_code = normalizedApiCode;
            } else if (dataProvider === 'smeplug') {
              planObj.smeplug_code = normalizedApiCode;
            } else if (dataProvider === 'mobilenig') {
              planObj.mobilenig_code = normalizedApiCode;
            } else if (dataProvider === 'ebills' || dataProvider === 'flutterwave') {
              planObj.api_code = normalizedApiCode;
            }

            // Extract plan type and size if available
            planObj.plan_type = inferPlanType(
              typeof planName === 'string' ? planName : '',
              typeof plan.plan_type === 'string' ? plan.plan_type : null,
            );

            // Extract size from plan name if possible
            const sizeMatch = planName.match(/(\d+\s*(GB|MB|TB))/i);
            if (sizeMatch) {
              planObj.size = sizeMatch[1];
            }

            return planObj;
          })
          .filter((plan: any) => {
            if (!plan.api_code) {
              console.warn('Skipping plan without api_code', plan);
              return false;
            }
            if (!Number.isFinite(plan.price)) {
              console.warn('Skipping plan with invalid price', plan);
              return false;
            }
            return true;
          });

        // Deduplicate plans within the same import batch
        const dedupedPlans: typeof plansToInsert = [];
        const seen = new Set<string>();
        for (const plan of plansToInsert) {
          const key = `${plan.provider}-${plan.api_code}`;
          if (seen.has(key)) continue;
          seen.add(key);
          dedupedPlans.push(plan);
        }

        if (!dedupedPlans.length) {
          toast({
            title: 'No Valid Plans',
            description: 'Fetched plans did not contain valid API codes or prices.',
            variant: 'destructive',
          });
          return;
        }

        // Smart upsert: Match existing plans by network + plan_name and merge vendor codes
        // First, fetch existing plans for this network to check for matches
        const { data: existingPlans } = await supabase
          .from('data_plans')
          .select('id, network, plan_name, vtpass_code, smeplug_code, mobilenig_code, api_code, provider, vendor_price, user_price, validity, size, price')
          .in('network', Array.from(new Set([network.name, normalizedNetwork])));

        const plansToUpsert: any[] = [];
        const plansToUpdate: Array<{ id: string; updates: any }> = [];

        for (const newPlan of dedupedPlans) {
          // Try to find matching existing plan by network + plan_name + price (more accurate matching)
          // Also try to match by size if available
          const matchingPlan = existingPlans?.find(
            (existing: any) => {
              const networkMatch =
                normalizeNetworkTab(existing.network) === normalizedNetwork ||
                existing.network === network.name;
              const nameMatch = existing.plan_name.toLowerCase().trim() === newPlan.plan_name.toLowerCase().trim();
              
              // Try to match by price (within 5% tolerance for rounding differences)
              const priceMatch = existing.price && newPlan.price && 
                Math.abs(existing.price - newPlan.price) / Math.max(existing.price, newPlan.price) < 0.05;
              
              // Try to match by size if available
              const sizeMatch = !existing.size || !newPlan.size || 
                existing.size.toLowerCase().trim() === newPlan.size.toLowerCase().trim();
              
              return networkMatch && nameMatch && (priceMatch || sizeMatch);
            }
          );

          if (matchingPlan) {
            // Plan exists - merge vendor codes (preserve existing codes, add new ones)
            const updates: any = {};
            
            // Update vendor-specific code (only if not already set or if we have a new one)
            if (dataProvider === 'vtpass' && newPlan.vtpass_code) {
              // Only update if existing code is null/empty or if we're explicitly updating
              if (!matchingPlan.vtpass_code || matchingPlan.vtpass_code !== newPlan.vtpass_code) {
                updates.vtpass_code = newPlan.vtpass_code;
              }
            } else if (dataProvider === 'smeplug' && newPlan.smeplug_code) {
              if (!matchingPlan.smeplug_code || matchingPlan.smeplug_code !== newPlan.smeplug_code) {
                updates.smeplug_code = newPlan.smeplug_code;
              }
            } else if (dataProvider === 'mobilenig' && newPlan.mobilenig_code) {
              if (!matchingPlan.mobilenig_code || matchingPlan.mobilenig_code !== newPlan.mobilenig_code) {
                updates.mobilenig_code = newPlan.mobilenig_code;
              }
            } else if ((dataProvider === 'ebills' || dataProvider === 'flutterwave') && newPlan.api_code) {
              if (!matchingPlan.api_code || matchingPlan.api_code !== newPlan.api_code) {
                updates.api_code = newPlan.api_code;
              }
              updates.provider = dataProvider;
              updates.network = normalizedNetwork;
            }

            if (matchingPlan.provider !== dataProvider) {
              updates.provider = dataProvider;
            }
            if (normalizeNetworkTab(matchingPlan.network) !== normalizedNetwork) {
              updates.network = normalizedNetwork;
            }

            // Update price if vendor price is different
            if (newPlan.vendor_price && newPlan.vendor_price !== matchingPlan.vendor_price) {
              updates.vendor_price = newPlan.vendor_price;
              // Only update user_price if it was the same as old vendor_price (auto-pricing)
              if (!matchingPlan.user_price || matchingPlan.user_price === matchingPlan.vendor_price) {
                updates.user_price = newPlan.vendor_price;
              }
            }

            // Update validity if different
            if (newPlan.validity && newPlan.validity !== matchingPlan.validity) {
              updates.validity = newPlan.validity;
            }

            // Update plan_type and size if available
            if (newPlan.plan_type) updates.plan_type = newPlan.plan_type;
            if (newPlan.size) updates.size = newPlan.size;

            if (Object.keys(updates).length > 0) {
              plansToUpdate.push({ id: matchingPlan.id, updates });
            }
          } else {
            // New plan - insert it
            plansToUpsert.push(newPlan);
          }
        }

        // Perform updates for existing plans
        for (const { id, updates } of plansToUpdate) {
          const { error: updateError } = await supabase
            .from('data_plans')
            .update(updates)
            .eq('id', id);
          
          if (updateError) {
            console.warn(`Failed to update plan ${id}:`, updateError);
          }
        }

        // Perform upserts for new plans
        if (plansToUpsert.length > 0) {
          let insertError;
          
          // Try with all vendor code columns
          try {
            // Supabase upsert uses column names, not constraint names
            const result = await supabase
              .from('data_plans')
              .upsert(plansToUpsert, { 
                onConflict: 'provider,api_code',
                ignoreDuplicates: false 
              });
            insertError = result.error;
          } catch (e: any) {
            insertError = e;
          }

          // Handle RLS policy errors
          if (insertError && (
            insertError.message?.includes('row-level security') ||
            insertError.message?.includes('RLS') ||
            insertError.code === '42501'
          )) {
            console.error('RLS policy violation:', insertError);
            console.error('This usually means the user does not have admin role in user_roles table');
            
            // Check admin role again
            const { data: { session: rlsSession } } = await supabase.auth.getSession();
            if (rlsSession) {
              const { data: roleData, error: roleError } = await supabase
                .from('user_roles')
                .select('*')
                .eq('user_id', rlsSession.user.id);
              
              console.error('User roles:', roleData);
              console.error('Role check error:', roleError);
            }
            
            throw new Error('Permission denied: You do not have admin permissions to insert data plans. Please ensure your account has the admin role assigned in the user_roles table.');
          }
          
          // Handle column errors gracefully
          if (insertError && (
            insertError.code === '42703' ||
            insertError.message?.toLowerCase().includes('column') ||
            insertError.message?.toLowerCase().includes('does not exist') ||
            insertError.message?.includes('no unique or exclusion constraint')
          )) {
            console.warn('Upsert with constraint failed, trying manual insert/update:', insertError.message);
            
            // Fallback: Manual insert/update by checking for existing plans
            for (const plan of plansToUpsert) {
              const { data: existing } = await supabase
                .from('data_plans')
                .select('id')
                .eq('provider', plan.provider)
                .eq('api_code', plan.api_code)
                .maybeSingle();
              
              if (existing) {
                const { error: updateError } = await supabase
                  .from('data_plans')
                  .update(plan)
                  .eq('id', existing.id);
                if (updateError) {
                  console.warn(`Failed to update plan ${existing.id}:`, updateError);
                  if (updateError.message?.includes('row-level security') || updateError.message?.includes('RLS')) {
                    throw new Error('Permission denied: You do not have admin permissions to update data plans.');
                  }
                }
              } else {
                const { error: insertError2 } = await supabase
                  .from('data_plans')
                  .insert(plan);
                if (insertError2) {
                  console.warn(`Failed to insert plan:`, insertError2);
                  if (insertError2.message?.includes('row-level security') || insertError2.message?.includes('RLS')) {
                    throw new Error('Permission denied: You do not have admin permissions to insert data plans. Please ensure your account has the admin role assigned.');
                  }
                }
              }
            }
            insertError = null; // Clear error since we handled it manually
          } else if (insertError) {
            throw insertError;
          }
        }

        const totalProcessed = plansToUpsert.length + plansToUpdate.length;

        await fetchDataPlans();
        setIsDialogOpen(false);
        setFilterNetwork(normalizedNetwork);
        setActiveNetworkTab(normalizedNetwork);
        setCurrentPage(1);

        const newCount = plansToUpsert.length;
        const updatedCount = plansToUpdate.length;
        let successMessage = `Imported ${totalProcessed} data plans from ${normalizedNetwork} via ${dataProvider === 'ebills' ? 'eBills Africa' : dataProvider.toUpperCase()}`;
        if (newCount > 0 && updatedCount > 0) {
          successMessage += ` (${newCount} new, ${updatedCount} updated with ${dataProvider} codes)`;
        } else if (updatedCount > 0) {
          successMessage += ` (Updated ${updatedCount} existing plans with ${dataProvider} codes)`;
        }
        successMessage += `. Showing ${normalizedNetwork} plans.`;
        
        toast({
          title: "Success",
          description: successMessage,
        });
    } catch (error: any) {
      if (timeoutId) clearTimeout(timeoutId);
      console.error('Error fetching plans from API:', error);
      console.error('Error details:', {
        name: error?.name,
        message: error?.message,
        stack: error?.stack,
        status: error?.status,
        code: error?.code,
      });
      
      // Handle timeout/abort errors
      if (error.name === 'AbortError' || error.message?.includes('aborted') || error.message?.includes('timeout')) {
        const timeoutSeconds = dataProvider === 'vtpass' ? 30 : 60;
        toast({
          title: "Request Timeout",
          description: `The request took too long (${timeoutSeconds}s). The ${dataProvider.toUpperCase()} API might be slow or unavailable. Please try again.`,
          variant: "destructive",
        });
        return;
      }
      
      // Handle network errors
      if (error.message?.includes('ERR_INTERNET_DISCONNECTED') || 
          error.message?.includes('Failed to fetch') ||
          error.message?.includes('network') ||
          error.message?.includes('Unable to connect') ||
          error.message?.includes('connection') ||
          error.message?.includes('ECONNREFUSED') ||
          error.message?.includes('ENOTFOUND') ||
          error.message?.includes('ETIMEDOUT') ||
          error.name === 'TypeError') {
        toast({
          title: "Network Error",
          description: error.message || "Unable to connect to the server. Please check your internet connection and try again.",
          variant: "destructive",
        });
        return;
      }
      
      // Extract more detailed error message
      let errorMessage = "Failed to fetch plans from API";
      
      if (error?.message) {
        errorMessage = error.message;
      } else if (error?.error) {
        errorMessage = error.error;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      
      // Check if it's a 400 error and provide more context
      if (error?.status === 400 || error?.code === 400 || errorMessage.includes('400')) {
        errorMessage = `Invalid request: ${errorMessage}. Please check that the network is properly configured with the required parameters.`;
      }
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsFetching(false);
    }
  };

  const openEditDialog = (plan: DataPlan) => {
    setEditingPlan(plan);
    const originalPrice = plan.original_price ?? plan.price;
    const vendorPrice = plan.vendor_price ?? originalPrice;
    const userPrice = plan.user_price ?? plan.custom_price ?? originalPrice;
    setEditForm({
      plan_name: plan.plan_name,
      price: String(originalPrice),
      validity: plan.validity,
      api_code: plan.api_code,
      custom_price: plan.custom_price ? String(plan.custom_price) : "",
      plan_type: plan.plan_type || "",
      size: plan.size || "",
      vendor_price: plan.vendor_price ? String(plan.vendor_price) : String(vendorPrice),
      user_price: plan.user_price ? String(plan.user_price) : String(userPrice),
      vtpass_code: plan.vtpass_code || "",
      smeplug_code: plan.smeplug_code || "",
      mobilenig_code: plan.mobilenig_code || "",
      is_active: plan.is_active ?? true
    });
    setIsEditDialogOpen(true);
  };

  const handleEditFormChange = (field: string, value: string) => {
    setEditForm(prev => ({ ...prev, [field]: value }));
  };

  const updatePlan = async () => {
    if (!editingPlan) return;

    // Validate inputs
    if (!editForm.plan_name.trim()) {
      toast({
        title: "Validation Error",
        description: "Plan name cannot be empty",
        variant: "destructive",
      });
      return;
    }

    const priceNum = parseFloat(editForm.price);
    if (isNaN(priceNum) || priceNum < 0) {
      toast({
        title: "Validation Error",
        description: "Price must be a valid positive number",
        variant: "destructive",
      });
      return;
    }

    if (!editForm.validity.trim()) {
      toast({
        title: "Validation Error",
        description: "Validity cannot be empty",
        variant: "destructive",
      });
      return;
    }

    if (!editForm.api_code.trim()) {
      toast({
        title: "Validation Error",
        description: "API code cannot be empty",
        variant: "destructive",
      });
      return;
    }

    try {
      const customPriceValue = editForm.custom_price.trim();
      const customPriceNum = customPriceValue ? parseFloat(customPriceValue) : null;
      const isValidCustomPrice = customPriceNum !== null && !isNaN(customPriceNum) && customPriceNum >= 0;
      
      const updateData: any = {
        plan_name: editForm.plan_name.trim(),
        price: priceNum,
        validity: editForm.validity.trim(),
        api_code: editForm.api_code.trim(),
      };
      
      // Try to update original_price and custom_price if columns exist
      // Always update original_price to match the price field (this is the provider's price)
      updateData.original_price = priceNum;
      
      // Set custom_price (can be null to clear it)
      // This is what users will be charged
      updateData.custom_price = isValidCustomPrice ? customPriceNum : null;

      // Add new vendor-based fields if they exist
      if (editForm.plan_type.trim()) {
        updateData.plan_type = editForm.plan_type.trim();
      }
      if (editForm.size.trim()) {
        updateData.size = editForm.size.trim();
      }
      const vendorPriceNum = editForm.vendor_price.trim() ? parseFloat(editForm.vendor_price) : null;
      if (vendorPriceNum !== null && !isNaN(vendorPriceNum) && vendorPriceNum >= 0) {
        updateData.vendor_price = vendorPriceNum;
      }
      const userPriceNum = editForm.user_price.trim() ? parseFloat(editForm.user_price) : null;
      if (userPriceNum !== null && !isNaN(userPriceNum) && userPriceNum >= 0) {
        updateData.user_price = userPriceNum;
      }
      if (editForm.vtpass_code.trim()) {
        updateData.vtpass_code = editForm.vtpass_code.trim();
      }
      if (editForm.smeplug_code.trim()) {
        updateData.smeplug_code = editForm.smeplug_code.trim();
      }
      if (editForm.mobilenig_code.trim()) {
        updateData.mobilenig_code = editForm.mobilenig_code.trim();
      }
      updateData.is_active = editForm.is_active;
      
      console.log('Updating data plan:', {
        planId: editingPlan.id,
        originalPrice: priceNum,
        customPrice: updateData.custom_price,
        userWillPay: updateData.custom_price ?? priceNum
      });
      
      // Try update with all fields first
      let { error } = await supabase
        .from('data_plans')
        .update(updateData)
        .eq('id', editingPlan.id);

      // If error is about missing columns, remove them and try again
      if (error && (
        error.code === '42703' ||
        error.message?.toLowerCase().includes('column') ||
        error.message?.toLowerCase().includes('does not exist') ||
        error.message?.toLowerCase().includes('original_price') ||
        error.message?.toLowerCase().includes('custom_price')
      )) {
        console.warn('original_price or custom_price columns not found, updating without them:', error.message);
        const { original_price, custom_price, ...basicUpdateData } = updateData;
        const result = await supabase
          .from('data_plans')
          .update(basicUpdateData)
          .eq('id', editingPlan.id);
        error = result.error;
      }

      if (error) throw error;

      await fetchDataPlans();
      setIsEditDialogOpen(false);
      setEditingPlan(null);
      
      toast({
        title: "Success",
        description: "Data plan updated successfully",
      });
    } catch (error) {
      console.error('Error updating plan:', error);
      toast({
        title: "Error",
        description: "Failed to update data plan",
        variant: "destructive",
      });
    }
  };

  const resetCustomPrice = async (planId: string) => {
    try {
      const { error } = await supabase.rpc('reset_data_plan_custom_prices', {
        plan_ids: [planId]
      });

      if (error) {
        // If RPC doesn't exist, fallback to direct update
        console.warn('RPC function not found, using direct update:', error);
        const { error: updateError } = await supabase
          .from('data_plans')
          .update({ custom_price: null })
          .eq('id', planId);
        
        if (updateError) throw updateError;
      }

      toast({
        title: "Success",
        description: "Custom price reset to original price",
      });

      await fetchDataPlans();
    } catch (error: any) {
      console.error('Error resetting custom price:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to reset custom price",
        variant: "destructive",
      });
    }
  };

  const resetAllCustomPricesForProvider = async () => {
    if (!confirm(`Are you sure you want to reset all custom prices for ${dataProvider.toUpperCase()}? This will restore all plans to their original prices.`)) {
      return;
    }

    try {
      const { error } = await supabase.rpc('reset_data_provider_custom_prices', {
        provider_name: dataProvider
      });

      if (error) {
        // If RPC doesn't exist, fallback to direct update
        console.warn('RPC function not found, using direct update:', error);
        const { error: updateError } = await supabase
          .from('data_plans')
          .update({ custom_price: null })
          .eq('provider', dataProvider);
        
        if (updateError) throw updateError;
      }

      toast({
        title: "Success",
        description: `All custom prices reset for ${dataProvider.toUpperCase()}`,
      });

      await fetchDataPlans();
    } catch (error: any) {
      console.error('Error resetting custom prices:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to reset custom prices",
        variant: "destructive",
      });
    }
  };

  const deletePlan = async (id: string) => {
    try {
      const { error } = await supabase
        .from('data_plans')
        .delete()
        .eq('id', id);

      if (error) throw error;

      await fetchDataPlans();
      toast({
        title: "Success",
        description: "Data plan deleted successfully",
      });
    } catch (error) {
      console.error('Error deleting plan:', error);
      toast({
        title: "Error",
        description: "Failed to delete data plan",
        variant: "destructive",
      });
    }
  };

  const getNetworkColor = (network: string) => {
    const colors: Record<string, string> = {
      'MTN': 'bg-yellow-500',
      'Airtel': 'bg-red-500',
      'Glo': 'bg-green-500',
      'T2': 'bg-emerald-600'
    };
    return colors[network] || 'bg-gray-500';
  };

  const networkCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const plan of dataPlans) {
      const tab = normalizeNetworkTab(plan.network);
      counts[tab] = (counts[tab] || 0) + 1;
    }
    return counts;
  }, [dataPlans]);

  const filteredPlans = useMemo(() => {
    let plans = [...dataPlans];

    const activeTab = activeNetworkTab === 'all' ? 'all' : normalizeNetworkTab(activeNetworkTab);

    if (activeTab !== 'all') {
      plans = plans.filter((plan) => normalizeNetworkTab(plan.network) === activeTab);
    } else if (filterNetwork) {
      plans = plans.filter((plan) => normalizeNetworkTab(plan.network) === normalizeNetworkTab(filterNetwork));
    }

    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase();
      plans = plans.filter((plan) =>
        plan.plan_name.toLowerCase().includes(query) ||
        plan.api_code?.toLowerCase().includes(query) ||
        plan.network.toLowerCase().includes(query) ||
        plan.size?.toLowerCase().includes(query)
      );
    }

    if (planFilter === 'active') {
      plans = plans.filter((plan) => plan.is_active !== false);
    } else if (planFilter === 'custom_price') {
      plans = plans.filter((plan) => !!plan.custom_price);
    }

    return plans.sort((a, b) => {
      if (a.network !== b.network) return a.network.localeCompare(b.network);
      return (a.price || 0) - (b.price || 0);
    });
  }, [dataPlans, activeNetworkTab, filterNetwork, searchQuery, planFilter]);

  const totalPlansCount = dataPlans.length;
  const totalFilteredCount = filteredPlans.length;
  const totalPages = Math.max(1, Math.ceil(totalFilteredCount / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedPlans = filteredPlans.slice(
    (safeCurrentPage - 1) * pageSize,
    safeCurrentPage * pageSize
  );
  const pageStart = totalFilteredCount === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1;
  const pageEnd = Math.min(safeCurrentPage * pageSize, totalFilteredCount);

  const getVendorBadgeClass = (provider?: string | null) => {
    const normalized = (provider || '').toLowerCase();
    if (normalized === 'smeplug') return 'bg-green-50 text-green-700 border-green-200';
    if (normalized === 'vtpass') return 'bg-blue-50 text-blue-700 border-blue-200';
    if (normalized === 'mobilenig') return 'bg-purple-50 text-purple-700 border-purple-200';
    if (normalized === 'ebills' || normalized === 'ebills.africa') return 'bg-orange-50 text-orange-700 border-orange-200';
    if (normalized === 'flutterwave') return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    return 'bg-gray-50 text-gray-700 border-gray-200';
  };

  const handleNetworkTabChange = (tab: string) => {
    setActiveNetworkTab(tab);
    setFilterNetwork(tab === 'all' ? null : tab);
    setCurrentPage(1);
  };

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
                  <h1 className="text-3xl font-bold">Data Plans Management</h1>
                  <p className="text-muted-foreground">
                    Manage and sync data plans from providers
                    {totalPlansCount > 0 ? ` · ${totalPlansCount} plan${totalPlansCount !== 1 ? 's' : ''}` : ''}
                  </p>
                  <div className="mt-2 flex items-center gap-2 text-sm bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2 max-w-3xl">
                    <DollarSign className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span className="text-blue-700 dark:text-blue-300">
                      <strong>Pricing:</strong> Set custom prices to charge users a different amount than the provider&apos;s price. Users will be charged the custom price (or original if not set).
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-wrap justify-end">
                  <Button
                    variant="outline"
                    onClick={syncAllProviderPlans}
                    disabled={isSyncingAll}
                    className="flex items-center gap-2"
                    title="Fetch and store plans for SMEPLUG, eBills, and MobileNig so the app loads instantly"
                  >
                    <RefreshCw className={`h-4 w-4 ${isSyncingAll ? 'animate-spin' : ''}`} />
                    {isSyncingAll ? 'Syncing…' : 'Sync All Providers'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={resetAllCustomPricesForProvider}
                    className="flex items-center gap-2"
                    title="Reset all custom prices to original prices"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Reset All Prices
                  </Button>
                  <div className="flex items-center gap-3 bg-card border rounded-lg px-4 py-2">
                    <Label htmlFor="data-provider" className="text-sm font-medium whitespace-nowrap">Data Provider:</Label>
                    <Select
                      value={dataProvider}
                      onValueChange={async (value) => {
                        const provider = value as DataVendingProvider;
                        setDataProvider(provider);
                        await updateDataProvider(provider);
                      }}
                      disabled={isUpdatingProvider}
                    >
                      <SelectTrigger id="data-provider" className="w-[180px]">
                        <SelectValue placeholder="Select provider" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="smeplug">SMEPLUG</SelectItem>
                        <SelectItem value="mobilenig">MobileNig</SelectItem>
                        <SelectItem value="ebills">eBills Africa</SelectItem>
                        <SelectItem value="flutterwave">Flutterwave</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                  <DialogTrigger asChild>
                    <Button className="bg-orange-500 hover:bg-orange-600 text-white">
                      <Plus className="mr-2 h-4 w-4" />
                      Import from API
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Import Data Plans from {dataProvider === 'ebills' ? 'eBills Africa' : dataProvider.toUpperCase()}</DialogTitle>
                      <DialogDescription>
                        Select a network to fetch and import their data plans from {dataProvider === 'ebills' ? 'eBills Africa' : dataProvider.toUpperCase()}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="network">Select Network</Label>
                        <Select value={selectedNetwork} onValueChange={setSelectedNetwork}>
                          <SelectTrigger>
                            <SelectValue placeholder="Choose a network" />
                          </SelectTrigger>
                          <SelectContent>
                            {networks.map((network) => (
                              <SelectItem key={network.id} value={network.id}>
                                {normalizeNetworkTab(network.name)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button 
                        onClick={fetchPlansFromAPI} 
                        disabled={!selectedNetwork || isFetching}
                        className="w-full"
                      >
                        {isFetching ? (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                            Fetching...
                          </>
                        ) : (
                          'Fetch & Import Plans'
                        )}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
                </div>
              </div>
            </div>

            <Card className="mt-6">
              <CardContent className="pt-6 space-y-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex flex-wrap gap-2">
                    {NETWORK_TABS.map((network) => (
                      <Button
                        key={network}
                        variant={normalizeNetworkTab(activeNetworkTab) === network ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => handleNetworkTabChange(network)}
                        className={normalizeNetworkTab(activeNetworkTab) === network ? 'bg-orange-500 hover:bg-orange-600 text-white' : ''}
                      >
                        {network}
                        <span className="ml-2 text-xs opacity-80">({networkCounts[network] || 0} plans)</span>
                      </Button>
                    ))}
                    <Button
                      variant={activeNetworkTab === 'all' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleNetworkTabChange('all')}
                      className={activeNetworkTab === 'all' ? 'bg-orange-500 hover:bg-orange-600 text-white' : ''}
                    >
                      All Providers
                      <span className="ml-2 text-xs opacity-80">({totalPlansCount} plans)</span>
                    </Button>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          setCurrentPage(1);
                        }}
                        placeholder="Search plans..."
                        className="pl-9 w-[220px]"
                      />
                    </div>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-2">
                          <Filter className="h-4 w-4" />
                          Filter
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-48 p-2">
                        <div className="space-y-1">
                          <Button
                            variant={planFilter === 'all' ? 'secondary' : 'ghost'}
                            size="sm"
                            className="w-full justify-start"
                            onClick={() => { setPlanFilter('all'); setCurrentPage(1); }}
                          >
                            All plans
                          </Button>
                          <Button
                            variant={planFilter === 'active' ? 'secondary' : 'ghost'}
                            size="sm"
                            className="w-full justify-start"
                            onClick={() => { setPlanFilter('active'); setCurrentPage(1); }}
                          >
                            Active only
                          </Button>
                          <Button
                            variant={planFilter === 'custom_price' ? 'secondary' : 'ghost'}
                            size="sm"
                            className="w-full justify-start"
                            onClick={() => { setPlanFilter('custom_price'); setCurrentPage(1); }}
                          >
                            Custom price only
                          </Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                    <span className="text-sm text-green-600 whitespace-nowrap">
                      Last synced: {formatRelativeSyncTime(lastSyncedAt)}
                    </span>
                  </div>
                </div>

                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Plan Name</TableHead>
                        <TableHead>Provider</TableHead>
                        <TableHead className="text-right">Original Price</TableHead>
                        <TableHead className="text-right">Custom Price</TableHead>
                        <TableHead className="text-right font-semibold">User Pays</TableHead>
                        <TableHead>Validity</TableHead>
                        <TableHead>Size</TableHead>
                        <TableHead>API Code</TableHead>
                        <TableHead>Vendor Code</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedPlans.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={11} className="text-center py-12 text-muted-foreground">
                            {searchQuery || planFilter !== 'all'
                              ? 'No plans match your search or filter.'
                              : 'No data plans found. Import plans from the API to get started.'}
                          </TableCell>
                        </TableRow>
                      ) : (
                        paginatedPlans.map((plan) => {
                          const effectivePrice = plan.custom_price ?? plan.original_price ?? plan.price;
                          const originalPrice = plan.original_price ?? plan.price;
                          const hasCustomPrice = !!plan.custom_price;
                          const isActive = plan.is_active !== false;

                          return (
                            <TableRow key={plan.id}>
                              <TableCell className="font-medium max-w-[280px]">{plan.plan_name}</TableCell>
                              <TableCell>
                                <Badge className={`${getNetworkColor(normalizeNetworkTab(plan.network))} text-white border-0`}>
                                  {normalizeNetworkTab(plan.network)}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                {formatNaira(originalPrice)}
                              </TableCell>
                              <TableCell className="text-right">
                                {hasCustomPrice ? (
                                  <span className="text-green-600 font-medium">{formatNaira(plan.custom_price!)}</span>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right font-semibold">
                                <span className={hasCustomPrice ? 'text-primary' : ''}>
                                  {formatNaira(effectivePrice)}
                                </span>
                              </TableCell>
                              <TableCell>{plan.validity || 'N/A'}</TableCell>
                              <TableCell>{plan.size || '-'}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 font-mono">
                                  {plan.api_code || 'N/A'}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className={getVendorBadgeClass(plan.provider)}>
                                  {formatVendorLabel(plan.provider)}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className={isActive
                                    ? 'bg-green-50 text-green-700 border-green-200'
                                    : 'bg-gray-50 text-gray-600 border-gray-200'}
                                >
                                  {isActive ? 'Active' : 'Inactive'}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openEditDialog(plan)}
                                    title="Edit plan"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  {plan.custom_price && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => resetCustomPrice(plan.id)}
                                      title="Reset to original price"
                                    >
                                      <RotateCcw className="h-4 w-4 text-orange-600" />
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => deletePlan(plan.id)}
                                    title="Delete plan"
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pt-2">
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span>
                      Showing {pageStart} to {pageEnd} of {totalFilteredCount} plan{totalFilteredCount !== 1 ? 's' : ''}
                    </span>
                    <Select
                      value={String(pageSize)}
                      onValueChange={(value) => {
                        setPageSize(Number(value));
                        setCurrentPage(1);
                      }}
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
              </CardContent>
            </Card>

            {/* Edit Plan Dialog */}
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
              <DialogContent className="flex max-h-[90vh] w-full max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
                <DialogHeader className="shrink-0 border-b px-6 py-4 pr-12">
                  <DialogTitle>Edit Data Plan</DialogTitle>
                  <DialogDescription>
                    Update the data plan details below
                  </DialogDescription>
                </DialogHeader>
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-plan-name">Plan Name</Label>
                    <Input
                      id="edit-plan-name"
                      value={editForm.plan_name}
                      onChange={(e) => handleEditFormChange('plan_name', e.target.value)}
                      placeholder="e.g., 1GB Daily Plan"
                      maxLength={200}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-price">Original Price (₦)</Label>
                    <Input
                      id="edit-price"
                      type="number"
                      step="0.01"
                      min="0"
                      value={editForm.price}
                      onChange={(e) => handleEditFormChange('price', e.target.value)}
                      placeholder="e.g., 500"
                    />
                    <p className="text-xs text-muted-foreground">
                      This is the original price from the provider. Users will see this price unless you set a custom price below.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-validity">Validity</Label>
                    <Input
                      id="edit-validity"
                      value={editForm.validity}
                      onChange={(e) => handleEditFormChange('validity', e.target.value)}
                      placeholder="e.g., 1 Day, 30 Days"
                      maxLength={100}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-api-code">API Code (Legacy)</Label>
                    <Input
                      id="edit-api-code"
                      value={editForm.api_code}
                      onChange={(e) => handleEditFormChange('api_code', e.target.value)}
                      placeholder="e.g., MTN-1GB-DAILY"
                      maxLength={100}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="edit-plan-type">Plan Type</Label>
                      <Input
                        id="edit-plan-type"
                        value={editForm.plan_type}
                        onChange={(e) => handleEditFormChange('plan_type', e.target.value)}
                        placeholder="e.g., SME, Gifting, VTU"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-size">Size</Label>
                      <Input
                        id="edit-size"
                        value={editForm.size}
                        onChange={(e) => handleEditFormChange('size', e.target.value)}
                        placeholder="e.g., 1GB, 2GB"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="edit-vendor-price">Vendor Price (₦)</Label>
                      <Input
                        id="edit-vendor-price"
                        type="number"
                        step="0.01"
                        min="0"
                        value={editForm.vendor_price}
                        onChange={(e) => handleEditFormChange('vendor_price', e.target.value)}
                        placeholder="Cost price"
                      />
                      <p className="text-xs text-muted-foreground">What vendor charges</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-user-price">User Price (₦)</Label>
                      <Input
                        id="edit-user-price"
                        type="number"
                        step="0.01"
                        min="0"
                        value={editForm.user_price}
                        onChange={(e) => handleEditFormChange('user_price', e.target.value)}
                        placeholder="Selling price"
                      />
                      <p className="text-xs text-muted-foreground">What user pays</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Vendor Codes</Label>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <div className="space-y-1">
                        <Label htmlFor="edit-vtpass-code" className="text-xs">VTpass Code</Label>
                        <Input
                          id="edit-vtpass-code"
                          value={editForm.vtpass_code}
                          onChange={(e) => handleEditFormChange('vtpass_code', e.target.value)}
                          placeholder="VTpass code"
                          className="text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="edit-smeplug-code" className="text-xs">SMEPlug Code</Label>
                        <Input
                          id="edit-smeplug-code"
                          value={editForm.smeplug_code}
                          onChange={(e) => handleEditFormChange('smeplug_code', e.target.value)}
                          placeholder="SMEPlug code"
                          className="text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="edit-mobilenig-code" className="text-xs">Mobilenig Code</Label>
                        <Input
                          id="edit-mobilenig-code"
                          value={editForm.mobilenig_code}
                          onChange={(e) => handleEditFormChange('mobilenig_code', e.target.value)}
                          placeholder="Mobilenig code"
                          className="text-xs"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-custom-price" className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-primary" />
                      Custom Price (₦) - Legacy
                    </Label>
                    <Input
                      id="edit-custom-price"
                      type="number"
                      step="0.01"
                      min="0"
                      value={editForm.custom_price}
                      onChange={(e) => handleEditFormChange('custom_price', e.target.value)}
                      placeholder="Leave empty to use original price"
                      className={editForm.custom_price ? "border-primary" : ""}
                    />
                    <p className="text-xs text-muted-foreground">
                      Legacy field. Use "User Price" above instead.
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="edit-is-active"
                      checked={editForm.is_active}
                      onChange={(e) => setEditForm(prev => ({ ...prev, is_active: e.target.checked }))}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <Label htmlFor="edit-is-active" className="text-sm font-normal">
                      Plan is active
                    </Label>
                  </div>
                </div>
                <div className="shrink-0 border-t px-6 py-4">
                  <Button
                    onClick={updatePlan}
                    className="w-full"
                  >
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

export default DataPlans;
