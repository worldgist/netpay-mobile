import { useState, useEffect } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Users, CheckCircle, Clock, Gift, Settings, Circle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Referral {
  id: string;
  referrer_id: string;
  referred_id: string | null;
  referral_code: string;
  status: string;
  reward_amount: number;
  reward_paid: boolean;
  referrer_reward_paid: boolean;
  referred_email: string | null;
  referred_phone: string | null;
  created_at: string;
  completed_at: string | null;
  referrer?: {
    full_name: string;
    email: string;
  };
  referred?: {
    full_name: string;
    email: string;
  };
}

interface ReferralSettings {
  id: string;
  reward_amount: number;
  referrer_reward: number;
  referred_reward: number;
  min_transaction_for_reward: number;
  is_active: boolean;
}

export default function Referrals() {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [settings, setSettings] = useState<ReferralSettings | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedReferral, setSelectedReferral] = useState<Referral | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [stats, setStats] = useState({
    total: 0,
    completed: 0,
    pending: 0,
    totalRewards: 0,
  });

  useEffect(() => {
    fetchReferrals();
    fetchSettings();

    // Real-time subscription for referrals
    const referralsChannel = supabase
      .channel('admin-referrals')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'referrals',
        },
        (payload) => {
          console.log('Referral change detected:', payload);
          fetchReferrals();
          setLastUpdate(new Date());
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(referralsChannel);
    };
  }, []);

  const fetchReferrals = async () => {
    const { data, error } = await supabase
      .from("referrals")
      .select(`
        *,
        referrer:profiles!referrals_referrer_id_fkey(full_name, email),
        referred:profiles!referrals_referred_id_fkey(full_name, email)
      `)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching referrals:", error);
      toast.error("Failed to load referrals");
      return;
    }

    setReferrals(data || []);
    
    // Calculate stats
    const total = data?.length || 0;
    const completed = data?.filter(r => r.status === 'completed').length || 0;
    const pending = data?.filter(r => r.status === 'pending').length || 0;
    const totalRewards = data?.reduce((sum, r) => sum + (Number(r.reward_amount) || 0), 0) || 0;

    setStats({ total, completed, pending, totalRewards });
  };

  const fetchSettings = async () => {
    const { data, error } = await supabase
      .from("referral_settings")
      .select("*")
      .single();

    if (error) {
      console.error("Error fetching settings:", error);
      return;
    }

    setSettings(data);
  };

  const handleUpdateStatus = async (referralId: string, newStatus: string) => {
    const { error } = await supabase
      .from("referrals")
      .update({ 
        status: newStatus,
        completed_at: newStatus === 'completed' ? new Date().toISOString() : null
      })
      .eq("id", referralId);

    if (error) {
      toast.error("Failed to update status");
      return;
    }

    toast.success("Status updated successfully");
    fetchReferrals();
    setIsViewDialogOpen(false);
  };

  const handlePayReward = async (referralId: string, paymentType: 'referrer' | 'referred' | 'both') => {
    try {
      const { data, error } = await supabase.functions.invoke('process-referral-earning', {
        body: { referralId, paymentType }
      });

      if (error) {
        console.error('Error processing payment:', error);
        toast.error(error.message || "Failed to process reward payment");
        return;
      }

      if (data.success) {
        const { results } = data;
        let message = "Reward payment processed: ";
        const payments = [];
        
        if (results.referrerPaid) {
          payments.push(`Referrer: ₦${results.referrerAmount}`);
        }
        if (results.referredPaid) {
          payments.push(`Referred: ₦${results.referredAmount}`);
        }
        
        message += payments.join(', ');
        toast.success(message);
        fetchReferrals();
        setIsViewDialogOpen(false);
      } else {
        toast.error(data.error || "Failed to process reward payment");
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error("An error occurred while processing payment");
    }
  };

  const handleUpdateSettings = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!settings) return;

    const formData = new FormData(e.currentTarget);
    const updates = {
      referrer_reward: Number(formData.get("referrer_reward")),
      referred_reward: Number(formData.get("referred_reward")),
      min_transaction_for_reward: Number(formData.get("min_transaction")),
      is_active: formData.get("is_active") === "true",
    };

    const { error } = await supabase
      .from("referral_settings")
      .update(updates)
      .eq("id", settings.id);

    if (error) {
      toast.error("Failed to update settings");
      return;
    }

    toast.success("Settings updated successfully");
    fetchSettings();
    setIsSettingsDialogOpen(false);
  };

  const filteredReferrals = referrals.filter(referral => {
    const query = searchQuery.toLowerCase();
    return (
      referral.referral_code.toLowerCase().includes(query) ||
      referral.referrer?.full_name?.toLowerCase().includes(query) ||
      referral.referrer?.email?.toLowerCase().includes(query) ||
      referral.referred?.full_name?.toLowerCase().includes(query) ||
      referral.referred_email?.toLowerCase().includes(query)
    );
  });

  const statsCards = [
    {
      title: "Total Referrals",
      value: stats.total,
      icon: Users,
      color: "text-primary",
    },
    {
      title: "Completed",
      value: stats.completed,
      icon: CheckCircle,
      color: "text-green-500",
    },
    {
      title: "Pending",
      value: stats.pending,
      icon: Clock,
      color: "text-yellow-500",
    },
    {
      title: "Total Rewards",
      value: `₦${stats.totalRewards.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`,
      icon: Gift,
      color: "text-purple-500",
    },
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
                  <h1 className="text-2xl font-bold">Referral Management</h1>
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
                <Dialog open={isSettingsDialogOpen} onOpenChange={setIsSettingsDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Settings className="h-4 w-4 mr-2" />
                      Settings
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Referral Settings</DialogTitle>
                      <DialogDescription>
                        Configure referral rewards and requirements
                      </DialogDescription>
                    </DialogHeader>
                    {settings && (
                      <form onSubmit={handleUpdateSettings} className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="referrer_reward">Referrer Reward (₦)</Label>
                          <Input
                            id="referrer_reward"
                            name="referrer_reward"
                            type="number"
                            step="0.01"
                            defaultValue={settings.referrer_reward}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="referred_reward">Referred User Reward (₦)</Label>
                          <Input
                            id="referred_reward"
                            name="referred_reward"
                            type="number"
                            step="0.01"
                            defaultValue={settings.referred_reward}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="min_transaction">Minimum Transaction (₦)</Label>
                          <Input
                            id="min_transaction"
                            name="min_transaction"
                            type="number"
                            step="0.01"
                            defaultValue={settings.min_transaction_for_reward}
                            required
                          />
                          <p className="text-xs text-muted-foreground">
                            Minimum transaction amount for referred user to complete before reward is paid
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="is_active">Status</Label>
                          <Select name="is_active" defaultValue={settings.is_active.toString()}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="true">Active</SelectItem>
                              <SelectItem value="false">Inactive</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <DialogFooter>
                          <Button type="submit">Save Changes</Button>
                        </DialogFooter>
                      </form>
                    )}
                  </DialogContent>
                </Dialog>
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

            <Card>
              <CardHeader>
                <CardTitle>All Referrals</CardTitle>
                <CardDescription>Manage and track all referral activities</CardDescription>
                <Input
                  placeholder="Search by code, referrer, or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="mt-4"
                />
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Referral Code</TableHead>
                        <TableHead>Referrer</TableHead>
                        <TableHead>Referred</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Reward</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredReferrals.map((referral) => (
                        <TableRow key={referral.id}>
                          <TableCell className="font-mono">{referral.referral_code}</TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium">{referral.referrer?.full_name}</div>
                              <div className="text-sm text-muted-foreground">{referral.referrer?.email}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {referral.referred ? (
                              <div>
                                <div className="font-medium">{referral.referred.full_name}</div>
                                <div className="text-sm text-muted-foreground">{referral.referred.email}</div>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">
                                {referral.referred_email || "Not yet signed up"}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                referral.status === "completed"
                                  ? "default"
                                  : referral.status === "pending"
                                  ? "secondary"
                                  : "outline"
                              }
                            >
                              {referral.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            ₦{Number(referral.reward_amount || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                            {referral.reward_paid && (
                              <Badge variant="outline" className="ml-2">Paid</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {new Date(referral.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedReferral(referral);
                                setIsViewDialogOpen(true);
                              }}
                            >
                              View
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Referral Details</DialogTitle>
          </DialogHeader>
          {selectedReferral && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Referral Code</Label>
                  <p className="font-mono font-medium">{selectedReferral.referral_code}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <div className="mt-1">
                    <Select
                      value={selectedReferral.status}
                      onValueChange={(value) => handleUpdateStatus(selectedReferral.id, value)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="expired">Expired</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div>
                <Label className="text-muted-foreground">Referrer</Label>
                <p className="font-medium">{selectedReferral.referrer?.full_name}</p>
                <p className="text-sm text-muted-foreground">{selectedReferral.referrer?.email}</p>
              </div>

              <div>
                <Label className="text-muted-foreground">Referred User</Label>
                {selectedReferral.referred ? (
                  <>
                    <p className="font-medium">{selectedReferral.referred.full_name}</p>
                    <p className="text-sm text-muted-foreground">{selectedReferral.referred.email}</p>
                  </>
                ) : (
                  <p className="text-muted-foreground">
                    {selectedReferral.referred_email || "Not yet signed up"}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Reward Amount</Label>
                  <p className="font-medium">
                    ₦{Number(selectedReferral.reward_amount || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Created</Label>
                  <p className="font-medium">
                    {new Date(selectedReferral.created_at).toLocaleString()}
                  </p>
                </div>
              </div>

              {selectedReferral.completed_at && (
                <div>
                  <Label className="text-muted-foreground">Completed</Label>
                  <p className="font-medium">
                    {new Date(selectedReferral.completed_at).toLocaleString()}
                  </p>
                </div>
              )}

              <div className="flex gap-2 pt-4 border-t">
                <Button
                  onClick={() => handlePayReward(selectedReferral.id, 'referrer')}
                  disabled={selectedReferral.referrer_reward_paid}
                  className="flex-1"
                >
                  {selectedReferral.referrer_reward_paid ? "✓ Referrer Paid" : `Pay Referrer ₦${Number(settings?.referrer_reward || 0).toLocaleString()}`}
                </Button>
                <Button
                  onClick={() => handlePayReward(selectedReferral.id, 'referred')}
                  disabled={selectedReferral.reward_paid || !selectedReferral.referred_id}
                  className="flex-1"
                >
                  {selectedReferral.reward_paid ? "✓ Referred Paid" : `Pay Referred ₦${Number(settings?.referred_reward || 0).toLocaleString()}`}
                </Button>
              </div>
              
              {!selectedReferral.referrer_reward_paid && !selectedReferral.reward_paid && selectedReferral.referred_id && (
                <Button
                  onClick={() => handlePayReward(selectedReferral.id, 'both')}
                  className="w-full"
                  variant="default"
                >
                  Pay Both (₦{(Number(settings?.referrer_reward || 0) + Number(settings?.referred_reward || 0)).toLocaleString()})
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
