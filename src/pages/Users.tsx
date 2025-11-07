import { useState, useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Search, Eye, DollarSign, Ban, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface UserProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  balance: number;
  status: string;
  created_at: string;
}

interface Transaction {
  id: string;
  transaction_type: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  description: string | null;
  reference: string | null;
  created_at: string;
}

export default function Users() {
  const [searchQuery, setSearchQuery] = useState("");
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [userTransactions, setUserTransactions] = useState<Transaction[]>([]);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isCreditDialogOpen, setIsCreditDialogOpen] = useState(false);
  const [isDebitDialogOpen, setIsDebitDialogOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast({
        title: "Error",
        description: "Failed to fetch users",
        variant: "destructive",
      });
      return;
    }

    setUsers(data || []);
  };

  const fetchUserTransactions = async (userId: string) => {
    const { data, error } = await supabase
      .from("user_transactions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to fetch transactions",
        variant: "destructive",
      });
      return;
    }

    setUserTransactions(data || []);
  };

  const handleViewUser = async (user: UserProfile) => {
    setSelectedUser(user);
    await fetchUserTransactions(user.id);
    setIsViewDialogOpen(true);
  };

  const handleCreditUser = (user: UserProfile) => {
    setSelectedUser(user);
    setAmount("");
    setDescription("");
    setIsCreditDialogOpen(true);
  };

  const handleDebitUser = (user: UserProfile) => {
    setSelectedUser(user);
    setAmount("");
    setDescription("");
    setIsDebitDialogOpen(true);
  };

  const performTransaction = async (type: "credit" | "debit") => {
    if (!selectedUser || !amount || parseFloat(amount) <= 0) {
      toast({
        title: "Error",
        description: "Please enter a valid amount",
        variant: "destructive",
      });
      return;
    }

    const amountValue = parseFloat(amount);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast({
          title: "Error",
          description: "You must be logged in",
          variant: "destructive",
        });
        return;
      }

      const functionName = type === "credit" ? "credit-user" : "debit-user";
      
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: {
          userId: selectedUser.id,
          amount: amountValue,
          description: description || null,
        },
      });

      if (error) {
        throw error;
      }

      if (!data.success) {
        throw new Error(data.error || `Failed to ${type} user`);
      }

      toast({
        title: "Success",
        description: `User ${type === "credit" ? "credited" : "debited"} successfully`,
      });

      setIsCreditDialogOpen(false);
      setIsDebitDialogOpen(false);
      setAmount("");
      setDescription("");
      fetchUsers();
    } catch (error) {
      console.error(`${type} error:`, error);
      toast({
        title: "Error",
        description: error.message || `Failed to ${type} user`,
        variant: "destructive",
      });
    }
  };

  const handleSuspendUser = async (user: UserProfile) => {
    try {
      const newStatus = user.status === "suspended" ? "active" : "suspended";

      const { data, error } = await supabase.functions.invoke('suspend-user', {
        body: {
          userId: user.id,
          status: newStatus,
        },
      });

      if (error) {
        throw error;
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to update user status');
      }

      toast({
        title: "Success",
        description: `User ${newStatus === "suspended" ? "suspended" : "activated"} successfully`,
      });

      fetchUsers();
    } catch (error: any) {
      console.error('Suspend user error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to update user status",
        variant: "destructive",
      });
    }
  };

  const filteredUsers = users.filter(
    (user) =>
      user.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex h-16 items-center gap-4 px-6">
              <SidebarTrigger />
              <h1 className="text-2xl font-bold">Users Management</h1>
            </div>
          </header>

          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Search users..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>All Users</CardTitle>
                <CardDescription>Manage and monitor user accounts</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Balance</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">
                          No users found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredUsers.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell className="font-medium">
                            {user.full_name || "N/A"}
                          </TableCell>
                          <TableCell>{user.email || "N/A"}</TableCell>
                          <TableCell>{user.phone || "N/A"}</TableCell>
                          <TableCell className="font-semibold">
                            ₦{user.balance.toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant={
                                user.status === "active" 
                                  ? "default" 
                                  : user.status === "suspended" 
                                  ? "destructive" 
                                  : "secondary"
                              }
                            >
                              {user.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewUser(user)}
                            >
                              View Details
                            </Button>
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

      {/* View User Details Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>User Details</DialogTitle>
            <DialogDescription>Complete user information and transaction history</DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Full Name</Label>
                  <p className="font-medium">{selectedUser.full_name || "N/A"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Email</Label>
                  <p className="font-medium">{selectedUser.email || "N/A"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Phone</Label>
                  <p className="font-medium">{selectedUser.phone || "N/A"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <div className="mt-1">
                    <Badge variant={selectedUser.status === "active" ? "default" : "destructive"}>
                      {selectedUser.status}
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Balance</Label>
                  <p className="font-semibold text-lg">₦{selectedUser.balance.toFixed(2)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Joined</Label>
                  <p className="font-medium">
                    {new Date(selectedUser.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div>
                <Label className="text-lg font-semibold">Recent Transactions</Label>
                <div className="mt-3 space-y-2">
                  {userTransactions.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No transactions yet</p>
                  ) : (
                    userTransactions.map((tx) => (
                      <div
                        key={tx.id}
                        className="flex items-center justify-between p-3 border rounded-lg"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={
                                tx.transaction_type === "credit"
                                  ? "default"
                                  : tx.transaction_type === "debit"
                                  ? "destructive"
                                  : "secondary"
                              }
                            >
                              {tx.transaction_type}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              {new Date(tx.created_at).toLocaleString()}
                            </span>
                          </div>
                          {tx.description && (
                            <p className="text-sm mt-1">{tx.description}</p>
                          )}
                          {tx.reference && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Ref: {tx.reference}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <p
                            className={`font-semibold ${
                              tx.transaction_type === "credit"
                                ? "text-green-600"
                                : "text-red-600"
                            }`}
                          >
                            {tx.transaction_type === "credit" ? "+" : "-"}₦
                            {tx.amount.toFixed(2)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Balance: ₦{tx.balance_after.toFixed(2)}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            <div className="flex gap-2 flex-1">
              <Button
                variant="default"
                onClick={() => {
                  setIsViewDialogOpen(false);
                  handleCreditUser(selectedUser!);
                }}
                className="flex-1"
              >
                <DollarSign className="h-4 w-4 mr-2" />
                Credit User
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setIsViewDialogOpen(false);
                  handleDebitUser(selectedUser!);
                }}
                className="flex-1"
              >
                <DollarSign className="h-4 w-4 mr-2" />
                Debit User
              </Button>
              <Button
                variant={selectedUser?.status === "suspended" ? "default" : "destructive"}
                onClick={() => {
                  if (selectedUser) {
                    handleSuspendUser(selectedUser);
                    setIsViewDialogOpen(false);
                  }
                }}
                className="flex-1"
              >
                {selectedUser?.status === "suspended" ? (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Activate
                  </>
                ) : (
                  <>
                    <Ban className="h-4 w-4 mr-2" />
                    Suspend
                  </>
                )}
              </Button>
            </div>
            <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Credit User Dialog */}
      <Dialog open={isCreditDialogOpen} onOpenChange={setIsCreditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Credit User</DialogTitle>
            <DialogDescription>
              Add funds to {selectedUser?.full_name || selectedUser?.email}'s account
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-muted-foreground">Current Balance</Label>
              <p className="font-semibold text-lg">₦{selectedUser?.balance.toFixed(2)}</p>
            </div>
            <div>
              <Label htmlFor="credit-amount">Amount (₦)</Label>
              <Input
                id="credit-amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="Enter amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="credit-description">Description (Optional)</Label>
              <Textarea
                id="credit-description"
                placeholder="Reason for credit"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCreditDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={() => performTransaction("credit")}>
              Credit Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Debit User Dialog */}
      <Dialog open={isDebitDialogOpen} onOpenChange={setIsDebitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Debit User</DialogTitle>
            <DialogDescription>
              Deduct funds from {selectedUser?.full_name || selectedUser?.email}'s account
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-muted-foreground">Current Balance</Label>
              <p className="font-semibold text-lg">₦{selectedUser?.balance.toFixed(2)}</p>
            </div>
            <div>
              <Label htmlFor="debit-amount">Amount (₦)</Label>
              <Input
                id="debit-amount"
                type="number"
                step="0.01"
                min="0.01"
                max={selectedUser?.balance}
                placeholder="Enter amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="debit-description">Description (Optional)</Label>
              <Textarea
                id="debit-description"
                placeholder="Reason for debit"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDebitDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => performTransaction("debit")}
            >
              Debit Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
