import React, { useState, useRef, useEffect } from "react";
import { useAuth } from "@clerk/react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from "framer-motion";
import WhatsAppButton from "@/components/whatsapp-button";
import { Button } from "@/components/ui/button";
import { 
  MessageSquareText, Zap, ChevronRight, 
  Sparkles, Wallet, Network, Package, PhoneCall, Megaphone, Layers, Users, Check,
  Command, Play, MapPin, Phone, ChevronLeft, Mic, FileSpreadsheet, Globe2,
  Library, Target, HelpCircle, Plus, Building2, Palette, Scissors, BarChart3,
  Menu, X, ChevronDown, BookOpen, Smartphone, Code2, ShoppingBag, PenSquare,
  Webhook, FileText, Plug, ShoppingCart, UserCheck, BookMarked,
} from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { FaInstagram, FaFacebook, FaXTwitter, FaLinkedin, FaTiktok, FaTelegram } from "react-icons/fa6";

const SOCIAL_LINKS = [
  { name: "Instagram", href: "https://www.instagram.com/lumgwunsolutionsgroup", icon: FaInstagram },
  { name: "Facebook", href: "https://web.facebook.com/LUMGWUNSOLUTIONS/", icon: FaFacebook },
  { name: "X", href: "https://x.com/awajimaaApp", icon: FaXTwitter },
  { name: "LinkedIn", href: "https://www.linkedin.com/company/lumgwun-solutions-group/", icon: FaLinkedin },
  { name: "TikTok", href: "https://tiktok.com/@lumgwun.solutions", icon: FaTiktok },
  { name: "Telegram", href: "https://t.me/AwaApp", icon: FaTelegram },
];

const OFFICES = [
  {
    label: "Nigeria HQ",
    lines: ["Pyale Workhub", "21 Bekwere Wosu Street", "D-Line, Diobu, Port Harcourt", "Rivers State, Nigeria"],
  },
  {
    label: "United States",
    lines: ["16501 Shady Grove Road, Suite 8885", "Gaithersburg, MD 20898", "USA"],
  },
];

const PHONE_NUMBERS = ["+1 917 821 8640", "+234 703 884 3102"];

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

const VIDEOS = [
  { id: "promo", title: "Awa Biz Suite Promo Video", path: "/vendorhub-promo-video/" },
  { id: "walkthrough", title: "Awa Biz Suite Walkthrough Video", path: "/vendorhub-walkthrough-video/" },
];

type SiteContent = {
  "landing.hero": { badge: string; heading: string; subheading: string; primaryCta: string; secondaryCta: string };
  "landing.features": { heading: string; subheading: string; items: { title: string; description: string }[] };
  "landing.stats": { heading: string; body: string; bullets: string[]; stats: { value: string; label: string }[] };
  "landing.cta": { heading: string; body: string; buttonLabel: string };
  "site.settings": { siteName: string; logoUrl: string; supportEmail: string; footerTagline: string };
};

async function fetchSiteContent(): Promise<SiteContent> {
  const res = await fetch(`${BASE_URL}/api/site-content`);
  if (!res.ok) throw new Error("Failed to load site content");
  return res.json() as Promise<SiteContent>;
}

const getFeatureIcon = (title: string) => {
  const t = title.toLowerCase();
  if (t.includes("social")) return MessageSquareText;
  if (t.includes("ai quick") || t.includes("quick create")) return Mic;
  if (t.includes("spreadsheet") || t.includes("intelligence")) return FileSpreadsheet;
  if (t.includes("data analytics") || t.includes("analytics")) return BarChart3;
  if (t.includes("website builder") || t.includes("e-commerce")) return Globe2;
  if (t.includes("media library") || t.includes("media")) return Library;
  if (t.includes("ads") || t.includes("paid social")) return Target;
  if (t.includes("architecture") || t.includes("building design")) return Building2;
  if (t.includes("interior design")) return Palette;
  if (t.includes("fashion") || t.includes("tailoring")) return Scissors;
  if (t.includes("ai ") || t.includes("studio")) return Sparkles;
  if (t.includes("crm") || t.includes("lead")) return UserCheck;
  if (t.includes("sales")) return Users;
  if (t.includes("finance")) return Wallet;
  if (t.includes("branch") || t.includes("worker")) return Network;
  if (t.includes("order") || t.includes("inventory")) return Package;
  if (t.includes("products") || t.includes("catalogue")) return ShoppingBag;
  if (t.includes("voice")) return PhoneCall;
  if (t.includes("omnichannel")) return Megaphone;
  if (t.includes("vendor")) return Layers;
  if (t.includes("mobile app") || t.includes("android")) return Smartphone;
  if (t.includes("connect api") || t.includes("api") || t.includes("webhook")) return Webhook;
  if (t.includes("blog") || t.includes("content publishing")) return PenSquare;
  if (t.includes("documentation") || t.includes("developer docs")) return BookMarked;
  if (t.includes("payment")) return ShoppingCart;
  return Zap;
};

const DEFAULT_FEATURES = [
  { title: "E-Commerce & Payments", description: "Launch a full animated storefront with a built-in cart, live checkout, and multi-gateway payments — Paystack, Stripe, Interswitch, Flutterwave, PayPal, Squad, and more. Customer ratings, refunds, and real-time order tracking included." },
  { title: "Products & Catalogue", description: "Manage your full product catalogue with variants, pricing, stock levels, and categories. AI Quick Create lets you add items by voice or chat — just describe what you sell." },
  { title: "CRM & Lead Tracking", description: "Capture leads from your website, blog comments, social clicks, UTM links, and order forms automatically. Track every lead from first touch to closed deal with pipeline views and activity timelines." },
  { title: "Blog & Content Publishing", description: "Write and publish rich-text blog posts with a TipTap editor, cover images, keywords, and SEO excerpts. Visitors can like posts and leave comments — automatically captured as CRM leads." },
  { title: "Connect API & Webhooks", description: "Expose your store data via a secure REST API with API key authentication and OAuth 2.0. Connect third-party tools, trigger webhooks on order and payment events, and build custom integrations from a dedicated developer portal." },
  { title: "Developer Documentation", description: "A full developer docs portal with getting-started guides, API reference, code samples, and a connected business onboarding flow — everything external developers need to build on top of your platform." },
  { title: "Mobile App Builder", description: "Turn your business into a native Android app — no coding needed. Configure your brand colors, logo, and website URL, and the platform generates and signs an APK automatically, ready to share or publish on the Play Store." },
  { title: "Unified Social Media", description: "Draft, schedule, and publish to Instagram, Facebook, X, and LinkedIn — including video — from one composer. AI captions, platform-specific formatting, and scheduled auto-posting included." },
  { title: "AI Content & Video Studio", description: "Generate product imagery, social captions, and fully animated multi-scene marketing videos with AI voiceover and music — all without leaving your dashboard." },
  { title: "Interswitch Payment Suite", description: "Accept payments, send bank transfers, pay utility bills (airtime, DSTV, electricity, data), verify accounts and BVNs, create dedicated virtual accounts, and process partial or full refunds — all in one place." },
  { title: "Finance Suite", description: "Sales, expenses, and investments in one ledger — filterable by branch, worker, and date range. Exportable anytime. Reconciles automatically with incoming payment webhooks." },
  { title: "Orders & Inventory", description: "Real-time stock tracking with low-stock alerts, reorder management, full order fulfillment lifecycle, and complete transaction histories across all payment gateways." },
  { title: "Branches & Workers", description: "Model every physical location and staff member, and see exactly which branch or worker drove each sale, expense, or investment." },
  { title: "Voice Campaigns", description: "Automated AI voice calls for birthdays, promotions, and re-engagement using ElevenLabs TTS. Schedule campaigns, track call status, and get completion reports — no call center required." },
  { title: "Omnichannel Campaigns", description: "Broadcast targeted email and SMS campaigns to your leads and customers. Segment by channel, status, or location and track open rates and conversions." },
  { title: "Ads Suite", description: "Create and manage Meta and X/Twitter paid social campaigns without leaving your dashboard. Link your ad accounts, track spend, and measure ROI in one place." },
  { title: "Architecture & Building Design", description: "Generate architectural concept sketches, building elevations, floor plans, and 3D render previews with AI — ideal for real estate, construction, and property businesses." },
  { title: "Data Analytics", description: "Upload any CSV or Excel file, connect your sales data, and interrogate it with AI — get interactive charts, trend summaries, and actionable insights instantly." },
  { title: "AI Quick Create", description: "Create inventory items, orders, and invoices instantly — just speak or type what you want and AI fills in the details." },
  { title: "Media Library", description: "Browse, edit, and reuse every AI-generated and vendor-uploaded image or video in one searchable library." },
  { title: "Multi-Vendor Management", description: "Run an agency? Manage dozens of separate brands and vendors from a single login, with isolated data and per-vendor billing." },
];

