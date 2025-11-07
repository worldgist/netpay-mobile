import { useState, useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<CableTvPlan | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string>("DSTV");
  const [isFetching, setIsFetching] = useState(false);
  const [formData, setFormData] = useState({
    provider: "",
    package_name: "",
    price: "",
    custom_price: "",
    api_code: "",
    is_active: true,
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast({
          title: "Authentication Required",
          description: "Please log in to view cable TV plans",
          variant: "destructive",
        });
        return;
      }

      const { data, error } = await supabase
        .from("cable_tv_plans")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error('Error fetching cable TV plans:', error);
        toast({
          title: "Error",
          description: error.message || "Failed to fetch cable TV plans. Please check if you have admin access.",
          variant: "destructive",
        });
        return;
      }

      setPlans(data || []);
    } catch (err: any) {
      console.error('Unexpected error fetching plans:', err);
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

      console.log('Fetching cable packages for provider:', selectedProvider);

      const { data, error } = await supabase.functions.invoke('fetch-cable-packages', {
        body: { provider: selectedProvider },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      console.log('Response from fetch-cable-packages:', { data, error });

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

      if (!data.data || data.data.length === 0) {
        toast({
          title: "No Packages Found",
          description: `No packages available for ${selectedProvider}`,
        });
        return;
      }

      // Insert packages into database
      const packagesWithOriginalPrice = data.data.map((pkg: any) => ({
        ...pkg,
        original_price: pkg.price,
      }));

      console.log('Upserting packages:', packagesWithOriginalPrice);

      const { error: insertError } = await supabase
        .from('cable_tv_plans')
        .upsert(packagesWithOriginalPrice, { 
          onConflict: 'api_code',
        });

      if (insertError) {
        console.error('Database insert error:', insertError);
        throw insertError;
      }

      toast({
        title: "Success",
        description: `Successfully fetched ${data.data.length} packages from ${selectedProvider}`,
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

    fetchPlans();
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
    fetchPlans();
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

    fetchPlans();
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

              <div className="flex gap-2">
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
                  Manage cable TV packages across different providers
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
