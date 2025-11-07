import { useState, useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, Plus, Pencil, Trash2, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface ElectricityService {
  id: string;
  provider: string;
  package_name: string;
  price: number;
  api_code: string;
  original_price?: number | null;
  custom_price?: number | null;
  is_active: boolean;
}

export default function ElectricityPlans() {
  const [searchQuery, setSearchQuery] = useState("");
  const [plans, setPlans] = useState<ElectricityService[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<ElectricityService | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [formData, setFormData] = useState({
    provider: "",
    package_name: "",
    price: "",
    api_code: "",
    custom_price: "",
    is_active: true,
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      const { data, error } = await supabase
        .from("electricity_plans")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        toast({
          title: "Error",
          description: error.message || "Failed to fetch electricity plans",
          variant: "destructive",
        });
        return;
      }

      setPlans(data || []);
    } catch (err: any) {
      console.error('Error fetching plans:', err);
      toast({
        title: "Error",
        description: err.message || "An unexpected error occurred",
        variant: "destructive",
      });
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

      console.log('Fetching electricity packages for all providers...');

      const { data, error } = await supabase.functions.invoke('fetch-electricity-packages', {
        body: {}, // No provider specified = fetch all
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      console.log('Response from fetch-electricity-packages:', { data, error });

      if (error) {
        console.error('Edge function error:', error);
        throw error;
      }

      if (!data?.success) {
        toast({
          title: "API Error",
          description: data?.error || "Failed to fetch packages from API",
          variant: "destructive",
        });
        return;
      }

      if (!data.packages || data.packages.length === 0) {
        toast({
          title: "No Packages Found",
          description: "No packages available from any provider",
        });
        return;
      }

      // Insert packages into database
      const packagesWithOriginalPrice = data.packages.map((pkg: any) => ({
        ...pkg,
        original_price: pkg.price,
      }));

      console.log('Upserting packages:', packagesWithOriginalPrice);

      // Check existing packages and update or insert
      for (const pkg of packagesWithOriginalPrice) {
        const { data: existing } = await supabase
          .from('electricity_plans')
          .select('id')
          .eq('provider', pkg.provider)
          .eq('api_code', pkg.api_code)
          .maybeSingle();

        if (existing) {
          // Update existing
          const { error: updateError } = await supabase
            .from('electricity_plans')
            .update({
              package_name: pkg.package_name,
              price: pkg.price,
              original_price: pkg.original_price,
            })
            .eq('id', existing.id);

          if (updateError) {
            console.error('Error updating package:', updateError);
          }
        } else {
          // Insert new
          const { error: insertError } = await supabase
            .from('electricity_plans')
            .insert(pkg);

          if (insertError) {
            console.error('Error inserting package:', insertError);
          }
        }
      }

      // Show summary of fetched packages
      const providerCounts = data.results ? 
        Object.entries(data.results)
          .filter(([_, result]: [string, any]) => result.success)
          .map(([prov, result]: [string, any]) => `${prov} (${result.count})`)
          .join(', ') : '';

      toast({
        title: "Success",
        description: `Successfully fetched ${data.packages.length} packages from ${data.providers?.length || 'all'} provider(s)`,
      });

      await fetchPlans();
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const planData = {
      provider: formData.provider,
      package_name: formData.package_name,
      price: parseFloat(formData.price),
      api_code: formData.api_code,
      custom_price: formData.custom_price ? parseFloat(formData.custom_price) : null,
      is_active: formData.is_active,
    };

    if (editingPlan) {
      const { error } = await supabase
        .from("electricity_plans")
        .update(planData)
        .eq("id", editingPlan.id);

      if (error) {
        toast({
          title: "Error",
          description: "Failed to update electricity plan",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Success",
        description: "Electricity plan updated successfully",
      });
    } else {
      const { error } = await supabase.from("electricity_plans").insert(planData);

      if (error) {
        toast({
          title: "Error",
          description: "Failed to create electricity plan",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Success",
        description: "Electricity plan created successfully",
      });
    }

    setIsDialogOpen(false);
    resetForm();
    fetchPlans();
  };

  const handleEdit = (plan: ElectricityService) => {
    setEditingPlan(plan);
    setFormData({
      provider: plan.provider,
      package_name: plan.package_name,
      price: plan.price.toString(),
      api_code: plan.api_code,
      custom_price: plan.custom_price?.toString() || "",
      is_active: plan.is_active,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("electricity_plans").delete().eq("id", id);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to delete electricity plan",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Success",
      description: "Electricity plan deleted successfully",
    });

    fetchPlans();
  };

  const resetForm = () => {
    setFormData({
      provider: "",
      package_name: "",
      price: "",
      api_code: "",
      custom_price: "",
      is_active: true,
    });
    setEditingPlan(null);
  };

  const getEffectivePrice = (plan: ElectricityService) => {
    return plan.custom_price ?? plan.original_price ?? plan.price;
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
              <h1 className="text-2xl font-bold">Electricity Services Management</h1>
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
                <Button
                  onClick={fetchFromAPI}
                  disabled={isFetching}
                  variant="outline"
                  className="gap-2"
                >
                  <Download className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
                  {isFetching ? 'Fetching All Providers...' : 'Fetch All from API'}
                </Button>
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
                      {editingPlan ? "Edit Electricity Service" : "Add New Electricity Service"}
                    </DialogTitle>
                    <DialogDescription>
                      Fill in the details for the electricity service
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
                          placeholder="e.g. EKEDC, IKEDC, AEDC"
                          required
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="package_name">Meter Type</Label>
                        <Input
                          id="package_name"
                          value={formData.package_name}
                          onChange={(e) =>
                            setFormData({ ...formData, package_name: e.target.value })
                          }
                          placeholder="e.g. Prepaid, Postpaid"
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
                          placeholder="e.g. 1000.00"
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
                          placeholder="e.g. EKEDC-PREPAID"
                          required
                        />
                      </div>
                      <div className="flex items-center justify-between">
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
                        {editingPlan ? "Update Service" : "Add Service"}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>

            <Card>
              <CardHeader>
                <CardTitle>All Electricity Services</CardTitle>
                <CardDescription>
                  Manage electricity services across different providers
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Provider</TableHead>
                      <TableHead>Meter Type</TableHead>
                      <TableHead>Original Price</TableHead>
                      <TableHead>Custom Price</TableHead>
                      <TableHead>Effective Price</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>API Code</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPlans.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground">
                          No electricity services found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredPlans.map((plan) => (
                        <TableRow key={plan.id} className={!plan.is_active ? "opacity-50" : ""}>
                          <TableCell className="font-medium">{plan.provider}</TableCell>
                          <TableCell>{plan.package_name}</TableCell>
                          <TableCell>
                            ₦{(plan.original_price || plan.price).toFixed(2)}
                          </TableCell>
                          <TableCell>
                            {plan.custom_price ? `₦${plan.custom_price.toFixed(2)}` : "-"}
                          </TableCell>
                          <TableCell className="font-semibold">
                            ₦{getEffectivePrice(plan).toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              plan.is_active 
                                ? "bg-green-100 text-green-800" 
                                : "bg-gray-100 text-gray-800"
                            }`}>
                              {plan.is_active ? "Active" : "Inactive"}
                            </span>
                          </TableCell>
                          <TableCell className="font-mono text-sm">{plan.api_code}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
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
