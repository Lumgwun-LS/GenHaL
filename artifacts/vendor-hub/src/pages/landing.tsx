import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { BarChart3, Globe, PackageSearch, MessageSquareText, Zap, ChevronRight, Mail } from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

const ICONS = [MessageSquareText, BarChart3, PackageSearch, Zap, Mail, Globe];

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

export default function LandingPage() {
  const { data } = useQuery({ queryKey: ["site-content"], queryFn: fetchSiteContent, staleTime: 60_000 });

  const hero = data?.["landing.hero"];
  const features = data?.["landing.features"];
  const stats = data?.["landing.stats"];
  const cta = data?.["landing.cta"];
  const settings = data?.["site.settings"];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Navbar */}
      <header className="fixed top-0 w-full z-50 bg-background/80 backdrop-blur-md border-b">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={settings?.logoUrl ?? "/awajimaa-logo.jpg"} alt={settings?.siteName ?? "Awajimaa"} className="w-8 h-8 rounded object-cover" />
            <span className="font-bold text-xl tracking-tight">{settings?.siteName ?? "Awa Biz Suite"}</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/sign-in" className="text-sm font-medium hover:text-primary transition-colors">
              Sign In
            </Link>
            <Link href="/sign-up" className="text-sm font-medium text-primary-foreground bg-primary px-4 py-2 rounded-md hover:bg-primary/90 transition-colors">
              Start Free Trial
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 pt-16">
        {/* Hero Section */}
        <section className="py-20 md:py-32 px-4 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/20 via-background to-background -z-10"></div>
          <div className="container mx-auto max-w-6xl flex flex-col items-center text-center">
            <Badge className="mb-6">{hero?.badge ?? "Command Center for Modern Operators"}</Badge>
            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-8 max-w-4xl text-balance">
              {hero?.heading ?? "Run your entire business from one terminal."}
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl text-balance">
              {hero?.subheading ??
                "Awa Biz Suite replaces your fragmented tool stack. Manage multi-channel social media, inventory, sales, leads, and SMS campaigns in a single, high-density cockpit."}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 mb-16">
              <Link href="/sign-up" className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90">
                {hero?.primaryCta ?? "Get Started"}
                <ChevronRight className="ml-2 h-4 w-4" />
              </Link>
              <Button variant="outline" size="lg" className="h-12 px-8">
                {hero?.secondaryCta ?? "View Demo"}
              </Button>
            </div>

            <div className="w-full aspect-[16/9] md:aspect-[21/9] rounded-xl overflow-hidden border shadow-2xl relative">
              <img src="/hero.png" alt="Awa Biz Suite Dashboard" className="object-cover w-full h-full" />
              <div className="absolute inset-0 bg-gradient-to-t from-background/20 to-transparent"></div>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="py-24 bg-muted/30">
          <div className="container mx-auto px-4 max-w-6xl">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold tracking-tight mb-4">{features?.heading ?? "Everything you need to scale"}</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
                {features?.subheading ?? "We've collapsed 6 different SaaS products into one cohesive, blazing-fast experience."}
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {(features?.items ?? [
                { title: "Unified Social", description: "Draft, schedule, and publish to Instagram, X, LinkedIn, TikTok, and Telegram from one composer." },
                { title: "Sales & Leads CRM", description: "Track every lead from first touch to closed order. Visualize pipelines and revenue." },
                { title: "Inventory & Stock", description: "Real-time stock tracking with low-stock alerts and transaction histories." },
                { title: "AI Content Studio", description: "Generate bespoke product imagery and viral captions natively inside the platform." },
                { title: "Omnichannel Campaigns", description: "Broadcast targeted email and SMS campaigns to your leads and customers." },
                { title: "Multi-Vendor Management", description: "Run an agency? Manage dozens of separate brands and vendors from a single login." },
              ]).map((f, i) => (
                <FeatureCard key={f.title} icon={ICONS[i % ICONS.length]!} title={f.title} description={f.description} />
              ))}
            </div>
          </div>
        </section>

        {/* Metric Section */}
        <section className="py-24">
          <div className="container mx-auto px-4 max-w-6xl">
            <div className="grid md:grid-cols-2 gap-16 items-center">
              <div>
                <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-6">{stats?.heading ?? "Built for operators who hate switching tabs"}</h2>
                <p className="text-lg text-muted-foreground mb-8">
                  {stats?.body ??
                    "Stop paying for a social scheduler, a CRM, an inventory tracker, an email tool, and an AI generation tool. Awa Biz Suite connects your data so an inventory update can automatically trigger a social post."}
                </p>
                <ul className="space-y-4">
                  {(stats?.bullets ?? [
                    "Zero latency interface",
                    "Dark mode optimized for long sessions",
                    "Keyboard shortcuts for power users",
                    "Export any table to CSV instantly",
                  ]).map((item, i) => (
                    <li key={i} className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center">✓</div>
                      <span className="font-medium">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-4 pt-8">
                  <StatCard value={stats?.stats?.[0]?.value ?? "40+"} label={stats?.stats?.[0]?.label ?? "Hours saved monthly"} />
                  <StatCard value={stats?.stats?.[1]?.value ?? "100%"} label={stats?.stats?.[1]?.label ?? "Data synchronization"} />
                </div>
                <div className="space-y-4">
                  <StatCard value={stats?.stats?.[2]?.value ?? "6"} label={stats?.stats?.[2]?.label ?? "SaaS subscriptions replaced"} />
                  <StatCard value={stats?.stats?.[3]?.value ?? "2.5x"} label={stats?.stats?.[3]?.label ?? "Faster response times"} />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-24 bg-primary text-primary-foreground text-center px-4 relative overflow-hidden">
          <div className="container mx-auto max-w-3xl relative z-10">
            <h2 className="text-4xl font-bold mb-6">{cta?.heading ?? "Ready to take command?"}</h2>
            <p className="text-primary-foreground/80 text-xl mb-10">
              {cta?.body ?? "Join thousands of operators running their empires on Awa Biz Suite."}
            </p>
            <Link href="/sign-up" className="inline-flex h-14 items-center justify-center rounded-md bg-background px-10 text-base font-bold text-foreground shadow-lg transition-colors hover:bg-background/90">
              {cta?.buttonLabel ?? "Start Your Free Trial"}
            </Link>
          </div>
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0)', backgroundSize: '24px 24px' }}></div>
        </section>
      </main>

      <footer className="border-t bg-card">
        {/* Main footer grid */}
        <div className="container mx-auto px-4 py-14 grid grid-cols-1 md:grid-cols-3 gap-10">
          {/* Brand */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <img src={settings?.logoUrl ?? "/awajimaa-logo.jpg"} alt={settings?.siteName ?? "Awajimaa"} className="w-8 h-8 rounded object-cover" />
              <span className="font-bold text-base tracking-tight">{settings?.siteName ?? "Awa Biz Suite"}</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
              {settings?.footerTagline ??
                "The all-in-one business command centre for vendors, agencies, and multi-brand operators — built for the modern African and global market."}
            </p>
          </div>

          {/* Our Products */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Our Products</h4>
            <ul className="space-y-3 text-sm">
              <li>
                <span className="block font-medium text-foreground">Awa Biz Suite</span>
                <span className="text-muted-foreground text-xs">Multi-vendor business management platform</span>
              </li>
              <li>
                <a
                  href="https://www.awajimaaschools.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group"
                >
                  <span className="block font-medium text-foreground group-hover:text-primary transition-colors">Awajimaa Schools</span>
                  <span className="text-muted-foreground text-xs">Education Management Platform</span>
                </a>
              </li>
              <li>
                <a
                  href="https://www.awajimaahosting.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group"
                >
                  <span className="block font-medium text-foreground group-hover:text-primary transition-colors">Awajimaa Hosting</span>
                  <span className="text-muted-foreground text-xs">Reliable cloud hosting services</span>
                </a>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Company</h4>
            <div className="space-y-3 text-sm">
              <div>
                <p className="font-medium text-foreground">Lumgwun Solutions</p>
                <a
                  href="https://www.lumgwunsolutions.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline"
                >
                  www.lumgwunsolutions.com
                </a>
              </div>
              <div>
                <p className="font-medium text-foreground">Awajimaa Group</p>
                <p className="text-xs text-muted-foreground">Technology · Education · Infrastructure</p>
              </div>
              {settings?.supportEmail ? (
                <div>
                  <p className="font-medium text-foreground">Support</p>
                  <a href={`mailto:${settings.supportEmail}`} className="text-xs text-primary hover:underline">
                    {settings.supportEmail}
                  </a>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t">
          <div className="container mx-auto px-4 py-5 flex flex-col md:flex-row justify-between items-center gap-2 text-xs text-muted-foreground">
            <p>
              © {new Date().getFullYear()} {settings?.siteName ?? "Awa Biz Suite"}. All rights reserved.
            </p>
            <p>
              A product of{" "}
              <a
                href="https://www.lumgwunsolutions.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground font-medium hover:text-primary transition-colors"
              >
                Lumgwun Solutions
              </a>
              {" "}and the{" "}
              <span className="text-foreground font-medium">Awajimaa Group</span>.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Badge({ children, className }: { children: React.ReactNode, className?: string }) {
  return (
    <div className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-primary/10 text-primary ${className}`}>
      {children}
    </div>
  )
}

function FeatureCard({ icon: Icon, title, description }: { icon: any, title: string, description: string }) {
  return (
    <div className="p-6 rounded-xl border bg-card hover:border-primary/50 transition-colors group">
      <div className="w-12 h-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
        <Icon className="w-6 h-6" />
      </div>
      <h3 className="text-xl font-bold mb-3">{title}</h3>
      <p className="text-muted-foreground leading-relaxed">{description}</p>
    </div>
  )
}

function StatCard({ value, label }: { value: string, label: string }) {
  return (
    <div className="p-6 rounded-xl border bg-card">
      <div className="text-4xl font-extrabold tracking-tight text-primary mb-2">{value}</div>
      <div className="text-sm font-medium text-muted-foreground">{value && label}</div>
    </div>
  )
}
