import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import BottomNav from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Trash2, ArrowLeft, Shield, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function DeleteAccount() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [password, setPassword] = useState("");

  const requiredText = "DELETE MY ACCOUNT";

  const handleDeleteAccount = async () => {
    if (confirmText !== requiredText) {
      toast.error(`Please type "${requiredText}" to confirm`);
      return;
    }

    setShowConfirmDialog(true);
  };

  const confirmDelete = async () => {
    try {
      setLoading(true);
      setShowConfirmDialog(false);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Session expired. Please login again.");
        navigate("/user/auth");
        return;
      }

      // Call edge function to delete account
      const { data, error } = await supabase.functions.invoke("delete-user-account", {
        body: {
          password: password || undefined, // Optional password verification
        },
      });

      if (error) throw error;

      if (!data?.success) {
        throw new Error(data?.error || "Failed to delete account");
      }

      toast.success("Account deleted successfully");
      
      // Sign out and redirect
      await supabase.auth.signOut();
      navigate("/user/auth");
    } catch (error: any) {
      console.error("Error deleting account:", error);
      toast.error(error.message || "Failed to delete account. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50/50 via-white to-orange-50/30 pb-24">
      {/* Header with Orange Theme */}
      <div className="bg-gradient-to-r from-orange-500 via-orange-600 to-orange-700 text-white shadow-lg">
        <div className="px-4 py-6">
          <div className="flex items-center gap-3 mb-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/user/profile")}
              className="text-white hover:bg-white/20"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="p-2 bg-white/20 rounded-lg">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold">Delete Account</h1>
              <p className="text-orange-100 text-sm">This action cannot be undone</p>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Warning Card */}
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-6 h-6 text-red-600" />
              <CardTitle className="text-red-900">Warning: Permanent Action</CardTitle>
            </div>
            <CardDescription className="text-red-800">
              Deleting your account will permanently remove all your data, transactions, and account information. 
              This action cannot be undone.
            </CardDescription>
          </CardHeader>
        </Card>

        {/* What Will Be Deleted */}
        <Card className="border-l-4 border-l-orange-500">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-orange-600" />
              <CardTitle className="text-orange-600">What Will Be Deleted</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-gray-700">
              <li className="flex items-start gap-2">
                <span className="text-orange-500 mt-1">•</span>
                <span>Your profile and personal information</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-500 mt-1">•</span>
                <span>All transaction history</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-500 mt-1">•</span>
                <span>Wallet balance (ensure you withdraw funds first)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-500 mt-1">•</span>
                <span>Referral codes and referral history</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-500 mt-1">•</span>
                <span>All saved preferences and settings</span>
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* Confirmation Form */}
        <Card>
          <CardHeader>
            <CardTitle>Confirm Account Deletion</CardTitle>
            <CardDescription>
              To confirm, please type <strong className="text-orange-600">{requiredText}</strong> in the field below
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="confirm">Type to confirm</Label>
              <Input
                id="confirm"
                type="text"
                placeholder={requiredText}
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                className="font-mono"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password (Optional)</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password for additional verification"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="text-xs text-gray-500">
                Providing your password adds an extra layer of security
              </p>
            </div>

            <Button
              onClick={handleDeleteAccount}
              disabled={loading || confirmText !== requiredText}
              className="w-full bg-red-600 hover:bg-red-700 text-white"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {loading ? "Deleting Account..." : "Delete My Account"}
            </Button>
          </CardContent>
        </Card>

        {/* Information Card */}
        <Card className="bg-orange-50 border-orange-200">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-orange-900 mb-2">Before You Delete</h3>
                <ul className="text-sm text-orange-800 space-y-1">
                  <li>• Withdraw any remaining balance from your wallet</li>
                  <li>• Download any transaction records you need</li>
                  <li>• Cancel any pending transactions</li>
                  <li>• Contact support if you have questions</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              Final Confirmation Required
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Are you absolutely sure you want to delete your account? This action is permanent and cannot be undone.
              </p>
              <p className="font-semibold text-red-600">
                All your data, transactions, and account information will be permanently deleted.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Yes, Delete My Account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BottomNav />
    </div>
  );
}


