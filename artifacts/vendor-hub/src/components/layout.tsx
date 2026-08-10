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
  GitBranch,
  Inbox,
  Landmark,
  MapPin,
  Smartphone,
  BookOpen,
  CheckSquare,
  TicketCheck,
  Palette,
  Zap,
  TreePine,
} from "lucide-react";
import { CrossAppBanner } from "./cross-app-banner";
import { ThemePicker } from "@/components/ui/ThemePicker";
import { useThemeStore, type SidebarVariant } from "@/store/themeStore";
import { NavProgressBar } from "@/components/NavProgressBar";
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
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {SOCIAL_LINKS.map((s) => (
              <a key={s.name} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.name}
                className={cn("text-muted-foreground/60 transition-colors", s.color)}>
                <s.icon className="w-3.5 h-3.5" />
              </a>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-[10px] text-muted-foreground/50">
            <span>© {new Date().getFullYear()} Lumgwun Solutions Group. All rights reserved.</span>
            <span className="hidden sm:inline">·</span>
            <a href="mailto:admin@lumgwunsolutions.com" className="hover:text-muted-foreground transition-colors">admin@lumgwunsolutions.com</a>
            <span className="hidden sm:inline">·</span>
            <a href="mailto:awajimaaapps@gmail.com" className="hover:text-muted-foreground transition-colors">awajimaaapps@gmail.com</a>
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
      { href: "/analytics",         label: "Analytics",         icon: BarChart3 },
      { href: "/data-analysis",     label: "Data Analysis",     icon: BarChart2 },
      { href: "/finance-analytics", label: "Finance Analytics", icon: LineChart },
    ],
  },
  {
    label: "Marketing",
    defaultOpen: true,
    items: [
      { href: "/social",           label: "Social Hub",      icon: Share2 },
      { href: "/ads",              label: "Ads Suite",       icon: Megaphone },
      { href: "/ai-studio",        label: "AI Studio",       icon: Sparkles },
      { href: "/leads",            label: "Leads & CRM",     icon: Target },
      { href: "/email-campaigns",  label: "Email Campaigns", icon: Mail },
      { href: "/sms-campaigns",    label: "SMS Campaigns",   icon: MessageSquare },
      { href: "/voice-campaigns",  label: "Voice Campaigns", icon: Phone },
    ],
  },
  {
    label: "Store",
    defaultOpen: true,
    items: [
      { href: "/products",  label: "Products",        icon: Package },
      { href: "/inventory", label: "Inventory",       icon: Archive },
      { href: "/orders",    label: "Orders",          icon: ShoppingCart },
      { href: "/customers", label: "Customers",       icon: Users },
      { href: "/messages",  label: "Messages",        icon: Inbox },
      { href: "/support",   label: "Support Tickets", icon: TicketCheck },
      { href: "/wallet",    label: "Wallet",          icon: Landmark },
      { href: "/interswitch", label: "Interswitch",   icon: CreditCard },
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
    label: "Content",
    defaultOpen: true,
    items: [
      { href: "/blog",       label: "Blog",       icon: BookOpen },
      { href: "/website",    label: "My Website", icon: Globe },
      { href: "/mobile-app", label: "Mobile App", icon: Smartphone },
    ],
  },
  {
    label: "Operations",
    defaultOpen: true,
    items: [
      { href: "/branches", label: "Branches",     icon: Building2 },
      { href: "/workers",  label: "Workers",      icon: Users },
      { href: "/tasks",    label: "Task Manager", icon: CheckSquare },
    ],
  },
  {
    label: "Design Studio",
    defaultOpen: true,
    items: [
      { href: "/architect",   label: "AI Design Studio", icon: Ruler },
      { href: "/real-estate", label: "Real Estate",      icon: Building2 },
    ],
  },
  {
    label: "Integrations",
    defaultOpen: true,
    items: [
      { href: "/marketplace",        label: "Marketplace",       icon: Globe },
      { href: "/connected-business", label: "Connected Business", icon: GitBranch },
    ],
  },
  {
    label: "Awajimaa",
    defaultOpen: false,
    items: [
      { href: "https://genhal.awajimaa.com", label: "GenHaL — Heritage & Language", icon: TreePine },
    ],
  },
  {
    label: "Account",
    defaultOpen: true,
    items: [
      { href: "/vendors", label: "Vendors", icon: Users },
      { href: "/account", label: "Account", icon: UserCircle },
      { href: "/pricing", label: "Pricing", icon: Tag },
    ],
  },
];

