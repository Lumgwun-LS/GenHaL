import { Link, useLocation } from "wouter";
import { UserButton, useUser } from "@clerk/react";
import { 
  LayoutDashboard, 
  Users, 
  Share2, 
  Sparkles, 
  Package, 
  Archive, 
  ShoppingCart, 
  Target, 
  Mail, 
  MessageSquare,
  CreditCard,
  Menu,
  X
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/vendors", label: "Vendors", icon: Users },
  { href: "/social", label: "Social Hub", icon: Share2 },
  { href: "/ai-studio", label: "AI Studio", icon: Sparkles },
  { href: "/products", label: "Products", icon: Package },
  { href: "/inventory", label: "Inventory", icon: Archive },
  { href: "/orders", label: "Orders", icon: ShoppingCart },
  { href: "/leads", label: "Leads", icon: Target },
  { href: "/email-campaigns", label: "Email", icon: Mail },
  { href: "/sms-campaigns", label: "SMS", icon: MessageSquare },
  { href: "/payments", label: "Payments", icon: CreditCard },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 border-b bg-card">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded flex items-center justify-center text-primary-foreground font-bold text-xs">
            ACS
          </div>
          <span className="font-bold text-lg">Awajimaa Connect Suite</span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setIsMobileOpen(!isMobileOpen)}>
          {isMobileOpen ? <X /> : <Menu />}
        </Button>
      </div>

      {/* Sidebar */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-card border-r flex-col transition-transform duration-200 ease-in-out md:relative md:translate-x-0 md:flex",
        isMobileOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-6 hidden md:flex items-center gap-3 border-b">
          <div className="w-8 h-8 bg-primary rounded flex items-center justify-center text-primary-foreground font-bold text-xs">
            ACS
          </div>
          <span className="font-bold text-base tracking-tight">Awajimaa Connect Suite</span>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = location === item.href || location.startsWith(item.href + "/");
            return (
              <Link key={item.href} href={item.href} className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                isActive 
                  ? "bg-primary/10 text-primary" 
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
              onClick={() => setIsMobileOpen(false)}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t flex items-center gap-3">
          <UserButton afterSignOutUrl="/" appearance={{ elements: { userButtonAvatarBox: "w-8 h-8" } }} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">My Account</p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-screen max-w-full overflow-hidden">
        {children}
      </main>
    </div>
  );
}
