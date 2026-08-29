import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Search, DollarSign, Ban, CheckCircle, Users as UsersIcon, CalendarDays, CalendarRange, Calendar, Printer, Download, ShieldCheck, Trash2, MailCheck, KeyRound, Link2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatNaira } from "@/lib/currency";
import { balancesMatch, fetchUserLedgerBalance } from "@/lib/ledger-balance";
import { UserBalanceReconcileDialog } from "@/components/UserBalanceReconcileDialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
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

interface AdminUserDetails {
  email_verified: boolean;
  email_confirmed_at: string | null;
  last_sign_in_at: string | null;
  transaction_count: number;
  roles: string[];
}

export default function Users() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [ledgerBalances, setLedgerBalances] = useState<Record<string, number>>({});
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [userTransactions, setUserTransactions] = useState<Transaction[]>([]);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isStatementPreviewOpen, setIsStatementPreviewOpen] = useState(false);
  const [isCreditDialogOpen, setIsCreditDialogOpen] = useState(false);
  const [isDebitDialogOpen, setIsDebitDialogOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [reconcileDialogOpen, setReconcileDialogOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [searchParams, setSearchParams] = useSearchParams();
  const [authorized, setAuthorized] = useState(false);
  const [userDetails, setUserDetails] = useState<AdminUserDetails | null>(null);
  const [loadingUserDetails, setLoadingUserDetails] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState("");
  const [deletingUser, setDeletingUser] = useState(false);
  const [verifyingUser, setVerifyingUser] = useState(false);
  const [isResetPasswordDialogOpen, setIsResetPasswordDialogOpen] = useState(false);
  const [resetPasswordReason, setResetPasswordReason] = useState("");
  const [resettingPassword, setResettingPassword] = useState(false);
  const [isSendResetLinkDialogOpen, setIsSendResetLinkDialogOpen] = useState(false);
  const [resetLinkReason, setResetLinkReason] = useState("");
  const [sendingResetLink, setSendingResetLink] = useState(false);
  const { toast } = useToast();

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
          description: "You don't have permission to access user management",
          variant: "destructive",
        });
        navigate("/dashboard");
        return;
      }

      setAuthorized(true);
      await fetchUsers();
    };

    void init();
  }, [navigate, toast]);

  const getLedgerBalance = (user: UserProfile) => ledgerBalances[user.id] ?? user.balance;

  const loadLedgerBalances = async (userList: UserProfile[]) => {
    const entries = await Promise.all(
      userList.map(async (user) => {
        const balance = await fetchUserLedgerBalance(supabase, user.id, user.balance);
        return [user.id, balance] as const;
      }),
    );
    setLedgerBalances(Object.fromEntries(entries));
  };

  const refreshUserLedgerBalance = async (userId: string, fallback = 0) => {
    const balance = await fetchUserLedgerBalance(supabase, userId, fallback);
    setLedgerBalances((prev) => ({ ...prev, [userId]: balance }));
    return balance;
  };

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
    void loadLedgerBalances(data || []);
  };

  const fetchUserTransactions = async (userId: string) => {
    const { data, error } = await supabase
      .from("user_transactions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);

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

  const handlePrintUserTransactions = () => {
    if (!selectedUser) return;

    const rowsHtml =
      userTransactions.length === 0
        ? `<tr><td colspan="5" style="text-align:center;padding:12px;color:#6b7280;">No transactions found</td></tr>`
        : userTransactions
            .map((tx) => {
              const amount = Number(tx.amount || 0).toFixed(2);
              const balanceAfter = Number(tx.balance_after || 0).toFixed(2);
              const txType = tx.transaction_type || "N/A";
              const txDate = new Date(tx.created_at).toLocaleString();
              const txDescription = tx.description || "-";
              const txReference = tx.reference || "-";

              return `
                <tr>
                  <td style="padding:10px;border-bottom:1px solid #e5e7eb;">${txDate}</td>
                  <td style="padding:10px;border-bottom:1px solid #e5e7eb;">${txType}</td>
                  <td style="padding:10px;border-bottom:1px solid #e5e7eb;">${txDescription}<br/><span style="font-size:12px;color:#6b7280;">Ref: ${txReference}</span></td>
                  <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right;">₦${amount}</td>
                  <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right;">₦${balanceAfter}</td>
                </tr>
              `;
            })
            .join("");

    const printWindow = window.open("", "_blank", "width=1000,height=800");
    if (!printWindow) {
      toast({
        title: "Popup Blocked",
        description: "Allow popups to print user transactions.",
        variant: "destructive",
      });
      return;
    }

    const joinedAt = new Date(selectedUser.created_at).toLocaleString();
    const printedAt = new Date().toLocaleString();
    const ledgerBalance = getLedgerBalance(selectedUser);

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>User Transactions - ${selectedUser.full_name || selectedUser.email || selectedUser.id}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
            h1 { margin: 0 0 8px; }
            .meta { margin-bottom: 16px; line-height: 1.5; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 14px; }
            th { text-align: left; background: #f3f4f6; padding: 10px; border-bottom: 2px solid #d1d5db; }
            .right { text-align: right; }
            .footer { margin-top: 16px; color: #6b7280; font-size: 12px; }
          </style>
        </head>
        <body>
          <h1>User Transactions Statement</h1>
          <div class="meta">
            <strong>Name:</strong> ${selectedUser.full_name || "N/A"}<br/>
            <strong>Email:</strong> ${selectedUser.email || "N/A"}<br/>
            <strong>User ID:</strong> ${selectedUser.id}<br/>
            <strong>Joined:</strong> ${joinedAt}<br/>
            <strong>Current Balance (Ledger):</strong> ₦${ledgerBalance.toFixed(2)}<br/>
            <strong>Total Transactions Listed:</strong> ${userTransactions.length}
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Description / Reference</th>
                <th class="right">Amount</th>
                <th class="right">Balance After</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
          <div class="footer">Generated by NetPay Admin on ${printedAt}</div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const handleExportUserTransactionsCsv = () => {
    if (!selectedUser) return;

    const escapeCsv = (value: string | number | null | undefined) => {
      const str = value == null ? "" : String(value);
      const escaped = str.replace(/"/g, '""');
      return `"${escaped}"`;
    };

    const rows = userTransactions.map((tx) => [
      new Date(tx.created_at).toLocaleString(),
      tx.transaction_type || "",
      tx.description || "",
      tx.reference || "",
      Number(tx.amount || 0).toFixed(2),
      Number(tx.balance_before || 0).toFixed(2),
      Number(tx.balance_after || 0).toFixed(2),
    ]);

    const header = [
      "Date",
      "Type",
      "Description",
      "Reference",
      "Amount",
      "Balance Before",
      "Balance After",
    ];

    const csv = [
      header.map(escapeCsv).join(","),
      ...rows.map((row) => row.map(escapeCsv).join(",")),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    const name = (selectedUser.full_name || selectedUser.email || selectedUser.id).replace(/\s+/g, "_");
    a.href = url;
    a.download = `user-transactions-${name}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const fetchAdminUserDetails = async (userId: string) => {
    setLoadingUserDetails(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-get-user-details", {
        body: { userId },
      });

      if (error) {
        throw error;
      }

      if (!data?.success) {
        throw new Error(data?.error || "Failed to load user details");
      }

      setUserDetails({
        email_verified: Boolean(data.data.email_verified),
        email_confirmed_at: data.data.auth?.email_confirmed_at ?? data.data.auth?.confirmed_at ?? null,
        last_sign_in_at: data.data.auth?.last_sign_in_at ?? null,
        transaction_count: Number(data.data.transaction_count || 0),
        roles: Array.isArray(data.data.roles) ? data.data.roles : [],
      });
    } catch (error: any) {
      console.error("Failed to load admin user details:", error);
      setUserDetails(null);
      toast({
        title: "Warning",
        description: error.message || "Could not load extended user details",
        variant: "destructive",
      });
    } finally {
      setLoadingUserDetails(false);
    }
  };

  const handleVerifyUserEmail = async () => {
    if (!selectedUser) return;

    try {
      setVerifyingUser(true);
      const { data, error } = await supabase.functions.invoke("admin-verify-user", {
        body: { userId: selectedUser.id },
      });

      if (error) {
        throw error;
      }

      if (!data?.success) {
        throw new Error(data?.error || "Failed to verify user email");
      }

      toast({
        title: "Email Verified",
        description: data.message || "User email has been verified successfully",
      });

      await fetchAdminUserDetails(selectedUser.id);
    } catch (error: any) {
      toast({
        title: "Verification Failed",
        description: error.message || "Could not verify user email",
        variant: "destructive",
      });
    } finally {
      setVerifyingUser(false);
    }
  };

  const handleOpenDeleteDialog = () => {
    setDeleteReason("");
    setDeleteConfirmEmail("");
    setIsDeleteDialogOpen(true);
  };

  const handleOpenResetPasswordDialog = () => {
    setResetPasswordReason("");
    setIsResetPasswordDialogOpen(true);
  };

  const handleOpenSendResetLinkDialog = () => {
    setResetLinkReason("");
    setIsSendResetLinkDialogOpen(true);
  };

  const handleSendPasswordResetLink = async () => {
    if (!selectedUser) return;

    try {
      setSendingResetLink(true);
      const { data, error } = await supabase.functions.invoke("admin-send-password-reset-link", {
        body: {
          userId: selectedUser.id,
          reason: resetLinkReason.trim() || null,
        },
      });

      if (error) {
        throw error;
      }

      if (!data?.success) {
        throw new Error(data?.error || "Failed to send password reset link");
      }

      toast({
        title: "Reset Link Sent",
        description: data.message || `Password reset link emailed to ${selectedUser.email}`,
      });

      setIsSendResetLinkDialogOpen(false);
      setResetLinkReason("");
    } catch (error: any) {
      toast({
        title: "Send Link Failed",
        description: error.message || "Could not send password reset link",
        variant: "destructive",
      });
    } finally {
      setSendingResetLink(false);
    }
  };

  const handleResetUserPassword = async () => {
    if (!selectedUser) return;

    try {
      setResettingPassword(true);
      const { data, error } = await supabase.functions.invoke("admin-reset-user-password", {
        body: {
          userId: selectedUser.id,
          reason: resetPasswordReason.trim() || null,
        },
      });

      if (error) {
        throw error;
      }

      if (!data?.success) {
        throw new Error(data?.error || "Failed to reset user password");
      }

      toast({
        title: "Password Reset",
        description: data.message || `A new password was emailed to ${selectedUser.email}`,
      });

      setIsResetPasswordDialogOpen(false);
      setResetPasswordReason("");
    } catch (error: any) {
      toast({
        title: "Password Reset Failed",
        description: error.message || "Could not reset user password",
        variant: "destructive",
      });
    } finally {
      setResettingPassword(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;

    const expectedEmail = (selectedUser.email || "").trim().toLowerCase();
    if (!expectedEmail || deleteConfirmEmail.trim().toLowerCase() !== expectedEmail) {
      toast({
        title: "Confirmation Required",
        description: "Enter the user's email exactly to confirm deletion",
        variant: "destructive",
      });
      return;
    }

    try {
      setDeletingUser(true);
      const { data, error } = await supabase.functions.invoke("admin-delete-user", {
        body: {
          userId: selectedUser.id,
          deletion_reason: deleteReason.trim() || "Deleted by admin from user management",
        },
      });

      if (error) {
        throw error;
      }

      if (!data?.success) {
        throw new Error(data?.error || "Failed to delete user");
      }

      toast({
        title: "User Deleted",
        description: "The user was removed from the app and archived in deleted account management",
      });

      setIsDeleteDialogOpen(false);
      setIsViewDialogOpen(false);
      setSelectedUser(null);
      setUserDetails(null);
      await fetchUsers();
    } catch (error: any) {
      toast({
        title: "Delete Failed",
        description: error.message || "Could not delete user",
        variant: "destructive",
      });
    } finally {
      setDeletingUser(false);
    }
  };

  const handleViewUser = async (user: UserProfile, openReconcile = false) => {
    setSelectedUser(user);
    setUserDetails(null);
    await Promise.all([
      fetchUserTransactions(user.id),
      refreshUserLedgerBalance(user.id, user.balance),
      fetchAdminUserDetails(user.id),
    ]);
    setIsViewDialogOpen(true);
    if (openReconcile) {
      setReconcileDialogOpen(true);
    }
  };

  const openUserFromQuery = useCallback(async () => {
    const userId = searchParams.get("userId");
    if (!userId || users.length === 0) return;

    const user = users.find((entry) => entry.id === userId);
    if (!user) return;

    const openReconcile = searchParams.get("reconcile") === "1";
    await handleViewUser(user, openReconcile);

    const next = new URLSearchParams(searchParams);
    next.delete("userId");
    next.delete("reconcile");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, users]);

  useEffect(() => {
    void openUserFromQuery();
  }, [openUserFromQuery]);

  const handleOpenStatementPreview = () => {
    if (!selectedUser) return;
    setIsStatementPreviewOpen(true);
  };

  const handleCreditUser = (user: UserProfile) => {
    setSelectedUser(user);
    setAmount("");
    setDescription("");
    void refreshUserLedgerBalance(user.id, user.balance);
    setIsCreditDialogOpen(true);
  };

  const handleDebitUser = (user: UserProfile) => {
    setSelectedUser(user);
    setAmount("");
    setDescription("");
    void refreshUserLedgerBalance(user.id, user.balance);
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
      await fetchUsers();
      if (selectedUser && data?.data?.balanceAfter != null) {
        setLedgerBalances((prev) => ({
          ...prev,
          [selectedUser.id]: Number(data.data.balanceAfter),
        }));
      }
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

  const filteredUsers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return users;
    return users.filter(
      (user) =>
        user.full_name?.toLowerCase().includes(query) ||
        user.email?.toLowerCase().includes(query) ||
        user.phone?.toLowerCase().includes(query) ||
        user.id.toLowerCase().includes(query),
    );
  }, [users, searchQuery]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const totalFilteredCount = filteredUsers.length;
  const totalPages = Math.max(1, Math.ceil(totalFilteredCount / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedUsers = filteredUsers.slice(
    (safeCurrentPage - 1) * pageSize,
    safeCurrentPage * pageSize,
  );
  const pageStart = totalFilteredCount === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1;
  const pageEnd = Math.min(safeCurrentPage * pageSize, totalFilteredCount);

  const userJoinStats = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 7);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    let weekly = 0;
    let monthly = 0;
    let yearly = 0;

    for (const user of users) {
      if (!user.created_at) continue;
      const joinedAt = new Date(user.created_at);
      if (Number.isNaN(joinedAt.getTime())) continue;

      if (joinedAt >= weekAgo) weekly += 1;
      if (joinedAt >= monthStart) monthly += 1;
      if (joinedAt >= yearStart) yearly += 1;
    }

    return {
      total: users.length,
      weekly,
      monthly,
      yearly,
    };
  }, [users]);

  const selectedUserMetrics = useMemo(() => {
    const credits = userTransactions
      .filter((tx) => tx.transaction_type === "credit")
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const debits = userTransactions
      .filter((tx) => tx.transaction_type === "debit")
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const net = credits - debits;

    return {
      credits,
      debits,
      net,
      count: userTransactions.length,
    };
  }, [userTransactions]);

  const selectedUserLedgerBalance = selectedUser ? getLedgerBalance(selectedUser) : 0;
  const selectedUserHasBalanceDrift =
    selectedUser != null && !balancesMatch(selectedUserLedgerBalance, selectedUser.balance);

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

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                  <UsersIcon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{userJoinStats.total}</div>
                  <p className="text-xs text-muted-foreground">All registered users</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Joined This Week</CardTitle>
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{userJoinStats.weekly}</div>
                  <p className="text-xs text-muted-foreground">Last 7 days</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Joined This Month</CardTitle>
                  <CalendarRange className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{userJoinStats.monthly}</div>
                  <p className="text-xs text-muted-foreground">Since month start</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Joined This Year</CardTitle>
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{userJoinStats.yearly}</div>
                  <p className="text-xs text-muted-foreground">Since year start</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>All Users</CardTitle>
                <CardDescription>
                  {totalFilteredCount === 0
                    ? "No users match your search"
                    : `Showing ${pageStart}–${pageEnd} of ${totalFilteredCount} user${totalFilteredCount !== 1 ? "s" : ""}`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Ledger Balance</TableHead>
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
                      paginatedUsers.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell className="font-medium">
                            {user.full_name || "N/A"}
                          </TableCell>
                          <TableCell>{user.email || "N/A"}</TableCell>
                          <TableCell>{user.phone || "N/A"}</TableCell>
                          <TableCell className="font-semibold">
                            <div>₦{getLedgerBalance(user).toFixed(2)}</div>
                            {!balancesMatch(getLedgerBalance(user), user.balance) && (
                              <p className="text-xs text-amber-600 font-normal">
                                Cache: ₦{user.balance.toFixed(2)}
                              </p>
                            )}
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
                          <SelectItem value="100">100 / page</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {totalPages > 1 && (
                      <Pagination>
                        <PaginationContent>
                          <PaginationItem>
                            <PaginationPrevious
                              href="#"
                              onClick={(e) => {
                                e.preventDefault();
                                setCurrentPage((page) => Math.max(1, page - 1));
                              }}
                              className={safeCurrentPage <= 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                            />
                          </PaginationItem>
                          {Array.from({ length: Math.min(totalPages, 7) }, (_, index) => {
                            let pageNumber = index + 1;
                            if (totalPages > 7) {
                              if (safeCurrentPage <= 4) pageNumber = index + 1;
                              else if (safeCurrentPage >= totalPages - 3) pageNumber = totalPages - 6 + index;
                              else pageNumber = safeCurrentPage - 3 + index;
                            }
                            return (
                              <PaginationItem key={pageNumber}>
                                <PaginationLink
                                  href="#"
                                  isActive={pageNumber === safeCurrentPage}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    setCurrentPage(pageNumber);
                                  }}
                                  className="cursor-pointer"
                                >
                                  {pageNumber}
                                </PaginationLink>
                              </PaginationItem>
                            );
                          })}
                          <PaginationItem>
                            <PaginationNext
                              href="#"
                              onClick={(e) => {
                                e.preventDefault();
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

      {/* View User Details Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>User Details</DialogTitle>
            <DialogDescription>Complete user information and transaction history</DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-6">
              {selectedUserHasBalanceDrift && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <span>
                      Profile cache ({formatNaira(selectedUser.balance)}) differs from ledger (
                      {formatNaira(selectedUserLedgerBalance)}). Cache should auto-sync on the next ledger entry or admin view.
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="gap-2 shrink-0"
                      onClick={() => setReconcileDialogOpen(true)}
                    >
                      View balance detail
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                  <Label className="text-muted-foreground">Email Verification</Label>
                  <div className="mt-1">
                    {loadingUserDetails ? (
                      <Badge variant="secondary">Loading…</Badge>
                    ) : (
                      <Badge variant={userDetails?.email_verified ? "default" : "destructive"}>
                        {userDetails?.email_verified ? "Verified" : "Not verified"}
                      </Badge>
                    )}
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Last Sign In</Label>
                  <p className="font-medium">
                    {userDetails?.last_sign_in_at
                      ? new Date(userDetails.last_sign_in_at).toLocaleString()
                      : loadingUserDetails
                        ? "Loading…"
                        : "Never"}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Total Transactions</Label>
                  <p className="font-medium">
                    {loadingUserDetails
                      ? "Loading…"
                      : userDetails?.transaction_count ?? selectedUserMetrics.count}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Roles</Label>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {(userDetails?.roles?.length ? userDetails.roles : ["user"]).map((role) => (
                      <Badge key={role} variant="secondary">
                        {role}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Ledger Balance</Label>
                  <p className="font-semibold text-lg">₦{selectedUserLedgerBalance.toFixed(2)}</p>
                  {selectedUserHasBalanceDrift && (
                    <p className="text-xs text-amber-600 mt-1">
                      Profile cache: ₦{selectedUser.balance.toFixed(2)}
                    </p>
                  )}
                </div>
                <div>
                  <Label className="text-muted-foreground">Joined</Label>
                  <p className="font-medium">
                    {new Date(selectedUser.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Joined Time</Label>
                  <p className="font-medium">
                    {new Date(selectedUser.created_at).toLocaleTimeString()}
                  </p>
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <Label className="text-muted-foreground">User ID</Label>
                  <p className="font-mono text-xs break-all">{selectedUser.id}</p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Recent Tx Count</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xl font-bold">{selectedUserMetrics.count}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Credits (Recent)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xl font-bold text-green-600">₦{selectedUserMetrics.credits.toFixed(2)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Debits (Recent)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xl font-bold text-red-600">₦{selectedUserMetrics.debits.toFixed(2)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Net Flow (Recent)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className={`text-xl font-bold ${selectedUserMetrics.net >= 0 ? "text-green-600" : "text-red-600"}`}>
                      ₦{selectedUserMetrics.net.toFixed(2)}
                    </p>
                  </CardContent>
                </Card>
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
                variant="outline"
                onClick={handleOpenStatementPreview}
                className="flex-1"
                disabled={!selectedUser}
              >
                <Printer className="h-4 w-4 mr-2" />
                Print Transactions
              </Button>
              <Button
                variant="outline"
                onClick={handleOpenStatementPreview}
                className="flex-1"
                disabled={!selectedUser}
              >
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
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
              <Button
                variant="outline"
                onClick={handleOpenSendResetLinkDialog}
                disabled={!selectedUser || sendingResetLink || !selectedUser.email}
                className="flex-1"
              >
                <Link2 className="h-4 w-4 mr-2" />
                Send Reset Link
              </Button>
              <Button
                variant="outline"
                onClick={handleOpenResetPasswordDialog}
                disabled={!selectedUser || resettingPassword || !selectedUser.email}
                className="flex-1"
              >
                <KeyRound className="h-4 w-4 mr-2" />
                Reset Password
              </Button>
              <Button
                variant="outline"
                onClick={handleVerifyUserEmail}
                disabled={!selectedUser || verifyingUser || loadingUserDetails || userDetails?.email_verified}
                className="flex-1"
              >
                <MailCheck className="h-4 w-4 mr-2" />
                {verifyingUser ? "Verifying…" : "Verify Email"}
              </Button>
              <Button
                variant="destructive"
                onClick={handleOpenDeleteDialog}
                disabled={!selectedUser || deletingUser}
                className="flex-1"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete User
              </Button>
            </div>
            <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isStatementPreviewOpen} onOpenChange={setIsStatementPreviewOpen}>
        <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Transaction Statement Preview</DialogTitle>
            <DialogDescription>
              Review this user's transaction statement before printing or downloading.
            </DialogDescription>
          </DialogHeader>

          {selectedUser && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <Label className="text-muted-foreground">Name</Label>
                  <p className="font-medium">{selectedUser.full_name || "N/A"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Email</Label>
                  <p className="font-medium">{selectedUser.email || "N/A"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Ledger Balance</Label>
                  <p className="font-semibold">₦{selectedUserLedgerBalance.toFixed(2)}</p>
                  {selectedUserHasBalanceDrift && (
                    <p className="text-xs text-amber-600 mt-1">
                      Profile cache: ₦{Number(selectedUser.balance || 0).toFixed(2)}
                    </p>
                  )}
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <Label className="text-muted-foreground">User ID</Label>
                  <p className="font-mono text-xs break-all">{selectedUser.id}</p>
                </div>
              </div>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Transactions ({userTransactions.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  {userTransactions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No transactions found for this user.</p>
                  ) : (
                    <div className="max-h-[420px] overflow-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Description / Reference</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead className="text-right">Balance After</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {userTransactions.map((tx) => (
                            <TableRow key={tx.id}>
                              <TableCell>{new Date(tx.created_at).toLocaleString()}</TableCell>
                              <TableCell>
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
                              </TableCell>
                              <TableCell>
                                <div className="text-sm">
                                  <p>{tx.description || "-"}</p>
                                  <p className="text-xs text-muted-foreground">Ref: {tx.reference || "-"}</p>
                                </div>
                              </TableCell>
                              <TableCell className="text-right">₦{Number(tx.amount || 0).toFixed(2)}</TableCell>
                              <TableCell className="text-right">₦{Number(tx.balance_after || 0).toFixed(2)}</TableCell>
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

          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setIsStatementPreviewOpen(false)}>
              Close Preview
            </Button>
            <Button variant="outline" onClick={handleExportUserTransactionsCsv} disabled={!selectedUser}>
              <Download className="h-4 w-4 mr-2" />
              Download CSV
            </Button>
            <Button onClick={handlePrintUserTransactions} disabled={!selectedUser}>
              <Printer className="h-4 w-4 mr-2" />
              Print Now
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
              <Label className="text-muted-foreground">Ledger Balance</Label>
              <p className="font-semibold text-lg">₦{selectedUserLedgerBalance.toFixed(2)}</p>
              {selectedUserHasBalanceDrift && selectedUser && (
                <p className="text-xs text-amber-600 mt-1">
                  Profile cache: ₦{selectedUser.balance.toFixed(2)}
                </p>
              )}
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
              <Label className="text-muted-foreground">Ledger Balance</Label>
              <p className="font-semibold text-lg">₦{selectedUserLedgerBalance.toFixed(2)}</p>
              {selectedUserHasBalanceDrift && selectedUser && (
                <p className="text-xs text-amber-600 mt-1">
                  Profile cache: ₦{selectedUser.balance.toFixed(2)}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="debit-amount">Amount (₦)</Label>
              <Input
                id="debit-amount"
                type="number"
                step="0.01"
                min="0.01"
                max={selectedUserLedgerBalance}
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

      <UserBalanceReconcileDialog
        userId={selectedUser?.id ?? null}
        open={reconcileDialogOpen}
        onOpenChange={setReconcileDialogOpen}
        onReconciled={async () => {
          await fetchUsers();
          if (selectedUser) {
            await refreshUserLedgerBalance(selectedUser.id, selectedUser.balance);
          }
        }}
      />

      <Dialog open={isSendResetLinkDialogOpen} onOpenChange={setIsSendResetLinkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Password Reset Link</DialogTitle>
            <DialogDescription>
              Generate a secure deep link and email it to the user. The link opens NetPay so they can choose a new password.
            </DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
              <Alert>
                <Link2 className="h-4 w-4" />
                <AlertDescription>
                  A reset link will be sent to <strong>{selectedUser.email}</strong>. It expires in 1 hour and opens the NetPay app on their phone.
                </AlertDescription>
              </Alert>
              <div>
                <Label htmlFor="reset-link-reason">Reason (optional, included in email)</Label>
                <Textarea
                  id="reset-link-reason"
                  placeholder="Why is this reset link being sent?"
                  value={resetLinkReason}
                  onChange={(event) => setResetLinkReason(event.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSendResetLinkDialogOpen(false)} disabled={sendingResetLink}>
              Cancel
            </Button>
            <Button onClick={handleSendPasswordResetLink} disabled={sendingResetLink || !selectedUser?.email}>
              {sendingResetLink ? "Sending…" : "Send Reset Link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isResetPasswordDialogOpen} onOpenChange={setIsResetPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset User Password</DialogTitle>
            <DialogDescription>
              Generate a new temporary password and email it to the user so they can sign in again.
            </DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
              <Alert>
                <KeyRound className="h-4 w-4" />
                <AlertDescription>
                  A new password will be sent to <strong>{selectedUser.email}</strong>. The user will be signed out of all devices.
                </AlertDescription>
              </Alert>
              <div>
                <Label htmlFor="reset-password-reason">Reason (optional, included in email)</Label>
                <Textarea
                  id="reset-password-reason"
                  placeholder="Why is this password being reset?"
                  value={resetPasswordReason}
                  onChange={(event) => setResetPasswordReason(event.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsResetPasswordDialogOpen(false)} disabled={resettingPassword}>
              Cancel
            </Button>
            <Button onClick={handleResetUserPassword} disabled={resettingPassword || !selectedUser?.email}>
              {resettingPassword ? "Resetting…" : "Reset & Email Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User Account</DialogTitle>
            <DialogDescription>
              This permanently removes the user from the app and archives their account data in deleted account management.
            </DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
              <Alert variant="destructive">
                <ShieldCheck className="h-4 w-4" />
                <AlertDescription>
                  You are about to delete <strong>{selectedUser.full_name || selectedUser.email}</strong>.
                  This action cannot be undone.
                </AlertDescription>
              </Alert>
              <div>
                <Label htmlFor="delete-reason">Reason for deletion</Label>
                <Textarea
                  id="delete-reason"
                  placeholder="Why is this account being deleted?"
                  value={deleteReason}
                  onChange={(event) => setDeleteReason(event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="delete-confirm-email">
                  Type <strong>{selectedUser.email}</strong> to confirm
                </Label>
                <Input
                  id="delete-confirm-email"
                  placeholder="Enter user email"
                  value={deleteConfirmEmail}
                  onChange={(event) => setDeleteConfirmEmail(event.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)} disabled={deletingUser}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteUser} disabled={deletingUser || !selectedUser}>
              {deletingUser ? "Deleting…" : "Delete Permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
