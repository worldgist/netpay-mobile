import { useState, useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Download, Upload, Plus, CheckCircle2, XCircle, AlertCircle, Loader2, Search, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatNaira } from "@/lib/currency";
import { format } from "date-fns";

interface ImportResult {
  trans_id: string;
  user_id?: string;
  amount: number;
  description: string;
  date: string;
  service?: string;
  status: string;
  reference?: string;
  transaction_data?: any;
}

interface ImportSummary {
  total_cable_transactions: number;
  imported: number;
  skipped: number;
  errors: number;
}

interface User {
  id: string;
  full_name: string;
  email: string;
  phone: string;
}

export default function ImportCableTransactions() {
  const [importResults, setImportResults] = useState<ImportResult[]>([]);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<string>("");
  const [formData, setFormData] = useState({
    amount: "",
    description: "",
    reference: "",
    provider: "",
    package_name: "",
    smart_card: "",
    created_at: new Date().toISOString().split('T')[0],
  });
  const [queryTransId, setQueryTransId] = useState("");
  const [queryResult, setQueryResult] = useState<any>(null);
  const [isQuerying, setIsQuerying] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, phone")
        .order("full_name", { ascending: true });

      if (error) throw error;
      setUsers(data || []);
    } catch (error: any) {
      console.error("Error fetching users:", error);
      toast({
        title: "Error",
        description: "Failed to fetch users",
        variant: "destructive",
      });
    }
  };

  const handleImport = async () => {
    try {
      setIsImporting(true);
      const { data, error } = await supabase.functions.invoke("import-cable-transactions", {
        body: {
          page: 1,
          per_page: 100,
          auto_match: true,
        },
      });

      if (error) throw error;

      if (!data.success) {
        throw new Error(data.error || "Failed to import transactions");
      }

      setImportSummary(data.summary);
      setImportResults(data.imported || []);
      
      toast({
        title: "Import Complete",
        description: `Imported ${data.summary.imported} transactions, skipped ${data.summary.skipped}, ${data.summary.errors} errors`,
      });
    } catch (error: any) {
      console.error("Import error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to import transactions",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleManualCreate = async () => {
    if (!selectedUser || !formData.amount) {
      toast({
        title: "Error",
        description: "Please select a user and enter an amount",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke("create-missing-cable-transaction", {
        body: {
          user_id: selectedUser,
          amount: parseFloat(formData.amount),
          description: formData.description || `${formData.provider} - ${formData.package_name} - ${formData.smart_card}`,
          reference: formData.reference || undefined,
          provider: formData.provider || undefined,
          package_name: formData.package_name || undefined,
          smart_card: formData.smart_card || undefined,
          created_at: formData.created_at ? new Date(formData.created_at).toISOString() : undefined,
        },
      });

      if (error) throw error;

      if (!data.success) {
        throw new Error(data.error || "Failed to create transaction");
      }

      toast({
        title: "Success",
        description: "Transaction created successfully",
      });

      setIsDialogOpen(false);
      setFormData({
        amount: "",
        description: "",
        reference: "",
        provider: "",
        package_name: "",
        smart_card: "",
        created_at: new Date().toISOString().split('T')[0],
      });
      setSelectedUser("");
    } catch (error: any) {
      console.error("Create transaction error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create transaction",
        variant: "destructive",
      });
    }
  };

  const handleQueryTransaction = async () => {
    if (!queryTransId) {
      toast({
        title: "Error",
        description: "Please enter a transaction ID",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsQuerying(true);
      const { data, error } = await supabase.functions.invoke("query-cable-transaction", {
        body: {
          trans_id: queryTransId,
        },
      });

      if (error) throw error;

      if (!data.success) {
        throw new Error(data.error || "Failed to query transaction");
      }

      setQueryResult(data.transaction);
      toast({
        title: "Success",
        description: "Transaction queried successfully",
      });
    } catch (error: any) {
      console.error("Query transaction error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to query transaction",
        variant: "destructive",
      });
      setQueryResult(null);
    } finally {
      setIsQuerying(false);
    }
  };

  const handleAssignUser = async (transId: string, userId: string) => {
    try {
      const transaction = importResults.find((t) => t.trans_id === transId);
      if (!transaction) {
        throw new Error("Transaction not found");
      }

      const { data, error } = await supabase.functions.invoke("create-missing-cable-transaction", {
        body: {
          user_id: userId,
          amount: transaction.amount,
          description: transaction.description,
          reference: transaction.reference || `CABLE-${transId}`,
          created_at: transaction.date,
        },
      });

      if (error) throw error;

      if (!data.success) {
        throw new Error(data.error || "Failed to assign transaction");
      }

      // Update the transaction status
      setImportResults((prev) =>
        prev.map((t) =>
          t.trans_id === transId ? { ...t, status: "imported", user_id: userId } : t
        )
      );

      toast({
        title: "Success",
        description: "Transaction assigned and created successfully",
      });
    } catch (error: any) {
      console.error("Assign transaction error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to assign transaction",
        variant: "destructive",
      });
    }
  };

  const filteredUsers = users.filter((user) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      user.full_name?.toLowerCase().includes(searchLower) ||
      user.email?.toLowerCase().includes(searchLower) ||
      user.phone?.toLowerCase().includes(searchLower)
    );
  });

  const importedTransactions = importResults.filter((t) => t.status === "imported");
  const needsAssignment = importResults.filter((t) => t.status === "needs_manual_assignment");

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <header className="flex h-16 items-center gap-4 border-b px-4">
            <SidebarTrigger />
            <h1 className="text-2xl font-semibold">Import Cable TV Transactions</h1>
          </header>

          <main className="flex-1 p-6 space-y-6">
            <div className="grid gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Query Transaction Status</CardTitle>
                  <CardDescription>
                    Query the status of a specific cable TV transaction from MobileNig using trans_id
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4">
                    <Input
                      placeholder="Enter trans_id (e.g., 23455667954)"
                      value={queryTransId}
                      onChange={(e) => setQueryTransId(e.target.value)}
                      className="max-w-md"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleQueryTransaction();
                        }
                      }}
                    />
                    <Button onClick={handleQueryTransaction} disabled={isQuerying || !queryTransId}>
                      {isQuerying ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Querying...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Query
                        </>
                      )}
                    </Button>
                  </div>
                  {queryResult && (
                    <div className="mt-4 p-4 bg-muted rounded-lg">
                      <h4 className="font-semibold mb-2">Transaction Details:</h4>
                      <pre className="text-sm overflow-auto">
                        {JSON.stringify(queryResult, null, 2)}
                      </pre>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Import from MobileNig</CardTitle>
                  <CardDescription>
                    Fetch cable TV transactions from MobileNig wallet history and import missing transactions
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4">
                    <Button onClick={handleImport} disabled={isImporting}>
                      {isImporting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Importing...
                        </>
                      ) : (
                        <>
                          <Upload className="mr-2 h-4 w-4" />
                          Import Transactions
                        </>
                      )}
                    </Button>
                    {importSummary && (
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-muted-foreground">
                          Total: {importSummary.total_cable_transactions}
                        </span>
                        <Badge variant="default" className="bg-green-500">
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          Imported: {importSummary.imported}
                        </Badge>
                        <Badge variant="secondary">
                          Skipped: {importSummary.skipped}
                        </Badge>
                        {importSummary.errors > 0 && (
                          <Badge variant="destructive">
                            <XCircle className="mr-1 h-3 w-3" />
                            Errors: {importSummary.errors}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Transaction Results</CardTitle>
                      <CardDescription>
                        Review imported transactions and assign users to unassigned transactions
                      </CardDescription>
                    </div>
                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                      <DialogTrigger asChild>
                        <Button>
                          <Plus className="mr-2 h-4 w-4" />
                          Create Manually
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>Create Cable TV Transaction</DialogTitle>
                          <DialogDescription>
                            Manually create a transaction record for a user
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label>User</Label>
                            <Select value={selectedUser} onValueChange={setSelectedUser}>
                              <SelectTrigger>
                                <SelectValue placeholder="Select a user" />
                              </SelectTrigger>
                              <SelectContent>
                                <div className="p-2">
                                  <Input
                                    placeholder="Search users..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="mb-2"
                                  />
                                </div>
                                {filteredUsers.map((user) => (
                                  <SelectItem key={user.id} value={user.id}>
                                    {user.full_name} ({user.email})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Amount (₦)</Label>
                              <Input
                                type="number"
                                value={formData.amount}
                                onChange={(e) =>
                                  setFormData({ ...formData, amount: e.target.value })
                                }
                                placeholder="0.00"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Date</Label>
                              <Input
                                type="date"
                                value={formData.created_at}
                                onChange={(e) =>
                                  setFormData({ ...formData, created_at: e.target.value })
                                }
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>Description</Label>
                            <Input
                              value={formData.description}
                              onChange={(e) =>
                                setFormData({ ...formData, description: e.target.value })
                              }
                              placeholder="e.g., DSTV - Premium - 1234567890"
                            />
                          </div>
                          <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-2">
                              <Label>Provider</Label>
                              <Input
                                value={formData.provider}
                                onChange={(e) =>
                                  setFormData({ ...formData, provider: e.target.value })
                                }
                                placeholder="DSTV"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Package</Label>
                              <Input
                                value={formData.package_name}
                                onChange={(e) =>
                                  setFormData({ ...formData, package_name: e.target.value })
                                }
                                placeholder="Premium"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Smart Card</Label>
                              <Input
                                value={formData.smart_card}
                                onChange={(e) =>
                                  setFormData({ ...formData, smart_card: e.target.value })
                                }
                                placeholder="1234567890"
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>Reference (Optional)</Label>
                            <Input
                              value={formData.reference}
                              onChange={(e) =>
                                setFormData({ ...formData, reference: e.target.value })
                              }
                              placeholder="Auto-generated if empty"
                            />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                            Cancel
                          </Button>
                          <Button onClick={handleManualCreate}>Create Transaction</Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="all" className="w-full">
                    <TabsList>
                      <TabsTrigger value="all">All ({importResults.length})</TabsTrigger>
                      <TabsTrigger value="imported">
                        Imported ({importedTransactions.length})
                      </TabsTrigger>
                      <TabsTrigger value="needs-assignment">
                        Needs Assignment ({needsAssignment.length})
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value="all" className="space-y-4">
                      {importResults.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          No transactions imported yet. Click "Import Transactions" to start.
                        </div>
                      ) : (
                        <div className="rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Service</TableHead>
                                <TableHead>Amount</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead>User</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Actions</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {importResults.map((transaction) => (
                                <TableRow key={transaction.trans_id}>
                                  <TableCell>
                                    {format(new Date(transaction.date), "MMM dd, yyyy HH:mm")}
                                  </TableCell>
                                  <TableCell>{transaction.service || "N/A"}</TableCell>
                                  <TableCell>{formatNaira(transaction.amount)}</TableCell>
                                  <TableCell className="max-w-xs truncate">
                                    {transaction.description}
                                  </TableCell>
                                  <TableCell>
                                    {transaction.user_id ? (
                                      <Badge variant="default">Assigned</Badge>
                                    ) : (
                                      <Badge variant="secondary">Unassigned</Badge>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    {transaction.status === "imported" ? (
                                      <Badge variant="default" className="bg-green-500">
                                        <CheckCircle2 className="mr-1 h-3 w-3" />
                                        Imported
                                      </Badge>
                                    ) : (
                                      <Badge variant="secondary">
                                        <AlertCircle className="mr-1 h-3 w-3" />
                                        Needs Assignment
                                      </Badge>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    {transaction.status === "needs_manual_assignment" ? (
                                      <Select
                                        onValueChange={(userId) =>
                                          handleAssignUser(transaction.trans_id, userId)
                                        }
                                      >
                                        <SelectTrigger className="w-64">
                                          <SelectValue placeholder="Select user to assign" />
                                        </SelectTrigger>
                                        <SelectContent className="max-h-[300px]">
                                          <div className="p-2 sticky top-0 bg-background z-10 border-b">
                                            <Input
                                              placeholder="Search users..."
                                              value={searchQuery}
                                              onChange={(e) => setSearchQuery(e.target.value)}
                                              onClick={(e) => e.stopPropagation()}
                                              onKeyDown={(e) => e.stopPropagation()}
                                            />
                                          </div>
                                          {filteredUsers.length === 0 ? (
                                            <div className="p-4 text-center text-sm text-muted-foreground">
                                              No users found
                                            </div>
                                          ) : (
                                            filteredUsers.map((user) => (
                                              <SelectItem key={user.id} value={user.id}>
                                                {user.full_name || "No name"} ({user.email})
                                              </SelectItem>
                                            ))
                                          )}
                                        </SelectContent>
                                      </Select>
                                    ) : transaction.user_id ? (
                                      <Badge variant="default" className="bg-green-500">
                                        <CheckCircle2 className="mr-1 h-3 w-3" />
                                        Assigned
                                      </Badge>
                                    ) : null}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </TabsContent>
                    <TabsContent value="imported" className="space-y-4">
                      {importedTransactions.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          No imported transactions
                        </div>
                      ) : (
                        <div className="rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Service</TableHead>
                                <TableHead>Amount</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead>Reference</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {importedTransactions.map((transaction) => (
                                <TableRow key={transaction.trans_id}>
                                  <TableCell>
                                    {format(new Date(transaction.date), "MMM dd, yyyy HH:mm")}
                                  </TableCell>
                                  <TableCell>{transaction.service || "N/A"}</TableCell>
                                  <TableCell>{formatNaira(transaction.amount)}</TableCell>
                                  <TableCell className="max-w-xs truncate">
                                    {transaction.description}
                                  </TableCell>
                                  <TableCell className="font-mono text-xs">
                                    {transaction.reference}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </TabsContent>
                    <TabsContent value="needs-assignment" className="space-y-4">
                      {needsAssignment.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          No transactions need assignment
                        </div>
                      ) : (
                        <div className="rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Service</TableHead>
                                <TableHead>Amount</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead>Assign User</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {needsAssignment.map((transaction) => (
                                <TableRow key={transaction.trans_id}>
                                  <TableCell>
                                    {format(new Date(transaction.date), "MMM dd, yyyy HH:mm")}
                                  </TableCell>
                                  <TableCell>{transaction.service || "N/A"}</TableCell>
                                  <TableCell>{formatNaira(transaction.amount)}</TableCell>
                                  <TableCell className="max-w-xs truncate">
                                    {transaction.description}
                                  </TableCell>
                                  <TableCell>
                                    <Select
                                      onValueChange={(userId) =>
                                        handleAssignUser(transaction.trans_id, userId)
                                      }
                                    >
                                      <SelectTrigger className="w-64">
                                        <SelectValue placeholder="Select user to assign" />
                                      </SelectTrigger>
                                      <SelectContent className="max-h-[300px]">
                                        <div className="p-2 sticky top-0 bg-background z-10 border-b">
                                          <Input
                                            placeholder="Search users..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            onClick={(e) => e.stopPropagation()}
                                            onKeyDown={(e) => e.stopPropagation()}
                                          />
                                        </div>
                                        {filteredUsers.length === 0 ? (
                                          <div className="p-4 text-center text-sm text-muted-foreground">
                                            No users found
                                          </div>
                                        ) : (
                                          filteredUsers.map((user) => (
                                            <SelectItem key={user.id} value={user.id}>
                                              {user.full_name || "No name"} ({user.email})
                                            </SelectItem>
                                          ))
                                        )}
                                      </SelectContent>
                                    </Select>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

