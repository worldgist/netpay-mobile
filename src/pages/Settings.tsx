import { useState, useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface AppSetting {
  id: string;
  setting_key: string;
  setting_value: any;
  setting_category: string;
  description: string | null;
}

export default function Settings() {
  const [settings, setSettings] = useState<AppSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    const { data, error } = await (supabase as any)
      .from("app_settings")
      .select("*")
      .order("setting_category");

    if (error) {
      toast({
        title: "Error",
        description: "Failed to fetch app settings",
        variant: "destructive",
      });
      return;
    }

    setSettings(data || []);
    setLoading(false);
  };

  const updateSetting = async (key: string, value: any) => {
    setSaving(true);
    const { error } = await (supabase as any)
      .from("app_settings")
      .update({ 
        setting_value: value,
        updated_at: new Date().toISOString() 
      })
      .eq("setting_key", key);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to update setting",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Success",
        description: "Setting updated successfully",
      });
      fetchSettings();
    }
    setSaving(false);
  };

  const getSetting = (key: string) => {
    return settings.find((s) => s.setting_key === key);
  };

  const handleNumberChange = (key: string, field: string, value: string) => {
    const setting = getSetting(key);
    if (setting) {
      const newValue = { ...setting.setting_value, [field]: parseFloat(value) || 0 };
      updateSetting(key, newValue);
    }
  };

  const handleBooleanChange = (key: string, field: string, checked: boolean) => {
    const setting = getSetting(key);
    if (setting) {
      const newValue = { ...setting.setting_value, [field]: checked };
      updateSetting(key, newValue);
    }
  };

  if (loading) {
    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full bg-background">
          <AppSidebar />
          <main className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </main>
        </div>
      </SidebarProvider>
    );
  }

  const commissionSettings = settings.filter((s) => s.setting_category === "commissions");
  const limitSettings = settings.filter((s) => s.setting_category === "limits");
  const systemSettings = settings.filter((s) => s.setting_category === "system");
  const notificationSettings = settings.filter((s) => s.setting_category === "notifications");

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex h-16 items-center gap-4 px-6">
              <SidebarTrigger />
              <h1 className="text-2xl font-bold">App Settings</h1>
            </div>
          </header>

          <div className="p-6 space-y-6">
            <Tabs defaultValue="commissions">
              <TabsList>
                <TabsTrigger value="commissions">Commissions</TabsTrigger>
                <TabsTrigger value="limits">Transaction Limits</TabsTrigger>
                <TabsTrigger value="system">System</TabsTrigger>
                <TabsTrigger value="notifications">Notifications</TabsTrigger>
              </TabsList>

              <TabsContent value="commissions" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Commission Settings</CardTitle>
                    <CardDescription>
                      Configure commission percentages for different services
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {commissionSettings.map((setting) => (
                      <div key={setting.id}>
                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <Label className="text-base">
                              {setting.setting_key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                            </Label>
                            <p className="text-sm text-muted-foreground">{setting.description}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              step="0.1"
                              min="0"
                              max="100"
                              value={setting.setting_value.percentage || 0}
                              onChange={(e) => handleNumberChange(setting.setting_key, "percentage", e.target.value)}
                              className="w-24"
                              disabled={saving}
                            />
                            <span className="text-sm text-muted-foreground">%</span>
                          </div>
                        </div>
                        <Separator className="mt-4" />
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="limits" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Transaction Limits</CardTitle>
                    <CardDescription>
                      Set minimum and maximum transaction amounts
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {limitSettings.map((setting) => (
                      <div key={setting.id}>
                        <div className="space-y-2">
                          <Label className="text-base">
                            {setting.setting_key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                          </Label>
                          <p className="text-sm text-muted-foreground mb-2">{setting.description}</p>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">₦</span>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={setting.setting_value.amount || 0}
                              onChange={(e) => handleNumberChange(setting.setting_key, "amount", e.target.value)}
                              className="max-w-xs"
                              disabled={saving}
                            />
                          </div>
                        </div>
                        <Separator className="mt-4" />
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="system" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>System Settings</CardTitle>
                    <CardDescription>Configure system-wide preferences</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {systemSettings.map((setting) => (
                      <div key={setting.id}>
                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <Label className="text-base">
                              {setting.setting_key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                            </Label>
                            <p className="text-sm text-muted-foreground">{setting.description}</p>
                          </div>
                          <Switch
                            checked={setting.setting_value.enabled || false}
                            onCheckedChange={(checked) =>
                              handleBooleanChange(setting.setting_key, "enabled", checked)
                            }
                            disabled={saving}
                          />
                        </div>
                        <Separator className="mt-4" />
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="notifications" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Notification Settings</CardTitle>
                    <CardDescription>Configure notification preferences</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {notificationSettings.map((setting) => (
                      <div key={setting.id}>
                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <Label className="text-base">
                              {setting.setting_key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                            </Label>
                            <p className="text-sm text-muted-foreground">{setting.description}</p>
                          </div>
                          <Switch
                            checked={setting.setting_value.enabled || false}
                            onCheckedChange={(checked) =>
                              handleBooleanChange(setting.setting_key, "enabled", checked)
                            }
                            disabled={saving}
                          />
                        </div>
                        <Separator className="mt-4" />
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Additional Settings</CardTitle>
                <CardDescription>
                  Manage content pages, referral settings, and other configurations
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-3">
                <Button
                  variant="outline"
                  className="h-24 flex flex-col gap-2"
                  onClick={() => window.location.href = "/content"}
                >
                  <div className="text-4xl">📄</div>
                  <div className="font-medium">Content Management</div>
                  <div className="text-xs text-muted-foreground">Privacy, Terms, Support</div>
                </Button>
                
                <Button
                  variant="outline"
                  className="h-24 flex flex-col gap-2"
                  onClick={() => window.location.href = "/referrals"}
                >
                  <div className="text-4xl">🎁</div>
                  <div className="font-medium">Referral Settings</div>
                  <div className="text-xs text-muted-foreground">Rewards & Bonuses</div>
                </Button>

                <Button
                  variant="outline"
                  className="h-24 flex flex-col gap-2"
                  onClick={() => window.location.href = "/analytics"}
                >
                  <div className="text-4xl">📊</div>
                  <div className="font-medium">Analytics</div>
                  <div className="text-xs text-muted-foreground">Revenue & Performance</div>
                </Button>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
