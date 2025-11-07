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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatNaira } from "@/lib/currency";
import { Plus, Trash2, RefreshCw, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface DataPlan {
  id: string;
  network: string;
  plan_name: string;
  price: number;
  validity: string;
  api_code: string;
  created_at: string;
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
    api_code: ""
  });

  useEffect(() => {
    checkAdminAndFetch();
  }, [navigate]);

  const checkAdminAndFetch = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        navigate('/auth');
        return;
      }

      // Check if user is admin
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

      await Promise.all([fetchDataPlans(), fetchNetworks()]);
      setLoading(false);
    } catch (error) {
      console.error('Error:', error);
      setLoading(false);
    }
  };

  const fetchDataPlans = async () => {
    try {
      const { data, error } = await supabase
        .from('data_plans')
        .select('*')
        .order('network', { ascending: true })
        .order('price', { ascending: true });

      if (error) throw error;
      setDataPlans(data || []);
    } catch (error) {
      console.error('Error fetching data plans:', error);
      toast({
        title: "Error",
        description: "Failed to load data plans",
        variant: "destructive",
      });
    }
  };

  const fetchNetworks = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('fetch-smeplug-networks');
      
      if (error) throw error;
      
      if (data?.success && data?.data) {
        setNetworks(data.data);
      }
    } catch (error) {
      console.error('Error fetching networks:', error);
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
      if (!network) return;

      const { data, error } = await supabase.functions.invoke('fetch-smeplug-data-plans', {
        body: { network_id: network.network_id }
      });

      if (error) throw error;

      if (data?.success) {
        // Normalize various possible response shapes into an array
        const raw = (data as any)?.data;
        let plansArray: any[] = [];

        if (Array.isArray(raw)) {
          plansArray = raw;
        } else if (raw && typeof raw === 'object') {
          const keyed = (raw as any)[network.network_id] ?? (raw as any)[String(network.network_id)];
          if (Array.isArray(keyed)) {
            plansArray = keyed;
          } else if (Array.isArray((raw as any).plans)) {
            plansArray = (raw as any).plans;
          } else {
            const values = Object.values(raw as any);
            const arrays = values.filter((v) => Array.isArray(v)) as any[];
            if (arrays.length) {
              // Fallback: flatten all arrays (may include other networks if provider returns mixed data)
              plansArray = arrays.flat();
            } else {
              plansArray = values.filter((v) => v && typeof v === 'object') as any[];
            }
          }
        } else if (Array.isArray((data as any).plans)) {
          plansArray = (data as any).plans;
        }

        if (!plansArray.length) {
          toast({
            title: 'No Plans Found',
            description: 'The provider returned no plans for this network.',
          });
          return;
        }

        const plansToInsert = plansArray.map((plan: any) => ({
          network: network.name,
          plan_name: plan.plan || plan.name || plan.title || 'Unknown Plan',
          price: parseFloat(plan.price) || parseFloat(plan.amount) || 0,
          validity: plan.validity || plan.duration || plan.validity_period || 'N/A',
          api_code: String(plan.id || plan.plan_id || plan.code || ''),
        }));

        const { error: insertError } = await supabase
          .from('data_plans')
          .upsert(plansToInsert, { 
            onConflict: 'api_code',
            ignoreDuplicates: false 
          });

        if (insertError) throw insertError;

        await fetchDataPlans();
        setIsDialogOpen(false);
        
        toast({
          title: "Success",
          description: `Imported ${plansToInsert.length} data plans from ${network.name}`,
        });
      }
    } catch (error: any) {
      console.error('Error fetching plans from API:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to fetch plans from API",
        variant: "destructive",
      });
    } finally {
      setIsFetching(false);
    }
  };

  const openEditDialog = (plan: DataPlan) => {
    setEditingPlan(plan);
    setEditForm({
      plan_name: plan.plan_name,
      price: String(plan.price),
      validity: plan.validity,
      api_code: plan.api_code
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
      const { error } = await supabase
        .from('data_plans')
        .update({
          plan_name: editForm.plan_name.trim(),
          price: priceNum,
          validity: editForm.validity.trim(),
          api_code: editForm.api_code.trim(),
        })
        .eq('id', editingPlan.id);

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
                  <p className="text-muted-foreground">Manage data plans from SMEPLUG API</p>
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
                      <DialogTitle>Import Data Plans from SMEPLUG</DialogTitle>
                      <DialogDescription>
                        Select a network to fetch and import their data plans
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

            <div className="space-y-6">
              {Object.entries(groupedPlans).map(([network, plans]) => (
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
                            <TableHead>Price</TableHead>
                            <TableHead>Validity</TableHead>
                            <TableHead>API Code</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {plans.map((plan) => (
                            <TableRow key={plan.id}>
                              <TableCell className="font-medium">{plan.plan_name}</TableCell>
                              <TableCell>{formatNaira(plan.price)}</TableCell>
                              <TableCell>{plan.validity}</TableCell>
                              <TableCell className="font-mono text-sm">{plan.api_code}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openEditDialog(plan)}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => deletePlan(plan.id)}
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
                  </CardContent>
                </Card>
              ))}

              {dataPlans.length === 0 && (
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
                    <Label htmlFor="edit-price">Price (₦)</Label>
                    <Input
                      id="edit-price"
                      type="number"
                      step="0.01"
                      min="0"
                      value={editForm.price}
                      onChange={(e) => handleEditFormChange('price', e.target.value)}
                      placeholder="e.g., 500"
                    />
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
                    <Label htmlFor="edit-api-code">API Code</Label>
                    <Input
                      id="edit-api-code"
                      value={editForm.api_code}
                      onChange={(e) => handleEditFormChange('api_code', e.target.value)}
                      placeholder="e.g., MTN-1GB-DAILY"
                      maxLength={100}
                    />
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
