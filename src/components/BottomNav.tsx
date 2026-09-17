import { useLocation } from "react-router-dom";
import { Home, CreditCard, RefreshCw, User } from "lucide-react";
import { goExpoWeb, expoWebRoutes } from "@/config/site";

const navItems = [
  { expoPath: expoWebRoutes.home, label: "Home", icon: Home, match: ["/", "/index"] },
  { expoPath: expoWebRoutes.payBills, label: "Pay Bills", icon: CreditCard, match: ["/pay-bills"] },
  {
    expoPath: expoWebRoutes.transactions,
    label: "Transactions",
    icon: RefreshCw,
    match: ["/transactions"],
  },
  { expoPath: expoWebRoutes.profile, label: "Profile", icon: User, match: ["/profile"] },
] as const;

/**
 * Rarely shown on Vite (customer UI is Expo). If rendered, tabs open Expo web.
 */
export default function BottomNav() {
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 pb-safe">
      <div className="flex items-center justify-around h-16">
        {navItems.map((item) => {
          const isActive = item.match.some(
            (m) => location.pathname === m || location.pathname.startsWith(`${m}/`),
          );
          const Icon = item.icon;

          return (
            <button
              key={item.expoPath}
              type="button"
              onClick={() => goExpoWeb(item.expoPath, "/open/app")}
              className="flex flex-col items-center justify-center flex-1 h-full transition-colors"
            >
              <Icon className={`w-6 h-6 mb-1 ${isActive ? "text-brand" : "text-gray-400"}`} />
              <span className={`text-xs ${isActive ? "text-brand font-medium" : "text-gray-600"}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