const ADDON_PLANS = [
  {
    name: "AI Quick Create",
    badge: "Popular",
    price: { usd: 7, ngn: 4500 },
    description: "Create inventory, orders & invoices by voice, chat, or form — with instant AI parsing and confirmation.",
    features: [
      "Voice & chat-based record creation",
      "Inventory items, orders & sales",
      "AI auto-fills fields from plain English",
      "Confirmation dialog before saving",
      "In-app notifications on every create",
    ],
    color: "from-violet-500/20 to-primary/10",
    border: "border-primary/40",
  },
  {
    name: "Spreadsheet Intelligence",
    badge: null,
    price: { usd: 5, ngn: 3000 },
    description: "Upload any CSV or Excel file and interrogate your data with AI — charts, trend analysis, and direct import.",
    features: [
      "CSV, XLS & XLSX file support",
      "Auto-generated charts & visualizations",
      "AI-powered Q&A on your dataset",
      "Import rows directly into Sales/Inventory",
      "Streaming analysis results",
    ],
    color: "from-blue-500/20 to-cyan-500/10",
    border: "border-blue-500/30",
  },
  {
    name: "E-Commerce Website Builder",
    badge: "New",
    price: { usd: 9, ngn: 5500 },
    description: "A full animated storefront: beautiful templates, live shop with cart & checkout, multi-gateway payments, customer ratings, and one-click publish.",
    features: [
      "Beautiful animated templates with sliders & gradients",
      "Live shop — cart, checkout & order tracking",
      "Multi-gateway: Paystack, Stripe, Interswitch, Flutterwave",
      "Customer star ratings shown publicly",
      "Partial & full refund support built in",
      "Business address & contact info always visible",
      "Live public URL at your custom slug",
    ],
    color: "from-emerald-500/20 to-teal-500/10",
    border: "border-emerald-500/30",
  },
  {
    name: "WhatsApp Direct Support",
    badge: "Free",
    price: null,
    description: "One-click WhatsApp access to the Awa Biz team from anywhere in your dashboard — Nigeria & US offices.",
    features: [
      "Floating WhatsApp button everywhere",
      "Nigeria & US office contacts",
      "Links to real WhatsApp chats",
      "No app switching needed",
      "Available 24/7",
    ],
    color: "from-emerald-500/20 to-green-500/10",
    border: "border-emerald-500/30",
  },
];

const NAV_FEATURE_GROUPS = [
  {
    label: "Commerce",
    items: [
      { icon: Globe2,       title: "E-Commerce & Payments", desc: "Storefront, cart & multi-gateway checkout" },
      { icon: ShoppingBag,  title: "Products & Catalogue", desc: "Variants, pricing & stock management" },
      { icon: Package,      title: "Orders & Inventory", desc: "Fulfillment & real-time stock tracking" },
      { icon: ShoppingCart, title: "Interswitch Suite", desc: "Transfers, bills, virtual accounts" },
    ],
  },
  {
    label: "Growth",
    items: [
      { icon: UserCheck,         title: "CRM & Lead Tracking", desc: "Pipeline, activity & auto-capture" },
      { icon: PenSquare,         title: "Blog & Content", desc: "Rich-text posts with comment lead capture" },
      { icon: MessageSquareText, title: "Social Media", desc: "Schedule & publish to all platforms" },
      { icon: Megaphone,         title: "Omnichannel Campaigns", desc: "Email, SMS & voice broadcast" },
    ],
  },
  {
    label: "Developer",
    items: [
      { icon: Webhook,    title: "Connect API", desc: "REST API, OAuth 2.0 & webhooks" },
      { icon: BookMarked, title: "Documentation", desc: "Guides, API reference & code samples" },
      { icon: Smartphone, title: "Mobile App Builder", desc: "Native Android APK, no code needed" },
      { icon: Sparkles,   title: "AI Studio", desc: "Images, captions & multi-scene video" },
    ],
  },
  {
    label: "Operations",
    items: [
      { icon: Wallet,    title: "Finance Suite", desc: "Sales, expenses & investments" },
      { icon: Network,   title: "Branches & Workers", desc: "Locations, staff & attribution" },
      { icon: BarChart3, title: "Data Analytics", desc: "AI-powered charts from any CSV" },
      { icon: Target,    title: "Ads Suite", desc: "Meta & X paid campaigns" },
    ],
  },
];

