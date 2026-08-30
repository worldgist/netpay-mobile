import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const NAV_ITEMS = [
  { label: "Home", path: "/" },
  { label: "About Us", path: "/about" },
  { label: "Contact Us", path: "/contact-us" },
  { label: "FAQ", path: "/faq" },
] as const;

export function LandingHeader() {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <header className="border-b border-orange-300/50 bg-gradient-to-r from-orange-500 via-orange-600 to-orange-700 text-white sticky top-0 z-50 shadow-lg">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between transition-smooth">
        <div className="flex items-center gap-6">
          <button
            type="button"
            onClick={() => go("/")}
            className="flex items-center gap-3"
            aria-label="NetPay home"
          >
            <img
              src="/logo.png"
              alt="NetPay"
              className="w-10 h-10 rounded-lg border border-white/40 shadow-elegant"
              loading="lazy"
            />
            <span className="text-2xl font-bold tracking-tight">
              <span className="text-white">NET</span>
              <span className="text-orange-200">PAY</span>
            </span>
          </button>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-white/80">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.path}
                type="button"
                onClick={() => go(item.path)}
                className={
                  location.pathname === item.path
                    ? "text-white"
                    : "hover:text-white transition-colors"
                }
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/15 hover:text-white"
              aria-label="Open menu"
            >
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72 sm:max-w-sm p-0">
            <SheetHeader className="border-b border-orange-200/60 bg-gradient-to-r from-orange-500 via-orange-600 to-orange-700 px-6 py-5 text-left">
              <SheetTitle className="text-white">Menu</SheetTitle>
            </SheetHeader>
            <nav className="flex flex-col p-4 gap-1">
              {NAV_ITEMS.map((item) => {
                const active = location.pathname === item.path;
                return (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => go(item.path)}
                    className={`rounded-lg px-4 py-3 text-left text-sm font-medium transition-colors ${
                      active
                        ? "bg-orange-50 text-orange-700"
                        : "text-foreground hover:bg-orange-50/70"
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
