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
  const [formData, setFormData] = useState({
    exam_type: "",
    service_name: "",
    price: "",
    api_code: "",
    service_id: "",
    is_active: true,
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchServices();
  }, []);

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
    });
    setEditingService(null);
  };

  const fetchFromAPI = async (examType: string) => {
    setIsFetching(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('fetch-education-services', {
        body: { exam_type: examType }
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
                  Fetch education services from MobileNig API for each exam type
                </CardDescription>
              </CardHeader>
              <CardContent>
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
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredServices.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">
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