export default function LandingPage() {
  const { isSignedIn } = useAuth();
  const { data } = useQuery({ queryKey: ["site-content"], queryFn: fetchSiteContent, staleTime: 60_000 });
  const [activeVideo, setActiveVideo] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [featuresOpen, setFeaturesOpen] = useState(false);
  const featuresRef = useRef<HTMLDivElement>(null);

  // Close features dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (featuresRef.current && !featuresRef.current.contains(e.target as Node)) {
        setFeaturesOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const hero = data?.["landing.hero"];
  const features = data?.["landing.features"];
  const stats = data?.["landing.stats"];
  const cta = data?.["landing.cta"];
  const settings = data?.["site.settings"];

  const featuresList = features?.items ?? DEFAULT_FEATURES;

  return (
    <div className="dark min-h-screen bg-background text-foreground flex flex-col font-sans bg-noise selection:bg-primary/30">
      {/* Navbar */}
      <header className="fixed top-0 w-full z-50 bg-background/80 backdrop-blur-xl border-b border-border/50 transition-all">
        <div className="container mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <img src={settings?.logoUrl ?? "/awajimaa-logo.jpg"} alt={settings?.siteName ?? "Awajimaa"} className="w-8 h-8 rounded bg-primary/20 object-cover border border-primary/30" />
            <span className="font-extrabold text-lg tracking-tight">{settings?.siteName ?? "Awa Biz Suite"}</span>
          </div>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {/* Features mega-dropdown */}
            <div className="relative" ref={featuresRef}>
              <button
                onClick={() => setFeaturesOpen((v) => !v)}
                className="flex items-center gap-1 px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted/50"
              >
                Features
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${featuresOpen ? "rotate-180" : ""}`} />
              </button>
              <AnimatePresence>
                {featuresOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.97 }}
                    transition={{ duration: 0.15 }}
                    className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-[920px] rounded-2xl border border-border/50 bg-background/95 backdrop-blur-xl shadow-2xl shadow-black/40 p-5"
                    onClick={() => setFeaturesOpen(false)}
                  >
                    <div className="grid grid-cols-4 gap-5">
                      {NAV_FEATURE_GROUPS.map((group) => (
                        <div key={group.label}>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-3 px-2">{group.label}</p>
                          <div className="space-y-0.5">
                            {group.items.map((item) => (
                              <Link
                                key={item.title}
                                href="/sign-up"
                                className="flex items-start gap-3 px-2 py-2.5 rounded-lg hover:bg-primary/10 transition-colors group/item"
                              >
                                <div className="mt-0.5 w-7 h-7 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 group-hover/item:bg-primary/20 transition-colors">
                                  <item.icon className="w-3.5 h-3.5 text-primary" />
                                </div>
                                <div>
                                  <div className="text-xs font-semibold text-foreground leading-tight">{item.title}</div>
                                  <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">{item.desc}</div>
                                </div>
                              </Link>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 pt-4 border-t border-border/40 flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">All features included from day one — even on the free plan.</p>
                      <Link href="/pricing" className="text-xs font-bold text-primary hover:underline flex items-center gap-1">
                        See pricing <ChevronRight className="w-3 h-3" />
                      </Link>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <Link href="/pricing" className="px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted/50">
              Pricing
            </Link>
            <Link href="/developers" className="px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted/50 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5" />
              Docs
            </Link>
            <Link href="/become-a-connected-business" className="px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted/50 flex items-center gap-1.5">
              <Globe2 className="w-3.5 h-3.5" />
              Connected Business
            </Link>

            <div className="ml-4 flex items-center gap-3">
              {isSignedIn ? (
                <Link href="/dashboard" className="text-sm font-bold text-primary-foreground bg-primary px-5 py-2 rounded-md hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/40 transition-all flex items-center gap-2">
                  <Layers className="w-4 h-4" />
                  Dashboard
                </Link>
              ) : (
                <>
                  <Link href="/sign-in" className="text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors px-3 py-2 rounded-md hover:bg-muted/50">
                    Sign In
                  </Link>
                  <Link href="/sign-up" className="text-sm font-bold text-primary-foreground bg-primary px-5 py-2 rounded-md hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/40 transition-all">
                    Start Free Trial
                  </Link>
                </>
              )}
            </div>
          </nav>

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMobileMenuOpen((v) => !v)}
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile dropdown menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="md:hidden overflow-hidden border-t border-border/50 bg-background/98 backdrop-blur-xl"
            >
              <div className="px-4 py-4 space-y-1">
                {/* Feature groups */}
                {NAV_FEATURE_GROUPS.map((group) => (
                  <div key={group.label} className="mb-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 px-3 mb-1">{group.label}</p>
                    {group.items.map((item) => (
                      <Link
                        key={item.title}
                        href="/sign-up"
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-primary/10 transition-colors"
                      >
                        <div className="w-7 h-7 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                          <item.icon className="w-3.5 h-3.5 text-primary" />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-foreground">{item.title}</div>
                          <div className="text-xs text-muted-foreground">{item.desc}</div>
                        </div>
                      </Link>
                    ))}
                  </div>
                ))}

                {/* Divider */}
                <div className="border-t border-border/40 my-2" />

                {/* Top-level links */}
                <Link href="/pricing" onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-muted/50 transition-colors text-sm font-semibold text-foreground">
                  Pricing
                </Link>
                <Link href="/developers" onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-muted/50 transition-colors text-sm font-semibold text-foreground">
                  <BookOpen className="w-4 h-4 text-muted-foreground" />
                  Documentation
                </Link>
                {isSignedIn ? (
                  <div className="pt-2">
                    <Link href="/dashboard" onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center justify-center gap-2 w-full py-3 rounded-lg bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/30">
                      <Layers className="w-4 h-4" />
                      Go to Dashboard
                    </Link>
                  </div>
                ) : (
                  <>
                    <Link href="/sign-in" onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-muted/50 transition-colors text-sm font-semibold text-muted-foreground">
                      Sign In
                    </Link>
                    <div className="pt-2">
                      <Link href="/sign-up" onClick={() => setMobileMenuOpen(false)}
                        className="flex items-center justify-center w-full py-3 rounded-lg bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/30">
                        Start Free Trial
                        <ChevronRight className="ml-2 w-4 h-4" />
                      </Link>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main className="flex-1 pt-16">
        {/* Hero Section */}
        <section className="pt-32 pb-20 px-6 relative overflow-hidden flex flex-col items-center">
          <div className="absolute inset-0 bg-grid-pattern opacity-30 pointer-events-none" style={{ maskImage: "linear-gradient(to bottom, black 40%, transparent 100%)", WebkitMaskImage: "linear-gradient(to bottom, black 40%, transparent 100%)" }} />
          <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/20 blur-[120px] rounded-full pointer-events-none" />

          <div className="container mx-auto max-w-5xl relative z-10 flex flex-col items-center text-center">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              <Badge className="mb-8 border-primary/30 bg-primary/10 text-primary uppercase tracking-wider text-xs py-1.5 px-4 shadow-sm shadow-primary/20">
                {hero?.badge ?? "Command Center for Modern Operators"}
              </Badge>
            </motion.div>
            
            <motion.h1 
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}
              className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 max-w-4xl text-balance text-foreground leading-[1.1]"
            >
              {hero?.heading ?? "Run your entire business from one terminal."}
            </motion.h1>
            
            <motion.p 
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }}
              className="text-lg md:text-xl text-muted-foreground mb-12 max-w-2xl text-balance font-medium leading-relaxed"
            >
              {hero?.subheading ?? "Awa Biz Suite replaces your fragmented tool stack. Manage multi-channel social media, inventory, sales, leads, and SMS campaigns in a single, high-density cockpit."}
            </motion.p>
            
            <motion.div 
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3 }}
              className="flex flex-col sm:flex-row gap-5 mb-16 w-full sm:w-auto"
            >
              <Link href="/sign-up" className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-8 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/30 transition-all hover:bg-primary/90 hover:shadow-xl hover:shadow-primary/50 hover:-translate-y-0.5">
                {hero?.primaryCta ?? "Get Started"}
                <ChevronRight className="ml-2 h-4 w-4" />
              </Link>
              <Button
                variant="outline" size="lg"
                className="h-12 px-8 border-border bg-card/50 backdrop-blur hover:bg-muted font-semibold transition-all hover:-translate-y-0.5"
                onClick={() => document.getElementById("demo-preview")?.scrollIntoView({ behavior: "smooth", block: "center" })}
              >
                <Command className="mr-2 w-4 h-4 text-muted-foreground" />
                {hero?.secondaryCta ?? "View Demo"}
              </Button>
            </motion.div>
          </div>

          <motion.div 
            id="demo-preview"
            initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.4 }}
            className="w-full max-w-5xl mx-auto rounded-xl overflow-hidden border border-border/50 shadow-2xl bg-card/40 backdrop-blur-md relative z-20 mb-10"
          >
            <div className="flex items-center gap-3 p-3 border-b border-border/50 bg-background/80">
              <Play className="w-3.5 h-3.5 text-primary fill-primary shrink-0" />
              <span className="text-sm font-semibold truncate">{VIDEOS[activeVideo].title}</span>
              <div className="ml-auto flex items-center gap-1.5 px-3 shrink-0">
                 <div className="w-2.5 h-2.5 rounded-full bg-destructive/80" />
                 <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                 <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
              </div>
            </div>

            <div className="relative aspect-[16/9] bg-black overflow-hidden group">
              <div
                className="absolute inset-0 flex h-full transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
                style={{ width: `${VIDEOS.length * 100}%`, transform: `translateX(-${activeVideo * (100 / VIDEOS.length)}%)` }}
              >
                {VIDEOS.map((v) => (
                  <div key={v.id} className="relative h-full" style={{ width: `${100 / VIDEOS.length}%` }}>
                    <iframe
                      src={v.path}
                      title={v.title}
                      className="w-full h-full border-0"
                      loading="lazy"
                    />
                  </div>
                ))}
              </div>

              <button
                type="button"
                aria-label="Previous video"
                onClick={() => setActiveVideo((i) => (i - 1 + VIDEOS.length) % VIDEOS.length)}
                className="absolute left-3 top-1/2 -translate-y-1/2 z-30 w-9 h-9 rounded-full bg-background/70 backdrop-blur border border-border/60 flex items-center justify-center text-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:bg-background/90 focus-visible:opacity-100 outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                aria-label="Next video"
                onClick={() => setActiveVideo((i) => (i + 1) % VIDEOS.length)}
                className="absolute right-3 top-1/2 -translate-y-1/2 z-30 w-9 h-9 rounded-full bg-background/70 backdrop-blur border border-border/60 flex items-center justify-center text-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:bg-background/90 focus-visible:opacity-100 outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <ChevronRight className="w-5 h-5" />
              </button>

              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2">
                {VIDEOS.map((v, i) => (
                  <button
                    key={v.id}
                    type="button"
                    aria-label={`Show ${v.title}`}
                    onClick={() => setActiveVideo(i)}
                    className={`h-1.5 rounded-full transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                      i === activeVideo ? "w-6 bg-primary" : "w-1.5 bg-white/40 hover:bg-white/60"
                    }`}
                  />
                ))}
              </div>

              <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-b-xl z-20 pointer-events-none" />
            </div>
          </motion.div>
        </section>

        {/* Features Section */}
        <section className="py-28 relative border-t border-border/50 bg-background/50 overflow-hidden">
          {/* Slow-breathing ambient orb */}
          <motion.div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, hsl(var(--primary)/0.07) 0%, transparent 70%)" }}
            animate={{ scale: [1, 1.18, 1], opacity: [0.45, 0.85, 0.45] }}
            transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
          />
          {/* Subtle grid texture overlay */}
          <div className="absolute inset-0 pointer-events-none opacity-[0.025]"
            style={{ backgroundImage: "linear-gradient(to right,currentColor 1px,transparent 1px),linear-gradient(to bottom,currentColor 1px,transparent 1px)", backgroundSize: "48px 48px" }} />

          <div className="container mx-auto px-6 max-w-6xl relative z-10">
            <div className="text-center mb-18">
              {/* Animated badge */}
              <motion.div
                initial={{ opacity: 0, scale: 0.7, y: 16 }}
                whileInView={{ opacity: 1, scale: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ type: "spring", stiffness: 320, damping: 18 }}
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-bold uppercase tracking-widest mb-7 select-none"
              >
                <motion.span animate={{ rotate: [0, 15, -10, 0] }} transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 4 }}>
                  <Sparkles className="w-3.5 h-3.5" />
                </motion.span>
                Full Platform
              </motion.div>

              <motion.h2
                initial={{ opacity: 0, y: 40, scale: 0.93, filter: "blur(4px)" }}
                whileInView={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                viewport={{ once: true }}
                transition={{ type: "spring", stiffness: 180, damping: 18, delay: 0.08 }}
                className="text-3xl md:text-5xl font-extrabold tracking-tight mb-5"
              >
                {features?.heading ?? "Everything you need to scale"}
              </motion.h2>

              <motion.p
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2, duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
                className="text-muted-foreground max-w-2xl mx-auto text-lg font-medium"
              >
                {features?.subheading ?? "We've collapsed a dozen different SaaS products into one cohesive, blazing-fast experience."}
              </motion.p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mt-14">
              {featuresList.map((f, i) => (
                <FeatureCard key={f.title} title={f.title} description={f.description} index={i} />
              ))}
            </div>
          </div>
        </section>

        {/* Add-on Services Section */}
        <section className="py-24 border-t border-border/50 relative overflow-hidden bg-card/20">
          <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-[500px] h-[500px] bg-primary/5 blur-[140px] rounded-full pointer-events-none" />
          <div className="container mx-auto px-6 max-w-6xl relative z-10">
            <div className="text-center mb-14">
              <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
                <Badge className="border-primary/30 bg-primary/10 text-primary px-4 py-1.5 text-xs font-bold uppercase tracking-wider mb-6">
                  <Sparkles className="w-3.5 h-3.5 mr-2" /> Power-Ups
                </Badge>
              </motion.div>
              <motion.h2 initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }}
                className="text-3xl md:text-4xl font-extrabold tracking-tight mb-4">
                Add-on Services
              </motion.h2>
              <motion.p initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.2 }}
                className="text-muted-foreground max-w-2xl mx-auto text-lg font-medium">
                Bolt on extra capabilities to any plan — pay only for what you need, cancel any time.
              </motion.p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
              {ADDON_PLANS.map((addon, i) => (
                <motion.div
                  key={addon.name}
                  initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.1 }}
                  className={`relative rounded-2xl border ${addon.border} bg-gradient-to-br ${addon.color} backdrop-blur-sm p-6 flex flex-col gap-4 group hover:scale-[1.02] transition-transform duration-300`}
                >
                  {addon.badge && (
                    <span className={`absolute -top-3 left-4 text-xs font-bold px-3 py-1 rounded-full ${addon.badge === "Free" ? "bg-emerald-500 text-white" : "bg-primary text-primary-foreground"}`}>
                      {addon.badge}
                    </span>
                  )}
                  <div>
                    <h3 className="font-bold text-lg mb-1">{addon.name}</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">{addon.description}</p>
                  </div>
                  <div className="text-2xl font-black tracking-tight">
                    {addon.price ? (
                      <>
                        <span>${addon.price.usd}</span>
                        <span className="text-sm font-medium text-muted-foreground">/mo</span>
                        <div className="text-sm font-semibold text-muted-foreground">₦{addon.price.ngn.toLocaleString()}/mo</div>
                      </>
                    ) : (
                      <span className="text-emerald-400">Free</span>
                    )}
                  </div>
                  <ul className="space-y-2 flex-1">
                    {addon.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <Check className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link href="/pricing"
                    className="mt-2 block text-center text-xs font-bold py-2 px-4 rounded-lg bg-background/60 hover:bg-background border border-border/50 hover:border-primary/40 transition-all">
                    {addon.price ? "Add to Plan →" : "Included Free →"}
                  </Link>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Metric Section */}
        <section className="py-32 border-t border-border/50 relative overflow-hidden">
          <div className="absolute top-1/2 right-0 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 blur-[150px] rounded-full pointer-events-none" />
          <div className="container mx-auto px-6 max-w-6xl relative z-10">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              <motion.div
                initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}
              >
                <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-6 text-balance leading-tight">
                  {stats?.heading ?? "Built for operators who hate switching tabs"}
                </h2>
                <p className="text-lg text-muted-foreground mb-8 font-medium leading-relaxed">
                  {stats?.body ??
                    "Stop paying for a social scheduler, a CRM, an inventory tracker, a finance tracker, a call center, and an AI generation tool. Awa Biz Suite connects your data so an inventory update can automatically trigger a social post."}
                </p>
                <ul className="space-y-4">
                  {(stats?.bullets ?? [
                    "Zero latency interface",
                    "Dark mode optimized for long sessions",
                    "Keyboard shortcuts for power users",
                    "Export any table to CSV instantly",
                  ]).map((item, i) => (
                    <motion.li 
                      key={i} initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: 0.2 + (i * 0.1) }}
                      className="flex items-center gap-3"
                    >
                      <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center border border-primary/30 shrink-0">
                        <Check className="w-3.5 h-3.5" />
                      </div>
                      <span className="font-semibold text-foreground/90">{item}</span>
                    </motion.li>
                  ))}
                </ul>
              </motion.div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-4 pt-8 md:pt-12">
                  <StatCard value={stats?.stats?.[0]?.value ?? "40+"} label={stats?.stats?.[0]?.label ?? "Hours saved monthly"} delay={0.2} />
                  <StatCard value={stats?.stats?.[1]?.value ?? "100%"} label={stats?.stats?.[1]?.label ?? "Data synchronization"} delay={0.3} />
                </div>
                <div className="space-y-4">
                  <StatCard value={stats?.stats?.[2]?.value ?? "9"} label={stats?.stats?.[2]?.label ?? "SaaS subscriptions replaced"} delay={0.4} />
                  <StatCard value={stats?.stats?.[3]?.value ?? "2.5x"} label={stats?.stats?.[3]?.label ?? "Faster response times"} delay={0.5} />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Trusted By Section */}
        <TrustedBySection />

        {/* Platform Partners Section */}
        <PlatformPartnersSection />

        {/* Ecosystem Section */}
        <section className="py-28 border-t border-border/50 relative overflow-hidden bg-background/50">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-primary/5 blur-[160px] rounded-full pointer-events-none" />
          <div className="container mx-auto px-6 max-w-4xl relative z-10 text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            >
              <Badge className="border-primary/30 bg-primary/10 text-primary px-4 py-1.5 text-xs font-bold uppercase tracking-wider mb-6">
                <Sparkles className="w-3.5 h-3.5 mr-2" /> The Ecosystem
              </Badge>
            </motion.div>
            <motion.h2
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }}
              className="text-3xl md:text-4xl font-extrabold tracking-tight mb-6 text-balance"
            >
              Powered by Awajimaa <span className="text-primary">AI</span>
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.2 }}
              className="text-lg text-muted-foreground leading-relaxed font-medium max-w-3xl mx-auto"
            >
              The Awajimaa AI is a core part of the Unified Civictech, Fintech, & Super App called the{" "}
              <span className="text-foreground font-bold">Awajimaa App</span> — an intelligent platform for
              reporting and responding to emergencies, commerce, and education. The WeChat of Africa, and the
              digital infrastructure that will power states and organizations across Africa and beyond.
            </motion.p>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-28 border-t border-border/50 relative overflow-hidden">
          <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-[500px] h-[500px] bg-primary/5 blur-[140px] rounded-full pointer-events-none" />
          <div className="container mx-auto px-6 max-w-3xl relative z-10">
            <motion.div
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              className="text-center mb-12"
            >
              <Badge className="border-primary/30 bg-primary/10 text-primary px-4 py-1.5 text-xs font-bold uppercase tracking-wider mb-4">
                <HelpCircle className="w-3.5 h-3.5 mr-2" /> FAQ
              </Badge>
              <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-balance">
                Common questions
              </h2>
              <p className="text-muted-foreground mt-3 text-lg font-medium">
                Everything you need to know about Awa Biz Suite.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }}
            >
              <Accordion type="single" collapsible className="space-y-3">
                {[
                  {
                    q: "What is Awa Biz Suite / Awajimaa AI?",
                    a: "Awa Biz Suite is an all-in-one business command centre built for vendors, agencies, and multi-brand operators. It brings social media management, inventory, orders, leads, CRM, payments, SMS & email campaigns, AI content creation, and analytics into one dashboard — no juggling 10 separate tools. It's powered by Awajimaa AI, part of the broader Awajimaa App ecosystem."
                  },
                  {
                    q: "Is there a free plan?",
                    a: "Yes. The Free plan gives you access to the core features with generous limits so you can run your business without paying anything upfront. Paid plans (Starter, Professional, Enterprise) unlock higher quotas, advanced AI features, voice campaigns, and priority support. You can upgrade, downgrade, or cancel at any time."
                  },
                  {
                    q: "What payment gateways are supported?",
                    a: "Awa Biz Suite supports Stripe (USD), Paystack (NGN), PayPal, Flutterwave, Nomba, and Remita out of the box. You can enable only the gateways relevant to your customers. Each gateway connects with your own merchant credentials so funds go directly to your account."
                  },
                  {
                    q: "Can I connect Awa Biz Suite to Zapier, HubSpot, my CRM, or an AI platform?",
                    a: "Absolutely — that's a core capability. Generate an API key from Account → Developer, or use our full OAuth 2.0 flow for marketplace-grade integrations. We expose a REST API covering posts, leads, products, inventory, orders, campaigns, and analytics, plus real-time webhooks for events like order.paid and lead.created. See the Developer Docs for guides specific to Zapier, HubSpot, Salesforce, Make, Power Automate, and n8n."
                  },
                  {
                    q: "Is there a mobile app?",
                    a: "Yes. Awa Biz Suite Mobile (available on iOS and Android via the Expo/EAS build) gives you a full dashboard on the go — manage products, orders, leads, and social posts from anywhere. Download links are in the App section of your dashboard."
                  },
                  {
                    q: "How does the AI assistant work?",
                    a: "The AI is embedded throughout the platform. The Social Media Manager generates captions and images for any platform in seconds. The AI Design Studio (Architect) creates brand assets and edits existing designs using vision + image generation. The AI Content Studio auto-generates full post batches. Voice Control lets you speak commands to fill forms and navigate — all powered by OpenAI and Google Gemini models running through our secure integration layer."
                  },
                  {
                    q: "Can I manage multiple brands or businesses?",
                    a: "Each vendor account represents one brand. If you manage multiple businesses, you can create separate vendor accounts (one per business) and switch between them. Enterprise plans include bulk management features and shared analytics across accounts."
                  },
                  {
                    q: "Which social media platforms can I post to?",
                    a: "Facebook Pages, Instagram Business, LinkedIn (personal profile), and X (Twitter) are supported with direct publishing. TikTok content can be drafted and scheduled with manual posting guidance. You can connect multiple accounts per platform and manage them all from a single compose screen."
                  },
                  {
                    q: "What happens if I go over my plan's usage limits?",
                    a: "Paid-tier vendors are never hard-blocked when they exceed their monthly quota. Instead, overage is tracked transparently and billed as a small pay-as-you-go charge at the end of the billing period — you always stay operational. Free-tier accounts are paused at the limit until the next period."
                  },
                  {
                    q: "How secure is my data?",
                    a: "All data is encrypted in transit (TLS 1.3) and at rest. Clerk handles authentication — your passwords are never stored by us. Payment credentials are stored encrypted and never logged. API keys are stored as SHA-256 hashes; the raw key is shown only once. Webhook signatures use HMAC-SHA256 so you can verify every delivery came from us."
                  },
                  {
                    q: "Can I export my data?",
                    a: "Yes. You can export orders, leads, products, expenses, and sales as CSV from the dashboard at any time. The API also gives programmatic access to all your data with no export quotas. If you need a full data extract for compliance or migration, contact admin@lumgwunsolutions.com."
                  },
                  {
                    q: "How do I cancel my subscription?",
                    a: "Go to Account → Billing → Manage Subscription. You'll be redirected to your Stripe or Paystack billing portal where you can cancel with one click. Your paid features remain active until the end of the current billing period — no pro-rating, no surprise charges."
                  },
                  {
                    q: "What support do you offer?",
                    a: "All plans include email support (admin@lumgwunsolutions.com). Starter and above include priority response. Professional and Enterprise customers can schedule calls with the team. We also maintain a developer support line at awajimaaapps@gmail.com for API and integration questions."
                  },
                  {
                    q: "What countries is Awa Biz Suite available in?",
                    a: "Awa Biz Suite is available globally. The platform is optimised for Nigerian businesses (Naira pricing, Paystack, Nomba, Remita, and local phone formats) and fully supports USD pricing and Stripe for international vendors. We're based in Port Harcourt, Nigeria and Gaithersburg, Maryland USA."
                  },
                ].map(({ q, a }, i) => (
                  <AccordionItem
                    key={i}
                    value={`item-${i}`}
                    className="border border-border/50 rounded-xl px-5 bg-card/30 backdrop-blur-sm data-[state=open]:border-primary/30 data-[state=open]:bg-primary/5 transition-colors"
                  >
                    <AccordionTrigger className="text-left font-semibold text-sm py-4 hover:no-underline gap-3 [&>svg]:hidden">
                      <span className="flex-1 text-left">{q}</span>
                      <Plus className="w-4 h-4 shrink-0 text-primary transition-transform duration-200 [[data-state=open]_&]:rotate-45" />
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground text-sm leading-relaxed pb-4">
                      {a}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.2 }}
              className="text-center mt-10 text-sm text-muted-foreground"
            >
              Still have questions?{" "}
              <a href="mailto:admin@lumgwunsolutions.com" className="text-primary hover:underline font-medium">
                Email us at admin@lumgwunsolutions.com
              </a>
            </motion.div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-32 relative overflow-hidden border-t border-primary/20">
          <div className="absolute inset-0 bg-primary/5" />
          <div className="absolute inset-0 bg-grid-pattern opacity-40" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-primary/20 blur-[150px] rounded-full pointer-events-none" />
          
          <div className="container mx-auto max-w-3xl relative z-10 text-center">
            <motion.h2 
              initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }}
              className="text-4xl md:text-5xl font-black tracking-tight mb-6 text-foreground"
            >
              {cta?.heading ?? "Ready to take command?"}
            </motion.h2>
            <motion.p 
              initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }}
              className="text-muted-foreground text-xl mb-10 font-medium"
            >
              {cta?.body ?? "Join thousands of operators running their empires on Awa Biz Suite."}
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.2 }}
            >
              <Link href="/sign-up" className="inline-flex h-14 items-center justify-center rounded-lg bg-primary px-10 text-base font-bold text-primary-foreground shadow-lg shadow-primary/30 transition-all hover:bg-primary/90 hover:scale-105 hover:shadow-xl hover:shadow-primary/50">
                {cta?.buttonLabel ?? "Start Your Free Trial"}
                <ChevronRight className="ml-2 h-5 w-5" />
              </Link>
            </motion.div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/50 bg-card/30 backdrop-blur">
        <div className="container mx-auto px-6 py-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
          {/* Brand */}
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <img src={settings?.logoUrl ?? "/awajimaa-logo.jpg"} alt={settings?.siteName ?? "Awajimaa"} className="w-8 h-8 rounded bg-primary/20 object-cover border border-primary/30" />
              <span className="font-extrabold text-lg tracking-tight">{settings?.siteName ?? "Awa Biz Suite"}</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs font-medium">
              {settings?.footerTagline ??
                "The all-in-one business command centre for vendors, agencies, and multi-brand operators — built for the modern African and global market."}
            </p>
            <div className="flex items-center gap-3">
              {SOCIAL_LINKS.map(({ name, href, icon: Icon }) => (
                <a
                  key={name}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={name}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/50 bg-background/50 text-muted-foreground transition-all hover:text-primary hover:border-primary/50 hover:scale-105"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Our Products */}
          <div className="space-y-6">
            <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Our Products</h4>
            <ul className="space-y-4 text-sm">
              <li>
                <span className="block font-semibold text-foreground">Awa Biz Suite</span>
                <span className="text-muted-foreground text-xs mt-1 block">Multi-vendor business management platform</span>
              </li>
              <li>
                <a href="https://www.awajimaaschools.com" target="_blank" rel="noopener noreferrer" className="group block">
                  <span className="block font-semibold text-foreground group-hover:text-primary transition-colors">Awajimaa Schools</span>
                  <span className="text-muted-foreground text-xs mt-1 block">Education Management Platform</span>
                </a>
              </li>
              <li>
                <a href="https://www.awajimaahosting.com" target="_blank" rel="noopener noreferrer" className="group block">
                  <span className="block font-semibold text-foreground group-hover:text-primary transition-colors">Awajimaa Hosting</span>
                  <span className="text-muted-foreground text-xs mt-1 block">Reliable cloud hosting services</span>
                </a>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div className="space-y-6">
            <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Company</h4>
            <div className="space-y-4 text-sm">
              <div>
                <p className="font-semibold text-foreground">Lumgwun Solutions</p>
                <a href="https://www.lumgwunsolutions.com" target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline mt-1 block">
                  www.lumgwunsolutions.com
                </a>
              </div>
              <div>
                <p className="font-semibold text-foreground">Awajimaa Group</p>
                <p className="text-xs text-muted-foreground mt-1 block">Technology · Education · Infrastructure</p>
              </div>
              {settings?.supportEmail ? (
                <div>
                  <p className="font-semibold text-foreground">Support</p>
                  <a href={`mailto:${settings.supportEmail}`} className="text-xs text-primary hover:underline mt-1 block">
                    {settings.supportEmail}
                  </a>
                </div>
              ) : null}
            </div>
          </div>

          {/* Contact */}
          <div className="space-y-6">
            <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Contact</h4>
            <div className="space-y-4 text-sm">
              {OFFICES.map((office) => (
                <div key={office.label} className="flex gap-2">
                  <MapPin className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                  <div>
                    <p className="font-semibold text-foreground">{office.label}</p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      {office.lines.map((line, i) => (
                        <React.Fragment key={i}>
                          {line}
                          {i < office.lines.length - 1 ? <br /> : null}
                        </React.Fragment>
                      ))}
                    </p>
                  </div>
                </div>
              ))}
              <div className="flex gap-2">
                <Phone className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                <div className="space-y-1">
                  {PHONE_NUMBERS.map((num) => (
                    <a
                      key={num}
                      href={`tel:${num.replace(/\s/g, "")}`}
                      className="block text-xs text-muted-foreground hover:text-primary transition-colors"
                    >
                      {num}
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Office Maps */}
        <div className="border-t border-border/50">
          <div className="container mx-auto px-6 py-8">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-4">Our Offices</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {OFFICES.map((office) => (
                <div key={office.label} className="rounded-xl overflow-hidden border border-border/40">
                  <div className="bg-muted/30 px-3 py-2 flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="text-xs font-semibold text-foreground">{office.label}</span>
                    <span className="text-[10px] text-muted-foreground ml-auto">{office.lines.join(", ")}</span>
                  </div>
                  <iframe
                    title={`Map — ${office.label}`}
                    src={`https://www.google.com/maps?q=${encodeURIComponent(office.lines.join(", "))}&output=embed`}
                    width="100%"
                    height="200"
                    style={{ border: 0, display: "block" }}
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-border/50">
          <div className="container mx-auto px-6 py-6 flex flex-col md:flex-row justify-between items-center gap-4 text-xs font-medium text-muted-foreground">
            <p>
              © {new Date().getFullYear()} {settings?.siteName ?? "Awa Biz Suite"}. All rights reserved.
            </p>
            <p>
              A product of{" "}
              <a href="https://www.lumgwunsolutions.com" target="_blank" rel="noopener noreferrer" className="text-foreground font-semibold hover:text-primary transition-colors">
                Lumgwun Solutions
              </a>
              {" "}and the{" "}
              <span className="text-foreground font-semibold">Awajimaa Group</span>.
            </p>
          </div>
        </div>
      </footer>

      {/* WhatsApp floating button — visible to all visitors */}
      <WhatsAppButton />
    </div>
  );
}

