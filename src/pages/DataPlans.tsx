import { useState, useEffect, useCallback } from "react";
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
import { Plus, Trash2, RefreshCw, Pencil, X, RotateCcw, DollarSign } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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
  const [dataProvider, setDataProvider] = useState<'smeplug' | 'anyone' | 'vtpass' | 'mobilenig' | 'ebills.africa'>('smeplug');
  const [isUpdatingProvider, setIsUpdatingProvider] = useState(false);
  const [filterNetwork, setFilterNetwork] = useState<string | null>(null);

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
        await fetchDataPlansForProvider('smeplug');
        return;
      }

      if (data?.setting_value) {
        const provider = (data.setting_value as any)?.provider || 'smeplug';
        const validProviders = ['smeplug', 'anyone', 'vtpass', 'mobilenig', 'ebills.africa'];
        const selectedProvider = validProviders.includes(provider) ? provider as any : 'smeplug';
        console.log('Setting data provider to:', selectedProvider);
        setDataProvider(selectedProvider);
        // Fetch plans for the selected provider
        await fetchDataPlansForProvider(selectedProvider);
      } else {
        console.log('No data provider setting found, defaulting to smeplug');
        // Default to smeplug if no setting found
        setDataProvider('smeplug');
        await fetchDataPlansForProvider('smeplug');
      }
    } catch (error) {
      console.error('Error fetching data provider setting:', error);
      // Default to smeplug on error
      setDataProvider('smeplug');
      await fetchDataPlansForProvider('smeplug');
    }
  }, [fetchDataPlansForProvider]);

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
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', session.user.id)
        .eq('role', 'admin')
        .maybeSingle();

      if (!roles) {
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
      await Promise.all([fetchDataProvider(), fetchNetworks()]);
      console.log('Data fetched, setting loading to false');
      setLoading(false);
    } catch (error) {
      console.error('Error in checkAdminAndFetch:', error);
      setLoading(false);
    }
  }, [navigate, toast, fetchDataProvider, fetchNetworks]);

  useEffect(() => {
    checkAdminAndFetch();
  }, [checkAdminAndFetch]);

  // Initial load effect
  useEffect(() => {
    checkAdminAndFetch();
  }, [checkAdminAndFetch]);

  const updateDataProvider = async (newProvider: 'smeplug' | 'anyone' | 'vtpass' | 'mobilenig' | 'ebills.africa') => {
    setIsUpdatingProvider(true);
    try {
      const { error } = await supabase
        .from('app_settings')
        .upsert({
          setting_key: 'data_provider',
          setting_value: { provider: newProvider },
          setting_category: 'system',
          description: 'Data vending provider: smeplug or anyone'
        }, {
          onConflict: 'setting_key'
        });

      if (error) throw error;

      setDataProvider(newProvider);
      // Fetch plans for the new provider
      await fetchDataPlansForProvider(newProvider);
      // Clear network filter when switching providers
      setFilterNetwork(null);
      toast({
        title: "Success",
        description: `Data provider switched to ${newProvider === 'ebills.africa' ? 'eBills.Africa' : newProvider.toUpperCase()}. Showing plans from ${newProvider === 'ebills.africa' ? 'eBills.Africa' : newProvider.toUpperCase()}.`,
      });
    } catch (error: any) {
      console.error('Error updating data provider:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to update data provider",
        variant: "destructive",
      });
    } finally {
      setIsUpdatingProvider(false);
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
        case 'vtpass':
          functionName = 'fetch-vtpass-data-plans';
          // VTpass can accept either network name or network_id
          if (network.name && network.name.trim()) {
            // Normalize network name to uppercase to match VTpass service map
            // VTpass expects: MTN, AIRTEL, GLO, 9MOBILE
            const normalizedNetworkName = network.name.trim().toUpperCase();
            requestBody = { network: normalizedNetworkName };
          } else if (network.network_id) {
            // Fallback to network_id if name is not available
            requestBody = { network_id: network.network_id };
          } else {
            throw new Error('Network name or network_id is required for VTpass. Please ensure the network is properly configured.');
          }
          break;
        case 'mobilenig':
          // TODO: Create fetch-mobilenig-data-plans function
          functionName = 'fetch-smeplug-data-plans';
          if (!network.network_id) {
            throw new Error('Network ID is required for SMEPLUG. Please ensure the network has a valid network_id.');
          }
          requestBody = { network_id: network.network_id };
          break;
        case 'ebills.africa':
          // TODO: Create fetch-ebills-data-plans function
          functionName = 'fetch-smeplug-data-plans';
          if (!network.network_id) {
            throw new Error('Network ID is required for SMEPLUG. Please ensure the network has a valid network_id.');
          }
          requestBody = { network_id: network.network_id };
          break;
        case 'anyone':
          // TODO: Create fetch-anyone-data-plans function
          functionName = 'fetch-smeplug-data-plans';
          if (!network.network_id) {
            throw new Error('Network ID is required for SMEPLUG. Please ensure the network has a valid network_id.');
          }
          requestBody = { network_id: network.network_id };
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

      // Use direct fetch for better timeout control
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      if (!supabaseUrl) {
        throw new Error('Supabase URL is not configured');
      }
      
      const functionUrl = `${supabaseUrl}/functions/v1/${functionName}`;
      
      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

      try {
        const response = await fetch(functionUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const responseData = await response.json();
        
        console.log('Edge function response:', {
          status: response.status,
          success: responseData?.success,
          error: responseData?.error,
          dataLength: responseData?.data?.length,
        });

        if (!response.ok) {
          const errorMessage = responseData?.error || responseData?.message || `HTTP ${response.status}: ${response.statusText}`;
          console.error('Edge function HTTP error:', response.status, errorMessage);
          throw new Error(errorMessage);
        }

        const data = responseData;

        if (!data?.success) {
          const errorMsg = data?.error || data?.message || "Failed to fetch data plans from API";
          console.error('API returned error:', { data, status: response.status });
          throw new Error(errorMsg);
        }

        // Normalize various possible response shapes into an array
        const raw = (data as any)?.data;
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
          toast({
            title: 'No Plans Found',
            description: `The ${dataProvider.toUpperCase()} provider returned no plans for this network.`,
          });
          return;
        }

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
            const apiCodeCandidate = plan.variation_code || plan.id || plan.code || plan.plan_id;
            const normalizedApiCode = typeof apiCodeCandidate === 'string'
              ? apiCodeCandidate.trim()
              : String(apiCodeCandidate ?? '');

            const planName =
              plan.plan ||
              plan.name ||
              plan.variation_name ||
              plan.fixedPriceDescription ||
              plan.title ||
              'Unknown Plan';

            const validityValue = plan.validity || plan.duration || plan.validity_period || 'N/A';
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
              network: network.name,
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
            }

            // Extract plan type and size if available
            if (plan.plan_type) {
              planObj.plan_type = plan.plan_type;
            } else if (planName.includes('SME') || planName.includes('sme')) {
              planObj.plan_type = 'SME';
            } else if (planName.includes('Gifting') || planName.includes('gift')) {
              planObj.plan_type = 'Gifting';
            } else {
              planObj.plan_type = 'SME'; // Default
            }

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
          .select('id, network, plan_name, vtpass_code, smeplug_code, mobilenig_code, api_code, provider')
          .eq('network', network.name);

        const plansToUpsert: any[] = [];
        const plansToUpdate: Array<{ id: string; updates: any }> = [];

        for (const newPlan of dedupedPlans) {
          // Try to find matching existing plan by network + plan_name
          const matchingPlan = existingPlans?.find(
            (existing: any) => 
              existing.network === newPlan.network &&
              existing.plan_name.toLowerCase().trim() === newPlan.plan_name.toLowerCase().trim()
          );

          if (matchingPlan) {
            // Plan exists - merge vendor codes
            const updates: any = {};
            
            // Update vendor-specific code
            if (dataProvider === 'vtpass' && newPlan.vtpass_code) {
              updates.vtpass_code = newPlan.vtpass_code;
            } else if (dataProvider === 'smeplug' && newPlan.smeplug_code) {
              updates.smeplug_code = newPlan.smeplug_code;
            } else if (dataProvider === 'mobilenig' && newPlan.mobilenig_code) {
              updates.mobilenig_code = newPlan.mobilenig_code;
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

          // Handle column errors gracefully
          if (insertError && (
            insertError.code === '42703' ||
            insertError.message?.toLowerCase().includes('column') ||
            insertError.message?.toLowerCase().includes('does not exist')
          )) {
            console.warn('Some columns may not exist, trying with basic columns:', insertError.message);
            
            // Remove vendor-specific columns and try again
            const basicPlans = plansToUpsert.map(({ vtpass_code, smeplug_code, mobilenig_code, vendor_price, user_price, plan_type, size, ...rest }) => rest);
            
            const { error: basicError } = await supabase
              .from('data_plans')
              .upsert(basicPlans, { 
                onConflict: 'provider,api_code',
                ignoreDuplicates: false 
              });
            
            if (basicError) {
              console.error('Failed to insert plans even with basic columns:', basicError);
              throw basicError;
            }
          } else if (insertError) {
            throw insertError;
          }
        }

        const totalProcessed = plansToUpsert.length + plansToUpdate.length;

        await fetchDataPlans();
        setIsDialogOpen(false);
        // Filter to show only the fetched network
        setFilterNetwork(network.name);
        
        const newCount = plansToUpsert.length;
        const updatedCount = plansToUpdate.length;
        let successMessage = `Imported ${totalProcessed} data plans from ${network.name} via ${dataProvider.toUpperCase()}`;
        if (newCount > 0 && updatedCount > 0) {
          successMessage += ` (${newCount} new, ${updatedCount} updated with ${dataProvider} codes)`;
        } else if (updatedCount > 0) {
          successMessage += ` (Updated ${updatedCount} existing plans with ${dataProvider} codes)`;
        }
        successMessage += `. Showing only ${network.name} plans.`;
        
        toast({
          title: "Success",
          description: successMessage,
        });
      } catch (fetchError) {
        clearTimeout(timeoutId);
        throw fetchError;
      }
    } catch (error: any) {
      console.error('Error fetching plans from API:', error);
      
      // Handle timeout/abort errors
      if (error.name === 'AbortError' || error.message?.includes('aborted') || error.message?.includes('timeout')) {
        toast({
          title: "Request Timeout",
          description: "The request took too long. The VTpass API might be slow or unavailable. Please try again.",
          variant: "destructive",
        });
        return;
      }
      
      // Handle network errors
      if (error.message?.includes('ERR_INTERNET_DISCONNECTED') || 
          error.message?.includes('Failed to fetch') ||
          error.message?.includes('network')) {
        toast({
          title: "Network Error",
          description: "Unable to connect to the server. Please check your internet connection and try again.",
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
      '9Mobile': 'bg-emerald-600'
    };
    return colors[network] || 'bg-gray-500';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const groupedPlans = dataPlans.reduce((acc, plan) => {
    // Filter by network if filterNetwork is set
    if (filterNetwork && plan.network !== filterNetwork) {
      return acc;
    }
    if (!acc[plan.network]) {
      acc[plan.network] = [];
    }
    acc[plan.network].push(plan);
    return acc;
  }, {} as Record<string, DataPlan[]>);

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
                    Manage data plans from {dataProvider === 'ebills.africa' ? 'eBills.Africa' : dataProvider.toUpperCase()}
                    {filterNetwork && ` - ${filterNetwork} network`}
                  </p>
                  <div className="mt-2 flex items-center gap-2 text-sm bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2">
                    <DollarSign className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <span className="text-blue-700 dark:text-blue-300">
                      <strong>Pricing:</strong> Set custom prices to charge users a different amount than the provider's price. Users will be charged the custom price (or original if not set).
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-4">
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
                    <Label htmlFor="data-provider" className="text-sm font-medium">Data Provider:</Label>
                    <Select
                      value={dataProvider}
                      onValueChange={(value) => {
                        updateDataProvider(value as 'smeplug' | 'anyone' | 'vtpass' | 'mobilenig' | 'ebills.africa');
                      }}
                      disabled={isUpdatingProvider}
                    >
                      <SelectTrigger id="data-provider" className="w-[180px]">
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
                  <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="mr-2 h-4 w-4" />
                      Import from API
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Import Data Plans from {dataProvider === 'ebills.africa' ? 'eBills.Africa' : dataProvider.toUpperCase()}</DialogTitle>
                      <DialogDescription>
                        Select a network to fetch and import their data plans from {dataProvider === 'ebills.africa' ? 'eBills.Africa' : dataProvider.toUpperCase()}
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
                                {network.name}
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

            {/* Filter Badge */}
            {filterNetwork && (
              <div className="mb-4 flex items-center gap-2">
                <Badge className="bg-brand text-white px-3 py-1.5 text-sm">
                  Showing: {filterNetwork}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFilterNetwork(null);
                    toast({
                      title: "Filter Cleared",
                      description: "Showing all networks",
                    });
                  }}
                  className="h-7 px-2"
                >
                  <X className="h-4 w-4 mr-1" />
                  Clear Filter
                </Button>
              </div>
            )}

            <div className="space-y-6">
              {Object.entries(groupedPlans).length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-16">
                    <p className="text-muted-foreground mb-4">
                      {filterNetwork 
                        ? `No data plans found for ${filterNetwork}` 
                        : "No data plans found"}
                    </p>
                    {filterNetwork && (
                      <Button 
                        variant="outline"
                        onClick={() => setFilterNetwork(null)}
                        className="mt-2"
                      >
                        <X className="h-4 w-4 mr-2" />
                        Clear Filter
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ) : (
                Object.entries(groupedPlans).map(([network, plans]) => (
                <Card key={network}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Badge className={getNetworkColor(network)}>
                        {network}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        ({plans.length} plans)
                      </span>
                    </CardTitle>
                    <CardDescription>Available data plans for {network}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Plan Name</TableHead>
                            <TableHead>Original Price</TableHead>
                            <TableHead>Custom Price</TableHead>
                            <TableHead className="font-semibold">User Pays</TableHead>
                            <TableHead>Validity</TableHead>
                            <TableHead>API Code</TableHead>
                            <TableHead>Vendor Codes</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {plans.map((plan) => {
                            const effectivePrice = plan.custom_price ?? plan.original_price ?? plan.price;
                            const originalPrice = plan.original_price ?? plan.price;
                            const hasCustomPrice = !!plan.custom_price;
                            return (
                              <TableRow key={plan.id}>
                                <TableCell className="font-medium">{plan.plan_name}</TableCell>
                                <TableCell>₦{originalPrice.toFixed(2)}</TableCell>
                                <TableCell>
                                  {hasCustomPrice ? (
                                    <span className="text-primary font-medium">₦{plan.custom_price!.toFixed(2)}</span>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </TableCell>
                                <TableCell className="font-semibold">
                                  <div className="flex items-center gap-2">
                                    <span className={hasCustomPrice ? "text-primary" : ""}>
                                      ₦{effectivePrice.toFixed(2)}
                                    </span>
                                    {hasCustomPrice && (
                                      <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary">
                                        Custom
                                      </Badge>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell>{plan.validity}</TableCell>
                                <TableCell className="font-mono text-sm">{plan.api_code}</TableCell>
                                <TableCell>
                                  <div className="flex flex-wrap gap-1">
                                    {plan.vtpass_code && (
                                      <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                                        VTpass
                                      </Badge>
                                    )}
                                    {plan.smeplug_code && (
                                      <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                                        SMEPlug
                                      </Badge>
                                    )}
                                    {plan.mobilenig_code && (
                                      <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                                        Mobilenig
                                      </Badge>
                                    )}
                                    {!plan.vtpass_code && !plan.smeplug_code && !plan.mobilenig_code && (
                                      <span className="text-xs text-muted-foreground">None</span>
                                    )}
                                  </div>
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
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
                ))
              )}

              {dataPlans.length === 0 && !filterNetwork && (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-16">
                    <p className="text-muted-foreground mb-4">No data plans found</p>
                    <Button onClick={() => setIsDialogOpen(true)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Import from API
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Edit Plan Dialog */}
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit Data Plan</DialogTitle>
                  <DialogDescription>
                    Update the data plan details below
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
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
                  <div className="grid grid-cols-2 gap-4">
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
                  <div className="grid grid-cols-2 gap-4">
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
                    <div className="grid grid-cols-3 gap-2">
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
