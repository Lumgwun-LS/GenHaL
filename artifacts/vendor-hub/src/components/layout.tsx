import WhatsAppButton from "@/components/whatsapp-button";
import AiQuickCreate from "@/components/ai-quick-create";
import VoiceFAB from "@/components/voice-fab";
import { VoiceProvider } from "@/contexts/voice-context";
import { Link, useLocation, useSearch } from "wouter";
import { UserButton } from "@clerk/react";
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
  Phone,
  Globe,
  BarChart2,
  Menu,
  X,
  ShieldCheck,
  BarChart3,
  UserCircle,
  Receipt,
  PiggyBank,
  LineChart,
  DollarSign,
  Building2,
  Megaphone,
  ExternalLink,
  Cpu,
  ShieldOff,
  Tag,
  Store,
  FileText,
} from "lucide-react";
import { CrossAppBanner } from "./cross-app-banner";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { NotificationBell } from "./notification-bell";
import { TrialUpgradeBanner } from "./trial-upgrade-banner";
import { FaInstagram, FaFacebook, FaXTwitter, FaLinkedin, FaTiktok, FaTelegram } from "react-icons/fa6";

const SOCIAL_LINKS = [
  { name: "Instagram", href: "https://www.instagram.com/lumgwunsolutionsgroup", icon: FaInstagram, color: "hover:text-pink-500" },
  { name: "Facebook",  href: "https://web.facebook.com/LUMGWUNSOLUTIONS/",       icon: FaFacebook,  color: "hover:text-blue-500" },
  { name: "X / Twitter", href: "https://x.com/awajimaaApp",                      icon: FaXTwitter,  color: "hover:text-foreground" },
  { name: "LinkedIn",  href: "https://www.linkedin.com/company/lumgwun-solutions-group/", icon: FaLinkedin, color: "hover:text-blue-400" },
  { name: "TikTok",   href: "https://tiktok.com/@lumgwun.solutions",              icon: FaTiktok,    color: "hover:text-teal-400" },
  { name: "Telegram", href: "https://t.me/AwaApp",                               icon: FaTelegram,  color: "hover:text-sky-400" },
];

const PLATFORM_LINKS = [
  { name: "Awa Biz Suite",         href: "#",                                        current: true },
  { name: "Awajimaa App Store",    href: "https://awajimaaappstore.com" },
  { name: "Awajimaa Schools",      href: "https://www.awajimaaschools.com" },
  { name: "Awajimaa Hosting",      href: "https://www.awajimaahosting.com" },
];