function Badge({ children, className }: { children: React.ReactNode, className?: string }) {
  return (
    <div className={`inline-flex items-center rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${className}`}>
      {children}
    </div>
  )
}

// Per-column entry animation: left-slide → zoom-bounce → right-slide
const CARD_ENTRY = [
  { hidden: { opacity: 0, x: -60, rotateY: -12 }, visible: { opacity: 1, x: 0, rotateY: 0 } },
  { hidden: { opacity: 0, y: 64, scale: 0.7  }, visible: { opacity: 1, y: 0, scale: 1  } },
  { hidden: { opacity: 0, x:  60, rotateY:  12 }, visible: { opacity: 1, x: 0, rotateY: 0 } },
] as const;

const CARD_ACCENT = [
  "from-violet-500/20 via-primary/10 to-transparent",
  "from-blue-500/20 via-cyan-500/10 to-transparent",
  "from-emerald-500/20 via-teal-500/10 to-transparent",
  "from-rose-500/20 via-orange-500/10 to-transparent",
  "from-amber-500/20 via-yellow-500/10 to-transparent",
  "from-fuchsia-500/20 via-pink-500/10 to-transparent",
];

function FeatureCard({ title, description, index }: { title: string; description: string; index: number }) {
  const Icon = getFeatureIcon(title);
  const col = index % 3;
  const row = Math.floor(index / 3);
  const delay = col * 0.11 + row * 0.07;

  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-60px" }}
      variants={CARD_ENTRY[col]}
      transition={{
        type: "spring",
        stiffness: col === 1 ? 170 : 210,
        damping: col === 1 ? 15 : 21,
        delay,
      }}
      whileHover={{ y: -8, scale: 1.025, transition: { type: "spring", stiffness: 380, damping: 18 } }}
      className="p-6 rounded-2xl border border-border/50 bg-card/40 backdrop-blur-sm hover:border-primary/40 transition-colors duration-300 group relative overflow-hidden cursor-default"
      style={{ perspective: 900 }}
    >
      {/* Hover gradient fill */}
      <div className={`absolute inset-0 bg-gradient-to-br ${CARD_ACCENT[index % CARD_ACCENT.length]} opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-2xl`} />

      {/* Ambient glow orb */}
      <div className="absolute -top-8 -right-8 w-36 h-36 bg-primary/6 rounded-full blur-2xl group-hover:bg-primary/14 transition-colors duration-500 pointer-events-none" />

      {/* Card number */}
      <motion.span
        initial={{ opacity: 0, scale: 0.5 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        transition={{ type: "spring", stiffness: 350, damping: 18, delay: delay + 0.28 }}
        className="absolute top-4 right-4 text-[11px] font-black text-muted-foreground/20 tabular-nums select-none relative z-10"
      >
        {String(index + 1).padStart(2, "0")}
      </motion.span>

      {/* Icon — bounce-in with spring, wobble on hover */}
      <motion.div
        initial={{ scale: 0, rotate: -28 }}
        whileInView={{ scale: 1, rotate: 0 }}
        viewport={{ once: true }}
        transition={{ type: "spring", stiffness: 500, damping: 13, delay: delay + 0.22 }}
        className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-5 group-hover:bg-primary group-hover:text-primary-foreground group-hover:shadow-lg group-hover:shadow-primary/30 transition-all duration-300 relative z-10 shrink-0"
      >
        <motion.div whileHover={{ rotate: [0, -10, 10, -5, 0], transition: { duration: 0.45 } }}>
          <Icon className="w-6 h-6" />
        </motion.div>
      </motion.div>

      <motion.h3
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: delay + 0.3, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="text-xl font-bold mb-3 text-foreground tracking-tight relative z-10"
      >
        {title}
      </motion.h3>

      <motion.p
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ delay: delay + 0.4, duration: 0.55 }}
        className="text-sm text-muted-foreground leading-relaxed font-medium relative z-10"
      >
        {description}
      </motion.p>

      {/* Bottom shimmer bar on hover */}
      <div className="absolute bottom-0 left-0 h-[2px] w-0 group-hover:w-full bg-gradient-to-r from-transparent via-primary/60 to-transparent transition-all duration-700 ease-out pointer-events-none rounded-b-2xl" />
    </motion.div>
  );
}