/* ═══════════════════════════════════════════════════════════════════════════
   NAV LINK — 4 visual variants
   ═══════════════════════════════════════════════════════════════════════════ */
function NavLink({
  item, location, onClick, variant, accentColor, accentGradient,
}: {
  item: NavItem;
  location: string;
  onClick: (label: string) => void;
  variant: SidebarVariant;
  accentColor: string;
  accentGradient: string;
}) {
  const isActive = location === item.href || location.startsWith(item.href + "/");
  const handleClick = () => onClick(item.label);

  /* ── External links — open in new tab regardless of sidebar variant ── */
  if (item.href.startsWith("http")) {
    return (
      <a
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleClick}
        className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all duration-150 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      >
        <item.icon className="w-4 h-4 shrink-0" />
        <span className="truncate">{item.label}</span>
        <ExternalLink className="w-3 h-3 ml-auto shrink-0 opacity-40" />
      </a>
    );
  }

  /* ── ELECTRIC (Unyeada) ── Bold neon borders, glow, sharp precision */
  if (variant === "electric") {
    return (
      <Link
        href={item.href}
        onClick={handleClick}
        className={cn(
          "group/link flex items-center gap-3 px-3 py-[9px] text-sm font-medium rounded-md",
          "border-l-2 transition-all duration-200 ease-out",
          isActive
            ? "font-semibold"
            : "border-transparent text-white/50 hover:text-white/85 hover:bg-white/5"
        )}
        style={isActive ? {
          borderLeftColor: accentColor,
          color: accentColor,
          background: `${accentColor}14`,
          boxShadow: `inset 0 0 28px ${accentColor}10, 0 1px 0 ${accentColor}20`,
        } : {}}
      >
        <item.icon
          className={cn("w-4 h-4 shrink-0 transition-all duration-200",
            isActive ? "" : "text-white/35 group-hover/link:text-white/75"
          )}
          style={isActive ? { color: accentColor, filter: `drop-shadow(0 0 4px ${accentColor}80)` } : {}}
        />
        <span className="truncate">{item.label}</span>
        {isActive && (
          <span
            className="ml-auto w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: accentColor, boxShadow: `0 0 6px ${accentColor}` }}
          />
        )}
      </Link>
    );
  }

  /* ── HARVEST (Ekede) ── Warm fills, rounded, generous spacing */
  if (variant === "harvest") {
    return (
      <Link
        href={item.href}
        onClick={handleClick}
        className={cn(
          "group/link relative flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-2xl",
          "transition-all duration-250 ease-out",
          isActive
            ? "font-semibold harvest-active-item"
            : "text-white/50 hover:text-white/85"
        )}
        style={isActive ? {
          background: `linear-gradient(135deg, ${accentColor}28 0%, ${accentColor}0a 100%)`,
          border: `1px solid ${accentColor}35`,
          color: "rgba(255,255,255,0.95)",
        } : {}}
      >
        {/* Warm left accent bar */}
        {isActive && (
          <div
            className="absolute left-0 inset-y-2 w-[3px] rounded-full"
            style={{ background: accentGradient }}
          />
        )}
        <item.icon
          className={cn("w-4 h-4 shrink-0 transition-colors duration-200",
            isActive ? "" : "text-white/35 group-hover/link:text-white/70"
          )}
          style={isActive ? { color: accentColor } : {}}
        />
        <span className="truncate">{item.label}</span>
      </Link>
    );
  }

  /* ── GLASS (Okoroete) ── Frosted glass, pill shapes, soft emerald glow */
  if (variant === "glass") {
    return (
      <Link
        href={item.href}
        onClick={handleClick}
        className={cn(
          "group/link flex items-center gap-3 px-4 py-2 text-sm font-medium rounded-full",
          "transition-all duration-200 ease-out",
          isActive
            ? "font-semibold"
            : "text-white/45 hover:text-white/80 hover:bg-white/6"
        )}
        style={isActive ? {
          background: `${accentColor}28`,
          border: `1px solid ${accentColor}45`,
          boxShadow: `0 0 18px ${accentColor}25, inset 0 1px 0 ${accentColor}20`,
          color: accentColor,
        } : {}}
      >
        <item.icon
          className={cn("w-4 h-4 shrink-0 transition-colors duration-200",
            isActive ? "" : "text-white/30 group-hover/link:text-white/65"
          )}
          style={isActive ? { color: accentColor } : {}}
        />
        <span className="truncate">{item.label}</span>
        {isActive && (
          <span
            className="ml-auto w-2 h-2 rounded-full shrink-0 opacity-70"
            style={{ background: accentColor }}
          />
        )}
      </Link>
    );
  }

  /* ── ROYAL (Otuo) ── Uppercase elegance, gold accents, luxury minimal */
  if (variant === "royal") {
    return (
      <Link
        href={item.href}
        onClick={handleClick}
        className={cn(
          "group/link flex items-center gap-3 px-3 py-[9px]",
          "text-[11px] font-bold uppercase tracking-[0.08em]",
          "transition-all duration-200 ease-out",
          isActive
            ? "text-yellow-300"
            : "text-white/35 hover:text-white/65"
        )}
        style={isActive ? {
          textShadow: "0 0 12px rgba(251,191,36,0.4)",
        } : {}}
      >
        <item.icon
          className={cn("w-3.5 h-3.5 shrink-0 transition-colors duration-200",
            isActive ? "" : "text-white/25 group-hover/link:text-white/55"
          )}
          style={isActive ? { color: "#FBBF24", filter: "drop-shadow(0 0 4px rgba(251,191,36,0.6))" } : {}}
        />
        <span className="truncate">{item.label}</span>
        {isActive && <span className="ml-auto text-yellow-400 text-[13px] leading-none">✦</span>}
      </Link>
    );
  }

  /* fallback */
  return (
    <Link href={item.href} onClick={handleClick}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all duration-150",
        isActive ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      )}>
      <item.icon className="w-4 h-4 shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   NAV GROUP SECTION — label style per variant
   ═══════════════════════════════════════════════════════════════════════════ */
