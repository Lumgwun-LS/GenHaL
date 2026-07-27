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
  Ruler,
  ChevronDown,
} from "lucide-react";
import { CrossAppBanner } from "./cross-app-banner";
import { useState, useCallback } from "react";
import { trackEvent } from "@/lib/analytics";
import { useCurrentVendor } from "@/hooks/useCurrentVendor";
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
type NavGroup = { label?: string; items: NavItem[]; defaultOpen?: boolean };

const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Insights",
    defaultOpen: true,
    items: [
      { href: "/analytics",        label: "Analytics",         icon: BarChart3 },
      { href: "/data-analysis",    label: "Data Analysis",     icon: BarChart2 },
      { href: "/finance-analytics",label: "Finance Analytics", icon: LineChart },
    ],
  },
  {
    label: "Marketing",
    defaultOpen: true,
    items: [
      { href: "/social",           label: "Social Hub",        icon: Share2 },
      { href: "/ads",              label: "Ads Suite",         icon: Megaphone },
      { href: "/ai-studio",        label: "AI Studio",         icon: Sparkles },
      { href: "/leads",            label: "Leads & CRM",       icon: Target },
      { href: "/email-campaigns",  label: "Email Campaigns",   icon: Mail },
      { href: "/sms-campaigns",    label: "SMS Campaigns",     icon: MessageSquare },
      { href: "/voice-campaigns",  label: "Voice Campaigns",   icon: Phone },
    ],
  },
  {
    label: "Store",
    defaultOpen: true,
    items: [
      { href: "/products",  label: "Products",   icon: Package },
      { href: "/inventory", label: "Inventory",  icon: Archive },
      { href: "/orders",    label: "Orders",     icon: ShoppingCart },
    ],
  },
  {
    label: "Finance",
    defaultOpen: true,
    items: [
      { href: "/payments",    label: "Payments",    icon: CreditCard },
      { href: "/invoices",    label: "Invoices",    icon: FileText },
      { href: "/sales",       label: "Sales",       icon: DollarSign },
      { href: "/expenses",    label: "Expenses",    icon: Receipt },
      { href: "/investments", label: "Investments", icon: PiggyBank },
    ],
  },
  {
    label: "Operations",
    defaultOpen: true,
    items: [
      { href: "/branches", label: "Branches",   icon: Building2 },
      { href: "/workers",  label: "Workers",    icon: Users },
      { href: "/website",  label: "My Website", icon: Globe },
    ],
  },
  {
    label: "Design Studio",
    defaultOpen: true,
    items: [
      { href: "/architect",     label: "AI Design Studio",  icon: Ruler },
      { href: "/real-estate",   label: "Real Estate",       icon: Building2 },
    ],
  },
  {
    label: "Account",
    defaultOpen: true,
    items: [
      { href: "/vendors", label: "Vendors",  icon: Users },
      { href: "/account", label: "Account",  icon: UserCircle },
      { href: "/pricing", label: "Pricing",  icon: Tag },
    ],
  },
];

/** A single collapsible nav group with smooth CSS-transition animation */
function NavGroupSection({
  group,
  location,
  onNavClick,
}: {
  group: NavGroup;
  location: string;
  onNavClick: (label: string) => void;
}) {
  const hasActive = group.items.some(
    (item) => location === item.href || location.startsWith(item.href + "/")
  );
  const [open, setOpen] = useState(group.defaultOpen ?? true);

  // Always open if a child is active
  const isOpen = open || hasActive;

  if (!group.label) {
    // Pinned top-level items — never collapsible
    return (
      <div className="space-y-0.5 mb-1">
        {group.items.map((item) => (
          <NavLink key={item.href} item={item} location={location} onClick={onNavClick} />
        ))}
      </div>
    );
  }

  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/40 transition-all duration-150 select-none group/hdr"
      >
        <span>{group.label}</span>
        <ChevronDown
          className={cn(
            "w-3 h-3 transition-transform duration-200",
            isOpen ? "rotate-0" : "-rotate-90"
          )}
        />
      </button>

      {/* Smooth height animation via max-height trick */}
      <div
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{ maxHeight: isOpen ? `${group.items.length * 44}px` : "0px" }}
      >
        <div className="space-y-0.5 pt-0.5">
          {group.items.map((item) => (
            <NavLink key={item.href} item={item} location={location} onClick={onNavClick} />
          ))}
        </div>
      </div>
    </div>
  );
}

