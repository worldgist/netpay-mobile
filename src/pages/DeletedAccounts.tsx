import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Search, Trash2, Eye, Archive } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type DeletedAccountStatus = "pending" | "processing" | "completed" | "cancelled";

interface DeletedAccountRecord {
  id: string;
  user_id: string;
  email: string | null;
  phone: string | null;
  full_name: string | null;
  deletion_reason: string | null;
  requested_at: string;
  deleted_at: string | null;
  status: DeletedAccountStatus;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  deleted_by: string | null;
}

function statusVariant(status: DeletedAccountStatus): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "completed":
      return "default";
    case "processing":
      return "secondary";
    case "cancelled":
      return "destructive";
    default:
      return "outline";
  }
}

function formatMetadataValue(value: unknown): string {
  if (value == null) return "N/A";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value, null, 2);
}

export default function DeletedAccounts() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<DeletedAccountRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedRecord, setSelectedRecord] = useState<DeletedAccountRecord | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("deleted_accounts")
      .select("*")
      .order("requested_at", { ascending: false });

    if (error) {
      toast({
        title: "Error",
        description: "Failed to load deleted account records",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    setRecords((data as DeletedAccountRecord[]) || []);
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        navigate("/auth");
        return;
      }

      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .eq("role", "admin")
        .maybeSingle();

      if (!roles) {
        toast({
          title: "Access Denied",
          description: "You don't have permission to access deleted account management",
          variant: "destructive",
        });
        navigate("/dashboard");
        return;
      }

      setAuthorized(true);
      await fetchRecords();
    };

    void init();
  }, [fetchRecords, navigate, toast]);

  const filteredRecords = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return records.filter((record) => {
      const matchesStatus = statusFilter === "all" || record.status === statusFilter;
      if (!matchesStatus) return false;
      if (!query) return true;

      return (
        record.email?.toLowerCase().includes(query) ||
        record.full_name?.toLowerCase().includes(query) ||
        record.phone?.toLowerCase().includes(query) ||
        record.user_id.toLowerCase().includes(query) ||
        record.deletion_reason?.toLowerCase().includes(query)
      );
    });
  }, [records, searchQuery, statusFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter]);

  const totalFilteredCount = filteredRecords.length;
  const totalPages = Math.max(1, Math.ceil(totalFilteredCount / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedRecords = filteredRecords.slice(
    (safeCurrentPage - 1) * pageSize,
    safeCurrentPage * pageSize,
  );
  const pageStart = totalFilteredCount === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1;
  const pageEnd = Math.min(safeCurrentPage * pageSize, totalFilteredCount);

  const stats = useMemo(() => {
    return {
      total: records.length,
      completed: records.filter((record) => record.status === "completed").length,
      processing: records.filter((record) => record.status === "processing").length,
      adminDeleted: records.filter((record) => record.metadata?.source === "admin").length,
    };
  }, [records]);

  const openDetails = (record: DeletedAccountRecord) => {
    setSelectedRecord(record);
    setIsDetailOpen(true);
  };

  if (!authorized) {
    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full bg-background">
          <AppSidebar />
          <main className="flex-1 flex items-center justify-center">
            <p className="text-muted-foreground">Checking admin access…</p>
          </main>
        </div>
      </SidebarProvider>
    );
  }

  const metadata = selectedRecord?.metadata ?? {};
  const recentTransactions = Array.isArray(metadata.recent_transactions)
    ? metadata.recent_transactions
    : [];

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex h-16 items-center gap-4 px-6">
              <SidebarTrigger />
              <h1 className="text-2xl font-bold">Deleted Account Management</h1>
            </div>
          </header>

          <div className="p-6 space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Total Records</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.total}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Completed</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.completed}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Processing</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.processing}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Admin Deleted</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.adminDeleted}</div>
                </CardContent>
              </Card>
            </div>

            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Search email, name, phone, user ID..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => void fetchRecords()} disabled={loading}>
                Refresh
              </Button>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Archive className="h-5 w-5" />
                  Archived Deletions
                </CardTitle>
                <CardDescription>
                  {totalFilteredCount === 0
                    ? "No deleted account records match your filters"
                    : `Showing ${pageStart}–${pageEnd} of ${totalFilteredCount} record${totalFilteredCount !== 1 ? "s" : ""}`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Requested</TableHead>
                      <TableHead>Deleted</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedRecords.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground">
                          {loading ? "Loading records..." : "No deleted account records found"}
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedRecords.map((record) => (
                        <TableRow key={record.id}>
                          <TableCell className="font-medium">{record.full_name || "N/A"}</TableCell>
                          <TableCell>{record.email || "N/A"}</TableCell>
                          <TableCell>
                            <Badge variant={record.metadata?.source === "admin" ? "destructive" : "secondary"}>
                              {record.metadata?.source === "admin" ? "Admin" : "Self"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={statusVariant(record.status)}>{record.status}</Badge>
                          </TableCell>
                          <TableCell>{new Date(record.requested_at).toLocaleString()}</TableCell>
                          <TableCell>
                            {record.deleted_at ? new Date(record.deleted_at).toLocaleString() : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" onClick={() => openDetails(record)}>
                              <Eye className="h-4 w-4 mr-2" />
                              View Archive
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>

                {totalFilteredCount > 0 && (
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pt-4 border-t mt-4">
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <span>
                        Page {safeCurrentPage} of {totalPages}
                      </span>
                      <Select
                        value={String(pageSize)}
                        onValueChange={(value) => {
                          setPageSize(Number(value));
                          setCurrentPage(1);
                        }}
                      >
                        <SelectTrigger className="w-[110px] h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="10">10 / page</SelectItem>
                          <SelectItem value="25">25 / page</SelectItem>
                          <SelectItem value="50">50 / page</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {totalPages > 1 && (
                      <Pagination>
                        <PaginationContent>
                          <PaginationItem>
                            <PaginationPrevious
                              href="#"
                              onClick={(event) => {
                                event.preventDefault();
                                setCurrentPage((page) => Math.max(1, page - 1));
                              }}
                              className={safeCurrentPage <= 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                            />
                          </PaginationItem>
                          <PaginationItem>
                            <PaginationLink
                              href="#"
                              isActive
                              onClick={(event) => event.preventDefault()}
                              className="cursor-default"
                            >
                              {safeCurrentPage}
                            </PaginationLink>
                          </PaginationItem>
                          <PaginationItem>
                            <PaginationNext
                              href="#"
                              onClick={(event) => {
                                event.preventDefault();
                                setCurrentPage((page) => Math.min(totalPages, page + 1));
                              }}
                              className={safeCurrentPage >= totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                            />
                          </PaginationItem>
                        </PaginationContent>
                      </Pagination>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>

      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Deleted Account Archive</DialogTitle>
            <DialogDescription>
              Archived account data retained after deletion from the app.
            </DialogDescription>
          </DialogHeader>

          {selectedRecord && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <Label className="text-muted-foreground">Full Name</Label>
                  <p className="font-medium">{selectedRecord.full_name || "N/A"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Email</Label>
                  <p className="font-medium">{selectedRecord.email || "N/A"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Phone</Label>
                  <p className="font-medium">{selectedRecord.phone || "N/A"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <div className="mt-1">
                    <Badge variant={statusVariant(selectedRecord.status)}>{selectedRecord.status}</Badge>
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Deletion Source</Label>
                  <p className="font-medium">{metadata.source === "admin" ? "Admin" : "Self-service"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Balance at Deletion</Label>
                  <p className="font-medium">
                    {metadata.balance_at_deletion != null
                      ? `₦${Number(metadata.balance_at_deletion).toFixed(2)}`
                      : "N/A"}
                  </p>
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <Label className="text-muted-foreground">Deletion Reason</Label>
                  <p className="font-medium">{selectedRecord.deletion_reason || "Not provided"}</p>
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <Label className="text-muted-foreground">User ID</Label>
                  <p className="font-mono text-xs break-all">{selectedRecord.user_id}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Requested At</Label>
                  <p className="font-medium">{new Date(selectedRecord.requested_at).toLocaleString()}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Deleted At</Label>
                  <p className="font-medium">
                    {selectedRecord.deleted_at
                      ? new Date(selectedRecord.deleted_at).toLocaleString()
                      : "Not completed"}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Transaction Count</Label>
                  <p className="font-medium">{String(metadata.transaction_count ?? "N/A")}</p>
                </div>
              </div>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Trash2 className="h-4 w-4" />
                    Archived Metadata
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="text-xs whitespace-pre-wrap break-all bg-muted p-4 rounded-md overflow-auto max-h-56">
                    {formatMetadataValue(metadata)}
                  </pre>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">
                    Recent Transactions Snapshot ({recentTransactions.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {recentTransactions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No transaction snapshot stored.</p>
                  ) : (
                    <div className="max-h-[320px] overflow-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {recentTransactions.map((transaction: Record<string, unknown>, index: number) => (
                            <TableRow key={String(transaction.id ?? index)}>
                              <TableCell>
                                {transaction.created_at
                                  ? new Date(String(transaction.created_at)).toLocaleString()
                                  : "—"}
                              </TableCell>
                              <TableCell>{String(transaction.transaction_type ?? "—")}</TableCell>
                              <TableCell>{String(transaction.description ?? "—")}</TableCell>
                              <TableCell className="text-right">
                                ₦{Number(transaction.amount ?? 0).toFixed(2)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDetailOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
