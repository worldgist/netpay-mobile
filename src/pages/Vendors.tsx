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
import { Plus, Trash2, RefreshCw, Pencil, X, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Vendor {
  id: number;
  name: string;
  base_url: string;
  api_key?: string | null;
  secret?: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

const Vendors = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [form, setForm] = useState({
    name: "",
    base_url: "",
    api_key: "",
    secret: "",
    status: "active"
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

      await fetchVendors();
      setLoading(false);
    } catch (error) {
      console.error('Error in checkAdminAndFetch:', error);
      setLoading(false);
    }
  }, [navigate, toast]);

  useEffect(() => {
    checkAdminAndFetch();
  }, [checkAdminAndFetch]);

  const fetchVendors = async () => {
    try {
      const { data, error } = await supabase
        .from('vendors')
        .select('*')
        .order('id', { ascending: true });

      if (error) throw error;
      setVendors(data || []);
    } catch (error: any) {
      console.error('Error fetching vendors:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to load vendors",
        variant: "destructive",
      });
    }
  };

  const openEditDialog = (vendor: Vendor) => {
    setEditingVendor(vendor);
    setForm({
      name: vendor.name,
      base_url: vendor.base_url,
      api_key: vendor.api_key || "",
      secret: vendor.secret || "",
      status: vendor.status
    });
    setIsEditDialogOpen(true);
  };

  const handleFormChange = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const updateVendor = async () => {
    if (!editingVendor) return;

    if (!form.name.trim() || !form.base_url.trim()) {
      toast({
        title: "Validation Error",
        description: "Name and Base URL are required",
        variant: "destructive",
      });
      return;
    }

    try {
      const updateData: any = {
        name: form.name.trim(),
        base_url: form.base_url.trim(),
        status: form.status,
      };

      // Only update credentials if provided
      if (form.api_key.trim()) {
        updateData.api_key = form.api_key.trim();
      }
      if (form.secret.trim()) {
        updateData.secret = form.secret.trim();
      }

      const { error } = await supabase
        .from('vendors')
        .update(updateData)
        .eq('id', editingVendor.id);

      if (error) throw error;

      await fetchVendors();
      setIsEditDialogOpen(false);
      setEditingVendor(null);
      
      toast({
        title: "Success",
        description: "Vendor updated successfully",
      });
    } catch (error: any) {
      console.error('Error updating vendor:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to update vendor",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const colors = {
      active: "bg-green-500",
      inactive: "bg-gray-500",
      suspended: "bg-red-500"
    };
    return (
      <Badge className={colors[status as keyof typeof colors] || "bg-gray-500"}>
        {status}
      </Badge>
    );
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
              <div className="flex-1">
                <h1 className="text-3xl font-bold">Vendor Management</h1>
                <p className="text-muted-foreground">
                  Manage data vending vendors and their credentials
                </p>
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Vendors</CardTitle>
                <CardDescription>Configure vendor credentials and status</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Base URL</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Has API Key</TableHead>
                        <TableHead>Has Secret</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {vendors.map((vendor) => (
                        <TableRow key={vendor.id}>
                          <TableCell>{vendor.id}</TableCell>
                          <TableCell className="font-medium">{vendor.name}</TableCell>
                          <TableCell className="font-mono text-sm">{vendor.base_url}</TableCell>
                          <TableCell>{getStatusBadge(vendor.status)}</TableCell>
                          <TableCell>{vendor.api_key ? '✓' : '✗'}</TableCell>
                          <TableCell>{vendor.secret ? '✓' : '✗'}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditDialog(vendor)}
                              title="Edit vendor"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Edit Vendor Dialog */}
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit Vendor</DialogTitle>
                  <DialogDescription>
                    Update vendor credentials and status
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-name">Name</Label>
                    <Input
                      id="edit-name"
                      value={form.name}
                      onChange={(e) => handleFormChange('name', e.target.value)}
                      disabled
                      className="bg-muted"
                    />
                    <p className="text-xs text-muted-foreground">Vendor name cannot be changed</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-base-url">Base URL</Label>
                    <Input
                      id="edit-base-url"
                      value={form.base_url}
                      onChange={(e) => handleFormChange('base_url', e.target.value)}
                      placeholder="https://api.vendor.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-api-key">API Key</Label>
                    <Input
                      id="edit-api-key"
                      type="password"
                      value={form.api_key}
                      onChange={(e) => handleFormChange('api_key', e.target.value)}
                      placeholder="Leave empty to keep existing"
                    />
                    <p className="text-xs text-muted-foreground">Leave empty to keep existing API key</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-secret">Secret Key</Label>
                    <Input
                      id="edit-secret"
                      type="password"
                      value={form.secret}
                      onChange={(e) => handleFormChange('secret', e.target.value)}
                      placeholder="Leave empty to keep existing"
                    />
                    <p className="text-xs text-muted-foreground">Leave empty to keep existing secret</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-status">Status</Label>
                    <Select value={form.status} onValueChange={(value) => handleFormChange('status', value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                        <SelectItem value="suspended">Suspended</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={updateVendor} className="w-full">
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

export default Vendors;