// ─── Platform Partners ────────────────────────────────────────────────────────

type TrustedPartner = { id: number; name: string; slug: string; logoUrl: string | null; websiteUrl: string | null; description: string | null };

function PartnerCard({ partner }: { partner: TrustedPartner }) {
  const initial = partner.name.trim().charAt(0).toUpperCase();
  const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  return (
    <motion.a
      href={`${BASE}/docs/${partner.slug}`}
      target="_blank"
      rel="noopener noreferrer"
      whileHover={{ scale: 1.06, y: -3 }}
      transition={{ type: "spring", stiffness: 380, damping: 18 }}
      className="flex items-center gap-3 shrink-0 px-5 py-3 rounded-2xl bg-card/80 border border-border/50 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10 backdrop-blur-sm cursor-pointer select-none transition-colors no-underline"
    >
      {partner.logoUrl ? (
        <img src={partner.logoUrl} alt={partner.name} className="w-8 h-8 rounded-lg object-contain shrink-0 bg-white/5"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
      ) : (
        <div className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
          <span className="text-xs font-black text-primary">{initial}</span>
        </div>
      )}
      <div>
        <span className="text-sm font-semibold text-foreground/80 whitespace-nowrap block max-w-[130px] truncate">{partner.name}</span>
        {partner.websiteUrl && (
          <span className="text-xs text-muted-foreground/60 truncate block max-w-[130px]">{partner.websiteUrl.replace(/^https?:\/\//, "")}</span>
        )}
      </div>
    </motion.a>
  );
}

function PlatformPartnersSection() {
  const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  const { data } = useQuery<{ count: number; partners: TrustedPartner[] }>({
    queryKey: ["trusted-partners"],
    queryFn: () => fetch(`${BASE}/api/public/trusted-partners`).then((r) => r.json()),
    staleTime: 10 * 60 * 1000,
  });

  const partners = data?.partners ?? [];
  // Always show the section with a CTA — hide marquee if no partners yet
  const showMarquee = partners.length >= 2;
  const row = showMarquee ? [...partners, ...partners] : [];

  return (
    <section className="py-20 border-t border-border/50 relative overflow-hidden bg-gradient-to-b from-background/60 to-card/20">
      <style>{`
        @keyframes awa-partner-ltr { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .awa-partner-ltr { animation: awa-partner-ltr 50s linear infinite; }
        .awa-partner-wrap:hover .awa-partner-ltr { animation-play-state: paused; }
      `}</style>

      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] pointer-events-none"
        style={{ background: "radial-gradient(ellipse, hsl(var(--primary)/0.05) 0%, transparent 70%)" }} />
      <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-background to-transparent pointer-events-none z-10" />
      <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-background to-transparent pointer-events-none z-10" />

      <div className="container mx-auto px-6 max-w-4xl relative z-10 text-center mb-10">
        <motion.div
          initial={{ opacity: 0, scale: 0.75, y: 10 }}
          whileInView={{ opacity: 1, scale: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ type: "spring", stiffness: 300, damping: 18 }}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-border/60 bg-muted/60 text-muted-foreground text-xs font-bold uppercase tracking-widest mb-6"
        >
          <motion.span className="w-2 h-2 rounded-full bg-blue-400"
            animate={{ scale: [1, 1.5, 1], opacity: [1, 0.6, 1] }}
            transition={{ duration: 2, repeat: Infinity }} />
          Connected Businesses
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className="text-2xl md:text-3xl font-extrabold tracking-tight mb-4"
        >
          Built on top of <span className="text-primary">Awa Biz Suite</span>
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="text-muted-foreground text-base max-w-xl mx-auto"
        >
          These platforms and websites connected their codebases — now their API documentation is live, and thousands of vendors can discover and integrate with them in one click.
        </motion.p>
      </div>

      {showMarquee && (
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
          className="overflow-hidden awa-partner-wrap mb-8 relative z-[5]"
        >
          <div className="awa-partner-ltr flex gap-4">
            {row.map((p, i) => <PartnerCard key={`pp-${p.id}-${i}`} partner={p} />)}
          </div>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: 0.4 }}
        className="text-center relative z-10"
      >
        <p className="text-sm text-muted-foreground mb-4">
          Own a website, app, or SaaS?{" "}
          <span className="text-foreground font-semibold">Become a Connected Business</span> — sign up as a vendor, connect your repo, and our AI generates your full API documentation automatically.
        </p>
        <a href={`${BASE}/become-a-connected-business`}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity no-underline">
          Become a Connected Business →
        </a>
      </motion.div>
    </section>
  );
}

// ─── Trusted By ──────────────────────────────────────────────────────────────

type TrustedVendor = {
  id: number; name: string; logoUrl: string | null;
  industry: string | null; website: string | null; addedAt: number;
};

const INDUSTRY_COLORS: Record<string, string> = {
  "Food & Beverage":   "#F97316",
  "Fashion & Apparel": "#EC4899",
  "Technology":        "#3B82F6",
  "Handmade Goods":    "#10B981",
  "Health & Wellness": "#8B5CF6",
  "Home Decor":        "#F59E0B",
  "Media & Creative":  "#06B6D4",
  "General":           "#6B7280",
};
function industryColor(ind: string | null) {
  return INDUSTRY_COLORS[ind ?? ""] ?? "#7F50FF";
}

/** Single vendor pill with 3-D tilt, glass blur, clickable when vendor has a website. */
function VendorLogoCard({ vendor, isNew = false }: { vendor: TrustedVendor; isNew?: boolean }) {
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rotateX = useTransform(my, [-0.5, 0.5], [10, -10]);
  const rotateY = useTransform(mx, [-0.5, 0.5], [-10, 10]);

  function onMouseMove(e: React.MouseEvent<HTMLElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width - 0.5);
    my.set((e.clientY - r.top) / r.height - 0.5);
  }
  function onMouseLeave() { mx.set(0); my.set(0); }

  const initial = vendor.name.trim().charAt(0).toUpperCase();
  const hasLink = !!vendor.website?.trim();
  const isExternal = hasLink && (vendor.website!.startsWith("http://") || vendor.website!.startsWith("https://"));
  const dot = industryColor(vendor.industry);

  const Tag = hasLink ? motion.a : motion.div;
  const linkProps = hasLink
    ? { href: vendor.website!, target: isExternal ? "_blank" : "_self", rel: isExternal ? "noopener noreferrer" : undefined }
    : {};

  return (
    <div style={{ perspective: 900 }} className="shrink-0">
      <Tag
        {...(linkProps as any)}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
        whileHover={{ scale: 1.06 }}
        transition={{ type: "spring", stiffness: 420, damping: 22 }}
        className={[
          "group relative flex items-center gap-3 px-4 py-2.5 rounded-2xl select-none",
          "bg-card/70 border border-border/50 backdrop-blur-md",
          "hover:border-primary/50 hover:shadow-xl hover:shadow-primary/15",
          "transition-[border-color,box-shadow] duration-200",
          hasLink ? "cursor-pointer no-underline" : "cursor-default",
          isNew ? "ring-2 ring-primary/60 ring-offset-1 ring-offset-background" : "",
        ].join(" ")}
        title={hasLink ? `Visit ${vendor.name}` : vendor.name}
      >
        {/* Shimmer overlay on hover */}
        <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
          style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.06) 0%, transparent 60%)" }} />

        {/* Logo or initial avatar */}
        {vendor.logoUrl ? (
          <img src={vendor.logoUrl} alt={vendor.name}
            className="w-8 h-8 rounded-lg object-contain shrink-0"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
        ) : (
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: `${dot}22`, border: `1px solid ${dot}44` }}>
            <span className="text-xs font-black" style={{ color: dot }}>{initial}</span>
          </div>
        )}

        {/* Name + industry */}
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-bold text-foreground/90 whitespace-nowrap truncate max-w-[130px] leading-tight">
            {vendor.name}
          </span>
          {vendor.industry && (
            <span className="text-[10px] font-semibold whitespace-nowrap leading-tight mt-0.5"
              style={{ color: dot }}>{vendor.industry}</span>
          )}
        </div>

        {/* Link icon */}
        {hasLink && (
          <svg className="w-3 h-3 shrink-0 opacity-30 group-hover:opacity-70 transition-opacity ml-0.5"
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        )}

        {/* "New" badge */}
        {isNew && (
          <motion.span
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="absolute -top-2 -right-2 bg-primary text-primary-foreground text-[9px] font-black px-1.5 py-0.5 rounded-full shadow-lg"
          >NEW</motion.span>
        )}
      </Tag>
    </div>
  );
}

