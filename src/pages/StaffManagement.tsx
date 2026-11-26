import { useState, useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Users, UserPlus, Shield, CheckSquare, Activity, Circle, Search } from "lucide-react";

interface StaffRole {
  id: string;
  role_name: string;
  role_description: string | null;
  permissions: any;
  can_manage_users: boolean;
  can_manage_transactions: boolean;
  can_manage_content: boolean;
  can_view_analytics: boolean;
  can_manage_staff: boolean;
  can_manage_settings: boolean;
  is_active: boolean;
}

interface StaffDuty {
  id: string;
  role_id: string;
  duty_title: string;
  duty_description: string;
  priority: string;
  is_mandatory: boolean;
}

interface StaffMember {
  id: string;
  user_id: string;
  role_id: string;
  employee_id: string;
  department: string;
  hire_date: string;
  employment_status: string;
  supervisor_id: string | null;
  notes: string | null;
  created_at: string;
  profiles?: {
    full_name: string;
    email: string;
    phone: string;
  };
  staff_roles?: {
    role_name: string;
  };
}

interface ActivityLog {
  id: string;
  staff_id: string;
  activity_type: string;
  activity_description: string;
  created_at: string;
  staff_members?: {
    profiles?: {
      full_name: string;
    };
  };
}

export default function StaffManagement() {
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [roles, setRoles] = useState<StaffRole[]>([]);
  const [duties, setDuties] = useState<StaffDuty[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [selectedRole, setSelectedRole] = useState<StaffRole | null>(null);
  const [isAddStaffDialogOpen, setIsAddStaffDialogOpen] = useState(false);
  const [isViewStaffDialogOpen, setIsViewStaffDialogOpen] = useState(false);
  const [isManageRoleDialogOpen, setIsManageRoleDialogOpen] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    onLeave: 0,
    suspended: 0,
  });

  useEffect(() => {
    fetchAll();

    // Real-time subscription
    const channel = supabase
      .channel('staff-management')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'staff_members',
        },
        () => {
          fetchAll();
          setLastUpdate(new Date());
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'staff_activity_logs',
        },
        () => {
          fetchActivityLogs();
          setLastUpdate(new Date());
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchAll = async () => {
    await Promise.all([
      fetchStaffMembers(),
      fetchRoles(),
      fetchDuties(),
      fetchActivityLogs(),
      fetchUsers(),
    ]);
  };

  const fetchStaffMembers = async () => {
    const { data, error } = await supabase
      .from("staff_members")
      .select(`
        *,
        profiles(full_name, email, phone),
        staff_roles(role_name)
      `)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching staff:", error);
      return;
    }

    setStaffMembers(data || []);

    // Calculate stats
    const total = data?.length || 0;
    const active = data?.filter(s => s.employment_status === 'active').length || 0;
    const onLeave = data?.filter(s => s.employment_status === 'on_leave').length || 0;
    const suspended = data?.filter(s => s.employment_status === 'suspended').length || 0;

    setStats({ total, active, onLeave, suspended });
  };

  const fetchRoles = async () => {
    const { data, error } = await supabase
      .from("staff_roles")
      .select("*")
      .order("role_name");

    if (error) {
      console.error("Error fetching roles:", error);
      return;
    }

    setRoles(data || []);
  };

  const fetchDuties = async () => {
    const { data, error } = await supabase
      .from("staff_duties")
      .select("*")
      .order("priority", { ascending: false });

    if (error) {
      console.error("Error fetching duties:", error);
      return;
    }

    setDuties(data || []);
  };

  const fetchActivityLogs = async () => {
    const { data, error } = await supabase
      .from("staff_activity_logs")
      .select(`
        *,
        staff_members(profiles(full_name))
      `)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("Error fetching logs:", error);
      return;
    }

    setActivityLogs(data || []);
  };

  const fetchUsers = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .order("full_name");

    if (error) {
      console.error("Error fetching users:", error);
      return;
    }

    setUsers(data || []);
  };

  const handleAddStaff = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const newStaff = {
      user_id: formData.get("user_id") as string,
      role_id: formData.get("role_id") as string,
      employee_id: formData.get("employee_id") as string,
      department: formData.get("department") as string,
      hire_date: formData.get("hire_date") as string,
      employment_status: formData.get("employment_status") as string,
      notes: formData.get("notes") as string || null,
    };

    const { error } = await supabase
      .from("staff_members")
      .insert([newStaff]);

    if (error) {
      toast.error("Failed to add staff member");
      console.error(error);
      return;
    }

    toast.success("Staff member added successfully");
    setIsAddStaffDialogOpen(false);
    fetchStaffMembers();
  };

  const handleUpdateStatus = async (staffId: string, newStatus: string) => {
    const { error } = await supabase
      .from("staff_members")
      .update({ employment_status: newStatus })
      .eq("id", staffId);

    if (error) {
      toast.error("Failed to update status");
      return;
    }

    toast.success("Status updated successfully");
    fetchStaffMembers();
    setIsViewStaffDialogOpen(false);
  };

  const handleUpdateRolePermissions = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedRole) return;

    const formData = new FormData(e.currentTarget);

    const updates = {
      can_manage_users: formData.get("can_manage_users") === "true",
      can_manage_transactions: formData.get("can_manage_transactions") === "true",
      can_manage_content: formData.get("can_manage_content") === "true",
      can_view_analytics: formData.get("can_view_analytics") === "true",
      can_manage_staff: formData.get("can_manage_staff") === "true",
      can_manage_settings: formData.get("can_manage_settings") === "true",
    };

    const { error } = await supabase
      .from("staff_roles")
      .update(updates)
      .eq("id", selectedRole.id);

    if (error) {
      toast.error("Failed to update permissions");
      return;
    }

    toast.success("Permissions updated successfully");
    setIsManageRoleDialogOpen(false);
    fetchRoles();
  };

  const filteredStaff = staffMembers.filter(staff => {
    const query = searchQuery.toLowerCase();
    return (
      staff.employee_id.toLowerCase().includes(query) ||
      staff.profiles?.full_name.toLowerCase().includes(query) ||
      staff.profiles?.email.toLowerCase().includes(query) ||
      staff.department.toLowerCase().includes(query)
    );
  });

  const getRoleDuties = (roleId: string) => {
    return duties.filter(d => d.role_id === roleId);
  };

  const statsCards = [
    { title: "Total Staff", value: stats.total, icon: Users, color: "text-primary" },
    { title: "Active", value: stats.active, icon: Users, color: "text-green-500" },
    { title: "On Leave", value: stats.onLeave, icon: Users, color: "text-yellow-500" },
    { title: "Suspended", value: stats.suspended, icon: Users, color: "text-red-500" },
  ];

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex-1">
          <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex h-16 items-center justify-between px-6">
              <div className="flex items-center gap-4">
                <SidebarTrigger />
                <div>
                  <h1 className="text-2xl font-bold">Staff Management</h1>
                  <p className="text-xs text-muted-foreground">
                    Last updated: {lastUpdate.toLocaleTimeString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="gap-1">
                  <Circle className="h-2 w-2 fill-green-500 text-green-500 animate-pulse" />
                  Live Updates
                </Badge>
                <Button onClick={() => setIsAddStaffDialogOpen(true)}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Add Staff
                </Button>
              </div>
            </div>
          </header>

          <div className="p-6 space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {statsCards.map((stat, index) => (
                <Card key={index}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                    <stat.icon className={`h-4 w-4 ${stat.color}`} />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stat.value}</div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Tabs defaultValue="staff" className="space-y-4">
              <TabsList>
                <TabsTrigger value="staff">Staff Members</TabsTrigger>
                <TabsTrigger value="roles">Roles & Permissions</TabsTrigger>
                <TabsTrigger value="duties">Duties</TabsTrigger>
                <TabsTrigger value="activity">Activity Logs</TabsTrigger>
              </TabsList>

              <TabsContent value="staff">
                <Card>
                  <CardHeader>
                    <CardTitle>All Staff Members</CardTitle>
                    <CardDescription>Manage your team members</CardDescription>
                    <div className="relative mt-4">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search by name, email, employee ID..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-8"
                      />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Employee ID</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Department</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Hire Date</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredStaff.map((staff) => (
                          <TableRow key={staff.id}>
                            <TableCell className="font-mono">{staff.employee_id}</TableCell>
                            <TableCell>
                              <div>
                                <div className="font-medium">{staff.profiles?.full_name}</div>
                                <div className="text-sm text-muted-foreground">{staff.profiles?.email}</div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{staff.staff_roles?.role_name}</Badge>
                            </TableCell>
                            <TableCell>{staff.department}</TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  staff.employment_status === "active"
                                    ? "default"
                                    : staff.employment_status === "on_leave"
                                    ? "secondary"
                                    : "destructive"
                                }
                              >
                                {staff.employment_status}
                              </Badge>
                            </TableCell>
                            <TableCell>{new Date(staff.hire_date).toLocaleDateString()}</TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSelectedStaff(staff);
                                  setIsViewStaffDialogOpen(true);
                                }}
                              >
                                View
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="roles">
                <div className="grid gap-4 md:grid-cols-2">
                  {roles.map((role) => (
                    <Card key={role.id}>
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="flex items-center gap-2">
                              <Shield className="h-5 w-5" />
                              {role.role_name}
                            </CardTitle>
                            <CardDescription>{role.role_description}</CardDescription>
                          </div>
                          <Badge variant={role.is_active ? "default" : "secondary"}>
                            {role.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="space-y-2 text-sm">
                          <div className="flex items-center justify-between">
                            <span>Manage Users</span>
                            <Badge variant={role.can_manage_users ? "default" : "outline"}>
                              {role.can_manage_users ? "Yes" : "No"}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Manage Transactions</span>
                            <Badge variant={role.can_manage_transactions ? "default" : "outline"}>
                              {role.can_manage_transactions ? "Yes" : "No"}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Manage Content</span>
                            <Badge variant={role.can_manage_content ? "default" : "outline"}>
                              {role.can_manage_content ? "Yes" : "No"}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>View Analytics</span>
                            <Badge variant={role.can_view_analytics ? "default" : "outline"}>
                              {role.can_view_analytics ? "Yes" : "No"}
                            </Badge>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => {
                            setSelectedRole(role);
                            setIsManageRoleDialogOpen(true);
                          }}
                        >
                          <Shield className="h-4 w-4 mr-2" />
                          Manage Permissions
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="duties">
                <div className="space-y-4">
                  {roles.map((role) => {
                    const roleDuties = getRoleDuties(role.id);
                    if (roleDuties.length === 0) return null;

                    return (
                      <Card key={role.id}>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <CheckSquare className="h-5 w-5" />
                            {role.role_name} Duties
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-3">
                            {roleDuties.map((duty) => (
                              <div
                                key={duty.id}
                                className="flex items-start gap-3 p-3 border rounded-lg"
                              >
                                <CheckSquare className={`h-5 w-5 mt-0.5 ${
                                  duty.priority === 'high' ? 'text-red-500' :
                                  duty.priority === 'medium' ? 'text-yellow-500' :
                                  'text-green-500'
                                }`} />
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <h4 className="font-medium">{duty.duty_title}</h4>
                                    <Badge variant="outline" className="text-xs">
                                      {duty.priority}
                                    </Badge>
                                    {duty.is_mandatory && (
                                      <Badge variant="destructive" className="text-xs">
                                        Mandatory
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-sm text-muted-foreground mt-1">
                                    {duty.duty_description}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </TabsContent>

              <TabsContent value="activity">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="h-5 w-5" />
                      Recent Activity
                    </CardTitle>
                    <CardDescription>Track staff actions and changes</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {activityLogs.map((log) => (
                        <div
                          key={log.id}
                          className="flex items-start gap-3 p-3 border rounded-lg"
                        >
                          <Activity className="h-5 w-5 mt-0.5 text-primary" />
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <p className="font-medium">
                                {log.staff_members?.profiles?.full_name}
                              </p>
                              <span className="text-sm text-muted-foreground">
                                {new Date(log.created_at).toLocaleString()}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              {log.activity_description}
                            </p>
                            <Badge variant="outline" className="mt-2 text-xs">
                              {log.activity_type}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      {/* Add Staff Dialog */}
      <Dialog open={isAddStaffDialogOpen} onOpenChange={setIsAddStaffDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add New Staff Member</DialogTitle>
            <DialogDescription>
              Add a new staff member to your team
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAddStaff} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="user_id">User</Label>
                <Select name="user_id" required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select user" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.full_name} ({user.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="employee_id">Employee ID</Label>
                <Input
                  id="employee_id"
                  name="employee_id"
                  placeholder="EMP-001"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="role_id">Role</Label>
                <Select name="role_id" required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((role) => (
                      <SelectItem key={role.id} value={role.id}>
                        {role.role_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="department">Department</Label>
                <Input
                  id="department"
                  name="department"
                  placeholder="Operations"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="hire_date">Hire Date</Label>
                <Input
                  id="hire_date"
                  name="hire_date"
                  type="date"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="employment_status">Status</Label>
                <Select name="employment_status" defaultValue="active">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="on_leave">On Leave</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                name="notes"
                placeholder="Additional notes..."
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAddStaffDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit">Add Staff Member</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* View Staff Dialog */}
      <Dialog open={isViewStaffDialogOpen} onOpenChange={setIsViewStaffDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Staff Member Details</DialogTitle>
          </DialogHeader>

          {selectedStaff && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Employee ID</Label>
                  <p className="font-mono font-medium">{selectedStaff.employee_id}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Name</Label>
                  <p className="font-medium">{selectedStaff.profiles?.full_name}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Email</Label>
                  <p>{selectedStaff.profiles?.email}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Phone</Label>
                  <p>{selectedStaff.profiles?.phone}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Role</Label>
                  <p>{selectedStaff.staff_roles?.role_name}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Department</Label>
                  <p>{selectedStaff.department}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Hire Date</Label>
                  <p>{new Date(selectedStaff.hire_date).toLocaleDateString()}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <Select
                    value={selectedStaff.employment_status}
                    onValueChange={(value) => handleUpdateStatus(selectedStaff.id, value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="on_leave">On Leave</SelectItem>
                      <SelectItem value="suspended">Suspended</SelectItem>
                      <SelectItem value="terminated">Terminated</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {selectedStaff.notes && (
                <div>
                  <Label className="text-muted-foreground">Notes</Label>
                  <p className="text-sm mt-1">{selectedStaff.notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Manage Role Permissions Dialog */}
      <Dialog open={isManageRoleDialogOpen} onOpenChange={setIsManageRoleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Manage Permissions: {selectedRole?.role_name}
            </DialogTitle>
            <DialogDescription>
              Configure access permissions for this role
            </DialogDescription>
          </DialogHeader>

          {selectedRole && (
            <form onSubmit={handleUpdateRolePermissions} className="space-y-4">
              <div className="space-y-3">
                {[
                  { name: "can_manage_users", label: "Manage Users" },
                  { name: "can_manage_transactions", label: "Manage Transactions" },
                  { name: "can_manage_content", label: "Manage Content" },
                  { name: "can_view_analytics", label: "View Analytics" },
                  { name: "can_manage_staff", label: "Manage Staff" },
                  { name: "can_manage_settings", label: "Manage Settings" },
                ].map((permission) => (
                  <div key={permission.name} className="flex items-center justify-between">
                    <Label htmlFor={permission.name}>{permission.label}</Label>
                    <Switch
                      id={permission.name}
                      name={permission.name}
                      defaultChecked={selectedRole[permission.name as keyof StaffRole] as boolean}
                      value="true"
                    />
                  </div>
                ))}
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsManageRoleDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit">Save Permissions</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
