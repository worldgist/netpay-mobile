import {
  LayoutDashboard,
  Users,
  Settings,
  DollarSign,
  CreditCard,
  TrendingUp,
  LogOut,
  Bell,
  Wifi,
  Zap,
  Tv,
  Smartphone,
  GraduationCap,
  Globe,
  Gift,
  FileText,
  UserCog,
  ShieldCheck,
  Mail,
  Dices,
  Headset,
  Banknote,
  BookOpen,
  Wallet,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ADMIN_TASKS } from "@/config/admin-tasks";
import { useAdminAccess } from "@/context/AdminAccessContext";

const TASK_ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  analytics: TrendingUp,
  treasury: Banknote,
  wallets: Wallet,
  virtual_accounts: CreditCard,
  ledger: BookOpen,
  transactions: CreditCard,
  platform_revenue: DollarSign,
  airtime: Smartphone,
  data_plans: Wifi,
  electricity: Zap,
  cable_tv: Tv,
  education: GraduationCap,
  betting: Dices,
  smeplug: Globe,
  ebills: Globe,
  payvessel: Wallet,
  flutterwave: CreditCard,
  users: Users,
  deleted_accounts: Trash2,
  referrals: Gift,
  staff: UserCog,
  hr: Users,
  support: Headset,
  notifications: Bell,
  email_notifications: Mail,
  compliance: ShieldCheck,
  content: FileText,
  settings: Settings,
};

export function AppSidebar() {
  const { state } = useSidebar();
  const navigate = useNavigate();
  const { loading, hasDbAdminRole, isSuperAdmin, taskKeys } = useAdminAccess();
  const isCollapsed = state === "collapsed";
  const menuSections = ADMIN_TASKS.reduce<Array<{ label: string; items: typeof ADMIN_TASKS }>>((sections, task) => {
    if (loading) return sections;
    const allowed = !hasDbAdminRole || isSuperAdmin || taskKeys.includes(task.key);
    if (!allowed) return sections;
    const section = sections.find((entry) => entry.label === task.section);
    if (section) {
      section.items.push(task);
    } else {
      sections.push({ label: task.section, items: [task] });
    }
    return sections;
  }, []);

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("Error signing out");
    } else {
      toast.success("Signed out successfully");
      navigate("/auth");
    }
  };

  return (
    <Sidebar className={`${isCollapsed ? "w-14" : "w-60"} border-sidebar-border transition-smooth`} collapsible="icon">
      <SidebarContent>
        <div className="flex items-center gap-2 px-4 py-6">
          <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
            <DollarSign className="w-6 h-6 text-primary" />
          </div>
          {!isCollapsed && (
            <div>
              <h2 className="font-bold text-lg">NetPay</h2>
              <p className="text-xs text-muted-foreground">Admin Portal</p>
            </div>
          )}
        </div>

        {menuSections.map((section) => (
          <SidebarGroup key={section.label}>
            <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => {
                  const Icon = TASK_ICONS[item.key] ?? LayoutDashboard;
                  return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.path}
                        end={item.path === "/dashboard"}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-3 py-2 rounded-lg transition-smooth ${
                            isActive
                              ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                              : "hover:bg-sidebar-accent/50"
                          }`
                        }
                      >
                        <Icon className="h-4 w-4 flex-shrink-0" />
                        {!isCollapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}

        <div className="mt-auto p-4">
          <SidebarMenuButton
            onClick={handleLogout}
            className="w-full justify-start gap-3 hover:bg-destructive/10 hover:text-destructive transition-smooth"
          >
            <LogOut className="h-4 w-4" />
            {!isCollapsed && <span>Logout</span>}
          </SidebarMenuButton>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}

