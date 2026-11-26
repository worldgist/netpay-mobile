import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Copy, CreditCard, RefreshCw, Search, ShieldCheck, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface VirtualAccountRow {
  id: string;
  user_id: string;
  account_number: string;
  account_name: string;
  bank_name: string;
  bank_code: string;
  provider: string | null;
  nin: string | null;
  tracking_reference: string | null;
  created_at: string;
  updated_at: string;
}

interface ProfileRow {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
}

interface UserNinRow {
  user_id: string;
  nin: string;
  verified_at: string | null;
}

function providerLabel(provider: string | null): string {
  if (!provider) return "Unknown";
  if (provider === "flutterwave") return "Flutterwave";
  if (provider === "payvessel") return "PayVessel";
  return provider;
}

function providerVariant(provider: string | null): "default" | "secondary" | "outline" {
  if (provider === "flutterwave") return "default";
  if (provider === "payvessel") return "secondary";
  return "outline";
}

export default function VirtualAccounts() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [accounts, setAccounts] = useState<VirtualAccountRow[]>([]);
  const [profilesByUserId, setProfilesByUserId] = useState<Record<string, ProfileRow>>({});
  const [ninByUserId, setNinByUserId] = useState<Record<string, UserNinRow>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [providerFilter, setProviderFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const fetchAccounts = useCallback(async () => {
    const { data, error } = await supabase
      .from("virtual_accounts")
      .select(`
        id,
        user_id,
        account_number,
        account_name,
        bank_name,
        bank_code,
        provider,
        nin,
        tracking_reference,
        created_at,
        updated_at
      `)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    const accountRows = (data as VirtualAccountRow[]) || [];
    const userIds = [...new Set(accountRows.map((row) => row.user_id))];

    const [{ data: profileRows, error: profileError }, { data: ninRows, error: ninError }] = await Promise.all([
      userIds.length > 0
        ? supabase.from("profiles").select("id, full_name, email, phone").in("id", userIds)
        : Promise.resolve({ data: [], error: null }),
      supabase.from("user_nin").select("user_id, nin, verified_at"),
    ]);

    if (profileError) {
      throw profileError;
    }

    if (ninError) {
      throw ninError;
    }

    setAccounts(accountRows);
    setProfilesByUserId(
      Object.fromEntries(((profileRows as ProfileRow[]) || []).map((row) => [row.id, row])),
    );
    setNinByUserId(
      Object.fromEntries(((ninRows as UserNinRow[]) || []).map((row) => [row.user_id, row])),
    );
  }, []);

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
          description: "You don't have permission to access virtual account management",
          variant: "destructive",
        });
        navigate("/dashboard");
        return;
      }

      setAuthorized(true);

      try {
        await fetchAccounts();
      } catch (error) {
        console.error("Failed to load virtual accounts:", error);
        toast({
          title: "Error",
          description: "Failed to load virtual accounts",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    void init();
  }, [fetchAccounts, navigate, toast]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchAccounts();
      toast({ title: "Refreshed", description: "Virtual account list updated" });
    } catch (error) {
      console.error("Failed to refresh virtual accounts:", error);
      toast({
        title: "Error",
        description: "Failed to refresh virtual accounts",
        variant: "destructive",
      });
    } finally {
      setRefreshing(false);
    }
  };

  const copyValue = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: "Copied", description: `${label} copied to clipboard` });
    } catch {
      toast({ title: "Copy failed", description: `Could not copy ${label.toLowerCase()}`, variant: "destructive" });
    }
  };

  const rowsWithNin = useMemo(() => {
    return accounts.map((account) => {
      const savedNin = ninByUserId[account.user_id];
      const profile = profilesByUserId[account.user_id];
      return {
        ...account,
        profile,
        resolvedNin: savedNin?.nin || account.nin || null,
        ninVerifiedAt: savedNin?.verified_at || null,
      };
    });
  }, [accounts, ninByUserId, profilesByUserId]);

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return rowsWithNin.filter((row) => {
      if (providerFilter !== "all" && (row.provider || "unknown") !== providerFilter) {
        return false;
      }

      if (!query) return true;

      const haystack = [
        row.profile?.full_name,
        row.profile?.email,
        row.profile?.phone,
        row.account_number,
        row.account_name,
        row.bank_name,
        row.resolvedNin,
        row.tracking_reference,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [rowsWithNin, searchQuery, providerFilter]);

  const totalCount = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedRows = filteredRows.slice((safeCurrentPage - 1) * pageSize, safeCurrentPage * pageSize);
  const pageStart = totalCount === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1;
  const pageEnd = Math.min(safeCurrentPage * pageSize, totalCount);

  const stats = useMemo(() => {
    const flutterwaveCount = rowsWithNin.filter((row) => row.provider === "flutterwave").length;
    const payvesselCount = rowsWithNin.filter((row) => row.provider === "payvessel").length;
    const withNinCount = rowsWithNin.filter((row) => row.resolvedNin).length;
    const uniqueUsers = new Set(rowsWithNin.map((row) => row.user_id)).size;

    return {
      total: rowsWithNin.length,
      uniqueUsers,
      flutterwaveCount,
      payvesselCount,
      withNinCount,
    };
  }, [rowsWithNin]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, providerFilter, pageSize]);

  if (!authorized) {
    return (
      <SidebarProvider>
        <div className="flex min-h-screen w-full">
          <AppSidebar />
          <main className="flex-1 p-6">
            <Skeleton className="h-10 w-64 mb-6" />
            <Skeleton className="h-96 w-full" />
          </main>
        </div>
      </SidebarProvider>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
            <div className="flex h-14 items-center gap-4 px-6">
              <SidebarTrigger />
              <div className="flex-1">
                <h1 className="text-lg font-semibold">Virtual Accounts</h1>
                <p className="text-sm text-muted-foreground">User NIN and dedicated account numbers</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => void handleRefresh()} disabled={refreshing}>
                <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </div>

          <div className="p-6 space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Total Accounts</CardDescription>
                  <CardTitle className="text-3xl">{stats.total}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CreditCard className="h-4 w-4" />
                    All providers
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Users With Accounts</CardDescription>
                  <CardTitle className="text-3xl">{stats.uniqueUsers}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    Unique users
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>With NIN on File</CardDescription>
                  <CardTitle className="text-3xl">{stats.withNinCount}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <ShieldCheck className="h-4 w-4" />
                    From user_nin or account record
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Flutterwave / PayVessel</CardDescription>
                  <CardTitle className="text-3xl">
                    {stats.flutterwaveCount} / {stats.payvesselCount}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">By provider</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Account Directory</CardTitle>
                <CardDescription>
                  Review each user&apos;s NIN and dedicated account number for wallet funding.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      placeholder="Search by name, email, phone, NIN, or account number..."
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                    />
                  </div>
                  <Select value={providerFilter} onValueChange={setProviderFilter}>
                    <SelectTrigger className="w-full md:w-[180px]">
                      <SelectValue placeholder="Provider" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All providers</SelectItem>
                      <SelectItem value="flutterwave">Flutterwave</SelectItem>
                      <SelectItem value="payvessel">PayVessel</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
                    <SelectTrigger className="w-full md:w-[120px]">
                      <SelectValue placeholder="Rows" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10 rows</SelectItem>
                      <SelectItem value="25">25 rows</SelectItem>
                      <SelectItem value="50">50 rows</SelectItem>
                      <SelectItem value="100">100 rows</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {loading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : paginatedRows.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
                    No virtual accounts match your filters.
                  </div>
                ) : (
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>User</TableHead>
                          <TableHead>NIN</TableHead>
                          <TableHead>Account Number</TableHead>
                          <TableHead>Bank</TableHead>
                          <TableHead>Account Name</TableHead>
                          <TableHead>Provider</TableHead>
                          <TableHead>Created</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedRows.map((row) => (
                          <TableRow key={row.id}>
                            <TableCell>
                              <div className="space-y-1">
                                <p className="font-medium">{row.profile?.full_name || "Unknown user"}</p>
                                <p className="text-sm text-muted-foreground">{row.profile?.email || "No email"}</p>
                                {row.profile?.phone ? (
                                  <p className="text-xs text-muted-foreground">{row.profile.phone}</p>
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell>
                              {row.resolvedNin ? (
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-sm">{row.resolvedNin}</span>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => void copyValue(row.resolvedNin!, "NIN")}
                                  >
                                    <Copy className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">Not provided</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-sm">{row.account_number}</span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => void copyValue(row.account_number, "Account number")}
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                            <TableCell>{row.bank_name}</TableCell>
                            <TableCell>{row.account_name}</TableCell>
                            <TableCell>
                              <Badge variant={providerVariant(row.provider)}>{providerLabel(row.provider)}</Badge>
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                              {format(new Date(row.created_at), "MMM d, yyyy HH:mm")}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {!loading && totalCount > 0 ? (
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <p className="text-sm text-muted-foreground">
                      Showing {pageStart}-{pageEnd} of {totalCount}
                    </p>
                    <Pagination>
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious
                            href="#"
                            onClick={(event) => {
                              event.preventDefault();
                              setCurrentPage((page) => Math.max(1, page - 1));
                            }}
                            className={safeCurrentPage <= 1 ? "pointer-events-none opacity-50" : ""}
                          />
                        </PaginationItem>
                        {Array.from({ length: totalPages }, (_, index) => index + 1)
                          .filter((page) => {
                            if (totalPages <= 7) return true;
                            return Math.abs(page - safeCurrentPage) <= 2 || page === 1 || page === totalPages;
                          })
                          .map((page, index, visiblePages) => {
                            const previousPage = visiblePages[index - 1];
                            const showEllipsis = previousPage != null && page - previousPage > 1;

                            return (
                              <span key={page} className="flex items-center">
                                {showEllipsis ? (
                                  <PaginationItem>
                                    <span className="px-2 text-muted-foreground">…</span>
                                  </PaginationItem>
                                ) : null}
                                <PaginationItem>
                                  <PaginationLink
                                    href="#"
                                    isActive={page === safeCurrentPage}
                                    onClick={(event) => {
                                      event.preventDefault();
                                      setCurrentPage(page);
                                    }}
                                  >
                                    {page}
                                  </PaginationLink>
                                </PaginationItem>
                              </span>
                            );
                          })}
                        <PaginationItem>
                          <PaginationNext
                            href="#"
                            onClick={(event) => {
                              event.preventDefault();
                              setCurrentPage((page) => Math.min(totalPages, page + 1));
                            }}
                            className={safeCurrentPage >= totalPages ? "pointer-events-none opacity-50" : ""}
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