/** Animated counter that counts up when totalCount changes. */
function AnimatedCount({ target }: { target: number }) {
  const mv = useMotionValue(0);
  const display = useTransform(mv, v => `${Math.round(v).toLocaleString()}+`);

  useEffect(() => {
    const controls = animate(mv, target, { duration: 2.2, ease: [0.16, 1, 0.3, 1] });
    return controls.stop;
  }, [target]);

  return <motion.span>{display}</motion.span>;
}

/** Sliding "just joined" notification bar. */
function JoinNotification({ vendor, onDone }: { vendor: TrustedVendor; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 5200);
    return () => clearTimeout(t);
  }, []);

  const initial = vendor.name.trim().charAt(0).toUpperCase();
  const dot = industryColor(vendor.industry);

  return (
    <motion.div
      initial={{ opacity: 0, y: -40, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -30, scale: 0.9 }}
      transition={{ type: "spring", stiffness: 400, damping: 28 }}
      className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-card/90 border border-primary/30 shadow-lg shadow-primary/10 backdrop-blur-md text-sm font-semibold text-foreground/90"
    >
      <motion.span
        className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"
        animate={{ scale: [1, 1.6, 1], opacity: [1, 0.5, 1] }}
        transition={{ duration: 1.2, repeat: Infinity }}
      />
      {vendor.logoUrl
        ? <img src={vendor.logoUrl} alt="" className="w-5 h-5 rounded-md object-contain" />
        : <div className="w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-black shrink-0"
            style={{ background: `${dot}33`, color: dot }}>{initial}</div>
      }
      <span className="text-primary font-bold">{vendor.name}</span>
      <span className="text-muted-foreground font-medium">just joined 🎉</span>
    </motion.div>
  );
}

