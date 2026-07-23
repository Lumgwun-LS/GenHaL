import { useState, useRef, useEffect } from "react";
import { motion, useMotionValue, useSpring, AnimatePresence } from "framer-motion";
import {
  Mail, Phone, MapPin, Send, Copy, Check,
  Instagram, Facebook, Linkedin, Globe, MessageCircle,
  ArrowRight, Sparkles, Clock, Shield,
} from "lucide-react";
import { FaXTwitter, FaTiktok, FaTelegram } from "react-icons/fa6";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ── helpers ──────────────────────────────────────────────────────────────── */

function useCopyToClipboard(text: string) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return { copied, copy };
}

/* ── animated orb background ─────────────────────────────────────────────── */

function AuroraBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden -z-10">
      {/* primary orb */}
      <motion.div
        className="absolute -top-32 -left-32 w-[600px] h-[600px] rounded-full
                   bg-primary/15 blur-[120px]"
        animate={{ x: [0, 40, 0], y: [0, 60, 0], scale: [1, 1.1, 1] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* accent orb */}
      <motion.div
        className="absolute top-1/2 -right-40 w-[500px] h-[500px] rounded-full
                   bg-purple-500/10 blur-[100px]"
        animate={{ x: [0, -50, 0], y: [0, -40, 0], scale: [1, 1.15, 1] }}
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut", delay: 3 }}
      />
      {/* bottom orb */}
      <motion.div
        className="absolute -bottom-24 left-1/3 w-[400px] h-[400px] rounded-full
                   bg-cyan-500/8 blur-[90px]"
        animate={{ x: [0, 30, 0], y: [0, -30, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut", delay: 6 }}
      />
      {/* grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: "linear-gradient(rgb(255 255 255/.3) 1px,transparent 1px),linear-gradient(90deg,rgb(255 255 255/.3) 1px,transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />
    </div>
  );
}

/* ── floating particles ───────────────────────────────────────────────────── */

function Particles() {
  const particles = Array.from({ length: 20 }, (_, i) => i);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden -z-10">
      {particles.map((i) => (
        <motion.div
          key={i}
          className="absolute w-1 h-1 rounded-full bg-primary/30"
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
          }}
          animate={{
            y: [0, -30, 0],
            opacity: [0, 0.6, 0],
            scale: [0, 1, 0],
          }}
          transition={{
            duration: 4 + Math.random() * 4,
            repeat: Infinity,
            delay: Math.random() * 6,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

/* ── email card ───────────────────────────────────────────────────────────── */

function EmailCard({
  email, label, description, delay = 0,
}: { email: string; label: string; description: string; delay?: number }) {
  const { copied, copy } = useCopyToClipboard(email);
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4, scale: 1.01 }}
      className="group relative rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-6
                 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10 transition-all duration-300"
    >
      {/* glow */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/5 via-transparent to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      <div className="flex items-start justify-between gap-4 relative">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex-shrink-0 w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center ring-1 ring-primary/20">
            <Mail className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60 mb-1">{label}</p>
            <a
              href={`mailto:${email}`}
              className="text-base font-semibold text-foreground hover:text-primary transition-colors break-all"
            >
              {email}
            </a>
            <p className="text-xs text-muted-foreground mt-1">{description}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="flex-shrink-0 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={copy}
        >
          <AnimatePresence mode="wait">
            {copied ? (
              <motion.div key="check" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                <Check className="w-3.5 h-3.5 text-emerald-500" />
              </motion.div>
            ) : (
              <motion.div key="copy" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                <Copy className="w-3.5 h-3.5 text-muted-foreground" />
              </motion.div>
            )}
          </AnimatePresence>
        </Button>
      </div>
    </motion.div>
  );
}

/* ── tilt card wrapper ────────────────────────────────────────────────────── */

function TiltCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(y, { stiffness: 200, damping: 20 });
  const rotateY = useSpring(x, { stiffness: 200, damping: 20 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    x.set((e.clientX - cx) / 20);
    y.set(-(e.clientY - cy) / 20);
  };
  const handleMouseLeave = () => { x.set(0); y.set(0); };

  return (
    <motion.div
      ref={ref}
      style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ── social link ──────────────────────────────────────────────────────────── */

const SOCIALS = [
  { name: "Instagram", href: "https://www.instagram.com/lumgwunsolutionsgroup", icon: Instagram, color: "hover:text-pink-500 hover:border-pink-500/30 hover:bg-pink-500/5" },
  { name: "Facebook",  href: "https://web.facebook.com/LUMGWUNSOLUTIONS/",       icon: Facebook,  color: "hover:text-blue-500 hover:border-blue-500/30 hover:bg-blue-500/5" },
  { name: "X / Twitter", href: "https://x.com/awajimaaApp",                      icon: FaXTwitter, color: "hover:text-foreground hover:border-border hover:bg-muted" },
  { name: "LinkedIn",  href: "https://www.linkedin.com/company/lumgwun-solutions-group/", icon: Linkedin, color: "hover:text-blue-400 hover:border-blue-400/30 hover:bg-blue-400/5" },
  { name: "TikTok",   href: "https://tiktok.com/@lumgwun.solutions",              icon: FaTiktok,  color: "hover:text-teal-400 hover:border-teal-400/30 hover:bg-teal-400/5" },
  { name: "Telegram", href: "https://t.me/AwaApp",                               icon: FaTelegram, color: "hover:text-sky-400 hover:border-sky-400/30 hover:bg-sky-400/5" },
];

/* ── info pill ────────────────────────────────────────────────────────────── */

function InfoPill({ icon: Icon, text }: { icon: React.ComponentType<{ className?: string }>; text: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-full px-3 py-1.5 border border-border/50">
      <Icon className="w-3 h-3 flex-shrink-0" />
      <span>{text}</span>
    </div>
  );
}

/* ── main page ────────────────────────────────────────────────────────────── */

const EASE = [0.22, 1, 0.36, 1] as const;

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.2 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

export default function ContactPage() {
  return (
    <motion.div
      className="relative min-h-screen bg-background overflow-hidden"
      variants={stagger}
      initial="hidden"
      animate="show"
    >
      <AuroraBackground />
      <Particles />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-24 space-y-16">

        {/* ── hero ──────────────────────────────────────────────────── */}
        <motion.div variants={fadeUp} className="text-center space-y-6">
          {/* badge */}
          <motion.div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-semibold"
            animate={{ boxShadow: ["0 0 0 0 rgba(var(--color-primary),0)", "0 0 0 8px rgba(var(--color-primary),0)"] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <Sparkles className="w-3 h-3" />
            We're here to help
          </motion.div>

          <h1 className="text-5xl sm:text-7xl font-black tracking-tight">
            <span className="bg-gradient-to-br from-foreground via-foreground/90 to-primary bg-clip-text text-transparent">
              Get in touch
            </span>
          </h1>
          <p className="max-w-xl mx-auto text-lg text-muted-foreground leading-relaxed">
            Reach us anytime through any of the channels below. Our team responds within 24 hours, typically much sooner.
          </p>

          {/* info pills */}
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <InfoPill icon={Clock}  text="Usually reply within 4 hours" />
            <InfoPill icon={Shield} text="Your data stays private" />
            <InfoPill icon={Globe}  text="Serving businesses across Africa & beyond" />
          </div>
        </motion.div>

        {/* ── email contacts ────────────────────────────────────────── */}
        <motion.div variants={fadeUp}>
          <div className="flex items-center gap-3 mb-6">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent to-border/50" />
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">Email us</p>
            <div className="h-px flex-1 bg-gradient-to-l from-transparent to-border/50" />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <EmailCard
              email="support@awajimaaapp.io"
              label="General Support"
              description="Platform questions, billing, and technical issues"
              delay={0.0}
            />
            <EmailCard
              email="awajimaaapps@gmail.com"
              label="App Support"
              description="Mobile app, App Store listings, and onboarding"
              delay={0.1}
            />
            <EmailCard
              email="admin@Lumgwunsolutions.com"
              label="Business Enquiries"
              description="Partnerships, enterprise, and corporate accounts"
              delay={0.2}
            />
          </div>
        </motion.div>

        {/* ── social + platforms grid ───────────────────────────────── */}
        <motion.div variants={fadeUp} className="grid gap-8 md:grid-cols-2">

          {/* Social channels */}
          <TiltCard className="rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-8 space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <MessageCircle className="w-4 h-4 text-primary" />
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">Follow us</p>
              </div>
              <h2 className="text-xl font-bold">Social channels</h2>
              <p className="text-sm text-muted-foreground mt-1">DMs open on Instagram, X, and Telegram.</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {SOCIALS.map((s, i) => (
                <motion.a
                  key={s.name}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.name}
                  className={cn(
                    "flex flex-col items-center justify-center gap-2 p-3 rounded-xl border border-border/50",
                    "text-muted-foreground text-xs font-medium transition-all duration-200",
                    s.color,
                  )}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.4 + i * 0.06, duration: 0.3 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <s.icon className="w-5 h-5" />
                  <span className="truncate w-full text-center">{s.name}</span>
                </motion.a>
              ))}
            </div>
          </TiltCard>

          {/* Platform links */}
          <TiltCard className="rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-8 space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Globe className="w-4 h-4 text-primary" />
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">Our platforms</p>
              </div>
              <h2 className="text-xl font-bold">Lumgwun Solutions Group</h2>
              <p className="text-sm text-muted-foreground mt-1">A suite of tools built to power African businesses.</p>
            </div>

            <div className="space-y-3">
              {[
                { name: "Awa Biz Suite", desc: "All-in-one business management platform", href: "#", current: true },
                { name: "Awajimaa App Store", desc: "Curated mobile apps for African merchants", href: "https://awajimaaappstore.com" },
                { name: "Awajimaa Schools", desc: "Digital learning for African students", href: "https://www.awajimaaschools.com" },
                { name: "Awajimaa Hosting", desc: "Reliable hosting for African businesses", href: "https://www.awajimaahosting.com" },
              ].map((p, i) => (
                <motion.a
                  key={p.name}
                  href={p.href}
                  target={p.current ? undefined : "_blank"}
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-3 rounded-xl border border-border/40 bg-muted/20 hover:bg-muted/50 hover:border-primary/30 transition-all group"
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + i * 0.08 }}
                  whileHover={{ x: 4 }}
                >
                  <div>
                    <p className="text-sm font-semibold flex items-center gap-2">
                      {p.name}
                      {p.current && (
                        <span className="text-[9px] bg-primary/15 text-primary rounded px-1.5 py-0.5 font-bold">YOU'RE HERE</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">{p.desc}</p>
                  </div>
                  {!p.current && (
                    <ArrowRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                  )}
                </motion.a>
              ))}
            </div>
          </TiltCard>
        </motion.div>

        {/* ── CTA strip ─────────────────────────────────────────────── */}
        <motion.div
          variants={fadeUp}
          className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card/50 to-purple-500/10 backdrop-blur-sm p-10 text-center space-y-5"
        >
          <motion.div
            className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-primary/10 blur-3xl"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 6, repeat: Infinity }}
          />
          <Send className="mx-auto w-8 h-8 text-primary" />
          <h2 className="text-2xl font-black">Ready to grow your business?</h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            Join thousands of vendors already using Awa Biz Suite to manage their entire operation from one place.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <a href="/sign-up">
              <Button size="lg" className="gap-2 font-semibold">
                Start free trial
                <ArrowRight className="w-4 h-4" />
              </Button>
            </a>
            <a href="mailto:support@awajimaaapp.io">
              <Button size="lg" variant="outline" className="gap-2">
                <Mail className="w-4 h-4" />
                Email us directly
              </Button>
            </a>
          </div>
        </motion.div>

        {/* ── footer note ───────────────────────────────────────────── */}
        <motion.p
          variants={fadeUp}
          className="text-center text-xs text-muted-foreground/50 pb-4"
        >
          © {new Date().getFullYear()} Lumgwun Solutions Group · Registered in Nigeria
        </motion.p>
      </div>
    </motion.div>
  );
}
