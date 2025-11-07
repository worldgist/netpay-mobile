import { useNavigate, useLocation } from "react-router-dom";
import { Home, CreditCard, RefreshCw, User } from "lucide-react";

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { path: "/user/dashboard", label: "Home", icon: Home },
    { path: "/user/paybills", label: "Pay Bills", icon: CreditCard },
    { path: "/user/transactions", label: "Transactions", icon: RefreshCw },
    { path: "/user/profile", label: "Profile", icon: User },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 pb-safe">
      <div className="flex items-center justify-around h-16">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;

          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className="flex flex-col items-center justify-center flex-1 h-full transition-colors"
            >
              <Icon
                className={`w-6 h-6 mb-1 ${
                  isActive ? "text-[#FF6B00]" : "text-gray-400"
                }`}
              />
              <span
                className={`text-xs ${
                  isActive ? "text-[#FF6B00] font-medium" : "text-gray-600"
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