function TrustedBySection() {
  const lastFetchTime = useRef(Date.now());

  const [newIds, setNewIds] = useState<Set<number>>(new Set());
  const [notifications, setNotifications] = useState<TrustedVendor[]>([]);

  const { data } = useQuery<{ totalCount: number; vendors: TrustedVendor[]; lastRefreshedAt: number }>({
    queryKey: ["trusted-vendors"],
    queryFn: () => fetch(`${BASE_URL}/api/public/trusted-vendors`).then((r) => r.json()),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  // Detect new arrivals on every refetch
  useEffect(() => {
    if (!data?.vendors) return;
    const now = Date.now();
    const arrivals = data.vendors.filter(v => v.addedAt > lastFetchTime.current);
    if (arrivals.length > 0) {
      setNewIds(prev => new Set([...prev, ...arrivals.map(v => v.id)]));
      setNotifications(prev => [...arrivals, ...prev].slice(0, 3));
      // Clear the NEW badge from cards after 8s
      setTimeout(() => setNewIds(prev => {
        const next = new Set(prev);
        arrivals.forEach(v => next.delete(v.id));
        return next;
      }), 8000);
    }
    lastFetchTime.current = now;
  }, [data]);

  if (!data || (data.totalCount ?? 0) < 1) return null;

  const vendors = data.vendors;
  // Split into 3 rows — different speeds create a sense of depth
  const t1 = Math.ceil(vendors.length / 3);
  const t2 = Math.ceil((2 * vendors.length) / 3);
  const r1raw = vendors.slice(0, t1);
  const r2raw = vendors.slice(t1, t2);
  const r3raw = vendors.slice(t2);
  // Each row doubled for seamless infinite scroll; fall back to full list if a row is too small
  const makeRow = (arr: TrustedVendor[]) => {
    const safe = arr.length >= 2 ? arr : vendors;
    return [...safe, ...safe];
  };
  const row1 = makeRow(r1raw);
  const row2 = makeRow(r2raw);
  const row3 = makeRow(r3raw);

  return (
    <section className="py-20 border-t border-border/50 relative overflow-hidden bg-gradient-to-b from-card/20 to-background/60">
      {/* CSS marquee keyframes — 3 speeds */}
      <style>{`
        @keyframes awa-ltr  { from{transform:translateX(0)}    to{transform:translateX(-50%)} }
        @keyframes awa-rtl  { from{transform:translateX(-50%)} to{transform:translateX(0)}    }
        .awa-s1 { animation: awa-ltr 50s linear infinite; }
        .awa-s2 { animation: awa-rtl 38s linear infinite; }
        .awa-s3 { animation: awa-ltr 28s linear infinite; }
        .awa-wrap:hover .awa-s1,
        .awa-wrap:hover .awa-s2,
        .awa-wrap:hover .awa-s3 { animation-play-state: paused; }
      `}</style>

      {/* Pulsing ambient glow */}
      <motion.div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[500px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(ellipse, hsl(var(--primary)/0.07) 0%, transparent 68%)" }}
        animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.85, 0.4] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }} />

      {/* Secondary glow — offset for richness */}
      <motion.div className="absolute top-1/3 right-1/4 w-[400px] h-[300px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(ellipse, hsl(var(--primary)/0.04) 0%, transparent 70%)" }}
        animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.7, 0.3] }}
        transition={{ duration: 11, repeat: Infinity, ease: "easeInOut", delay: 3 }} />

      {/* Edge fade masks */}
      <div className="absolute inset-y-0 left-0 w-44 bg-gradient-to-r from-background to-transparent pointer-events-none z-10" />
      <div className="absolute inset-y-0 right-0 w-44 bg-gradient-to-l from-background to-transparent pointer-events-none z-10" />

      {/* ── Heading ──────────────────────────────────────────────────────── */}
      <div className="container mx-auto px-6 max-w-4xl relative z-10 text-center mb-10">
        {/* Live "just joined" notifications */}
        <div className="flex justify-center mb-5 min-h-[38px]">
          <AnimatePresence mode="popLayout">
            {notifications.slice(0, 1).map(v => (
              <JoinNotification key={v.id} vendor={v}
                onDone={() => setNotifications(prev => prev.filter(x => x.id !== v.id))} />
            ))}
          </AnimatePresence>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.75, y: 10 }}
          whileInView={{ opacity: 1, scale: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ type: "spring", stiffness: 300, damping: 18 }}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-border/60 bg-muted/60 text-muted-foreground text-xs font-bold uppercase tracking-widest mb-6"
        >
          <motion.span className="w-2 h-2 rounded-full bg-emerald-400"
            animate={{ scale: [1, 1.6, 1], opacity: [1, 0.5, 1] }}
            transition={{ duration: 1.8, repeat: Infinity }} />
          Trusted by <AnimatedCount target={data.totalCount} /> businesses
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 24, filter: "blur(6px)" }}
          whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          viewport={{ once: true }}
          transition={{ delay: 0.1, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="text-2xl md:text-3xl font-extrabold tracking-tight mb-4"
        >
          Growing businesses run on{" "}
          <span className="text-primary">Awa Biz Suite</span>
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="text-muted-foreground text-base font-medium max-w-xl mx-auto"
        >
          Operators across Africa and the diaspora trust us to run their entire business.
        </motion.p>
      </div>

      {/* ── Three-speed marquee ───────────────────────────────────────────── */}
      <div className="awa-wrap space-y-3 relative z-[5]">
        {/* Row 1 — slow LTR */}
        <motion.div className="overflow-hidden"
          initial={{ opacity: 0, x: -40 }} whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.2 }}>
          <div className="awa-s1 flex gap-3">
            {row1.map((v, i) => (
              <VendorLogoCard key={`r1-${v.id}-${i}`} vendor={v} isNew={newIds.has(v.id)} />
            ))}
          </div>
        </motion.div>

        {/* Row 2 — medium RTL */}
        <motion.div className="overflow-hidden"
          initial={{ opacity: 0, x: 40 }} whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.35 }}>
          <div className="awa-s2 flex gap-3">
            {row2.map((v, i) => (
              <VendorLogoCard key={`r2-${v.id}-${i}`} vendor={v} isNew={newIds.has(v.id)} />
            ))}
          </div>
        </motion.div>

        {/* Row 3 — fast LTR */}
        <motion.div className="overflow-hidden"
          initial={{ opacity: 0, x: -40 }} whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.5 }}>
          <div className="awa-s3 flex gap-3">
            {row3.map((v, i) => (
              <VendorLogoCard key={`r3-${v.id}-${i}`} vendor={v} isNew={newIds.has(v.id)} />
            ))}
          </div>
        </motion.div>
      </div>

      {/* ── Bottom CTA ───────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0 }} whileInView={{ opacity: 1 }}
        viewport={{ once: true }} transition={{ delay: 0.6 }}
        className="text-center mt-10 relative z-10"
      >
        <p className="text-xs text-muted-foreground/50 font-medium">
          Your logo could be here —{" "}
          <a href="/sign-up" className="text-primary hover:underline font-semibold">join free today</a>
        </p>
      </motion.div>
    </section>
  );
}

function StatCard({ value, label, delay = 0 }: { value: string, label: string, delay?: number }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay, duration: 0.5 }}
      className="p-8 rounded-2xl border border-border/50 bg-card/30 backdrop-blur hover:bg-card/60 transition-colors relative overflow-hidden group"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="relative z-10">
        <div className="text-4xl md:text-5xl font-black tracking-tighter text-foreground mb-3 font-mono">{value}</div>
        <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{label}</div>
      </div>
    </motion.div>
  )
}
