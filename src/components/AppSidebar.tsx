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
  LifeBuoy,
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

type MenuItem = {
  title: string;
  url: string;
  icon: LucideIcon;
  end?: boolean;
};

type MenuSection = {
  label: string;
  items: MenuItem[];
};

const menuSections: MenuSection[] = [
  {
    label: "Overview",
    items: [
      { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, end: true },
      { title: "Analytics", url: "/analytics", icon: TrendingUp },
    ],
  },
  {
    label: "Finance",
    items: [
      { title: "Treasury", url: "/treasury", icon: Banknote },
      { title: "Wallets", url: "/wallets", icon: Wallet },
      { title: "Virtual Accounts", url: "/virtual-accounts", icon: CreditCard },
      { title: "Ledger", url: "/ledger", icon: BookOpen },
      { title: "Transactions", url: "/transactions", icon: CreditCard },
      { title: "Platform Revenue", url: "/platform-revenue", icon: DollarSign },
    ],
  },
  {
    label: "Vending Services",
    items: [
      { title: "Airtime", url: "/airtime", icon: Smartphone },
      { title: "Data Plans", url: "/data-plans", icon: Wifi },
      { title: "Electricity", url: "/electricity", icon: Zap },
      { title: "Cable TV", url: "/cable-tv", icon: Tv },
      { title: "Education", url: "/education", icon: GraduationCap },
      { title: "Betting", url: "/betting", icon: Dices },
    ],
  },
  {
    label: "Payment Providers",
    items: [
      { title: "SMEPLUG", url: "/smeplug", icon: Globe },
      { title: "eBills Africa", url: "/ebills", icon: Globe },
      { title: "PayVessel", url: "/payvessel", icon: Wallet },
      { title: "Flutterwave", url: "/flutterwave", icon: CreditCard },
    ],
  },
  {
    label: "Users & Team",
    items: [
      { title: "Users", url: "/users", icon: Users },
      { title: "Deleted Accounts", url: "/deleted-accounts", icon: Trash2 },
      { title: "Referrals", url: "/referrals", icon: Gift },
      { title: "Staff", url: "/staff", icon: UserCog },
      { title: "HR Manager", url: "/hr", icon: Users },
    ],
  },
  {
    label: "Support & Comms",
    items: [
      { title: "Live Support", url: "/support-admin", icon: Headset },
      { title: "Contact Forms", url: "/contact-us", icon: LifeBuoy },
      { title: "Notifications", url: "/notifications", icon: Bell },
      { title: "Email Notifications", url: "/email-notifications", icon: Mail },
    ],
  },
  {
    label: "Administration",
    items: [
      { title: "Compliance", url: "/compliance", icon: ShieldCheck },
      { title: "Content", url: "/content", icon: FileText },
      { title: "Settings", url: "/settings", icon: Settings },
    ],
  },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const navigate = useNavigate();
  const isCollapsed = state === "collapsed";

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
                {section.items.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        end={item.end}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-3 py-2 rounded-lg transition-smooth ${
                            isActive
                              ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                              : "hover:bg-sidebar-accent/50"
                          }`
                        }
                      >
                        <item.icon className="h-4 w-4 flex-shrink-0" />
                        {!isCollapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
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

