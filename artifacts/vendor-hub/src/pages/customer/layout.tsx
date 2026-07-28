/**
 * CustomerLayout — the shell for all /customer/* pages.
 * No vendor sidebar. Uses Clerk for auth.
 */
import { useUser, SignInButton } from "@clerk/react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

type NavItem = { href: string; label: string; icon: string };
const NAV: NavItem[] = [
  { href: "/customer/dashboard", label: "Dashboard",     icon: "🏠" },
  { href: "/customer/orders",    label: "My Orders",     icon: "📦" },
  { href: "/customer/vendors",   label: "My Vendors",    icon: "🏪" },
  { href: "/customer/inbox",     label: "Inbox",         icon: "📬" },
  { href: "/customer/ai",        label: "Awajimaa AI",   icon: "🤖" },
  { href: "/customer/profile",   label: "Profile",       icon: "👤" },
];

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useUser();
  const [location] = useLocation();

  const { data: notifs } = useQuery({
    queryKey: ["customer-notifications-count"],
    queryFn: () => fetch(`${BASE}/api/customer/notifications`).then(r => r.ok ? r.json() : { unreadCount: 0 }),
    enabled: isSignedIn,
    refetchInterval: 60_000,
  });

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-50 to-white">
        <div className="text-center text-muted-foreground animate-pulse">Loading…</div>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-violet-50 to-white p-6">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600 to-coral-500 flex items-center justify-center text-3xl mb-6 shadow-lg"
          style={{ background: "linear-gradient(135deg,#7F50FF,#FF7F50)" }}>🛒</div>
        <h1 className="text-2xl font-bold mb-2">Customer Account</h1>
        <p className="text-muted-foreground text-center max-w-sm mb-8">
          Sign in to view your orders, saved vendors, and unlock the Awajimaa AI Dashboard.
        </p>
        <SignInButton mode="modal">
          <button className="px-8 py-3 rounded-xl font-bold text-white shadow-lg"
            style={{ background: "linear-gradient(135deg,#7F50FF,#FF7F50)" }}>
            Sign in with Google
          </button>
        </SignInButton>
        <p className="text-xs text-muted-foreground mt-6">
          Are you a business?{" "}
          <Link href="/dashboard" className="text-violet-600 hover:underline font-medium">Open vendor dashboard →</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-60 bg-white border-r border-gray-100 flex flex-col shrink-0 h-screen sticky top-0">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-gray-100">
          <Link href="/customer/dashboard" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center text-base shadow-sm"
              style={{ background: "linear-gradient(135deg,#7F50FF,#FF7F50)" }}>🛍️</div>
            <div>
              <p className="text-sm font-bold leading-none text-gray-900">Awa Biz Suite</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Customer Portal</p>
            </div>
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {NAV.map(item => {
            const isActive = location.startsWith(item.href);
            const badge = item.href === "/customer/inbox" && notifs?.unreadCount > 0
              ? notifs.unreadCount : null;
            return (
              <Link key={item.href} href={item.href}>
                <div className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium cursor-pointer transition-all",
                  isActive
                    ? "text-white shadow-md"
                    : "text-gray-600 hover:bg-violet-50 hover:text-violet-700"
                )}
                style={isActive ? { background: "linear-gradient(135deg,#7F50FF,#FF7F50)" } : {}}>
                  <span className="text-base">{item.icon}</span>
                  <span className="flex-1">{item.label}</span>
                  {badge && (
                    <span className="min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
                      {badge > 9 ? "9+" : badge}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Bottom: vendor link */}
        <div className="p-3 border-t border-gray-100">
          <Link href="/dashboard">
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-muted-foreground hover:bg-gray-50 cursor-pointer">
              <span>🏢</span>
              <span>Vendor Dashboard</span>
            </div>
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 overflow-auto">
        {children}
      </main>
    </div>
  );
}
