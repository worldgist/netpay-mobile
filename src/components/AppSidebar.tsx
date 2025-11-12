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
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const menuItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "MobileNig API", url: "/mobilenig", icon: Globe },
  { title: "SMEPLUG API", url: "/smeplug", icon: Globe },
  { title: "PayVessel API", url: "/payvessel", icon: Globe },
  { title: "Transactions", url: "/transactions", icon: CreditCard },
  { title: "Airtime", url: "/airtime", icon: Smartphone },
  { title: "Data Plans", url: "/data-plans", icon: Wifi },
  { title: "Electricity", url: "/electricity", icon: Zap },
  { title: "Cable TV", url: "/cable-tv", icon: Tv },
  { title: "Education", url: "/education", icon: GraduationCap },
  { title: "Analytics", url: "/analytics", icon: TrendingUp },
  { title: "Referrals", url: "/referrals", icon: Gift },
  { title: "Users", url: "/users", icon: Users },
  { title: "Staff", url: "/staff", icon: UserCog },
  { title: "HR Manager", url: "/hr", icon: Users },
  { title: "Compliance", url: "/compliance", icon: ShieldCheck },
  { title: "Content", url: "/content", icon: FileText },
  { title: "Notifications", url: "/notifications", icon: Bell },
  { title: "Support", url: "/contact", icon: LifeBuoy },
  { title: "Settings", url: "/settings", icon: Settings },
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

        <SidebarGroup>
          <SidebarGroupLabel>Main Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end
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

        <div className="mt-auto p-4">
          <SidebarMenuButton onClick={handleLogout} className="w-full justify-start gap-3 hover:bg-destructive/10 hover:text-destructive transition-smooth">
            <LogOut className="h-4 w-4" />
            {!isCollapsed && <span>Logout</span>}
          </SidebarMenuButton>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}
