import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  BookOpen, Users, ExternalLink, Copy, Check, Clock, Globe,
  Share2, Code2, ArrowRight, Sparkles
} from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

interface PartnerData {
  partner: {
    id: number;
    name: string;
    slug: string;
    logoUrl: string | null;
    websiteUrl: string | null;
    description: string | null;
    applicationStatus: string;
    enabled: boolean;
    docVersion: number;
    docGeneratedAt: string | null;
    contactEmail: string;
  };
  connectedVendors: number;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? "Copied!" : label}
    </button>
  );
}

export default function PartnerToolkitPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data, isLoading, error } = useQuery<PartnerData>({
    queryKey: ["partner-toolkit", slug],
    queryFn: () => fetch(`${BASE_URL}/api/platform-partners/${slug}/toolkit`).then((r) => r.json()),
    enabled: !!slug,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (error || !data?.partner) {
    return (
      <div className="min-h-screen flex items-center justify-center text-center px-6">
        <div>
          <h1 className="text-3xl font-black mb-3">Partner not found</h1>
          <p className="text-muted-foreground mb-6">This partner link is invalid or has been removed.</p>
          <Link href="/become-a-partner"><Button>Become a Partner</Button></Link>
        </div>
      </div>
    );
  }

  const { partner, connectedVendors } = data;
  const docsUrl = `${window.location.origin}${BASE_URL}/docs/${partner.slug}`;
  const partnerUrl = `${window.location.origin}${BASE_URL}/partner/${partner.slug}`;
  const embedCode = `<a href="${docsUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:8px;padding:10px 18px;border-radius:8px;background:#7c3aed;color:#fff;font-family:sans-serif;font-size:14px;font-weight:600;text-decoration:none;"><img src="https://awabiz.app/favicon.ico" width="18" height="18" alt="" style="border-radius:3px">Connect on Awa Biz</a>`;

  const socialCopy = `🚀 ${partner.name} is now on the Awa Biz Suite Marketplace!\n\nVendors can connect to our platform directly — check out our developer docs and API connector:\n${docsUrl}`;

  const isPending = partner.applicationStatus === "pending";
  const isApproved = partner.enabled && partner.applicationStatus === "approved";

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="border-b border-border/40 bg-background/80 backdrop-blur sticky top-0 z-50">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between max-w-5xl">
          <Link href="/home">
            <span className="font-black text-lg tracking-tight">Awa Biz Suite</span>
          </Link>
          <Link href="/sign-in"><Button size="sm" variant="outline">Vendor sign in</Button></Link>
        </div>
      </header>

      <div className="container mx-auto px-6 py-12 max-w-4xl">
        {/* Partner header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-5 mb-8"
        >
          {partner.logoUrl ? (
            <img src={partner.logoUrl} alt={partner.name}
              className="w-16 h-16 rounded-2xl object-contain bg-card border border-border/50 p-1 shrink-0" />
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <span className="text-2xl font-black text-primary">{partner.name.charAt(0)}</span>
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-2xl font-black truncate">{partner.name}</h1>
            {partner.description && (
              <p className="text-muted-foreground text-sm mt-1 leading-relaxed">{partner.description}</p>
            )}
            <div className="flex items-center gap-3 mt-3 flex-wrap">
              {isPending && (
                <Badge variant="outline" className="text-amber-600 border-amber-400/40 bg-amber-50/10">
                  <Clock className="w-3 h-3 mr-1" /> Under review
                </Badge>
              )}
              {isApproved && (
                <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-400/30">
                  <Check className="w-3 h-3 mr-1" /> Approved Partner
                </Badge>
              )}
              {partner.websiteUrl && (
                <a href={partner.websiteUrl} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1">
                  <Globe className="w-3 h-3" /> {partner.websiteUrl.replace(/^https?:\/\//, "")}
                </a>
              )}
            </div>
          </div>
        </motion.div>

        {isPending && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-8 p-5 rounded-2xl bg-amber-500/8 border border-amber-400/20"
          >
            <h3 className="font-bold text-sm mb-1 text-amber-700 dark:text-amber-400">Application under review</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Your application is being reviewed by our team. Once approved, your documentation and marketplace listing
              will go live automatically. You'll receive an email at <strong>{partner.contactEmail}</strong> when it's ready.
              In the meantime, you can save the links below and prepare your website embed.
            </p>
          </motion.div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Stats */}
          <div className="lg:col-span-1 space-y-4">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="rounded-2xl border border-border/60 bg-card p-5"
            >
              <div className="text-3xl font-black mb-1">{connectedVendors}</div>
              <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                <Users className="w-3.5 h-3.5 inline mr-1" />Vendors connected
              </div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="rounded-2xl border border-border/60 bg-card p-5"
            >
              <div className="text-3xl font-black mb-1">{partner.docVersion > 0 ? `v${partner.docVersion}` : "—"}</div>
              <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                <BookOpen className="w-3.5 h-3.5 inline mr-1" />Doc version
              </div>
              {partner.docGeneratedAt && (
                <div className="text-xs text-muted-foreground/60 mt-1">
                  Generated {new Date(partner.docGeneratedAt).toLocaleDateString()}
                </div>
              )}
            </motion.div>

            {isApproved && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <Link href={`/docs/${partner.slug}`}>
                  <Button className="w-full" variant="outline">
                    <BookOpen className="w-4 h-4 mr-2" /> View your docs
                  </Button>
                </Link>
              </motion.div>
            )}
          </div>

          {/* Toolkit */}
          <div className="lg:col-span-2 space-y-5">
            {/* Links */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="rounded-2xl border border-border/60 bg-card p-5 space-y-4"
            >
              <div className="flex items-center gap-2 mb-1">
                <Link2Icon className="w-4 h-4 text-primary" />
                <h2 className="font-bold text-sm">Your links</h2>
              </div>
              <div className="space-y-3">
                <LinkRow label="Docs page" url={docsUrl} badge="Share this" />
                <LinkRow label="Partner toolkit" url={partnerUrl} badge="Bookmark" />
              </div>
            </motion.div>

            {/* Social share */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="rounded-2xl border border-border/60 bg-card p-5 space-y-3"
            >
              <div className="flex items-center gap-2 mb-1">
                <Share2 className="w-4 h-4 text-primary" />
                <h2 className="font-bold text-sm">Social media copy</h2>
              </div>
              <pre className="bg-muted rounded-xl p-4 text-xs whitespace-pre-wrap font-sans text-foreground/80 leading-relaxed select-all">{socialCopy}</pre>
              <CopyButton text={socialCopy} label="Copy text" />
            </motion.div>

            {/* Embed widget */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="rounded-2xl border border-border/60 bg-card p-5 space-y-3"
            >
              <div className="flex items-center gap-2 mb-1">
                <Code2 className="w-4 h-4 text-primary" />
                <h2 className="font-bold text-sm">Website embed button</h2>
              </div>
              <p className="text-xs text-muted-foreground">
                Paste this HTML anywhere on your site — in your nav, footer, or docs page — to let your users connect from Awa Biz:
              </p>

              {/* Preview */}
              <div className="bg-muted/40 rounded-xl p-4 flex items-center justify-center">
                <a
                  href={docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold no-underline hover:opacity-90 transition-opacity"
                >
                  <Sparkles className="w-4 h-4" /> Connect on Awa Biz
                </a>
              </div>

              <pre className="bg-muted rounded-xl p-3 text-xs overflow-x-auto whitespace-pre-wrap break-all font-mono select-all">{embedCode}</pre>
              <CopyButton text={embedCode} label="Copy embed code" />
            </motion.div>

            <Separator />

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="text-xs text-center text-muted-foreground/60"
            >
              Questions? Contact us at{" "}
              <a href="mailto:partners@awajimaa.com" className="underline hover:text-foreground">partners@awajimaa.com</a>
            </motion.p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Link2Icon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>;
}

function LinkRow({ label, url, badge }: { label: string; url: string; badge: string }) {
  return (
    <div className="flex items-center gap-3">
      <Badge variant="secondary" className="text-xs shrink-0">{badge}</Badge>
      <a href={url} className="text-sm text-primary hover:underline truncate font-mono flex-1 min-w-0">{url}</a>
      <div className="flex items-center gap-1 shrink-0">
        <CopyButton text={url} label="Copy" />
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary ml-1">
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
}