function NavLink({
  item,
  location,
  onClick,
}: {
  item: NavItem;
  location: string;
  onClick: (label: string) => void;
}) {
  const isActive = location === item.href || location.startsWith(item.href + "/");
  return (
    <Link
      href={item.href}
      onClick={() => onClick(item.label)}
      className={cn(
        "group/link flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium",
        "transition-all duration-150 ease-out",
        "hover:translate-x-0.5",
        isActive
          ? "bg-primary/12 text-primary shadow-sm shadow-primary/10 border border-primary/15"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground border border-transparent"
      )}
    >
      <item.icon className={cn(
        "w-4 h-4 shrink-0 transition-colors duration-150",
        isActive ? "text-primary" : "text-muted-foreground/70 group-hover/link:text-foreground"
      )} />
      <span className="truncate">{item.label}</span>
      {isActive && (
        <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
      )}
    </Link>
  );
}

function LayoutInner({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const search = useSearch();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const isAdmin = useIsAdmin();
  const { vendor } = useCurrentVendor();

  const handleNavClick = useCallback((label: string) => {
    setIsMobileOpen(false);
    trackEvent("nav_click", label, { vendorId: vendor?.id ?? null });
  }, [vendor]);

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">

      {/* ── Mobile top bar ─────────────────────────────────────── */}
      <div className="md:hidden sticky top-0 z-40 flex items-center justify-between px-4 h-14 border-b bg-card/95 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <img src="/awajimaa-logo.jpg" alt="Awajimaa" className="w-7 h-7 rounded object-cover" />
          <span className="font-bold text-base tracking-tight">Awa Biz Suite</span>
        </div>
        <div className="flex items-center gap-2">
          <NotificationBell />
          <Button
            variant="ghost" size="icon"
            className="w-9 h-9"
            onClick={() => setIsMobileOpen(!isMobileOpen)}
            aria-label={isMobileOpen ? "Close menu" : "Open menu"}
          >
            {isMobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
        </div>
      </div>

      {/* ── Mobile drawer overlay ──────────────────────────────── */}
      {isMobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* ── Sidebar ───────────────────────────────────────────── */}
      {/*   mobile: fixed overlay that slides in from left         */}
      {/*   desktop: sticky column that matches the viewport height */}
      <aside className={cn(
        // shared
        "z-50 w-72 bg-card border-r border-border/60 flex flex-col",
        // mobile: full-height fixed slide-in panel
        "fixed inset-y-0 left-0 transition-transform duration-300 ease-in-out",
        isMobileOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full",
        // desktop: static sticky column — key fix for scroll
        "md:sticky md:top-0 md:h-screen md:translate-x-0 md:transition-none md:shadow-none"
      )}>

        {/* Sidebar header — click logo to go to landing page */}
        <div className="flex items-center gap-3 px-4 h-16 border-b border-border/50 shrink-0">
          <Link
            href="/home"
            className="flex items-center gap-3 flex-1 min-w-0 group/logo"
            onClick={() => setIsMobileOpen(false)}
          >
            <img src="/awajimaa-logo.jpg" alt="Awajimaa" className="w-8 h-8 rounded object-cover shrink-0 group-hover/logo:opacity-80 transition-opacity" />
            <div className="min-w-0">
              <span className="font-bold text-sm tracking-tight block truncate group-hover/logo:text-primary transition-colors">Awa Biz Suite</span>
              <span className="text-[10px] text-muted-foreground/60 font-medium">Business Platform</span>
            </div>
          </Link>
          {/* Mobile close */}
          <button
            className="md:hidden p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors shrink-0"
            onClick={() => setIsMobileOpen(false)}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable nav — takes all remaining height */}
        <nav className="flex-1 overflow-y-auto overscroll-contain py-2 px-2 space-y-0.5
          [&::-webkit-scrollbar]:w-1
          [&::-webkit-scrollbar-track]:bg-transparent
          [&::-webkit-scrollbar-thumb]:rounded-full
          [&::-webkit-scrollbar-thumb]:bg-border/50
          [&::-webkit-scrollbar-thumb:hover]:bg-border">

          {NAV_GROUPS.map((group, gi) => (
            <NavGroupSection
              key={gi}
              group={group}
              location={location}
              onNavClick={handleNavClick}
            />
          ))}

          {/* App Store cross-link */}
          <div className="pt-2 pb-1">
            <p className="px-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40 mb-1">
              Switch To
            </p>
            <a
              href="/app-store/my-apps?ref=vendor-hub"
              className="group/store flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground transition-all duration-150 hover:translate-x-0.5 border border-transparent"
              style={{ background: "linear-gradient(135deg,rgba(124,58,237,0.08),rgba(168,85,247,0.04))", border: "1px solid rgba(124,58,237,0.18)" }}
              onClick={() => setIsMobileOpen(false)}
            >
              <Store className="w-4 h-4 text-violet-400 shrink-0" />
              <span className="truncate">Awajimaa App Store</span>
              <ExternalLink className="w-3 h-3 ml-auto opacity-0 group-hover/store:opacity-60 transition-opacity shrink-0" />
            </a>
          </div>

          {/* Admin links */}
          {isAdmin && (
            <div className="pt-2">
              <p className="px-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40 mb-1">
                Platform Admin
              </p>
              {[
                { href: "/admin",                             label: "Admin Panel",         icon: ShieldCheck, match: (l: string, s: string) => l === "/admin" && !s.includes("tab=") },
                { href: "/admin?tab=infrastructure-billing",  label: "Billing Intelligence", icon: Cpu,         match: (_: string, s: string) => s.includes("tab=infrastructure-billing") },
                { href: "/admin?tab=billing-enforcement",     label: "Billing Enforcement",  icon: ShieldOff,   match: (_: string, s: string) => s.includes("tab=billing-enforcement") },
              ].map(({ href, label, icon: Icon, match }) => {
                const active = match(location, search);
                return (
                  <Link key={href} href={href}
                    className={cn(
                      "group/link flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all duration-150 hover:translate-x-0.5 border",
                      active
                        ? "bg-primary/12 text-primary shadow-sm shadow-primary/10 border-primary/15"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground border-transparent"
                    )}
                    onClick={() => setIsMobileOpen(false)}
                  >
                    <Icon className={cn("w-4 h-4 shrink-0 transition-colors duration-150", active ? "text-primary" : "text-muted-foreground/70 group-hover/link:text-foreground")} />
                    {label}
                    {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                  </Link>
                );
              })}
            </div>
          )}

          {/* Bottom padding so last item isn't flush against user bar */}
          <div className="h-4" />
        </nav>

        {/* User bar — pinned to bottom */}
        <div className="px-3 py-3 border-t border-border/50 shrink-0 flex items-center gap-3 bg-card">
          <UserButton
            {...{ afterSignOutUrl: "/" } as object}
            appearance={{ elements: { userButtonAvatarBox: "w-8 h-8" } }}
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">My Account</p>
          </div>
          <div className="hidden md:block">
            <NotificationBell />
          </div>
        </div>
      </aside>

      {/* ── Main content ──────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 max-w-full overflow-hidden">
        <CrossAppBanner />
        <TrialUpgradeBanner />
        <div className="flex-1">
          {children}
        </div>
        <DashboardFooter />
      </main>

      {/* Floating action buttons */}
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