function NavGroupSection({
  group, location, onNavClick, variant, accentColor, accentGradient,
}: {
  group: NavGroup;
  location: string;
  onNavClick: (label: string) => void;
  variant: SidebarVariant;
  accentColor: string;
  accentGradient: string;
}) {
  const hasActive = group.items.some(
    (item) => location === item.href || location.startsWith(item.href + "/")
  );
  const [open, setOpen] = useState(group.defaultOpen ?? true);
  const isOpen = open || hasActive;

  const navLinkProps = { location, onClick: onNavClick, variant, accentColor, accentGradient };

  if (!group.label) {
    return (
      <div className="space-y-0.5 mb-1">
        {group.items.map((item) => (
          <NavLink key={item.href} item={item} {...navLinkProps} />
        ))}
      </div>
    );
  }

  /* ── Group label renderers ── */
  const labelEl = (() => {
    if (variant === "electric") {
      return (
        <button type="button" onClick={() => setOpen(v => !v)}
          className="w-full flex items-center justify-between px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all duration-150 select-none"
          style={{ color: "rgba(255,255,255,0.28)" }}>
          <span className="flex items-center gap-1.5">
            <Zap className="w-2.5 h-2.5" style={{ color: accentColor, opacity: 0.6 }} />
            {group.label}
          </span>
          <ChevronDown className={cn("w-3 h-3 transition-transform duration-200", isOpen ? "" : "-rotate-90")} />
        </button>
      );
    }

    if (variant === "harvest") {
      return (
        <button type="button" onClick={() => setOpen(v => !v)}
          className="w-full flex items-center gap-2 px-2 py-2 transition-all duration-150 select-none">
          <div className="h-px flex-1" style={{ background: `linear-gradient(to right, transparent, ${accentColor}35)` }} />
          <span className="text-[9px] font-bold uppercase tracking-widest flex-shrink-0" style={{ color: `${accentColor}80` }}>
            {group.label}
          </span>
          <div className="h-px flex-1" style={{ background: `linear-gradient(to left, transparent, ${accentColor}35)` }} />
          <ChevronDown className={cn("w-2.5 h-2.5 transition-transform duration-200 flex-shrink-0", isOpen ? "" : "-rotate-90")}
            style={{ color: `${accentColor}60` }} />
        </button>
      );
    }

    if (variant === "glass") {
      return (
        <button type="button" onClick={() => setOpen(v => !v)}
          className="w-full flex items-center justify-between px-4 py-1 transition-all duration-150 select-none">
          <div className="flex items-center gap-2">
            <div className="w-1 h-1 rounded-full" style={{ background: `${accentColor}60` }} />
            <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.22)" }}>
              {group.label}
            </span>
          </div>
          <ChevronDown className={cn("w-2.5 h-2.5 transition-transform duration-200", isOpen ? "" : "-rotate-90")}
            style={{ color: "rgba(255,255,255,0.2)" }} />
        </button>
      );
    }

    if (variant === "royal") {
      return (
        <button type="button" onClick={() => setOpen(v => !v)}
          className="w-full flex items-center gap-2 px-3 py-[7px] transition-all duration-150 select-none">
          <div className="h-px flex-1" style={{ background: "rgba(251,191,36,0.15)" }} />
          <span className="text-[9px] font-bold tracking-[0.15em] uppercase flex-shrink-0"
            style={{ color: "rgba(251,191,36,0.45)" }}>
            {group.label}
          </span>
          <div className="h-px flex-1" style={{ background: "rgba(251,191,36,0.15)" }} />
          <ChevronDown className={cn("w-2.5 h-2.5 transition-transform duration-200 flex-shrink-0", isOpen ? "" : "-rotate-90")}
            style={{ color: "rgba(251,191,36,0.3)" }} />
        </button>
      );
    }

    return (
      <button type="button" onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/40 transition-all duration-150 select-none">
        <span>{group.label}</span>
        <ChevronDown className={cn("w-3 h-3 transition-transform duration-200", isOpen ? "" : "-rotate-90")} />
      </button>
    );
  })();

  return (
    <div className="mb-1">
      {labelEl}
      <div
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{ maxHeight: isOpen ? `${group.items.length * 48}px` : "0px" }}
      >
        <div className={cn("space-y-0.5 pt-0.5", variant === "harvest" ? "space-y-1" : "")}>
          {group.items.map((item) => (
            <NavLink key={item.href} item={item} {...navLinkProps} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SIDEBAR HEADER — per variant
   ═══════════════════════════════════════════════════════════════════════════ */
function SidebarHeader({
  variant, accentColor, accentGradient, borderColor, onClose,
}: {
  variant: SidebarVariant;
  accentColor: string;
  accentGradient: string;
  borderColor: string;
  onClose: () => void;
}) {
  if (variant === "electric") {
    return (
      <div className="flex items-center gap-3 px-4 h-16 shrink-0 relative" style={{ borderBottom: `1px solid ${borderColor}` }}>
        {/* Electric edge shimmer */}
        <div className="sidebar-electric-edge" style={{ background: accentGradient }} />
        <Link href="/home" className="flex items-center gap-3 flex-1 min-w-0 group/logo" onClick={onClose}>
          <div className="relative shrink-0">
            <img src="/awajimaa-logo.jpg" alt="Awajimaa" className="w-8 h-8 rounded object-cover group-hover/logo:opacity-80 transition-opacity" />
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full flex items-center justify-center"
              style={{ background: accentColor }}>
              <Zap className="w-1.5 h-1.5 text-white" />
            </div>
          </div>
          <div className="min-w-0">
            <span className="font-bold text-sm tracking-tight block truncate text-white group-hover/logo:text-white/80 transition-colors">
              Awa Biz Suite
            </span>
            <span className="text-[10px] font-medium" style={{ color: accentColor, opacity: 0.7 }}>
              Electric · Business OS
            </span>
          </div>
        </Link>
        <button className="md:hidden p-1.5 rounded-md text-white/40 hover:text-white/80 transition-colors shrink-0" onClick={onClose}>
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  if (variant === "harvest") {
    return (
      <div className="flex items-center gap-3 px-4 py-4 shrink-0" style={{ borderBottom: `1px solid ${borderColor}` }}>
        <Link href="/home" className="flex items-center gap-3 flex-1 min-w-0 group/logo" onClick={onClose}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: `linear-gradient(135deg, ${accentColor}40, ${accentColor}18)`, border: `1px solid ${accentColor}35` }}>
            <img src="/awajimaa-logo.jpg" alt="Awajimaa" className="w-6 h-6 rounded object-cover" />
          </div>
          <div className="min-w-0">
            <span className="font-bold text-sm tracking-tight block truncate text-white group-hover/logo:opacity-80 transition-opacity">
              Awa Biz Suite
            </span>
            <span className="text-[10px] font-medium" style={{ color: accentColor, opacity: 0.65 }}>
              🌅 Harvest · Business Suite
            </span>
          </div>
        </Link>
        <button className="md:hidden p-1.5 rounded-lg text-white/40 hover:text-white/80 transition-colors shrink-0" onClick={onClose}>
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  if (variant === "glass") {
    return (
      <div className="flex items-center gap-3 px-4 h-16 shrink-0" style={{ borderBottom: `1px solid rgba(16,185,129,0.12)` }}>
        <Link href="/home" className="flex items-center gap-3 flex-1 min-w-0 group/logo" onClick={onClose}>
          <div className="relative shrink-0">
            <div className="absolute inset-0 rounded-full blur-sm" style={{ background: accentColor, opacity: 0.3 }} />
            <img src="/awajimaa-logo.jpg" alt="Awajimaa" className="relative w-8 h-8 rounded-full object-cover ring-1"
              style={{ ringColor: accentColor }} />
          </div>
          <div className="min-w-0">
            <span className="font-bold text-sm tracking-tight block truncate text-white/90 group-hover/logo:text-white transition-colors">
              Awa Biz Suite
            </span>
            <span className="text-[10px] font-medium" style={{ color: accentColor, opacity: 0.6 }}>
              🌿 Okoroete · Glass
            </span>
          </div>
        </Link>
        <button className="md:hidden p-1.5 rounded-full text-white/40 hover:text-white/80 transition-colors shrink-0" onClick={onClose}>
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  if (variant === "royal") {
    return (
      <div className="flex items-center gap-2 px-4 h-16 shrink-0" style={{ borderBottom: "1px solid rgba(251,191,36,0.12)" }}>
        <Link href="/home" className="flex items-center gap-3 flex-1 min-w-0 group/logo" onClick={onClose}>
          <img src="/awajimaa-logo.jpg" alt="Awajimaa" className="w-7 h-7 rounded object-cover shrink-0 opacity-80" />
          <div className="min-w-0">
            <span className="royal-crown-shine text-sm font-black tracking-widest uppercase block truncate">
              Awa Biz Suite
            </span>
            <span className="text-[9px] tracking-[0.18em] uppercase font-bold" style={{ color: "rgba(251,191,36,0.35)" }}>
              👑 The Royal Platform
            </span>
          </div>
        </Link>
        <button className="md:hidden p-1.5 text-white/30 hover:text-white/70 transition-colors shrink-0" onClick={onClose}>
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return null;
}

/* ═══════════════════════════════════════════════════════════════════════════
   USER BAR — per variant
   ═══════════════════════════════════════════════════════════════════════════ */
function UserBar({
  variant, accentColor, borderColor, onThemeClick,
}: {
  variant: SidebarVariant;
  accentColor: string;
  borderColor: string;
  onThemeClick: () => void;
}) {
  const themeButtonClass = cn(
    "p-1.5 rounded-lg transition-colors",
    variant === "glass" ? "rounded-full" : "",
  );
  const themeButtonStyle = { color: "rgba(255,255,255,0.45)" };

  return (
    <div
      className="px-3 py-3 shrink-0 flex items-center gap-3"
      style={{
        borderTop: variant === "royal"
          ? "1px solid rgba(251,191,36,0.12)"
          : variant === "glass"
            ? "1px solid rgba(16,185,129,0.12)"
            : `1px solid ${borderColor}`,
      }}
    >
      <UserButton
        {...{ afterSignOutUrl: "/" } as object}
        appearance={{ elements: { userButtonAvatarBox: "w-8 h-8" } }}
      />
      <div className="flex-1 min-w-0">
        {variant === "royal" ? (
          <p className="text-[10px] font-bold tracking-[0.12em] uppercase truncate" style={{ color: "rgba(251,191,36,0.5)" }}>My Account</p>
        ) : (
          <p className="text-sm font-medium truncate text-white/70">My Account</p>
        )}
      </div>
      <button
        onClick={onThemeClick}
        className={themeButtonClass}
        style={themeButtonStyle}
        title="Change dashboard theme"
      >
        <Palette className="w-4 h-4" />
      </button>
      <div className="hidden md:block">
        <NotificationBell />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   LAYOUT INNER
   ═══════════════════════════════════════════════════════════════════════════ */
function LayoutInner({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const search = useSearch();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const { config: themeConfig, theme } = useThemeStore();
  const isAdmin = useIsAdmin();
  const { vendor } = useCurrentVendor();

  const handleNavClick = useCallback((label: string) => {
    setIsMobileOpen(false);
    trackEvent("nav_click", label, { vendorId: vendor?.id ?? null });
  }, [vendor]);

  const { sidebarVariant: variant, accentColor, accentGradient, sidebarBorderColor } = themeConfig;

  /* Sidebar background — glass gets frosted treatment, others use gradient */
  const sidebarStyle = variant === "glass"
    ? {
        borderRight: `1px solid rgba(16,185,129,0.15)`,
      }
    : {
        background: themeConfig.sidebarGradient,
        borderRight: `1px solid ${sidebarBorderColor}`,
      };

  const navGroupProps = { location, onNavClick: handleNavClick, variant, accentColor, accentGradient };

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row" data-theme={theme}>

      {/* Sparkling navigation progress bar */}
      <NavProgressBar />

      {/* ── Mobile top bar ─────────────────────────────────── */}
      <div className="md:hidden sticky top-0 z-40 flex items-center justify-between px-4 h-14 border-b bg-card/95 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <img src="/awajimaa-logo.jpg" alt="Awajimaa" className="w-7 h-7 rounded object-cover" />
          {variant === "royal" ? (
            <span className="royal-crown-shine font-black text-base tracking-widest uppercase">Awa Biz Suite</span>
          ) : (
            <span className="font-bold text-base tracking-tight">Awa Biz Suite</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <NotificationBell />
          <Button variant="ghost" size="icon" className="w-9 h-9" onClick={() => setIsMobileOpen(!isMobileOpen)}>
            {isMobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
        </div>
      </div>

      {/* ── Mobile overlay ─────────────────────────────────── */}
      {isMobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => setIsMobileOpen(false)} />
      )}

      {/* ── Sidebar ────────────────────────────────────────── */}
      <aside
        className={cn(
          "z-50 w-72 flex flex-col",
          "fixed inset-y-0 left-0 h-screen overflow-hidden transition-transform duration-300 ease-in-out",
          isMobileOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full",
          "md:sticky md:top-0 md:h-screen md:translate-x-0 md:transition-none md:shadow-none",
          variant === "glass" ? "sidebar-glass" : "",
        )}
        style={sidebarStyle}
      >
        {/* Variant-specific header */}
        <SidebarHeader
          variant={variant}
          accentColor={accentColor}
          accentGradient={accentGradient}
          borderColor={sidebarBorderColor}
          onClose={() => setIsMobileOpen(false)}
        />

        {/* Scrollable nav */}
        <nav className={cn(
          "flex-1 min-h-0 overflow-y-auto overscroll-contain py-2 space-y-0.5",
          variant === "glass" ? "px-3" : "px-2",
          "[&::-webkit-scrollbar]:w-1",
          "[&::-webkit-scrollbar-track]:bg-transparent",
          "[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/15",
          "[&::-webkit-scrollbar-thumb:hover]:bg-white/30",
        )}>

          {NAV_GROUPS.map((group, gi) => (
            <NavGroupSection key={gi} group={group} {...navGroupProps} />
          ))}

          {/* App Store cross-link */}
          <div className="pt-2 pb-1">
            {variant === "royal" ? (
              <p className="px-3 text-[9px] font-bold tracking-[0.15em] uppercase mb-1" style={{ color: "rgba(251,191,36,0.3)" }}>
                Switch To
              </p>
            ) : (
              <p className="px-3 text-[10px] font-bold uppercase tracking-widest text-white/25 mb-1">Switch To</p>
            )}
            <a
              href="https://awajimaaappstore.com/my-apps?ref=vendor-hub"
              className={cn(
                "group/store flex items-center gap-3 px-3 py-2 text-sm font-medium text-white/45 hover:text-white/80 transition-all duration-150",
                variant === "glass" ? "rounded-full" : variant === "harvest" ? "rounded-2xl" : "rounded-md",
              )}
              style={{
                background: "linear-gradient(135deg,rgba(124,58,237,0.08),rgba(168,85,247,0.04))",
                border: "1px solid rgba(124,58,237,0.18)",
              }}
              onClick={() => setIsMobileOpen(false)}
            >
              <Store className="w-4 h-4 text-violet-400 shrink-0" />
              <span className={cn("truncate", variant === "royal" ? "uppercase text-[11px] tracking-widest font-bold" : "")}>
                Awajimaa App Store
              </span>
              <ExternalLink className="w-3 h-3 ml-auto opacity-0 group-hover/store:opacity-60 transition-opacity shrink-0" />
            </a>
          </div>

          {/* Admin links */}
          {isAdmin && (
            <div className="pt-2">
              {variant === "royal" ? (
                <p className="px-3 text-[9px] font-bold tracking-[0.15em] uppercase mb-1" style={{ color: "rgba(251,191,36,0.3)" }}>
                  Platform Admin
                </p>
              ) : (
                <p className="px-3 text-[10px] font-bold uppercase tracking-widest text-white/25 mb-1">Platform Admin</p>
              )}
              {[
                { href: "/admin", label: "Admin Panel", icon: ShieldCheck, match: (l: string, s: string) => l === "/admin" && !s.includes("tab=") },
                { href: "/admin?tab=infrastructure-billing", label: "Billing Intelligence", icon: Cpu, match: (_: string, s: string) => s.includes("tab=infrastructure-billing") },
                { href: "/admin?tab=billing-enforcement", label: "Billing Enforcement", icon: ShieldOff, match: (_: string, s: string) => s.includes("tab=billing-enforcement") },
              ].map(({ href, label, icon: Icon, match }) => {
                const active = match(location, search);
                return (
                  <NavLink
                    key={href}
                    item={{ href, label, icon: Icon }}
                    location={active ? href.split("?")[0] : location}
                    onClick={() => { handleNavClick(label); }}
                    variant={variant}
                    accentColor={accentColor}
                    accentGradient={accentGradient}
                  />
                );
              })}
            </div>
          )}

          <div className="h-4" />
        </nav>

        {/* User bar — pinned to bottom */}
        <UserBar
          variant={variant}
          accentColor={accentColor}
          borderColor={sidebarBorderColor}
          onThemeClick={() => setThemePickerOpen(true)}
        />
      </aside>

      <ThemePicker open={themePickerOpen} onClose={() => setThemePickerOpen(false)} />

      {/* ── Main content ─────────────────────────────────── */}
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

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <VoiceProvider>
      <LayoutInner>{children}</LayoutInner>
    </VoiceProvider>
  );
}
