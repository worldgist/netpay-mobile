import { useState, useEffect, useCallback } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Search, Plus, Pencil, Trash2, Download, RotateCcw, DollarSign, X } from "lucide-react";
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
  original_price?: number | null;
  custom_price?: number | null;
  vendor_price?: number | null;
  user_price?: number | null;
  vtpass_code?: string | null;
  smeplug_code?: string | null;
  mobilenig_code?: string | null;
  vending_provider?: string | null;
}

const EXAM_TYPES = ["WAEC", "NECO", "JAMB"] as const;

const DEFAULT_SERVICE_IDS: Record<string, string> = {
  WAEC: "AJA",
  NECO: "AJC",
  JAMB: "AJB",
};

const getEducationLogo = (examType: string) => {
  const logos: Record<string, string> = {
    'WAEC': '/waec.png',
    'NECO': '/neco.png',
    'JAMB': '/jamb.png'
  };
  return logos[examType.toUpperCase()] || '';
};

export default function EducationServices() {
  const [searchQuery, setSearchQuery] = useState("");
  const [services, setServices] = useState<EducationService[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState<EducationService | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [educationProvider, setEducationProvider] = useState<'smeplug' | 'anyone' | 'vtpass' | 'mobilenig' | 'ebills.africa'>('smeplug');
  const [isUpdatingProvider, setIsUpdatingProvider] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [filterExamType, setFilterExamType] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    exam_type: "",
    service_name: "",
    price: "",
    api_code: "",
    service_id: "",
    is_active: true,
  });
  const [editForm, setEditForm] = useState({
    service_name: "",
    price: "",
    api_code: "",
    service_id: "",
    custom_price: "",
    vendor_price: "",
    user_price: "",
    vtpass_code: "",
    smeplug_code: "",
    mobilenig_code: "",
    is_active: true
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchEducationProvider();
  }, [fetchEducationProvider]);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  const fetchEducationProvider = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'education_provider')
        .maybeSingle();

      if (error) {
        console.error('Error fetching education provider setting:', error);
        setEducationProvider('smeplug');
        return;
      }

      if (data?.setting_value) {
        const provider = (data.setting_value as any)?.provider || 'smeplug';
        const validProviders = ['smeplug', 'anyone', 'vtpass', 'mobilenig', 'ebills.africa'];
        const selectedProvider = validProviders.includes(provider) ? provider as any : 'smeplug';
        setEducationProvider(selectedProvider);
      } else {
        setEducationProvider('smeplug');
      }
    } catch (error) {
      console.error('Error fetching education provider setting:', error);
      setEducationProvider('smeplug');
    }
  }, []);

  const updateEducationProvider = async (newProvider: 'smeplug' | 'anyone' | 'vtpass' | 'mobilenig' | 'ebills.africa') => {
    setIsUpdatingProvider(true);
    try {
      const { error } = await supabase
        .from('app_settings')
        .upsert({
          setting_key: 'education_provider',
          setting_value: { provider: newProvider },
          setting_category: 'system',
          description: 'Education vending provider: smeplug, vtpass, mobilenig, ebills.africa, or anyone'
        }, {
          onConflict: 'setting_key'
        });

      if (error) {
        throw error;
      }

      setEducationProvider(newProvider);
      toast({
        title: "Success",
        description: `Education provider updated to ${newProvider.toUpperCase()}`,
      });
    } catch (error) {
      console.error('Error updating education provider:', error);
      toast({
        title: "Error",
        description: "Failed to update education provider",
        variant: "destructive",
      });
    } finally {
      setIsUpdatingProvider(false);
    }
  };

  const fetchServices = useCallback(async () => {
    try {
      let query = supabase
        .from("education_services")
        .select("*");
      
      // Try to filter by vending_provider if column exists
      try {
        query = query.eq('vending_provider', educationProvider);
      } catch (e) {
        console.warn('Vending provider column may not exist, fetching all services');
      }
      
      const { data, error } = await query.order("exam_type", { ascending: true });

      if (error) {
        // If error is about missing column, try without provider filter
        if (error.code === '42703' || error.message?.includes('vending_provider')) {
          console.warn('Vending provider column not found, fetching all services');
          const { data: allData, error: allError } = await supabase
            .from("education_services")
            .select("*")
            .order("exam_type", { ascending: true });
          
          if (allError) throw allError;
          
          // Filter by vending_provider in memory if field exists
          const filtered = (allData || []).filter((service: any) => 
            !service.vending_provider || service.vending_provider === educationProvider
          );
          
          setServices(filtered);
          return;
        }
        throw error;
      }

      setServices(data || []);
    } catch (error: any) {
      console.error('Error fetching education services:', error);
      toast({
        title: "Error",
        description: error?.message || "Failed to fetch education services",
        variant: "destructive",
      });
      setServices([]);
    }
  }, [educationProvider, toast]);

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

  const openEditDialog = (service: EducationService) => {
    setEditingService(service);
    const originalPrice = service.original_price ?? service.price;
    const vendorPrice = service.vendor_price ?? originalPrice;
    const userPrice = service.user_price ?? service.custom_price ?? originalPrice;
    setEditForm({
      service_name: service.service_name,
      price: String(originalPrice),
      api_code: service.api_code?.toUpperCase?.() ?? "",
      service_id: service.service_id.toUpperCase(),
      custom_price: service.custom_price ? String(service.custom_price) : "",
      vendor_price: service.vendor_price ? String(service.vendor_price) : String(vendorPrice),
      user_price: service.user_price ? String(service.user_price) : String(userPrice),
      vtpass_code: service.vtpass_code || "",
      smeplug_code: service.smeplug_code || "",
      mobilenig_code: service.mobilenig_code || "",
      is_active: service.is_active ?? true
    });
    setIsEditDialogOpen(true);
  };

  const handleEditFormChange = (field: string, value: string) => {
    setEditForm(prev => ({ ...prev, [field]: value }));
  };

  const updateService = async () => {
    if (!editingService) return;

    if (!editForm.service_name.trim()) {
      toast({
        title: "Validation Error",
        description: "Service name cannot be empty",
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

    try {
      const customPriceValue = editForm.custom_price.trim();
      const customPriceNum = customPriceValue ? parseFloat(customPriceValue) : null;
      const isValidCustomPrice = customPriceNum !== null && !isNaN(customPriceNum) && customPriceNum >= 0;
      
      const updateData: any = {
        service_name: editForm.service_name.trim(),
        price: priceNum,
        api_code: editForm.api_code.trim(),
        service_id: editForm.service_id.trim().toUpperCase(),
      };
      
      // Update original_price and custom_price if columns exist
      updateData.original_price = priceNum;
      updateData.custom_price = isValidCustomPrice ? customPriceNum : null;

      // Add vendor-based fields if they exist
      const vendorPriceNum = editForm.vendor_price.trim() ? parseFloat(editForm.vendor_price) : null;
      if (vendorPriceNum !== null && !isNaN(vendorPriceNum) && vendorPriceNum >= 0) {
        updateData.vendor_price = vendorPriceNum;
      }
      const userPriceNum = editForm.user_price.trim() ? parseFloat(editForm.user_price) : null;
      if (userPriceNum !== null && !isNaN(userPriceNum) && userPriceNum >= 0) {
        updateData.user_price = userPriceNum;
      }
      if (editForm.vtpass_code.trim()) {
        updateData.vtpass_code = editForm.vtpass_code.trim().toUpperCase();
      }
      if (editForm.smeplug_code.trim()) {
        updateData.smeplug_code = editForm.smeplug_code.trim().toUpperCase();
      }
      if (editForm.mobilenig_code.trim()) {
        updateData.mobilenig_code = editForm.mobilenig_code.trim().toUpperCase();
      }
      updateData.is_active = editForm.is_active;
      
      let { error } = await supabase
        .from('education_services')
        .update(updateData)
        .eq('id', editingService.id);

      // If error is about missing columns, remove them and try again
      if (error && (
        error.code === '42703' ||
        error.message?.toLowerCase().includes('column') ||
        error.message?.toLowerCase().includes('does not exist')
      )) {
        console.warn('Some columns not found, updating without them:', error.message);
        const { original_price, custom_price, vendor_price, user_price, vtpass_code, smeplug_code, mobilenig_code, ...basicUpdateData } = updateData;
        const result = await supabase
          .from('education_services')
          .update(basicUpdateData)
          .eq('id', editingService.id);
        error = result.error;
      }

      if (error) throw error;

      await fetchServices();
      setIsEditDialogOpen(false);
      setEditingService(null);
      
      toast({
        title: "Success",
        description: "Education service updated successfully",
      });
    } catch (error) {
      console.error('Error updating service:', error);
      toast({
        title: "Error",
        description: "Failed to update education service",
        variant: "destructive",
      });
    }
  };

  const resetCustomPrice = async (serviceId: string) => {
    try {
      const { error } = await supabase
        .from('education_services')
        .update({ custom_price: null })
        .eq('id', serviceId);
      
      if (error) throw error;

      toast({
        title: "Success",
        description: "Custom price reset to original price",
      });

      await fetchServices();
    } catch (error: any) {
      console.error('Error resetting custom price:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to reset custom price",
        variant: "destructive",
      });
    }
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
    });
    setEditingService(null);
  };

  const fetchFromAPI = async (examType: string) => {
    setIsFetching(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('fetch-education-services', {
        body: { exam_type: examType, vending_provider: educationProvider }
      });

      if (error) throw error;

      if (!data.success) {
        toast({
          title: "Error",
          description: data.error || "Failed to fetch services from API",
          variant: "destructive",
        });
        return;
      }

      // Insert or update services in the database
      const servicesData = data.data;
      
      if (servicesData && servicesData.length > 0) {
        const { error: upsertError } = await supabase
          .from('education_services')
          .upsert(servicesData, { 
            onConflict: 'exam_type,service_id',
            ignoreDuplicates: false 
          });

        if (upsertError) {
          toast({
            title: "Error",
            description: "Failed to save services to database",
            variant: "destructive",
          });
          return;
        }

        toast({
          title: "Success",
          description: `Imported ${servicesData.length} ${examType} services successfully`,
        });

        fetchServices();
      } else {
        toast({
          title: "Info",
          description: `No ${examType} services found in API`,
        });
      }
    } catch (error) {
      console.error('Error fetching from API:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to fetch from API",
        variant: "destructive",
      });
    } finally {
      setIsFetching(false);
    }
  };

  const filteredServices = services.filter(
    (service) => {
      const matchesSearch = 
        service.exam_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
        service.service_name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFilter = !filterExamType || service.exam_type === filterExamType;
      return matchesSearch && matchesFilter;
    }
  );

  const groupedServices = filteredServices.reduce((acc, service) => {
    if (!acc[service.exam_type]) {
      acc[service.exam_type] = [];
    }
    acc[service.exam_type].push(service);
    return acc;
  }, {} as Record<string, EducationService[]>);

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
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                  <DialogTrigger asChild>
                    <Button onClick={resetForm} className="gap-2">
                      <Plus className="h-4 w-4" />
                      Add Service
                    </Button>
                  </DialogTrigger>
                <DialogContent className="sm:max-w-[500px]">
                  <DialogHeader>
                    <DialogTitle>
                      {editingService ? "Edit Education Service" : "Add New Education Service"}
                    </DialogTitle>
                    <DialogDescription>
                      Fill in the details for the education service
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleSubmit}>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <Label htmlFor="exam_type">Exam Type</Label>
                        <Select
                          value={formData.exam_type}
                          onValueChange={(value) =>
                            setFormData({
                              ...formData,
                              exam_type: value,
                              service_id: (
                                formData.service_id ||
                                DEFAULT_SERVICE_IDS[value] ||
                                ""
                              )
                                .toString()
                                .trim()
                                .toUpperCase(),
                              api_code: (
                                formData.api_code ||
                                DEFAULT_SERVICE_IDS[value] ||
                                ""
                              )
                                .toString()
                                .trim()
                                .toUpperCase(),
                            })
                          }
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
                        <Label htmlFor="service_name">Service Name</Label>
                        <Input
                          id="service_name"
                          value={formData.service_name}
                          onChange={(e) =>
                            setFormData({ ...formData, service_name: e.target.value })
                          }
                          placeholder="e.g. Result Checker PIN"
                          required
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="price">Price (₦)</Label>
                        <Input
                          id="price"
                          type="number"
                          step="0.01"
                          value={formData.price}
                          onChange={(e) =>
                            setFormData({ ...formData, price: e.target.value })
                          }
                          placeholder="e.g. 500.00"
                          required
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="service_id">Service ID</Label>
                        <Input
                          id="service_id"
                          value={formData.service_id}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              service_id: e.target.value.trim().toUpperCase(),
                              api_code:
                                (formData.api_code && formData.api_code.trim() !== ""
                                  ? formData.api_code
                                  : e.target.value
                                )
                                  .toString()
                                  .trim()
                                  .toUpperCase(),
                            })
                          }
                          placeholder="e.g. AJA"
                          required
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="is_active">Status</Label>
                        <Switch
                          id="is_active"
                          checked={formData.is_active}
                          onCheckedChange={(checked) =>
                            setFormData({ ...formData, is_active: checked })
                          }
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
                <CardTitle>Import Services from API</CardTitle>
                <CardDescription>
                  Fetch education services from API for each exam type
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 mb-4">
                  <Button
                    variant="outline"
                    onClick={async () => {
                      if (!confirm(`Are you sure you want to reset all custom prices for ${educationProvider.toUpperCase()}? This will restore all services to their original prices.`)) {
                        return;
                      }
                      try {
                        const { error } = await supabase
                          .from('education_services')
                          .update({ custom_price: null })
                          .eq('vending_provider', educationProvider);
                        
                        if (error && error.code !== '42703') {
                          // If vending_provider column doesn't exist, update all
                          const { error: updateError } = await supabase
                            .from('education_services')
                            .update({ custom_price: null });
                          
                          if (updateError) throw updateError;
                        } else if (error) {
                          throw error;
                        }

                        toast({
                          title: "Success",
                          description: `All custom prices reset for ${educationProvider.toUpperCase()}`,
                        });

                        await fetchServices();
                      } catch (error: any) {
                        console.error('Error resetting custom prices:', error);
                        toast({
                          title: "Error",
                          description: error.message || "Failed to reset custom prices",
                          variant: "destructive",
                        });
                      }
                    }}
                    className="flex items-center gap-2"
                    title="Reset all custom prices to original prices"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Reset All Prices
                  </Button>
                  <div className="flex items-center gap-3 bg-card border rounded-lg px-4 py-2">
                    <Label htmlFor="education-provider" className="text-sm font-medium">Vending Provider:</Label>
                    <Select
                      value={educationProvider}
                      onValueChange={(value) => {
                        updateEducationProvider(value as 'smeplug' | 'anyone' | 'vtpass' | 'mobilenig' | 'ebills.africa');
                      }}
                      disabled={isUpdatingProvider}
                    >
                      <SelectTrigger id="education-provider" className="w-[180px]">
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
                </div>
                <div className="flex gap-2">
                  {EXAM_TYPES.map((examType) => (
                    <Button
                      key={examType}
                      variant="outline"
                      onClick={() => fetchFromAPI(examType)}
                      disabled={isFetching}
                      className="gap-2"
                    >
                      <Download className="h-4 w-4" />
                      Import {examType}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Filter Badge */}
            {filterExamType && (
              <div className="mb-4 flex items-center gap-2">
                <Badge className="bg-brand text-white px-3 py-1.5 text-sm">
                  Showing: {filterExamType}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFilterExamType(null);
                    toast({
                      title: "Filter Cleared",
                      description: "Showing all exam types",
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
              {Object.entries(groupedServices).length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-16">
                    <p className="text-muted-foreground mb-4">
                      {filterExamType 
                        ? `No education services found for ${filterExamType}` 
                        : "No education services found"}
                    </p>
                    {filterExamType && (
                      <Button 
                        variant="outline"
                        onClick={() => setFilterExamType(null)}
                        className="mt-2"
                      >
                        <X className="h-4 w-4 mr-2" />
                        Clear Filter
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ) : (
                Object.entries(groupedServices).map(([examType, examServices]) => (
                <Card key={examType}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <img 
                        src={getEducationLogo(examType)} 
                        alt={examType}
                        className="w-6 h-6 object-contain"
                      />
                      <Badge 
                        variant="outline"
                        className="cursor-pointer hover:bg-accent"
                        onClick={() => {
                          if (filterExamType === examType) {
                            setFilterExamType(null);
                          } else {
                            setFilterExamType(examType);
                            toast({
                              title: "Filter Applied",
                              description: `Showing only ${examType} services`,
                            });
                          }
                        }}
                      >
                        {examType}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        ({examServices.length} services)
                      </span>
                    </CardTitle>
                    <CardDescription>Available education services for {examType}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Service Name</TableHead>
                            <TableHead>Original Price</TableHead>
                            <TableHead>Custom Price</TableHead>
                            <TableHead className="font-semibold">User Pays</TableHead>
                            <TableHead>Service ID</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {examServices.map((service) => {
                            const effectivePrice = service.custom_price ?? service.original_price ?? service.price;
                            const originalPrice = service.original_price ?? service.price;
                            const hasCustomPrice = !!service.custom_price;
                            return (
                              <TableRow key={service.id}>
                                <TableCell className="font-medium">{service.service_name}</TableCell>
                                <TableCell>₦{originalPrice.toFixed(2)}</TableCell>
                                <TableCell>
                                  {hasCustomPrice ? (
                                    <span className="text-primary font-medium">₦{service.custom_price!.toFixed(2)}</span>
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
                                <TableCell className="font-mono text-sm">{service.service_id}</TableCell>
                                <TableCell>
                                  <Badge variant={service.is_active ? "default" : "secondary"}>
                                    {service.is_active ? "Active" : "Inactive"}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => openEditDialog(service)}
                                      title="Edit service"
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    {service.custom_price && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => resetCustomPrice(service.id)}
                                        title="Reset to original price"
                                      >
                                        <RotateCcw className="h-4 w-4 text-orange-600" />
                                      </Button>
                                    )}
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleDelete(service.id)}
                                      title="Delete service"
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

              {services.length === 0 && !filterExamType && (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-16">
                    <p className="text-muted-foreground mb-4">No education services found</p>
                    <Button onClick={() => setIsDialogOpen(true)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Service
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Edit Service Dialog */}
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Edit Education Service</DialogTitle>
                  <DialogDescription>
                    Update the education service details below
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-service-name">Service Name</Label>
                    <Input
                      id="edit-service-name"
                      value={editForm.service_name}
                      onChange={(e) => handleEditFormChange('service_name', e.target.value)}
                      placeholder="e.g., Result Checker PIN"
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
                    <Label htmlFor="edit-service-id">Service ID</Label>
                    <Input
                      id="edit-service-id"
                      value={editForm.service_id}
                      onChange={(e) => handleEditFormChange('service_id', e.target.value.toUpperCase())}
                      placeholder="e.g., AJA"
                      maxLength={100}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-api-code">API Code (Legacy)</Label>
                    <Input
                      id="edit-api-code"
                      value={editForm.api_code}
                      onChange={(e) => handleEditFormChange('api_code', e.target.value.toUpperCase())}
                      placeholder="e.g., WAEC-RESULT-CHECKER"
                      maxLength={100}
                    />
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
                          onChange={(e) => handleEditFormChange('vtpass_code', e.target.value.toUpperCase())}
                          placeholder="VTpass code"
                          className="text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="edit-smeplug-code" className="text-xs">SMEPlug Code</Label>
                        <Input
                          id="edit-smeplug-code"
                          value={editForm.smeplug_code}
                          onChange={(e) => handleEditFormChange('smeplug_code', e.target.value.toUpperCase())}
                          placeholder="SMEPlug code"
                          className="text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="edit-mobilenig-code" className="text-xs">Mobilenig Code</Label>
                        <Input
                          id="edit-mobilenig-code"
                          value={editForm.mobilenig_code}
                          onChange={(e) => handleEditFormChange('mobilenig_code', e.target.value.toUpperCase())}
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
                      Service is active
                    </Label>
                  </div>
                  <Button 
                    onClick={updateService} 
                    className="w-full"
                  >
                    Save Changes
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
