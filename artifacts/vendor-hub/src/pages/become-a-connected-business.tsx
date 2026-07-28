import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import { useUser } from "@clerk/react";
import { useState } from "react";
import {
  GitBranch, Zap, Globe, Link2, RefreshCw, ArrowRight,
  CheckCircle2, Github, Lock, FileCode2, Users, Star,
  ChevronRight, BookOpen,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

const STEPS = [
  {
    number: "01",
    icon: Users,
    title: "Sign up as a Vendor",
    description:
      "Create your free Awa Biz Suite vendor account — the same signup every business uses. No separate form, no waiting for approval.",
    color: "text-violet-400",
    bg: "bg-violet-400/10",
    border: "border-violet-400/25",
  },
  {
    number: "02",
    icon: GitBranch,
    title: "Connect your version control",
    description:
      "Link your GitHub, GitLab, or Bitbucket repository from the Connected Business dashboard. Paste your personal access token — we store it encrypted.",
    color: "text-blue-400",
    bg: "bg-blue-400/10",
    border: "border-blue-400/25",
  },
  {
    number: "03",
    icon: Zap,
    title: "Awajimaa AI reads your codebase",
    description:
      "Our AI scans your repo, identifies your routes, models, and auth flows, then writes complete API documentation and an integration connector — in seconds.",
    color: "text-amber-400",
    bg: "bg-amber-400/10",
    border: "border-amber-400/25",
  },
  {
    number: "04",
    icon: Globe,
    title: "Share your docs & get discovered",
    description:
      "You get a permanent docs link, an embeddable 'Connect' button for your website, and your business is listed on the Awa Biz Suite homepage.",
    color: "text-emerald-400",
    bg: "bg-emerald-400/10",
    border: "border-emerald-400/25",
  },
];

const FEATURES = [
  { icon: GitBranch, title: "GitHub, GitLab & Bitbucket", desc: "Connect whichever VCS your team uses — we support all three." },
  { icon: FileCode2, title: "AI-generated API documentation", desc: "Full OpenAPI-style docs written from your actual codebase, not templates." },
  { icon: Globe, title: "Custom or default base URL", desc: "Point your own domain, or use the shared https://awajimaaai.com gateway." },
  { icon: Link2, title: "Shareable docs link", desc: "A permanent URL you can put in your README, social bio, or pitch deck." },
  { icon: RefreshCw, title: "Regenerate on every update", desc: "Push a change? One click regenerates your docs to match your latest code." },
  { icon: Lock, title: "Encrypted token storage", desc: "Your access tokens are AES-256-GCM encrypted at rest. We never log them." },
];

const PRICING_BULLETS = [
  "Everything in the Pro plan",
  "AI-generated API documentation from your codebase",
  "GitHub, GitLab & Bitbucket integration",
  "Custom base URL configuration",
  "Unlimited doc regenerations",
  "Listed in Trusted By section on our homepage",
  "Shareable docs link + embeddable Connect button",
];

export default function BecomeAConnectedBusinessPage() {
  const { isSignedIn } = useUser();
  const [activeStep, setActiveStep] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Nav ── */}
      <nav className="fixed top-0 inset-x-0 z-50 h-14 border-b border-border/40 bg-background/80 backdrop-blur-xl flex items-center px-6 gap-6">
        <Link href={`${BASE}/home`} className="flex items-center gap-2 font-extrabold text-sm">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center text-primary-foreground text-xs font-black">A</div>
          Awa Biz Suite
        </Link>
        <div className="flex-1" />
        <Link href={`${BASE}/home`} className="text-sm text-muted-foreground hover:text-foreground transition-colors">Home</Link>
        {isSignedIn ? (
          <Link href={`${BASE}/connected-business`}>
            <Button size="sm" className="h-8 text-xs font-bold">Go to Dashboard</Button>
          </Link>
        ) : (
          <Link href={`${BASE}/sign-in`}>
            <Button size="sm" variant="outline" className="h-8 text-xs font-bold">Sign in</Button>
          </Link>
        )}
      </nav>

      <div className="pt-14">
        {/* ── Hero ── */}
        <section className="relative min-h-[85vh] flex flex-col items-center justify-center text-center px-6 py-24 overflow-hidden">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[600px] rounded-full"
              style={{ background: "radial-gradient(ellipse, hsl(var(--primary)/0.12) 0%, transparent 65%)" }} />
            <div className="absolute top-0 right-1/4 w-[300px] h-[300px] rounded-full bg-blue-500/5 blur-[80px]" />
            <div className="absolute bottom-0 left-1/4 w-[300px] h-[300px] rounded-full bg-violet-500/5 blur-[80px]" />
          </div>

          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="relative z-10"
          >
            <Badge className="border-primary/30 bg-primary/10 text-primary px-4 py-1.5 text-xs font-bold uppercase tracking-wider mb-8">
              Connected Business Program
            </Badge>

            <h1 className="text-4xl md:text-6xl lg:text-7xl font-black tracking-tight leading-none max-w-4xl mx-auto mb-6">
              Your platform.{" "}
              <span className="text-transparent bg-clip-text"
                style={{ backgroundImage: "linear-gradient(135deg, hsl(var(--primary)), #60a5fa)" }}>
                AI-documented.
              </span>
              <br />Connected to thousands.
            </h1>

            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed mb-10">
              Own a website, app, or SaaS? Sign up as a vendor, connect your GitHub/GitLab/Bitbucket, and
              Awajimaa AI builds your complete API documentation automatically. No developer needed.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              {isSignedIn ? (
                <Link href={`${BASE}/connected-business`}>
                  <Button size="lg" className="h-12 px-8 text-base font-bold gap-2">
                    Set Up Connected Business <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              ) : (
                <>
                  <Link href={`${BASE}/sign-up`}>
                    <Button size="lg" className="h-12 px-8 text-base font-bold gap-2">
                      Get Started Free <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                  <Link href={`${BASE}/sign-in`}>
                    <Button size="lg" variant="outline" className="h-12 px-8 text-base font-bold">
                      Sign In
                    </Button>
                  </Link>
                </>
              )}
            </div>

            {/* VCS badge row */}
            <div className="mt-10 flex items-center justify-center gap-3 flex-wrap">
              {[
                { label: "GitHub", color: "bg-gray-800 border-gray-700" },
                { label: "GitLab", color: "bg-orange-950/60 border-orange-700/40" },
                { label: "Bitbucket", color: "bg-blue-950/60 border-blue-700/40" },
              ].map(({ label, color }) => (
                <span key={label} className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold ${color}`}>
                  <Github className="w-3 h-3" /> {label}
                </span>
              ))}
            </div>
          </motion.div>
        </section>

        {/* ── How it works ── */}
        <section className="py-24 border-t border-border/50 px-6">
          <div className="container mx-auto max-w-5xl">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-16"
            >
              <Badge className="border-border/60 bg-muted/60 text-muted-foreground px-4 py-1.5 text-xs font-bold uppercase tracking-wider mb-4">
                How It Works
              </Badge>
              <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">Four steps to a professional API system</h2>
            </motion.div>

            <div className="grid md:grid-cols-2 gap-6">
              {STEPS.map((step, i) => (
                <motion.div
                  key={step.number}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  onClick={() => setActiveStep(activeStep === i ? null : i)}
                  className={`relative rounded-2xl border p-6 cursor-pointer transition-all duration-200 ${
                    activeStep === i
                      ? `${step.border} bg-card/80 shadow-lg`
                      : "border-border/40 bg-card/40 hover:border-border/70 hover:bg-card/70"
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`shrink-0 w-10 h-10 rounded-xl ${step.bg} border ${step.border} flex items-center justify-center`}>
                      <step.icon className={`w-5 h-5 ${step.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-black ${step.color} opacity-60`}>{step.number}</span>
                        <h3 className="text-base font-bold">{step.title}</h3>
                      </div>
                      <AnimatePresence>
                        {activeStep === i && (
                          <motion.p
                            key="desc"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="text-sm text-muted-foreground leading-relaxed overflow-hidden"
                          >
                            {step.description}
                          </motion.p>
                        )}
                        {activeStep !== i && (
                          <motion.p key="short" className="text-sm text-muted-foreground line-clamp-2">
                            {step.description}
                          </motion.p>
                        )}
                      </AnimatePresence>
                    </div>
                    <ChevronRight className={`shrink-0 w-4 h-4 text-muted-foreground/50 transition-transform ${activeStep === i ? "rotate-90" : ""}`} />
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Features grid ── */}
        <section className="py-24 border-t border-border/50 px-6 bg-card/20">
          <div className="container mx-auto max-w-5xl">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-14"
            >
              <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-3">Everything included</h2>
              <p className="text-muted-foreground text-base max-w-xl mx-auto">
                One plan, no surprises. The Connected Business plan bundles all Pro vendor features with
                the full API documentation suite.
              </p>
            </motion.div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-14">
              {FEATURES.map((f, i) => (
                <motion.div
                  key={f.title}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.07 }}
                  className="rounded-2xl border border-border/40 bg-card/60 p-5 hover:border-primary/30 hover:bg-card/80 transition-all"
                >
                  <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-3">
                    <f.icon className="w-4.5 h-4.5 text-primary" />
                  </div>
                  <h3 className="text-sm font-bold mb-1">{f.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
                </motion.div>
              ))}
            </div>

            {/* Pricing card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              className="max-w-md mx-auto rounded-3xl border border-primary/30 bg-gradient-to-b from-primary/10 to-card/60 p-8 text-center shadow-xl shadow-primary/10"
            >
              <Badge className="border-primary/40 bg-primary/15 text-primary px-3 py-1 text-xs font-bold uppercase tracking-wider mb-4">
                Connected Business Plan
              </Badge>
              <div className="flex items-end justify-center gap-1 mb-1">
                <span className="text-5xl font-black">$49</span>
                <span className="text-muted-foreground text-lg mb-2">/month</span>
              </div>
              <p className="text-xs text-muted-foreground mb-1">or ₦76,000/month via Paystack</p>
              <p className="text-sm text-muted-foreground mb-6">Billed monthly. Cancel any time.</p>
              <ul className="text-left space-y-2.5 mb-8">
                {PRICING_BULLETS.map((b) => (
                  <li key={b} className="flex items-start gap-2.5 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              {isSignedIn ? (
                <Link href={`${BASE}/connected-business`}>
                  <Button className="w-full h-11 font-bold gap-2">
                    Set Up Now <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              ) : (
                <Link href={`${BASE}/sign-up`}>
                  <Button className="w-full h-11 font-bold gap-2">
                    Start Free Trial <Star className="w-4 h-4" />
                  </Button>
                </Link>
              )}
            </motion.div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section className="py-24 border-t border-border/50 px-6">
          <div className="container mx-auto max-w-3xl">
            <motion.h2
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-3xl font-extrabold text-center mb-12"
            >
              Questions
            </motion.h2>
            {[
              {
                q: "Do I need an existing API or OpenAPI spec?",
                a: "No. If you have a spec URL, we use it. If not, our AI reads your source code directly and writes the spec for you — no existing documentation required.",
              },
              {
                q: "What if I update my codebase?",
                a: "Click 'Regenerate Docs' in your Connected Business dashboard and the AI re-reads your latest code. We also generate a changelog showing what changed between versions.",
              },
              {
                q: "Do I need to use the Awajimaa gateway URL?",
                a: "No. Set your own domain as the base URL (e.g. https://api.yoursite.com). The gateway URL (https://awajimaaai.com) is only used if you opt in.",
              },
              {
                q: "Is my access token safe?",
                a: "Yes. We encrypt every token with AES-256-GCM before writing it to the database. We never log or display it after you submit it.",
              },
              {
                q: "Does the Connected Business plan include all vendor features?",
                a: "Yes — it includes everything in the Pro plan: unlimited orders, advanced analytics, social media management, voice campaigns, payment routing, and more.",
              },
            ].map((faq, i) => (
              <motion.details
                key={faq.q}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.07 }}
                className="group border border-border/40 rounded-2xl mb-3 overflow-hidden"
              >
                <summary className="flex items-center justify-between gap-4 cursor-pointer px-5 py-4 text-sm font-semibold select-none list-none">
                  {faq.q}
                  <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                </summary>
                <p className="px-5 pb-5 text-sm text-muted-foreground leading-relaxed">{faq.a}</p>
              </motion.details>
            ))}
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="py-24 border-t border-border/50 px-6 text-center bg-gradient-to-b from-card/10 to-background">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-4">
              Ready to connect your business?
            </h2>
            <p className="text-muted-foreground text-base max-w-md mx-auto mb-8">
              Sign up in under two minutes. No credit card required to explore.
            </p>
            {isSignedIn ? (
              <Link href={`${BASE}/connected-business`}>
                <Button size="lg" className="h-12 px-10 font-bold gap-2">
                  Open Connected Business Dashboard <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            ) : (
              <Link href={`${BASE}/sign-up`}>
                <Button size="lg" className="h-12 px-10 font-bold gap-2">
                  Get Started Free <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            )}
          </motion.div>
        </section>

        {/* Footer */}
        <footer className="border-t border-border/40 py-6 px-6 text-center text-xs text-muted-foreground">
          © 2025 Awa Biz Suite &mdash;{" "}
          <Link href={`${BASE}/home`} className="hover:text-foreground transition-colors">Back to Home</Link>
          {" "}&middot;{" "}
          <Link href={`${BASE}/docs`} className="hover:text-foreground transition-colors">Docs</Link>
        </footer>
      </div>
    </div>
  );
}
