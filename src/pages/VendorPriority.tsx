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
import { Plus, Trash2, Pencil, X, Save, ArrowUp, ArrowDown, GripVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface VendorPriority {
  id: string;
  network: string;
  plan_type: string;
  vendor_order: string[];
  created_at: string;
  updated_at: string;
}

const NETWORKS = ['MTN', 'AIRTEL', 'GLO', '9MOBILE'];
const PLAN_TYPES = ['SME', 'Gifting', 'VTU', 'Corporate', 'Direct'];
const VENDORS = ['vtpass', 'smeplug', 'mobilenig'];

const VendorPriority = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [priorities, setPriorities] = useState<VendorPriority[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingPriority, setEditingPriority] = useState<VendorPriority | null>(null);
  const [form, setForm] = useState({
    network: "",
    plan_type: "",
    vendor_order: ['vtpass', 'smeplug', 'mobilenig'] as string[]
  });

  const checkAdminAndFetch = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        setLoading(false);
        navigate('/auth');
        return;
      }

      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', session.user.id)
        .eq('role', 'admin')
        .maybeSingle();

      if (!roles) {
        setLoading(false);
        toast({
          title: "Access Denied",
          description: "You don't have permission to access this page",
          variant: "destructive",
        });
        navigate('/dashboard');
        return;
      }

      await fetchPriorities();
      setLoading(false);
    } catch (error) {
      console.error('Error in checkAdminAndFetch:', error);
      setLoading(false);
    }
  }, [navigate, toast]);

  useEffect(() => {
    checkAdminAndFetch();
  }, [checkAdminAndFetch]);

  const fetchPriorities = async () => {
    try {
      const { data, error } = await supabase
        .from('vendor_priority')
        .select('*')
        .order('network', { ascending: true })
        .order('plan_type', { ascending: true });

      if (error) throw error;
      setPriorities(data || []);
    } catch (error: any) {
      console.error('Error fetching vendor priorities:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to load vendor priorities",
        variant: "destructive",
      });
    }
  };

  const openEditDialog = (priority: VendorPriority) => {
    setEditingPriority(priority);
    setForm({
      network: priority.network,
      plan_type: priority.plan_type,
      vendor_order: [...priority.vendor_order]
    });
    setIsEditDialogOpen(true);
  };

  const openNewDialog = () => {
    setEditingPriority(null);
    setForm({
      network: "",
      plan_type: "",
      vendor_order: ['vtpass', 'smeplug', 'mobilenig']
    });
    setIsDialogOpen(true);
  };

  const moveVendor = (index: number, direction: 'up' | 'down') => {
    const newOrder = [...form.vendor_order];
    if (direction === 'up' && index > 0) {
      [newOrder[index], newOrder[index - 1]] = [newOrder[index - 1], newOrder[index]];
    } else if (direction === 'down' && index < newOrder.length - 1) {
      [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
    }
    setForm({ ...form, vendor_order: newOrder });
  };

  const removeVendor = (index: number) => {
    const newOrder = form.vendor_order.filter((_, i) => i !== index);
    setForm({ ...form, vendor_order: newOrder });
  };

  const addVendor = (vendor: string) => {
    if (!form.vendor_order.includes(vendor)) {
      setForm({ ...form, vendor_order: [...form.vendor_order, vendor] });
    }
  };

  const savePriority = async () => {
    if (!form.network.trim() || !form.plan_type.trim()) {
      toast({
        title: "Validation Error",
        description: "Network and Plan Type are required",
        variant: "destructive",
      });
      return;
    }

    if (form.vendor_order.length === 0) {
      toast({
        title: "Validation Error",
        description: "At least one vendor must be selected",
        variant: "destructive",
      });
      return;
    }

    try {
      if (editingPriority) {
        // Update existing
        const { error } = await supabase
          .from('vendor_priority')
          .update({
            vendor_order: form.vendor_order,
            network: form.network,
            plan_type: form.plan_type
          })
          .eq('id', editingPriority.id);

        if (error) throw error;
        toast({
          title: "Success",
          description: "Vendor priority updated successfully",
        });
      } else {
        // Insert new
        const { error } = await supabase
          .from('vendor_priority')
          .insert({
            network: form.network,
            plan_type: form.plan_type,
            vendor_order: form.vendor_order
          });

        if (error) {
          if (error.code === '23505') {
            throw new Error('Priority already exists for this network and plan type');
          }
          throw error;
        }
        toast({
          title: "Success",
          description: "Vendor priority created successfully",
        });
      }

      await fetchPriorities();
      setIsDialogOpen(false);
      setIsEditDialogOpen(false);
      setEditingPriority(null);
    } catch (error: any) {
      console.error('Error saving vendor priority:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to save vendor priority",
        variant: "destructive",
      });
    }
  };

  const deletePriority = async (id: string) => {
    if (!confirm('Are you sure you want to delete this vendor priority?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('vendor_priority')
        .delete()
        .eq('id', id);

      if (error) throw error;

      await fetchPriorities();
      toast({
        title: "Success",
        description: "Vendor priority deleted successfully",
      });
    } catch (error: any) {
      console.error('Error deleting vendor priority:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete vendor priority",
        variant: "destructive",
      });
    }
  };

  const getNetworkColor = (network: string) => {
    const colors: Record<string, string> = {
      'MTN': 'bg-yellow-500',
      'AIRTEL': 'bg-red-500',
      'GLO': 'bg-green-500',
      '9MOBILE': 'bg-emerald-600'
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
                  <h1 className="text-3xl font-bold">Vendor Priority Management</h1>
                  <p className="text-muted-foreground">
                    Configure vendor fallback order for each network and plan type
                  </p>
                </div>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                  <DialogTrigger asChild>
                    <Button onClick={openNewDialog}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Priority
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Add Vendor Priority</DialogTitle>
                      <DialogDescription>
                        Set the fallback order for vendors for a network and plan type combination
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="new-network">Network</Label>
                          <Select value={form.network} onValueChange={(value) => setForm({ ...form, network: value })}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select network" />
                            </SelectTrigger>
                            <SelectContent>
                              {NETWORKS.map(network => (
                                <SelectItem key={network} value={network}>{network}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="new-plan-type">Plan Type</Label>
                          <Select value={form.plan_type} onValueChange={(value) => setForm({ ...form, plan_type: value })}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select plan type" />
                            </SelectTrigger>
                            <SelectContent>
                              {PLAN_TYPES.map(type => (
                                <SelectItem key={type} value={type}>{type}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Vendor Order (Fallback Priority)</Label>
                        <p className="text-xs text-muted-foreground mb-2">
                          Vendors will be tried in this order. First vendor will be tried first, then second if first fails, etc.
                        </p>
                        <div className="space-y-2 border rounded-lg p-4">
                          {form.vendor_order.map((vendor, index) => (
                            <div key={index} className="flex items-center gap-2 p-2 bg-muted rounded">
                              <span className="font-mono text-sm w-8 text-center">{index + 1}</span>
                              <Badge>{vendor}</Badge>
                              <div className="flex-1" />
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => moveVendor(index, 'up')}
                                disabled={index === 0}
                                className="h-7 w-7 p-0"
                              >
                                <ArrowUp className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => moveVendor(index, 'down')}
                                disabled={index === form.vendor_order.length - 1}
                                className="h-7 w-7 p-0"
                              >
                                <ArrowDown className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => removeVendor(index)}
                                className="h-7 w-7 p-0 text-destructive"
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          {VENDORS.filter(v => !form.vendor_order.includes(v)).map(vendor => (
                            <Button
                              key={vendor}
                              variant="outline"
                              size="sm"
                              onClick={() => addVendor(vendor)}
                            >
                              <Plus className="mr-1 h-3 w-3" />
                              {vendor}
                            </Button>
                          ))}
                        </div>
                      </div>
                      <Button onClick={savePriority} className="w-full">
                        <Save className="mr-2 h-4 w-4" />
                        Save Priority
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Vendor Priorities</CardTitle>
                <CardDescription>Configure fallback order for each network and plan type</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Network</TableHead>
                        <TableHead>Plan Type</TableHead>
                        <TableHead>Priority Order</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {priorities.map((priority) => (
                        <TableRow key={priority.id}>
                          <TableCell>
                            <Badge className={getNetworkColor(priority.network)}>
                              {priority.network}
                            </Badge>
                          </TableCell>
                          <TableCell>{priority.plan_type}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {priority.vendor_order.map((vendor, idx) => (
                                <div key={idx} className="flex items-center gap-1">
                                  <Badge variant="outline">{vendor}</Badge>
                                  {idx < priority.vendor_order.length - 1 && (
                                    <span className="text-muted-foreground">→</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEditDialog(priority)}
                                title="Edit priority"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => deletePriority(priority.id)}
                                title="Delete priority"
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

            {/* Edit Dialog */}
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Edit Vendor Priority</DialogTitle>
                  <DialogDescription>
                    Update the fallback order for vendors
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-network">Network</Label>
                      <Input
                        id="edit-network"
                        value={form.network}
                        disabled
                        className="bg-muted"
                      />
                      <p className="text-xs text-muted-foreground">Network cannot be changed</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-plan-type">Plan Type</Label>
                      <Input
                        id="edit-plan-type"
                        value={form.plan_type}
                        disabled
                        className="bg-muted"
                      />
                      <p className="text-xs text-muted-foreground">Plan type cannot be changed</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Vendor Order (Fallback Priority)</Label>
                    <p className="text-xs text-muted-foreground mb-2">
                      Vendors will be tried in this order. Drag to reorder or use arrows.
                    </p>
                    <div className="space-y-2 border rounded-lg p-4">
                      {form.vendor_order.map((vendor, index) => (
                        <div key={index} className="flex items-center gap-2 p-2 bg-muted rounded">
                          <span className="font-mono text-sm w-8 text-center">{index + 1}</span>
                          <Badge>{vendor}</Badge>
                          <div className="flex-1" />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => moveVendor(index, 'up')}
                            disabled={index === 0}
                            className="h-7 w-7 p-0"
                          >
                            <ArrowUp className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => moveVendor(index, 'down')}
                            disabled={index === form.vendor_order.length - 1}
                            className="h-7 w-7 p-0"
                          >
                            <ArrowDown className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeVendor(index)}
                            className="h-7 w-7 p-0 text-destructive"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      {VENDORS.filter(v => !form.vendor_order.includes(v)).map(vendor => (
                        <Button
                          key={vendor}
                          variant="outline"
                          size="sm"
                          onClick={() => addVendor(vendor)}
                        >
                          <Plus className="mr-1 h-3 w-3" />
                          {vendor}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <Button onClick={savePriority} className="w-full">
                    <Save className="mr-2 h-4 w-4" />
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

export default VendorPriority;

