import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatNaira } from "@/lib/currency";
import {
  parseUserBalanceReconcileDetail,
  type UserBalanceReconcileDetail,
  type UserBalanceReconcileTransaction,
} from "@/lib/ledger-balance";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, ArrowUpRight, RefreshCw, ShieldCheck, User } from "lucide-react";

type UserBalanceReconcileDialogProps = {
  userId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReconciled?: () => void;
};

export function UserBalanceReconcileDialog({
  userId,
  open,
  onOpenChange,
  onReconciled,
}: UserBalanceReconcileDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<UserBalanceReconcileDetail | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<UserBalanceReconcileTransaction[]>([]);
  const [autoSynced, setAutoSynced] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("get-user-balance-reconcile", {
        body: { userId },
      });
      if (error) throw error;
      if (!data?.success) {
        throw new Error(data?.error || "Failed to load reconcile detail");
      }

      setDetail(parseUserBalanceReconcileDetail(data.detail));
      setRecentTransactions((data.recent_transactions as UserBalanceReconcileTransaction[]) || []);
      setAutoSynced(Boolean(data.auto_synced));
      if (data.auto_synced) {
        onReconciled?.();
      }
    } catch (error) {
      console.error("Reconcile detail load failed:", error);
      toast({
        title: "Could not load user",
        description: error instanceof Error ? error.message : "Failed to load reconcile detail",
        variant: "destructive",
      });
      setDetail(null);
      setRecentTransactions([]);
      setAutoSynced(false);
    } finally {
      setLoading(false);
    }
  }, [onReconciled, toast, userId]);

  useEffect(() => {
    if (open && userId) {
      void loadDetail();
    }
    if (!open) {
      setDetail(null);
      setRecentTransactions([]);
      setAutoSynced(false);
    }
  }, [open, userId, loadDetail]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            User Balance Detail
          </DialogTitle>
          <DialogDescription>
            Profile cache is kept in sync automatically from the ledger
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : detail ? (
          <div className="space-y-4">
            {autoSynced && (
              <Alert>
                <ShieldCheck className="h-4 w-4" />
                <AlertDescription>Profile cache was auto-synced from the latest ledger entry.</AlertDescription>
              </Alert>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-sm text-muted-foreground">Name</p>
                <p className="font-medium">{detail.full_name || "N/A"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="font-medium">{detail.email || "N/A"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Phone</p>
                <p className="font-medium">{detail.phone || "N/A"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge variant={detail.status === "active" ? "default" : "destructive"}>{detail.status}</Badge>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border p-3 bg-primary/5">
                <p className="text-xs text-muted-foreground">Ledger balance (source of truth)</p>
                <p className="text-xl font-bold">{formatNaira(detail.ledger_balance)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Profile cache</p>
                <p className="text-xl font-bold">{formatNaira(detail.profile_balance)}</p>
              </div>
              <div className={`rounded-lg border p-3 ${detail.needs_reconcile ? "border-amber-300 bg-amber-50" : ""}`}>
                <p className="text-xs text-muted-foreground">Drift</p>
                <p className={`text-xl font-bold ${detail.needs_reconcile ? "text-amber-700" : "text-green-700"}`}>
                  {formatNaira(detail.drift)}
                </p>
              </div>
            </div>

            {detail.needs_reconcile ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{detail.reconcile_action}</AlertDescription>
              </Alert>
            ) : (
              <Alert>
                <ShieldCheck className="h-4 w-4" />
                <AlertDescription>{detail.reconcile_action}</AlertDescription>
              </Alert>
            )}

            {detail.latest_entry && (
              <div className="rounded-lg border p-3 space-y-1 text-sm">
                <p className="font-medium">Latest ledger entry</p>
                <p>
                  {format(new Date(detail.latest_entry.created_at), "MMM d, yyyy HH:mm")} ·{" "}
                  {detail.latest_entry.transaction_type.replace(/_/g, " ")} · Ref:{" "}
                  {detail.latest_entry.reference || "N/A"}
                </p>
                <p className="text-muted-foreground">
                  {formatNaira(detail.latest_entry.balance_before)} → {formatNaira(detail.latest_entry.balance_after)}
                  {" "}(amount {formatNaira(detail.latest_entry.amount)})
                </p>
                {detail.latest_entry.description && (
                  <p className="text-muted-foreground">{detail.latest_entry.description}</p>
                )}
              </div>
            )}

            {recentTransactions.length > 0 && (
              <div>
                <p className="font-medium mb-2">Recent ledger entries</p>
                <div className="rounded-md border overflow-x-auto max-h-56">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Balance After</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentTransactions.map((tx) => (
                        <TableRow key={tx.id}>
                          <TableCell className="text-xs">
                            {format(new Date(tx.created_at), "MMM d HH:mm")}
                          </TableCell>
                          <TableCell className="text-xs">{tx.transaction_type.replace(/_/g, " ")}</TableCell>
                          <TableCell className="text-right text-xs">{formatNaira(tx.amount)}</TableCell>
                          <TableCell className="text-right text-xs font-medium">
                            {formatNaira(tx.balance_after)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground font-mono break-all">User ID: {detail.user_id}</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-4">No user detail available.</p>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {detail && (
            <Button asChild variant="outline" className="gap-2">
              <Link to={`/wallets?userId=${detail.user_id}&reconcile=1`}>
                Open in Wallets <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Button>
          )}
          <Button variant="outline" onClick={() => void loadDetail()} disabled={loading || !userId}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
