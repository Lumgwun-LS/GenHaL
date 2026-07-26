import React, { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { 
  MessageSquareText, Zap, ChevronRight, 
  Sparkles, Wallet, Network, Package, PhoneCall, Megaphone, Layers, Users, Check,
  Command, Play, MapPin, Phone, ChevronLeft, Mic, FileSpreadsheet, Globe2,
  Library, Target
} from "lucide-react";
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
  if (t.includes("website builder")) return Globe2;
  if (t.includes("media library") || t.includes("media")) return Library;
  if (t.includes("ads") || t.includes("paid social")) return Target;
  if (t.includes("ai ") || t.includes("studio")) return Sparkles;
  if (t.includes("sales") || t.includes("crm")) return Users;
  if (t.includes("finance")) return Wallet;
  if (t.includes("branch") || t.includes("worker")) return Network;
  if (t.includes("order") || t.includes("inventory")) return Package;
  if (t.includes("voice")) return PhoneCall;
  if (t.includes("omnichannel")) return Megaphone;
  if (t.includes("vendor")) return Layers;
  return Zap;
};

const DEFAULT_FEATURES = [
  { title: "Unified Social", description: "Draft, schedule, and publish to Instagram, Facebook, X, and LinkedIn — including video — from one composer." },
  { title: "AI Content & Video Studio", description: "Generate product imagery, captions, and fully animated multi-scene marketing videos with AI voiceover and music." },
  { title: "Sales & Leads CRM", description: "Track every lead from first touch to closed order. Visualize pipelines and revenue." },
  { title: "Finance Suite", description: "Sales, expenses, and investments in one ledger — filterable by branch, worker, and date range, exportable anytime." },
  { title: "Branches & Workers", description: "Model every physical location and staff member, and see exactly which branch or worker drove each sale." },
  { title: "Orders & Inventory", description: "Real-time stock tracking with low-stock alerts, full order fulfillment, and transaction histories." },
  { title: "Voice Campaigns", description: "Automated AI voice calls for birthdays, promotions, and re-engagement — no call center required." },
  { title: "Omnichannel Campaigns", description: "Broadcast targeted email and SMS campaigns to your leads and customers." },
  { title: "Multi-Vendor Management", description: "Run an agency? Manage dozens of separate brands and vendors from a single login." },
  { title: "AI Quick Create", description: "Create inventory items, orders, and invoices instantly — just speak or type what you want and AI fills in the details." },
  { title: "Spreadsheet Intelligence", description: "Upload any CSV or Excel file and ask AI questions about your data. Get charts, trends, and actionable insights instantly." },
  { title: "Business Website Builder", description: "Launch a professional storefront in minutes with customizable templates, live preview, and one-click publish." },
  { title: "Media Library", description: "Browse, edit, and reuse every AI-generated and vendor-uploaded image or video in one searchable library — pick any asset directly from your social composer or website builder." },
  { title: "Ads Suite", description: "Create and manage Meta and X/Twitter paid social campaigns without leaving your dashboard — connect your ad account and launch in minutes." },
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
    name: "Business Website Builder",
    badge: null,
    price: { usd: 9, ngn: 5500 },
    description: "A full website editor with 4 professional templates, custom branding, SEO controls, and live public hosting.",
    features: [
      "4 professional templates",
      "Custom theme color & logo",
      "8 section types (hero, gallery, menu…)",
      "Live public URL at your custom slug",
      "SEO title & meta description controls",
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

export default function LandingPage() {
  const { data } = useQuery({ queryKey: ["site-content"], queryFn: fetchSiteContent, staleTime: 60_000 });
  const [activeVideo, setActiveVideo] = useState(0);

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
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={settings?.logoUrl ?? "/awajimaa-logo.jpg"} alt={settings?.siteName ?? "Awajimaa"} className="w-8 h-8 rounded bg-primary/20 object-cover border border-primary/30" />
            <span className="font-extrabold text-lg tracking-tight">{settings?.siteName ?? "Awa Biz Suite"}</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/pricing" className="text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">
              Pricing
            </Link>
            <Link href="/sign-in" className="text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">
              Sign In
            </Link>
            <Link href="/sign-up" className="text-sm font-bold text-primary-foreground bg-primary px-5 py-2 rounded-md hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/40 transition-all">
              Start Free Trial
            </Link>
          </div>
        </div>
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
        <section className="py-24 relative border-t border-border/50 bg-background/50">
          <div className="container mx-auto px-6 max-w-6xl relative z-10">
            <div className="text-center mb-16">
              <motion.h2 
                initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                className="text-3xl md:text-4xl font-extrabold tracking-tight mb-4"
              >
                {features?.heading ?? "Everything you need to scale"}
              </motion.h2>
              <motion.p 
                initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }}
                className="text-muted-foreground max-w-2xl mx-auto text-lg font-medium"
              >
                {features?.subheading ?? "We've collapsed 9 different SaaS products into one cohesive, blazing-fast experience."}
              </motion.p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
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

function FeatureCard({ title, description, index }: { title: string, description: string, index: number }) {
  const Icon = getFeatureIcon(title);
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-50px" }} transition={{ duration: 0.5, delay: index * 0.1 }}
      className="p-6 rounded-2xl border border-border/50 bg-card/40 backdrop-blur-sm hover:bg-card/80 hover:border-primary/50 transition-all duration-300 group relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-colors" />
      <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-5 group-hover:scale-110 group-hover:bg-primary group-hover:text-primary-foreground shadow-sm shadow-primary/0 group-hover:shadow-md group-hover:shadow-primary/30 transition-all duration-300 relative z-10">
        <Icon className="w-6 h-6" />
      </div>
      <h3 className="text-xl font-bold mb-3 text-foreground tracking-tight relative z-10">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed font-medium relative z-10">{description}</p>
    </motion.div>
  )
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