function DashboardFooter() {
  return (
    <footer className="border-t border-border/50 bg-card/30 mt-auto">
      <div className="px-6 py-5 space-y-4">
        {/* Platforms row */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2">Our Platforms</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {PLATFORM_LINKS.map((p) =>
              p.current ? (
                <span key={p.name} className="text-xs font-medium text-primary flex items-center gap-1">
                  {p.name}
                  <span className="text-[9px] bg-primary/15 text-primary rounded px-1 py-0.5 font-semibold">Current</span>
                </span>
              ) : (
                <a
                  key={p.name}
                  href={p.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-0.5 group"
                >
                  {p.name}
                  <ExternalLink className="w-2.5 h-2.5 opacity-0 group-hover:opacity-60 transition-opacity" />
                </a>
              )
            )}
          </div>
        </div>

        {/* Divider + social + copyright */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          {/* Social icons */}
          <div className="flex items-center gap-3">
            {SOCIAL_LINKS.map((s) => (
              <a
                key={s.name}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={s.name}
                className={cn("text-muted-foreground/60 transition-colors", s.color)}
              >
                <s.icon className="w-3.5 h-3.5" />
              </a>
            ))}
          </div>

          {/* Copyright + support */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-[10px] text-muted-foreground/50">
            <span>© {new Date().getFullYear()} Lumgwun Solutions Group. All rights reserved.</span>
            <span className="hidden sm:inline">·</span>
            <a href="mailto:support@awajimaaapp.io" className="hover:text-muted-foreground transition-colors">support@awajimaaapp.io</a>
            <span className="hidden sm:inline">·</span>
            <a href="mailto:awajimaaapps@gmail.com" className="hover:text-muted-foreground transition-colors">awajimaaapps@gmail.com</a>
            <span className="hidden sm:inline">·</span>
            <a href="mailto:admin@Lumgwunsolutions.com" className="hover:text-muted-foreground transition-colors">admin@Lumgwunsolutions.com</a>
            <span className="hidden sm:inline">·</span>
            <a href="/contact" className="hover:text-primary transition-colors font-medium">Contact Us</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }> };
type NavGroup = { label?: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Insights",
    items: [
      { href: "/data-analysis", label: "Data Analysis", icon: BarChart2 },
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/finance-analytics", label: "Finance Analytics", icon: LineChart },
    ],
  },
  {
    label: "Marketing",
    items: [
      { href: "/social", label: "Social Hub", icon: Share2 },
      { href: "/ads", label: "Ads Suite", icon: Megaphone },
      { href: "/ai-studio", label: "AI Studio", icon: Sparkles },
      { href: "/leads", label: "Leads", icon: Target },
      { href: "/email-campaigns", label: "Email Campaigns", icon: Mail },
      { href: "/sms-campaigns", label: "SMS Campaigns", icon: MessageSquare },
      { href: "/voice-campaigns", label: "Voice Campaigns", icon: Phone },
    ],
  },
  {
    label: "Store",
    items: [
      { href: "/products", label: "Products", icon: Package },
      { href: "/inventory", label: "Inventory", icon: Archive },
      { href: "/orders", label: "Orders", icon: ShoppingCart },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/payments", label: "Payments", icon: CreditCard },
      { href: "/invoices", label: "Invoices", icon: FileText },
      { href: "/sales", label: "Sales", icon: DollarSign },
      { href: "/expenses", label: "Expenses", icon: Receipt },
      { href: "/investments", label: "Investments", icon: PiggyBank },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/branches", label: "Branches", icon: Building2 },
      { href: "/workers", label: "Workers", icon: Users },
      { href: "/website", label: "My Website", icon: Globe },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/vendors", label: "Vendors", icon: Users },
      { href: "/account", label: "Account", icon: UserCircle },
      { href: "/pricing", label: "Pricing", icon: Tag },
    ],
  },
];

function LayoutInner({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const search = useSearch();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const isAdmin = useIsAdmin();

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 border-b bg-card">
        <div className="flex items-center gap-2">
          <img src="/awajimaa-logo.jpg" alt="Awajimaa" className="w-8 h-8 rounded object-cover" />
          <span className="font-bold text-lg">Awa Biz Suite</span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setIsMobileOpen(!isMobileOpen)}>
          {isMobileOpen ? <X /> : <Menu />}
        </Button>
      </div>

      {/* Sidebar */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-card border-r flex flex-col transition-transform duration-200 ease-in-out md:relative md:translate-x-0",
        isMobileOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-6 hidden md:flex items-center gap-3 border-b">
          <img src="/awajimaa-logo.jpg" alt="Awajimaa" className="w-8 h-8 rounded object-cover" />
          <span className="font-bold text-base tracking-tight">Awa Biz Suite</span>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-3">
          {NAV_GROUPS.map((group, gi) => (
            <div key={gi} className={gi > 0 ? "mt-3" : ""}>
              {group.label && (
                <p className="px-3 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 select-none">
                  {group.label}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
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
                      <item.icon className="w-4 h-4 shrink-0" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
          {/* Cross-app link to App Store */}
          <div className="px-3 pt-4 pb-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Switch To</p>
          </div>
          <a
            href="/app-store/my-apps?ref=vendor-hub"
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground transition-colors group"
            style={{
              background: "linear-gradient(135deg, rgba(124,58,237,0.08), rgba(168,85,247,0.04))",
              border: "1px solid rgba(124,58,237,0.18)",
            }}
            onClick={() => setIsMobileOpen(false)}
          >
            <Store className="w-4 h-4 text-violet-400" />
            <span>Awajimaa App Store</span>
            <ExternalLink className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-60 transition-opacity" />
          </a>

          {isAdmin && (
            <>
              <div className="px-3 pt-4 pb-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Platform Admin</p>
              </div>
              <Link
                href="/admin"
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  location === "/admin" && !search.includes("tab=")
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                onClick={() => setIsMobileOpen(false)}
              >
                <ShieldCheck className="w-4 h-4" />
                Admin Panel
              </Link>
              <Link
                href="/admin?tab=infrastructure-billing"
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  location === "/admin" && search.includes("tab=infrastructure-billing")
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                onClick={() => setIsMobileOpen(false)}
              >
                <Cpu className="w-4 h-4" />
                Billing Intelligence
              </Link>
              <Link
                href="/admin?tab=billing-enforcement"
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  location === "/admin" && search.includes("tab=billing-enforcement")
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                onClick={() => setIsMobileOpen(false)}
              >
                <ShieldOff className="w-4 h-4" />
                Billing Enforcement
              </Link>
            </>
          )}
        </nav>

        <div className="p-4 border-t flex items-center gap-3">
          <UserButton {...{ afterSignOutUrl: "/" } as object} appearance={{ elements: { userButtonAvatarBox: "w-8 h-8" } }} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">My Account</p>
          </div>
          <NotificationBell />
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-screen max-w-full overflow-hidden">
        <CrossAppBanner />
        <TrialUpgradeBanner />
        <div className="flex-1">
          {children}
        </div>
        <DashboardFooter />
      </main>

      {/* Floating action buttons — bottom-right stack */}
      <VoiceFAB />
      <AiQuickCreate />
      <WhatsAppButton />
    </div>
  );
}

// Wrap LayoutInner with VoiceProvider so the FAB and all forms share the context
export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <VoiceProvider>
      <LayoutInner>{children}</LayoutInner>
    </VoiceProvider>
  );
}
