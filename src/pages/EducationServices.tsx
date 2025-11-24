import { useState, useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Search, Plus, Pencil, Trash2, Download } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface EducationService {
  id: string;
  exam_type: string;
  service_name: string;
  price: number;
  api_code: string | null;
  service_id: string;
  is_active: boolean;
  vending_provider?: string | null;
  vtpass_code?: string | null;
  smeplug_code?: string | null;
  mobilenig_code?: string | null;
  vendor_price?: number | null;
  user_price?: number | null;
  original_price?: number | null;
  custom_price?: number | null;
}

const EXAM_TYPES = ["WAEC", "JAMB"] as const;
const VENDOR_PROVIDERS = ["mobilenig", "vtpass", "smeplug"] as const;

const DEFAULT_SERVICE_IDS: Record<string, string> = {
  WAEC: "AJA",
  JAMB: "AJB",
};

const getEducationLogo = (examType: string) => {
  const logos: Record<string, string> = {
    'WAEC': '/waec.png',
    'JAMB': '/jamb.png'
  };
  return logos[examType.toUpperCase()] || '';
};

export default function EducationServices() {
  const [searchQuery, setSearchQuery] = useState("");
  const [services, setServices] = useState<EducationService[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState<EducationService | null>(null);
  const [vendingProvider, setVendingProvider] = useState<'mobilenig' | 'vtpass' | 'smeplug'>('mobilenig');
  const [isFetchingPrice, setIsFetchingPrice] = useState(false);
  const [isFetchingServices, setIsFetchingServices] = useState(false);
  const [fetchingExamType, setFetchingExamType] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    exam_type: "",
    service_name: "",
    price: "",
    api_code: "",
    service_id: "",
    is_active: true,
    vending_provider: "mobilenig",
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchEducationProvider();
    fetchServices();
  }, []);


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

  const fetchServices = async () => {
    const { data, error } = await supabase
      .from("education_services")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast({
        title: "Error",
        description: "Failed to fetch education services",
        variant: "destructive",
      });
      return;
    }

    setServices(data || []);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const normalizedExamType = formData.exam_type.toUpperCase();
    const normalizedServiceId = formData.service_id.trim().toUpperCase();
    const fallbackServiceId = DEFAULT_SERVICE_IDS[normalizedExamType] || "";

    const parsedPrice = parseFloat(formData.price);

    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      toast({
        title: "Invalid Price",
        description: "Please enter a valid price greater than zero.",
        variant: "destructive",
      });
      return;
    }

    const serviceData = {
      exam_type: normalizedExamType,
      service_name: formData.service_name,
      price: parsedPrice,
      service_id: normalizedServiceId || fallbackServiceId || (formData.api_code || "").trim().toUpperCase(),
      api_code: (formData.api_code || "").trim().toUpperCase() || normalizedServiceId || fallbackServiceId,
      is_active: formData.is_active,
      vending_provider: formData.vending_provider || vendingProvider,
    };

    if (!serviceData.service_id) {
      toast({
        title: "Invalid Service ID",
        description: "Please provide a valid service ID.",
        variant: "destructive",
      });
      return;
    }

    if (editingService) {
      const { error } = await supabase
        .from("education_services")
        .update(serviceData)
        .eq("id", editingService.id);

      if (error) {
        toast({
          title: "Error",
          description: "Failed to update education service",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Success",
        description: "Education service updated successfully",
      });
    } else {
      const { error } = await supabase.from("education_services").insert(serviceData);

      if (error) {
        toast({
          title: "Error",
          description: "Failed to create education service",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Success",
        description: "Education service created successfully",
      });
    }

    setIsDialogOpen(false);
    resetForm();
    fetchServices();
  };

  const handleEdit = (service: EducationService) => {
    setEditingService(service);
    setFormData({
      exam_type: service.exam_type,
      service_name: service.service_name,
      price: service.price.toString(),
      api_code: service.api_code?.toUpperCase?.() ?? "",
      service_id: service.service_id.toUpperCase(),
      is_active: service.is_active,
      vending_provider: service.vending_provider || 'mobilenig',
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("education_services").delete().eq("id", id);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to delete education service",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Success",
      description: "Education service deleted successfully",
    });

    fetchServices();
  };

  const resetForm = () => {
    setFormData({
      exam_type: "",
      service_name: "",
      price: "",
      api_code: "",
      service_id: "",
      is_active: true,
      vending_provider: vendingProvider,
      mobilenig_code: "",
      vtpass_code: "",
      smeplug_code: "",
      vendor_price: "",
      user_price: "",
    });
    setEditingService(null);
  };

  const fetchPriceFromAPI = async (examType: string) => {
    console.log('fetchPriceFromAPI called with:', { examType, vendingProvider, formVendingProvider: formData.vending_provider });
    
    if (vendingProvider !== 'mobilenig' && formData.vending_provider !== 'mobilenig') {
      console.log('Skipping fetch - not mobilenig provider');
      return; // Silently skip if not mobilenig
    }

    // Prevent duplicate concurrent fetches, but allow refetching for Mobilenig NECO
    if (isFetchingPrice) {
      console.log('Already fetching, skipping duplicate request');
      return;
    }

    console.log('Starting price fetch from Mobilenig API...');
    setIsFetchingPrice(true);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        console.error('No session found - cannot fetch price');
        toast({
          title: "Authentication Required",
          description: "You must be logged in to fetch prices",
          variant: "destructive",
        });
        setIsFetchingPrice(false);
        return;
      }

      console.log('Calling fetch-education-services edge function...');
      const { data, error } = await supabase.functions.invoke('fetch-education-services', {
        body: { 
          exam_type: examType,
          provider: 'mobilenig',
          fetch_from_api: true // Force fetch from API, not database
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      console.log('Edge function response:', { data, error });

      if (error) {
        console.error('Error fetching price:', error);
        toast({
          title: "Fetch Error",
          description: error.message || "Failed to fetch price from Mobilenig API",
          variant: "destructive",
        });
        setIsFetchingPrice(false);
        return;
      }

      if (!data || !data.success) {
        const errorMsg = data?.error || "Failed to fetch price";
        console.error('Failed to fetch price:', errorMsg, data);
        toast({
          title: "Fetch Failed",
          description: errorMsg,
          variant: "destructive",
        });
        setIsFetchingPrice(false);
        return;
      }

      const servicesData = data.data || [];
      console.log('Fetched services data:', servicesData);
      
      if (servicesData.length === 0) {
        console.warn('No services returned from API');
          toast({
          title: "No Data",
          description: `No ${examType} services found from Mobilenig API`,
            variant: "destructive",
          });
        setIsFetchingPrice(false);
          return;
        }

      // Update form with fetched data (use first service)
      const fetchedService = servicesData[0];
      console.log('Using first service:', fetchedService);
      
      const fetchedPrice = fetchedService.price || fetchedService.original_price || fetchedService.vendor_price || fetchedService.user_price;
      console.log('Extracted price:', fetchedPrice);
      
      if (fetchedPrice && parseFloat(String(fetchedPrice)) > 0) {
        console.log('Updating form with fetched price:', fetchedPrice);
        setFormData((prev) => ({
          ...prev,
          exam_type: fetchedService.exam_type || examType,
          service_name: fetchedService.service_name || prev.service_name || `${examType} Result Checker PIN`,
          price: String(fetchedPrice),
          api_code: fetchedService.api_code || prev.api_code,
          service_id: fetchedService.service_id || prev.service_id || DEFAULT_SERVICE_IDS[examType as keyof typeof DEFAULT_SERVICE_IDS] || "",
          vending_provider: 'mobilenig',
        }));

        toast({
          title: "Price Fetched",
          description: `Successfully fetched ${examType} price: ₦${fetchedPrice}`,
        });
      } else {
        console.warn('Invalid price in fetched service:', fetchedPrice);
        toast({
          title: "Invalid Price",
          description: `Fetched price is invalid: ${fetchedPrice}`,
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error('Error fetching price from API:', error);
      toast({
        title: "Error",
        description: error.message || "An unexpected error occurred while fetching price",
        variant: "destructive",
      });
    } finally {
      setIsFetchingPrice(false);
    }
  };

  const fetchServicesFromVTpass = async (examType: 'WAEC' | 'JAMB') => {
    setIsFetchingServices(true);
    setFetchingExamType(examType);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast({
          title: "Authentication Required",
          description: "You must be logged in to fetch services",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Fetching Services",
        description: `Fetching ${examType} services from VTpass...`,
      });

      const { data, error } = await supabase.functions.invoke('fetch-education-services', {
        body: { 
          exam_type: examType,
          provider: 'vtpass'
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) {
        console.error('Error fetching services:', error);
        toast({
          title: "Fetch Error",
          description: error.message || "Failed to fetch services from VTpass",
          variant: "destructive",
        });
        return;
      }

      if (!data || !data.success) {
        const errorMsg = data?.error || "Failed to fetch services from VTpass";
        console.error('Failed to fetch services:', errorMsg);
        toast({
          title: "Fetch Failed",
          description: errorMsg,
          variant: "destructive",
        });
        return;
      }

      const servicesData = data.data || [];
      
      if (servicesData.length === 0) {
        toast({
          title: "No Data",
          description: `No ${examType} services found from VTpass`,
          variant: "destructive",
        });
        return;
      }

      // Import each service to the database
      let importedCount = 0;
      let updatedCount = 0;
      let errors: string[] = [];

      for (const service of servicesData) {
        try {
          const vtpassCode = (service.vtpass_code || service.api_code || '').toLowerCase();
          const apiCode = (service.api_code || service.vtpass_code || '').toLowerCase();
          
          // Check if service already exists by querying all VTpass services for this exam type
          // and matching by vtpass_code or api_code
          const { data: existingServices } = await supabase
            .from('education_services')
            .select('id, vtpass_code, api_code')
            .eq('exam_type', service.exam_type)
            .eq('vending_provider', 'vtpass');

          // Find existing service by matching vtpass_code or api_code
          const existingService = existingServices?.find((s: any) => {
            const existingVtpassCode = s.vtpass_code ? String(s.vtpass_code).toLowerCase() : '';
            const existingApiCode = s.api_code ? String(s.api_code).toLowerCase() : '';
            return (vtpassCode && existingVtpassCode === vtpassCode) || 
                   (apiCode && existingApiCode === apiCode) ||
                   (vtpassCode && existingApiCode === vtpassCode) ||
                   (apiCode && existingVtpassCode === apiCode);
          });

          const serviceData = {
            exam_type: service.exam_type,
            service_name: service.service_name,
            price: service.price || service.original_price || service.vendor_price || 0,
            service_id: service.service_id || (examType === 'WAEC' ? 'waec' : 'jamb'),
            api_code: apiCode,
            vtpass_code: vtpassCode,
            vending_provider: 'vtpass',
            is_active: true,
          };

          if (existingService) {
            // Update existing service
            const { error: updateError } = await supabase
              .from('education_services')
              .update(serviceData)
              .eq('id', existingService.id);

            if (updateError) {
              errors.push(`${service.service_name}: ${updateError.message}`);
            } else {
              updatedCount++;
            }
          } else {
            // Insert new service
            const { error: insertError } = await supabase
              .from('education_services')
              .insert(serviceData);

            if (insertError) {
              errors.push(`${service.service_name}: ${insertError.message}`);
            } else {
              importedCount++;
            }
          }
        } catch (serviceError: any) {
          errors.push(`${service.service_name}: ${serviceError.message}`);
        }
      }

      // Refresh services list
      await fetchServices();

      // Show success message
      const successMessage = `Successfully imported ${importedCount} new ${examType} service(s) and updated ${updatedCount} existing service(s) from VTpass.`;
      if (errors.length > 0) {
        toast({
          title: "Partial Success",
          description: `${successMessage} ${errors.length} error(s) occurred.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Success",
          description: successMessage,
        });
      }
    } catch (error: any) {
      console.error('Error fetching services from VTpass:', error);
      toast({
        title: "Error",
        description: error.message || "An unexpected error occurred while fetching services",
        variant: "destructive",
      });
    } finally {
      setIsFetchingServices(false);
      setFetchingExamType(null);
    }
  };

  const filteredServices = services.filter(
    (service) =>
      service.exam_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      service.service_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
            <div className="flex items-center justify-between">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Search services..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>

              <div className="flex gap-2">
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
                {vendingProvider === 'vtpass' && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => fetchServicesFromVTpass('WAEC')}
                      disabled={isFetchingServices}
                      className="gap-2"
                    >
                      <Download className={`h-4 w-4 ${isFetchingServices && fetchingExamType === 'WAEC' ? 'animate-spin' : ''}`} />
                      {isFetchingServices && fetchingExamType === 'WAEC' ? 'Fetching WAEC...' : 'Fetch WAEC'}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => fetchServicesFromVTpass('JAMB')}
                      disabled={isFetchingServices}
                      className="gap-2"
                    >
                      <Download className={`h-4 w-4 ${isFetchingServices && fetchingExamType === 'JAMB' ? 'animate-spin' : ''}`} />
                      {isFetchingServices && fetchingExamType === 'JAMB' ? 'Fetching JAMB...' : 'Fetch JAMB'}
                    </Button>
                  </>
                )}
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                  <DialogTrigger asChild>
                    <Button onClick={() => {
                      resetForm();
                      setIsDialogOpen(true);
                    }} className="gap-2">
                      <Plus className="h-4 w-4" />
                      Add Service
                    </Button>
                  </DialogTrigger>
                <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>
                      {editingService ? "Edit Education Service" : "Add New Education Service"}
                    </DialogTitle>
                    <DialogDescription>
                      Configure education service for direct purchase
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleSubmit}>
                    <div className="grid gap-4 py-4">
                      <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                          <Label htmlFor="exam_type">Exam Type *</Label>
                        <Select
                          value={formData.exam_type}
                            onValueChange={(value) => {
                              const serviceId = DEFAULT_SERVICE_IDS[value] || "";
                              const newVendingProvider = formData.vending_provider || vendingProvider;
                            setFormData({
                              ...formData,
                              exam_type: value,
                                service_id: serviceId,
                                api_code: formData.api_code || serviceId,
                                service_name: formData.service_name || `${value} Result Checker PIN`,
                                price: "", // Reset price to auto-fetch
                                vending_provider: newVendingProvider,
                              });
                              
                            }}
                          required
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select exam type" />
                          </SelectTrigger>
                          <SelectContent>
                            {EXAM_TYPES.map((type) => (
                              <SelectItem key={type} value={type}>
                                {type}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                          <Label htmlFor="vending_provider">Vending Provider *</Label>
                        <Select
                          value={formData.vending_provider}
                          onValueChange={(value) => {
                            setFormData({ ...formData, vending_provider: value, price: "" });
                            
                          }}
                          required
                        >
                            <SelectTrigger>
                              <SelectValue placeholder="Select vendor provider" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="mobilenig">Mobilenig</SelectItem>
                              <SelectItem value="vtpass">VTpass</SelectItem>
                              <SelectItem value="smeplug">SMEPlug</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      
                      <div className="grid gap-2">
                        <Label htmlFor="service_name">Service Name *</Label>
                        <Input
                          id="service_name"
                          value={formData.service_name}
                          onChange={(e) =>
                            setFormData({ ...formData, service_name: e.target.value })
                          }
                          placeholder="e.g. WAEC Result Checker PIN"
                          required
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                          <Label htmlFor="service_id">Service ID *</Label>
                          <Input
                            id="service_id"
                            value={formData.service_id}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                service_id: e.target.value.trim().toUpperCase(),
                              })
                            }
                            placeholder="e.g. AJA (WAEC), AJC (NECO), AJB (JAMB)"
                            required
                          />
                          <p className="text-xs text-muted-foreground">
                            Mobilenig: AJA(WAEC), AJC(NECO), AJB(JAMB)
                          </p>
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="api_code">API Code / Product Code</Label>
                          <Input
                            id="api_code"
                            value={formData.api_code}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                api_code: e.target.value.trim().toUpperCase(),
                              })
                            }
                            placeholder="e.g. UTME, DE (for JAMB)"
                          />
                          <p className="text-xs text-muted-foreground">
                            JAMB: UTME or DE
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                          <Label htmlFor="price">User Price (₦) *</Label>
                        <Input
                          id="price"
                          type="number"
                          step="0.01"
                          value={formData.price}
                          onChange={(e) =>
                            setFormData({ ...formData, price: e.target.value })
                          }
                            placeholder="e.g. 4500.00"
                          required
                        />
                          <p className="text-xs text-muted-foreground">
                            Price charged to customers
                          </p>
                      </div>
                        <div className="flex items-center justify-between pt-6">
                          <Label htmlFor="is_active">Active Status</Label>
                        <Switch
                          id="is_active"
                          checked={formData.is_active}
                          onCheckedChange={(checked) =>
                            setFormData({ ...formData, is_active: checked })
                          }
                        />
                        </div>
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
                        {editingService ? "Update Service" : "Add Service"}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
              </div>
            </div>


            <Card>
              <CardHeader>
                <CardTitle>All Education Services</CardTitle>
                <CardDescription>
                  Manage education services for WAEC, NECO, and JAMB
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Exam Type</TableHead>
                      <TableHead>Service Name</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Service ID</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredServices.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground">
                          No education services found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredServices.map((service) => (
                        <TableRow key={service.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <img 
                                src={getEducationLogo(service.exam_type)} 
                                alt={service.exam_type}
                                className="w-6 h-6 object-contain"
                              />
                              <Badge variant="outline">{service.exam_type}</Badge>
                            </div>
                          </TableCell>
                          <TableCell>{service.service_name}</TableCell>
                          <TableCell>₦{service.price.toFixed(2)}</TableCell>
                          <TableCell className="font-mono text-sm">
                            {service.service_id}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">
                              {service.vending_provider || 'mobilenig'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={service.is_active ? "default" : "secondary"}>
                              {service.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEdit(service)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDelete(service.id)}
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
