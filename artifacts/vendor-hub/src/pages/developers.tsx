import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Code2, Key, Webhook, Shield, Zap, Globe, BookOpen, ChevronRight,
  Terminal, Copy, CheckCheck, ArrowRight, Layers, Link2, Settings,
  AlertTriangle, Clock, Hash, ChevronDown, ExternalLink, Menu, X,
  FileText, Database, Activity, Send, Users, ShoppingCart, BarChart2,
  Package, MessageSquare, Mail, Mic2,
} from "lucide-react";

const BASE = "https://awajimaaai.com";
const API  = `${BASE}/api/external/features`;

// ── Copy button ───────────────────────────────────────────────────────────────
function CopyButton({ text, className = "" }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }
  return (
    <button onClick={copy} className={`p-1.5 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-white/10 transition-colors ${className}`}>
      {copied ? <CheckCheck className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
    </button>
  );
}

// ── Code block ────────────────────────────────────────────────────────────────
function CodeBlock({ code, lang = "bash", title }: { code: string; lang?: string; title?: string }) {
  return (
    <div className="rounded-xl bg-zinc-950 border border-zinc-800 overflow-hidden text-sm my-4">
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-900 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
          </div>
          {title && <span className="text-xs text-zinc-400 ml-1">{title}</span>}
          {!title && <span className="text-xs text-zinc-500">{lang}</span>}
        </div>
        <CopyButton text={code} />
      </div>
      <pre className="p-4 text-zinc-200 overflow-x-auto leading-relaxed whitespace-pre">{code}</pre>
    </div>
  );
}

// ── Inline code ───────────────────────────────────────────────────────────────
function C({ children }: { children: string }) {
  return <code className="bg-zinc-900 border border-zinc-800 text-violet-300 text-xs px-1.5 py-0.5 rounded font-mono">{children}</code>;
}

// ── Section heading ───────────────────────────────────────────────────────────
function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="text-2xl font-bold tracking-tight mb-4 scroll-mt-24 flex items-center gap-2 group">
      {children}
      <a href={`#${id}`} className="opacity-0 group-hover:opacity-50 hover:!opacity-100 transition-opacity text-violet-400">
        <Hash className="w-4 h-4" />
      </a>
    </h2>
  );
}

function H3({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h3 id={id} className="text-lg font-semibold tracking-tight mb-3 mt-6 scroll-mt-24">
      {children}
    </h3>
  );
}

// ── Method badge ─────────────────────────────────────────────────────────────
function Method({ m }: { m: string }) {
  const colours: Record<string, string> = {
    GET:    "bg-blue-500/15 text-blue-300 border-blue-500/30",
    POST:   "bg-green-500/15 text-green-300 border-green-500/30",
    PATCH:  "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
    DELETE: "bg-red-500/15 text-red-300 border-red-500/30",
    PUT:    "bg-orange-500/15 text-orange-300 border-orange-500/30",
  };
  return (
    <span className={`inline-block text-xs font-bold font-mono px-2 py-0.5 rounded border ${colours[m] ?? "bg-muted text-muted-foreground"}`}>
      {m}
    </span>
  );
}

// ── Endpoint card ─────────────────────────────────────────────────────────────
function EndpointCard({
  method, path, description, params, request, response,
}: {
  method: string; path: string; description: string;
  params?: { name: string; type: string; required: boolean; desc: string }[];
  request?: string; response?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border/50 rounded-xl overflow-hidden mb-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/30 transition-colors"
      >
        <Method m={method} />
        <code className="text-sm font-mono text-foreground/90 flex-1">{path}</code>
        <span className="text-xs text-muted-foreground hidden sm:block flex-[2]">{description}</span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="border-t border-border/50 p-4 space-y-4 bg-muted/10">
          <p className="text-sm text-muted-foreground">{description}</p>
          {params && params.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Parameters</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border/40">
                    <th className="pb-2 pr-4">Name</th><th className="pb-2 pr-4">Type</th>
                    <th className="pb-2 pr-4">Required</th><th className="pb-2">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {params.map((p) => (
                    <tr key={p.name} className="border-b border-border/20 last:border-0">
                      <td className="py-2 pr-4 font-mono text-violet-300">{p.name}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{p.type}</td>
                      <td className="py-2 pr-4">{p.required ? <span className="text-red-400">required</span> : <span className="text-muted-foreground">optional</span>}</td>
                      <td className="py-2 text-muted-foreground">{p.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {request && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Request body</p>
              <CodeBlock code={request} lang="json" />
            </div>
          )}
          {response && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Response</p>
              <CodeBlock code={response} lang="json" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Nav sections ─────────────────────────────────────────────────────────────
const NAV = [
  { id: "overview",       label: "Overview",         icon: BookOpen },
  { id: "authentication", label: "Authentication",    icon: Shield },
  { id: "quickstart",     label: "Quick start",       icon: Zap },
  { id: "posts",          label: "Posts",             icon: MessageSquare },
  { id: "leads",          label: "Leads",             icon: Users },
  { id: "products",       label: "Products",          icon: Package },
  { id: "inventory",      label: "Inventory",         icon: Database },
  { id: "orders",         label: "Orders",            icon: ShoppingCart },
  { id: "campaigns",      label: "Campaigns",         icon: Mail },
  { id: "analytics",      label: "Analytics",         icon: BarChart2 },
  { id: "webhooks",       label: "Webhooks",          icon: Webhook },
  { id: "oauth",          label: "OAuth 2.0",         icon: Link2 },
  { id: "errors",         label: "Errors",            icon: AlertTriangle },
  { id: "rate-limits",    label: "Rate limits",       icon: Clock },
  { id: "marketplaces",   label: "Marketplace guide", icon: Globe },
];

// ── Main ─────────────────────────────────────────────────────────────────────
export default function DevelopersPage() {
  const [activeSection, setActiveSection] = useState("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Scroll-spy
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length) setActiveSection(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -60% 0px" },
    );
    NAV.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    setSidebarOpen(false);
  }

  const Sidebar = () => (
    <nav className="space-y-0.5">
      <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground px-3 py-2">Docs</p>
      {NAV.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => scrollTo(id)}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left transition-all ${
            activeSection === id
              ? "bg-violet-500/15 text-violet-300 font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          }`}
        >
          <Icon className="w-3.5 h-3.5 shrink-0" />
          {label}
        </button>
      ))}
      <Separator className="my-3" />
      <Link href="/sign-up" className="block">
        <Button size="sm" className="w-full bg-violet-600 hover:bg-violet-700 text-xs gap-1.5">
          <Key className="w-3.5 h-3.5" /> Get API key
        </Button>
      </Link>
      <a href="mailto:developers@awajimaaai.com" className="block mt-2">
        <Button size="sm" variant="outline" className="w-full text-xs">Developer support</Button>
      </a>
    </nav>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">

      {/* ── Top nav ──────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button className="lg:hidden p-2 rounded-md hover:bg-muted transition-colors" onClick={() => setSidebarOpen((v) => !v)}>
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <Link href="/" className="flex items-center gap-2 font-bold text-sm shrink-0">
              <img src="/logo.png" alt="Awajimaa AI" className="w-6 h-6 rounded" />
              <span className="hidden sm:block">Awajimaa AI</span>
            </Link>
            <ChevronRight className="w-4 h-4 text-muted-foreground hidden sm:block" />
            <Badge variant="secondary" className="text-xs hidden sm:flex">Developer Docs</Badge>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <a href={`${BASE}/.well-known/oauth-authorization-server`} target="_blank" rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors hidden md:flex items-center gap-1">
              OAuth Discovery <ExternalLink className="w-3 h-3" />
            </a>
            <Link href="/sign-up">
              <Button size="sm" className="bg-violet-600 hover:bg-violet-700">Get API key</Button>
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto flex">

        {/* ── Sidebar desktop ──────────────────────────────────────── */}
        <aside className="hidden lg:block w-56 xl:w-64 shrink-0 sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto border-r border-border/40 py-6 px-3">
          <Sidebar />
        </aside>

        {/* ── Sidebar mobile overlay ───────────────────────────────── */}
        {sidebarOpen && (
          <div className="lg:hidden fixed inset-0 z-40 flex">
            <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
            <div className="relative w-64 bg-background border-r border-border/40 h-full overflow-y-auto py-6 px-3 z-50">
              <Sidebar />
            </div>
          </div>
        )}

        {/* ── Main content ─────────────────────────────────────────── */}
        <main ref={contentRef} className="flex-1 min-w-0 px-6 lg:px-10 xl:px-16 py-10 space-y-16 max-w-4xl">

          {/* ── Hero ───────────────────────────────────────────────── */}
          <div className="pb-6 border-b border-border/40">
            <Badge variant="outline" className="mb-4 border-violet-500/40 text-violet-300 bg-violet-500/10 text-xs">
              <Code2 className="w-3 h-3 mr-1.5" /> Platform API v1 · REST · JSON
            </Badge>
            <h1 className="text-4xl font-black tracking-tight mb-3">
              Awajimaa AI <span className="bg-gradient-to-r from-violet-400 to-pink-400 bg-clip-text text-transparent">Developer Docs</span>
            </h1>
            <p className="text-muted-foreground text-lg leading-relaxed max-w-2xl">
              Connect any CRM, AI platform, automation tool, or marketplace to a vendor's live business data — posts, leads, products, inventory, orders, campaigns, and analytics — through a single REST API.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/30 border border-border/40 rounded-lg px-3 py-1.5">
                <Globe className="w-4 h-4" /> Base URL:
                <code className="text-violet-300 font-mono text-xs">{BASE}</code>
                <CopyButton text={BASE} className="p-0.5" />
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/30 border border-border/40 rounded-lg px-3 py-1.5">
                <Terminal className="w-4 h-4" /> API:
                <code className="text-violet-300 font-mono text-xs">/api/external/features</code>
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════
              OVERVIEW
          ══════════════════════════════════════════════════════════ */}
          <section id="overview">
            <H2 id="overview">Overview</H2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              The Awajimaa AI API is a REST JSON API that lets registered users of any external application — a CRM, an AI agent, an automation workflow, a mobile app — securely read and write their Awa Biz Suite business data without having to log into the dashboard.
            </p>
            <div className="grid sm:grid-cols-3 gap-4 mb-6">
              {[
                { icon: Shield,   title: "Three auth methods",    desc: "API keys for quick integrations, OAuth 2.0 for marketplace apps, JWT sessions for partner backends." },
                { icon: Zap,      title: "Real-time webhooks",    desc: "Subscribe to order, lead, payment, and post events. All payloads are HMAC-SHA256 signed." },
                { icon: Globe,    title: "Marketplace ready",     desc: "Ships with an RFC 8414 OAuth discovery document for Zapier, HubSpot, Make, and Salesforce." },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="p-4 rounded-xl border border-border/50 bg-muted/20 space-y-2">
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-violet-400" />
                    <span className="text-sm font-semibold">{title}</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-border/50 overflow-hidden">
              <div className="px-4 py-2 bg-muted/30 border-b border-border/40 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Base URLs</div>
              <div className="divide-y divide-border/40">
                {[
                  { label: "Web app",                url: BASE },
                  { label: "External features API",  url: `${API}` },
                  { label: "OAuth authorize",         url: `${BASE}/oauth/authorize` },
                  { label: "OAuth token",             url: `${BASE}/api/oauth/token` },
                  { label: "Webhooks",                url: `${BASE}/api/developer/webhooks` },
                  { label: "OAuth discovery",         url: `${BASE}/.well-known/oauth-authorization-server` },
                ].map(({ label, url }) => (
                  <div key={label} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className="text-muted-foreground w-48 shrink-0">{label}</span>
                    <code className="font-mono text-xs text-foreground/80 flex-1 truncate">{url}</code>
                    <CopyButton text={url} />
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ══════════════════════════════════════════════════════════
              AUTHENTICATION
          ══════════════════════════════════════════════════════════ */}
          <section id="authentication">
            <H2 id="authentication"><Shield className="w-5 h-5 text-violet-400" /> Authentication</H2>
            <p className="text-muted-foreground leading-relaxed mb-6">
              All <C>/api/external/features/*</C> requests require an <C>Authorization: Bearer &lt;token&gt;</C> header. Three token types are accepted — the API detects the type automatically from the token prefix.
            </p>

            <Tabs defaultValue="api-key">
              <TabsList className="mb-5">
                <TabsTrigger value="api-key">API Key <Badge variant="secondary" className="ml-1.5 text-xs py-0 px-1">Simplest</Badge></TabsTrigger>
                <TabsTrigger value="oauth">OAuth 2.0 <Badge variant="secondary" className="ml-1.5 text-xs py-0 px-1">Marketplace</Badge></TabsTrigger>
                <TabsTrigger value="jwt">Partner JWT</TabsTrigger>
              </TabsList>

              {/* API Key */}
              <TabsContent value="api-key" className="space-y-4">
                <div className="p-4 rounded-xl border border-violet-500/20 bg-violet-500/5">
                  <p className="text-sm font-semibold text-violet-300 mb-1">Best for: Zapier, Make, n8n, custom apps, scripts</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">Generate a key in Account → Developer, choose scopes, copy it once. Use it forever as a Bearer token.</p>
                </div>
                <div className="space-y-1 text-sm">
                  <p className="font-medium">Token format:</p>
                  <C>{"awa_sk_<48 hex chars>"}</C>
                </div>
                <CodeBlock lang="bash" title="cURL" code={`curl ${API}/leads \\
  -H "Authorization: Bearer awa_sk_YOUR_API_KEY"`} />
                <CodeBlock lang="javascript" title="JavaScript / Node.js" code={`const resp = await fetch("${API}/leads", {
  headers: { Authorization: "Bearer awa_sk_YOUR_API_KEY" },
});
const data = await resp.json();`} />
                <CodeBlock lang="python" title="Python" code={`import requests

resp = requests.get(
    "${API}/leads",
    headers={"Authorization": "Bearer awa_sk_YOUR_API_KEY"},
)
data = resp.json()`} />
                <H3 id="scopes">Available scopes</H3>
                <div className="rounded-xl border border-border/50 overflow-hidden text-sm">
                  <div className="grid grid-cols-3 gap-0 px-4 py-2 bg-muted/30 border-b border-border/40 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    <span>Scope</span><span>Allows</span><span>Endpoints</span>
                  </div>
                  {[
                    { scope: "read",            allows: "Read all resources",            ep: "All GET endpoints" },
                    { scope: "write:posts",     allows: "Create/edit/delete posts",      ep: "POST/PATCH/DELETE /social/posts" },
                    { scope: "write:leads",     allows: "Create/edit/delete leads",      ep: "POST/PATCH/DELETE /leads" },
                    { scope: "write:products",  allows: "Create/edit/delete products",   ep: "POST/PATCH/DELETE /products" },
                    { scope: "write:orders",    allows: "Create/update orders",          ep: "POST/PATCH /orders" },
                    { scope: "write:inventory", allows: "Record stock adjustments",      ep: "POST /inventory" },
                    { scope: "write:campaigns", allows: "Create and send campaigns",     ep: "POST /campaigns/*" },
                    { scope: "analytics",       allows: "Read detailed analytics",       ep: "GET /analytics/summary" },
                  ].map(({ scope, allows, ep }) => (
                    <div key={scope} className="grid grid-cols-3 gap-0 px-4 py-2.5 border-b border-border/30 last:border-0 text-xs">
                      <code className="font-mono text-violet-300">{scope}</code>
                      <span className="text-muted-foreground">{allows}</span>
                      <code className="font-mono text-zinc-400 text-xs">{ep}</code>
                    </div>
                  ))}
                </div>
              </TabsContent>

              {/* OAuth 2.0 */}
              <TabsContent value="oauth" className="space-y-4">
                <div className="p-4 rounded-xl border border-green-500/20 bg-green-500/5">
                  <p className="text-sm font-semibold text-green-300 mb-1">Best for: Zapier, HubSpot, Salesforce, Power Automate, public integrations</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">Vendors authorize your app through a consent screen — your backend exchanges the code for a long-lived access token. No vendor passwords or keys are shared.</p>
                </div>
                <p className="text-sm text-muted-foreground">To register an OAuth client, email <a href="mailto:developers@awajimaaai.com" className="text-violet-400 hover:underline">developers@awajimaaai.com</a> with your app name, redirect URIs, and the scopes you need. You'll receive a <C>client_id</C> and <C>client_secret</C>.</p>
                <CodeBlock lang="bash" title="Step 1 — redirect vendor to consent screen" code={`${BASE}/oauth/authorize
  ?client_id=YOUR_CLIENT_ID
  &redirect_uri=https://yourapp.com/callback
  &scope=read+write:leads
  &response_type=code
  &state=RANDOM_CSRF_TOKEN`} />
                <CodeBlock lang="bash" title="Step 2 — exchange code for access token (server-side only)" code={`curl -X POST ${BASE}/api/oauth/token \\
  -H "Content-Type: application/json" \\
  -d '{
    "grant_type": "authorization_code",
    "code": "oac_AUTHORIZATION_CODE",
    "client_id": "YOUR_CLIENT_ID",
    "client_secret": "YOUR_CLIENT_SECRET",
    "redirect_uri": "https://yourapp.com/callback"
  }'`} />
                <CodeBlock lang="json" title="Token response" code={`{
  "access_token": "oat_7f3c9a2b1d4e...",
  "token_type": "Bearer",
  "expires_in": 2592000,
  "scope": "read write:leads"
}`} />
                <CodeBlock lang="bash" title="Step 3 — call the API with the token" code={`curl ${API}/leads \\
  -H "Authorization: Bearer oat_7f3c9a2b1d4e..."`} />
                <CodeBlock lang="bash" title="Revoke a token" code={`curl -X POST ${BASE}/api/oauth/revoke \\
  -H "Content-Type: application/json" \\
  -d '{ "token": "oat_7f3c9a2b1d4e..." }'`} />
                <div className="p-3 rounded-lg border border-border/40 bg-muted/20 text-xs text-muted-foreground">
                  <strong className="text-foreground">OAuth discovery document:</strong>{" "}
                  <a href={`${BASE}/.well-known/oauth-authorization-server`} target="_blank" rel="noopener noreferrer"
                    className="text-violet-400 hover:underline font-mono break-all">
                    {BASE}/.well-known/oauth-authorization-server
                  </a>{" "}
                  — Zapier, HubSpot, and Salesforce read this automatically to configure the OAuth flow.
                </div>
              </TabsContent>

              {/* Partner JWT */}
              <TabsContent value="jwt" className="space-y-4">
                <div className="p-4 rounded-xl border border-blue-500/20 bg-blue-500/5">
                  <p className="text-sm font-semibold text-blue-300 mb-1">Best for: trusted partner backends (e.g. Awajimaa Spring Boot)</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">The partner backend sends a user identity to the handshake endpoint using an admin-issued API key. A short-lived JWT is returned, which the client uses on all subsequent calls.</p>
                </div>
                <CodeBlock lang="bash" title="Handshake" code={`curl -X POST ${BASE}/api/external/auth/handshake \\
  -H "x-api-key: PARTNER_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "userId": "user_abc123",
    "userType": "business",
    "name": "Ada Okonkwo",
    "email": "ada@example.com"
  }'`} />
                <CodeBlock lang="json" title="Handshake response" code={`{
  "token": "eyJhbGciOiJIUzI1NiJ9...",
  "expiresAt": "2026-08-03T12:00:00Z",
  "vendorId": 42,
  "features": ["products","inventory","orders","leads","social","campaigns","analytics"],
  "vendor": { "id": 42, "name": "Ada Okonkwo", "email": "ada@example.com" }
}`} />
                <p className="text-xs text-muted-foreground">Valid <C>userType</C> values: <C>state</C> · <C>hospital</C> · <C>emergency</C> · <C>business</C> · <C>individual</C></p>
              </TabsContent>
            </Tabs>
          </section>

          {/* ══════════════════════════════════════════════════════════
              QUICK START
          ══════════════════════════════════════════════════════════ */}
          <section id="quickstart">
            <H2 id="quickstart"><Zap className="w-5 h-5 text-yellow-400" /> Quick start</H2>
            <p className="text-muted-foreground leading-relaxed mb-4">Get running in under 2 minutes using an API key.</p>
            <div className="grid gap-2 text-sm mb-4">
              {[
                "Sign in at awajimaaai.com",
                "Go to Account → Developer & Integrations",
                `Click "New API key", select scopes, click Create`,
                "Copy the key immediately — it's shown only once",
              ].map((s, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-violet-500/20 text-violet-300 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                  <span className="text-muted-foreground pt-0.5">{s}</span>
                </div>
              ))}
            </div>
            <CodeBlock lang="bash" title="Verify your key works" code={`# Replace with your real key
API_KEY="awa_sk_YOUR_KEY_HERE"

# Fetch your first 10 leads
curl "${API}/leads?limit=10" \\
  -H "Authorization: Bearer $API_KEY" | jq .`} />
            <CodeBlock lang="javascript" title="Node.js full example" code={`const API_KEY = "awa_sk_YOUR_KEY_HERE";
const BASE    = "${API}";
const headers = { Authorization: \`Bearer \${API_KEY}\` };

// ── List leads ─────────────────────────────────────
const leads = await fetch(\`\${BASE}/leads\`, { headers }).then(r => r.json());
console.log("Leads:", leads);

// ── Create a lead ──────────────────────────────────
const newLead = await fetch(\`\${BASE}/leads\`, {
  method: "POST",
  headers: { ...headers, "Content-Type": "application/json" },
  body: JSON.stringify({ name: "Ada Okonkwo", email: "ada@example.com", phone: "+2347031234567" }),
}).then(r => r.json());
console.log("Created:", newLead);

// ── Get analytics summary ─────────────────────────
const stats = await fetch(\`\${BASE}/analytics/summary\`, { headers }).then(r => r.json());
console.log("Stats:", stats);`} />
          </section>

          <Separator />

          {/* ══════════════════════════════════════════════════════════
              POSTS
          ══════════════════════════════════════════════════════════ */}
          <section id="posts">
            <H2 id="posts"><MessageSquare className="w-5 h-5 text-blue-400" /> Social Posts</H2>
            <p className="text-muted-foreground text-sm leading-relaxed mb-4">
              Manage the vendor's social media post queue — drafts, scheduled posts, and published posts across Facebook, Instagram, LinkedIn, X (Twitter), and TikTok.
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              Required scope: <C>read</C> (GET) · <C>write:posts</C> (POST / PATCH / DELETE)
            </p>
            <EndpointCard
              method="GET" path={`${API}/social/posts`}
              description="Returns the vendor's posts ordered by creation date (newest first), up to 50."
              response={`{
  "posts": [
    {
      "id": 101,
      "caption": "Big sale this Friday! 🎉",
      "status": "scheduled",
      "scheduledAt": "2026-07-30T10:00:00Z",
      "platforms": ["facebook", "instagram"],
      "mediaUrl": null,
      "createdAt": "2026-07-27T08:12:44Z"
    }
  ]
}`}
            />
            <EndpointCard
              method="POST" path={`${API}/social/posts`}
              description="Create a new social media post. Set scheduledAt to queue it; omit it to save as a draft."
              params={[
                { name: "caption",     type: "string",   required: true,  desc: "Post caption / copy" },
                { name: "platforms",   type: "string[]", required: true,  desc: "One or more of: facebook, instagram, linkedin, twitter, tiktok" },
                { name: "scheduledAt", type: "ISO 8601", required: false, desc: "Publish time — omit to save as draft" },
                { name: "mediaUrl",    type: "string",   required: false, desc: "Publicly accessible image or video URL" },
              ]}
              request={`{
  "caption": "New arrivals just landed 🚀",
  "platforms": ["facebook", "instagram"],
  "scheduledAt": "2026-07-30T10:00:00Z",
  "mediaUrl": "https://cdn.example.com/product.jpg"
}`}
              response={`{ "id": 102, "status": "scheduled", "caption": "New arrivals just landed 🚀" }`}
            />
            <EndpointCard method="GET"    path={`${API}/social/posts/:id`}  description="Get a single post by its numeric ID." />
            <EndpointCard method="PATCH"  path={`${API}/social/posts/:id`}  description="Update a post's caption, scheduledAt, platforms, or mediaUrl. Only draft/scheduled posts can be edited." />
            <EndpointCard method="DELETE" path={`${API}/social/posts/:id`}  description="Delete a post. Published posts cannot be deleted." />
          </section>

          {/* ══════════════════════════════════════════════════════════
              LEADS
          ══════════════════════════════════════════════════════════ */}
          <section id="leads">
            <H2 id="leads"><Users className="w-5 h-5 text-green-400" /> Leads</H2>
            <p className="text-muted-foreground text-sm leading-relaxed mb-4">
              Full CRM lead management — create, read, update, and delete leads with contact details, tags, and pipeline status.
            </p>
            <p className="text-xs text-muted-foreground mb-4">Required scope: <C>read</C> · <C>write:leads</C></p>
            <EndpointCard
              method="GET" path={`${API}/leads`}
              description="List all leads. Supports optional query params: ?status=new|contacted|qualified|converted|lost, ?limit=50."
              response={`{
  "leads": [
    {
      "id": 55,
      "name": "Emeka Obi",
      "email": "emeka@example.com",
      "phone": "+2348012345678",
      "status": "new",
      "source": "website",
      "tags": ["premium"],
      "notes": "Interested in bulk order",
      "createdAt": "2026-07-20T09:00:00Z"
    }
  ]
}`}
            />
            <EndpointCard
              method="POST" path={`${API}/leads`}
              description="Create a new lead."
              params={[
                { name: "name",   type: "string", required: true,  desc: "Full name" },
                { name: "email",  type: "string", required: false, desc: "Email address" },
                { name: "phone",  type: "string", required: false, desc: "Phone number with country code" },
                { name: "source", type: "string", required: false, desc: "Lead source label (e.g. 'zapier', 'hubspot', 'website')" },
                { name: "tags",   type: "string[]", required: false, desc: "Array of tag strings" },
                { name: "notes",  type: "string", required: false, desc: "Free-text notes" },
              ]}
              request={`{
  "name": "Ngozi Adeyemi",
  "email": "ngozi@example.com",
  "phone": "+2347091234567",
  "source": "zapier",
  "tags": ["enterprise"],
  "notes": "Referred by Ada"
}`}
              response={`{ "id": 56, "name": "Ngozi Adeyemi", "status": "new" }`}
            />
            <EndpointCard
              method="PATCH" path={`${API}/leads/:id`}
              description="Update lead fields. All fields are optional — only send what you want to change."
              params={[
                { name: "status", type: "string", required: false, desc: "new | contacted | qualified | converted | lost" },
                { name: "notes",  type: "string", required: false, desc: "Append or replace notes" },
                { name: "tags",   type: "string[]", required: false, desc: "Replace tag array" },
              ]}
            />
            <EndpointCard method="DELETE" path={`${API}/leads/:id`} description="Archive (soft-delete) a lead." />
          </section>

          {/* ══════════════════════════════════════════════════════════
              PRODUCTS
          ══════════════════════════════════════════════════════════ */}
          <section id="products">
            <H2 id="products"><Package className="w-5 h-5 text-orange-400" /> Products</H2>
            <p className="text-muted-foreground text-sm leading-relaxed mb-4">Product catalogue management with pricing, SKU, category, and media fields.</p>
            <p className="text-xs text-muted-foreground mb-4">Required scope: <C>read</C> · <C>write:products</C></p>
            <EndpointCard
              method="GET" path={`${API}/products`}
              description="List all products. Optional query: ?category=string, ?inStock=true|false."
              response={`{
  "products": [
    {
      "id": 1,
      "name": "Premium Basmati Rice (5kg)",
      "price": 12500,
      "currency": "NGN",
      "sku": "RICE-5KG-001",
      "category": "Food",
      "stockQuantity": 120,
      "imageUrl": "https://cdn.awajimaaai.com/media/rice.jpg",
      "isActive": true
    }
  ]
}`}
            />
            <EndpointCard
              method="POST" path={`${API}/products`}
              description="Create a new product."
              params={[
                { name: "name",     type: "string",  required: true,  desc: "Product name" },
                { name: "price",    type: "number",  required: true,  desc: "Unit price in the vendor's base currency" },
                { name: "sku",      type: "string",  required: false, desc: "Stock keeping unit" },
                { name: "category", type: "string",  required: false, desc: "Category label" },
                { name: "imageUrl", type: "string",  required: false, desc: "Product image URL" },
              ]}
            />
            <EndpointCard method="PATCH"  path={`${API}/products/:id`} description="Update product fields." />
            <EndpointCard method="DELETE" path={`${API}/products/:id`} description="Deactivate a product (soft delete)." />
          </section>

          {/* ══════════════════════════════════════════════════════════
              INVENTORY
          ══════════════════════════════════════════════════════════ */}
          <section id="inventory">
            <H2 id="inventory"><Database className="w-5 h-5 text-cyan-400" /> Inventory</H2>
            <p className="text-muted-foreground text-sm leading-relaxed mb-4">Record stock-in, stock-out, and adjustment transactions. Current stock levels are derived from the transaction ledger.</p>
            <p className="text-xs text-muted-foreground mb-4">Required scope: <C>read</C> · <C>write:inventory</C></p>
            <EndpointCard
              method="GET" path={`${API}/inventory`}
              description="List inventory transactions in reverse-chronological order."
              response={`{
  "transactions": [
    {
      "id": 301,
      "productId": 1,
      "type": "stock_in",
      "quantity": 50,
      "note": "Supplier delivery",
      "createdAt": "2026-07-25T14:00:00Z"
    }
  ]
}`}
            />
            <EndpointCard
              method="POST" path={`${API}/inventory`}
              description="Record a stock movement."
              params={[
                { name: "productId", type: "number", required: true,  desc: "Product ID" },
                { name: "type",      type: "string", required: true,  desc: "stock_in | stock_out | adjustment" },
                { name: "quantity",  type: "number", required: true,  desc: "Units (always positive)" },
                { name: "note",      type: "string", required: false, desc: "Reason or reference" },
              ]}
              request={`{ "productId": 1, "type": "stock_in", "quantity": 50, "note": "Supplier delivery #INV-2026-07" }`}
            />
          </section>

          {/* ══════════════════════════════════════════════════════════
              ORDERS
          ══════════════════════════════════════════════════════════ */}
          <section id="orders">
            <H2 id="orders"><ShoppingCart className="w-5 h-5 text-pink-400" /> Orders</H2>
            <p className="text-muted-foreground text-sm leading-relaxed mb-4">Create and track customer orders. Orders drive payment and inventory adjustments automatically.</p>
            <p className="text-xs text-muted-foreground mb-4">Required scope: <C>read</C> · <C>write:orders</C></p>
            <EndpointCard
              method="GET" path={`${API}/orders`}
              description="List orders. Optional: ?status=pending|paid|fulfilled|cancelled, ?limit=50."
              response={`{
  "orders": [
    {
      "id": 200,
      "customerName": "Chidi Okeke",
      "customerEmail": "chidi@example.com",
      "status": "paid",
      "total": 25000,
      "currency": "NGN",
      "items": [{ "productId": 1, "name": "Basmati Rice", "quantity": 2, "unitPrice": 12500 }],
      "createdAt": "2026-07-26T11:30:00Z"
    }
  ]
}`}
            />
            <EndpointCard
              method="POST" path={`${API}/orders`}
              description="Create a new order."
              params={[
                { name: "customerName",  type: "string",   required: true,  desc: "Customer's full name" },
                { name: "customerEmail", type: "string",   required: false, desc: "Customer email" },
                { name: "customerPhone", type: "string",   required: false, desc: "Customer phone" },
                { name: "items",         type: "object[]", required: true,  desc: "Array of { productId, quantity }" },
              ]}
              request={`{
  "customerName": "Amara Nwosu",
  "customerEmail": "amara@example.com",
  "items": [
    { "productId": 1, "quantity": 2 }
  ]
}`}
            />
            <EndpointCard method="GET" path={`${API}/orders/:id`} description="Get a single order with full line items." />
          </section>

          {/* ══════════════════════════════════════════════════════════
              CAMPAIGNS
          ══════════════════════════════════════════════════════════ */}
          <section id="campaigns">
            <H2 id="campaigns"><Mail className="w-5 h-5 text-yellow-400" /> Campaigns</H2>
            <p className="text-muted-foreground text-sm leading-relaxed mb-4">Create and list email and SMS campaigns. Sending is managed by the platform once a campaign is launched.</p>
            <p className="text-xs text-muted-foreground mb-4">Required scope: <C>read</C> · <C>write:campaigns</C></p>
            <EndpointCard method="GET"  path={`${API}/campaigns/email`}  description="List all email campaigns." />
            <EndpointCard
              method="POST" path={`${API}/campaigns/email`}
              description="Create a new email campaign."
              params={[
                { name: "name",    type: "string", required: true,  desc: "Internal name" },
                { name: "subject", type: "string", required: true,  desc: "Email subject line" },
                { name: "body",    type: "string", required: true,  desc: "HTML or plain-text body" },
                { name: "sendAt",  type: "ISO 8601", required: false, desc: "Scheduled send time — omit to save as draft" },
              ]}
            />
            <EndpointCard method="GET"  path={`${API}/campaigns/sms`}    description="List all SMS campaigns." />
            <EndpointCard
              method="POST" path={`${API}/campaigns/sms`}
              description="Create a new SMS campaign."
              params={[
                { name: "name",    type: "string", required: true,  desc: "Internal name" },
                { name: "message", type: "string", required: true,  desc: "SMS body (max 160 chars per segment)" },
                { name: "sendAt",  type: "ISO 8601", required: false, desc: "Scheduled send time" },
              ]}
            />
          </section>

          {/* ══════════════════════════════════════════════════════════
              ANALYTICS
          ══════════════════════════════════════════════════════════ */}
          <section id="analytics">
            <H2 id="analytics"><BarChart2 className="w-5 h-5 text-violet-400" /> Analytics</H2>
            <p className="text-muted-foreground text-sm leading-relaxed mb-4">Business performance summary — revenue, order count, lead count, and new customers.</p>
            <p className="text-xs text-muted-foreground mb-4">Required scope: <C>read</C> or <C>analytics</C></p>
            <EndpointCard
              method="GET" path={`${API}/analytics/summary`}
              description="Returns a summary of the vendor's business metrics for the current 30-day rolling window."
              response={`{
  "period": "2026-06-27 → 2026-07-27",
  "revenue": { "total": 1250000, "currency": "NGN", "change": "+12%" },
  "orders":  { "total": 48, "paid": 41, "cancelled": 3, "change": "+8%" },
  "leads":   { "total": 134, "new": 27, "converted": 18 },
  "customers": { "new": 32, "returning": 16 }
}`}
            />
          </section>

          <Separator />

          {/* ══════════════════════════════════════════════════════════
              WEBHOOKS
          ══════════════════════════════════════════════════════════ */}
          <section id="webhooks">
            <H2 id="webhooks"><Webhook className="w-5 h-5 text-orange-400" /> Webhooks</H2>
            <p className="text-muted-foreground text-sm leading-relaxed mb-4">
              Register HTTPS endpoints to receive real-time event notifications. Every payload is signed with HMAC-SHA256 so you can verify it came from Awajimaa AI.
            </p>

            <H3 id="webhook-manage">Managing endpoints</H3>
            <p className="text-xs text-muted-foreground mb-4">Webhook endpoints are managed from <strong>Account → Developer</strong> or via API (Clerk-authenticated):</p>
            <EndpointCard method="GET"    path={`${BASE}/api/developer/webhooks`}        description="List all registered webhook endpoints for the authenticated vendor." />
            <EndpointCard method="POST"   path={`${BASE}/api/developer/webhooks`}        description="Register a new HTTPS endpoint. The raw signing secret is returned once." />
            <EndpointCard method="PATCH"  path={`${BASE}/api/developer/webhooks/:id`}    description="Update events array or isActive flag." />
            <EndpointCard method="DELETE" path={`${BASE}/api/developer/webhooks/:id`}    description="Permanently remove an endpoint." />
            <EndpointCard method="POST"   path={`${BASE}/api/developer/webhooks/:id/test`} description="Fire a test event to confirm the endpoint is reachable." />

            <H3 id="webhook-events">Supported event types</H3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-6">
              {["* (all events)","order.created","order.paid","order.cancelled","lead.created","lead.updated","payment.succeeded","payment.failed","post.published","post.failed","product.created","product.updated","product.deleted"].map((ev) => (
                <code key={ev} className="text-xs font-mono bg-muted/50 border border-border/40 px-2.5 py-1.5 rounded-lg text-foreground/80">{ev}</code>
              ))}
            </div>

            <H3 id="webhook-payload">Payload structure</H3>
            <CodeBlock lang="json" title="Example: order.paid" code={`{
  "event": "order.paid",
  "timestamp": "2026-07-27T12:34:56Z",
  "vendorId": 42,
  "data": {
    "orderId": 200,
    "customerName": "Chidi Okeke",
    "total": 25000,
    "currency": "NGN",
    "status": "paid"
  }
}`} />

            <H3 id="webhook-verify">Verifying signatures</H3>
            <p className="text-sm text-muted-foreground mb-3">
              Every delivery includes an <C>X-Awa-Signature</C> header (<C>{"sha256=<hex>"}</C>). Compute your own HMAC and compare with <C>timingSafeEqual</C> to prevent timing attacks.
            </p>
            <CodeBlock lang="javascript" title="Node.js / Express — signature verification" code={`const crypto = require("crypto");

app.post("/webhooks/awajimaa", express.raw({ type: "application/json" }), (req, res) => {
  const sig    = req.headers["x-awa-signature"]; // "sha256=<hex>"
  const secret = process.env.AWA_WEBHOOK_SECRET; // raw secret shown at creation

  const expected = "sha256=" + crypto
    .createHmac("sha256", secret)
    .update(req.body)           // raw Buffer — NOT parsed JSON
    .digest("hex");

  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return res.status(401).send("Bad signature");
  }

  const event = JSON.parse(req.body);
  switch (event.event) {
    case "order.paid":    handleOrderPaid(event.data);    break;
    case "lead.created":  handleLeadCreated(event.data);  break;
    // ...
  }
  res.sendStatus(200);
});`} />
            <CodeBlock lang="python" title="Python / Flask" code={`import hmac, hashlib, json
from flask import request, abort

@app.route("/webhooks/awajimaa", methods=["POST"])
def webhook():
    secret  = os.environ["AWA_WEBHOOK_SECRET"].encode()
    sig_hdr = request.headers.get("X-Awa-Signature", "")
    body    = request.get_data()  # raw bytes

    expected = "sha256=" + hmac.new(secret, body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig_hdr, expected):
        abort(401)

    event = json.loads(body)
    print("Event:", event["event"], event["data"])
    return "", 200`} />
          </section>

          {/* ══════════════════════════════════════════════════════════
              OAUTH 2.0
          ══════════════════════════════════════════════════════════ */}
          <section id="oauth">
            <H2 id="oauth"><Link2 className="w-5 h-5 text-green-400" /> OAuth 2.0</H2>
            <p className="text-muted-foreground text-sm leading-relaxed mb-6">
              Awajimaa AI implements the OAuth 2.0 authorization code grant (RFC 6749). This is the recommended method for marketplaces, public integrations, and any app where multiple vendors connect their accounts.
            </p>
            <div className="grid sm:grid-cols-2 gap-4 mb-6 text-sm">
              {[
                { label: "Authorization endpoint", value: `${BASE}/oauth/authorize` },
                { label: "Token endpoint",          value: `${BASE}/api/oauth/token` },
                { label: "Revocation endpoint",     value: `${BASE}/api/oauth/revoke` },
                { label: "Discovery document",      value: `${BASE}/.well-known/oauth-authorization-server` },
                { label: "Token lifetime",          value: "30 days (2,592,000 seconds)" },
                { label: "Auth code lifetime",      value: "10 minutes (single use)" },
                { label: "Response type",           value: "code" },
                { label: "Grant type",              value: "authorization_code" },
              ].map(({ label, value }) => (
                <div key={label} className="flex flex-col gap-1 p-3 rounded-lg border border-border/40 bg-muted/20">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <code className="text-xs font-mono text-foreground/90 break-all">{value}</code>
                </div>
              ))}
            </div>
            <H3 id="oauth-register">Registering an OAuth client</H3>
            <p className="text-sm text-muted-foreground mb-3">Email <a href="mailto:developers@awajimaaai.com" className="text-violet-400 hover:underline">developers@awajimaaai.com</a> with:</p>
            <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1 mb-4">
              <li>Your application name and description</li>
              <li>Your website URL and logo URL</li>
              <li>All redirect URIs your app will use</li>
              <li>The scopes you need (<C>read</C>, <C>write:leads</C>, etc.)</li>
            </ul>
            <p className="text-sm text-muted-foreground">You'll receive a <C>client_id</C> and <C>client_secret</C> within 1 business day.</p>
          </section>

          {/* ══════════════════════════════════════════════════════════
              ERRORS
          ══════════════════════════════════════════════════════════ */}
          <section id="errors">
            <H2 id="errors"><AlertTriangle className="w-5 h-5 text-red-400" /> Errors</H2>
            <p className="text-muted-foreground text-sm leading-relaxed mb-4">
              All errors return a JSON body with an <C>error</C> field. HTTP status codes follow standard conventions.
            </p>
            <CodeBlock lang="json" title="Error response shape" code={`{
  "error": "Human-readable message explaining what went wrong"
}`} />
            <div className="rounded-xl border border-border/50 overflow-hidden text-sm mt-4">
              <div className="grid grid-cols-4 gap-0 px-4 py-2 bg-muted/30 border-b border-border/40 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <span>Status</span><span>Meaning</span><span className="col-span-2">Common causes</span>
              </div>
              {[
                { status: "400", meaning: "Bad Request",      causes: "Missing required field, invalid value, malformed JSON" },
                { status: "401", meaning: "Unauthorized",     causes: "Missing or invalid Bearer token, expired OAuth token, revoked API key" },
                { status: "403", meaning: "Forbidden",        causes: "Token lacks the required scope, vendor billing blocked" },
                { status: "404", meaning: "Not Found",        causes: "Resource ID doesn't exist or belongs to another vendor" },
                { status: "409", meaning: "Conflict",         causes: "Duplicate order, post scheduling conflict" },
                { status: "422", meaning: "Validation Error", causes: "Field value out of range or wrong format" },
                { status: "429", meaning: "Too Many Requests",causes: "Rate limit exceeded — see Rate Limits section" },
                { status: "500", meaning: "Server Error",     causes: "Unexpected server error — contact support@awajimaaai.com" },
              ].map(({ status, meaning, causes }) => (
                <div key={status} className="grid grid-cols-4 gap-0 px-4 py-2.5 border-b border-border/30 last:border-0 text-xs">
                  <code className="font-mono font-bold text-red-400">{status}</code>
                  <span className="font-medium text-foreground/90">{meaning}</span>
                  <span className="col-span-2 text-muted-foreground">{causes}</span>
                </div>
              ))}
            </div>
          </section>

          {/* ══════════════════════════════════════════════════════════
              RATE LIMITS
          ══════════════════════════════════════════════════════════ */}
          <section id="rate-limits">
            <H2 id="rate-limits"><Clock className="w-5 h-5 text-yellow-400" /> Rate limits</H2>
            <p className="text-muted-foreground text-sm leading-relaxed mb-4">
              Rate limits are applied per API key / OAuth token. Exceeding the limit returns HTTP <C>429</C> with a <C>Retry-After</C> header.
            </p>
            <div className="rounded-xl border border-border/50 overflow-hidden text-sm">
              <div className="grid grid-cols-3 gap-0 px-4 py-2 bg-muted/30 border-b border-border/40 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <span>Plan</span><span>Requests / min</span><span>Requests / day</span>
              </div>
              {[
                { plan: "Free",         rpm: "30",     rpd: "1,000" },
                { plan: "Starter",      rpm: "60",     rpd: "10,000" },
                { plan: "Professional", rpm: "120",    rpd: "50,000" },
                { plan: "Enterprise",   rpm: "Unlimited", rpd: "Unlimited" },
              ].map(({ plan, rpm, rpd }) => (
                <div key={plan} className="grid grid-cols-3 gap-0 px-4 py-2.5 border-b border-border/30 last:border-0 text-xs">
                  <span className="font-medium">{plan}</span>
                  <span className="font-mono text-muted-foreground">{rpm}</span>
                  <span className="font-mono text-muted-foreground">{rpd}</span>
                </div>
              ))}
            </div>
            <CodeBlock lang="http" title="Rate limit response headers" code={`HTTP/1.1 429 Too Many Requests
Retry-After: 12
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1722081780

{ "error": "Rate limit exceeded. Retry after 12 seconds." }`} />
          </section>

          {/* ══════════════════════════════════════════════════════════
              MARKETPLACE GUIDE
          ══════════════════════════════════════════════════════════ */}
          <section id="marketplaces">
            <H2 id="marketplaces"><Globe className="w-5 h-5 text-pink-400" /> Marketplace listing guide</H2>
            <p className="text-muted-foreground text-sm leading-relaxed mb-6">
              Awajimaa AI is designed to pass the technical requirements of all major automation and CRM marketplaces.
            </p>
            <div className="space-y-4">
              {[
                {
                  platform: "Zapier",
                  method: "OAuth 2.0 (preferred) or API Key",
                  steps: [
                    `Point Zapier to our OAuth discovery document: ${BASE}/.well-known/oauth-authorization-server`,
                    "Zapier auto-reads the authorization and token endpoints.",
                    "Optionally, offer API key auth as an alternative in your Zapier app definition.",
                    "Map triggers to our webhooks (order.paid, lead.created, etc.) and actions to our POST endpoints.",
                  ],
                },
                {
                  platform: "HubSpot App Marketplace",
                  method: "OAuth 2.0",
                  steps: [
                    "Register a Connected App in HubSpot Developer portal.",
                    `Set Authorization URL to: ${BASE}/oauth/authorize`,
                    `Set Token URL to: ${BASE}/api/oauth/token`,
                    "Request scopes: read, write:leads (map to HubSpot contact objects).",
                    "Use webhooks (lead.created, lead.updated) to sync contacts in real time.",
                  ],
                },
                {
                  platform: "Salesforce AppExchange",
                  method: "OAuth 2.0 (Connected App)",
                  steps: [
                    "Create a Connected App in Salesforce Setup.",
                    `Callback URL from Salesforce points to ${BASE}/api/oauth/token`,
                    "Use External Services or Apex callouts to call our REST API.",
                    "Map Leads ↔ /leads, Products ↔ /products, Orders ↔ /orders.",
                  ],
                },
                {
                  platform: "Microsoft Power Automate",
                  method: "Custom Connector (OpenAPI or API Key)",
                  steps: [
                    "Create a Custom Connector in Power Automate.",
                    "Choose API Key authentication with header Authorization: Bearer {key}.",
                    `Base URL: ${API}`,
                    "Import our OpenAPI spec or define operations manually for each endpoint.",
                  ],
                },
                {
                  platform: "Make (Integromat)",
                  method: "API Key (HTTP module)",
                  steps: [
                    "Use the HTTP / Make an API Key Auth Request module.",
                    `Set the URL to ${API}/…`,
                    "Add header Authorization: Bearer {{apiKey}} from a Make Connection.",
                    "Chain modules to map Leads, Orders, and Posts to any other Make app.",
                  ],
                },
                {
                  platform: "n8n / custom apps",
                  method: "API Key (any HTTP client)",
                  steps: [
                    "Generate an awa_sk_ key from Account → Developer.",
                    `Use the HTTP Request node, set URL to ${API}/…`,
                    "Authentication: Header Auth — Name: Authorization, Value: Bearer {{$credentials.apiKey}}",
                    "Works with any language: curl, Axios, requests, Guzzle, etc.",
                  ],
                },
              ].map(({ platform, method, steps }) => (
                <div key={platform} className="rounded-xl border border-border/50 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 bg-muted/20 border-b border-border/40">
                    <span className="text-sm font-semibold">{platform}</span>
                    <Badge variant="secondary" className="text-xs">{method}</Badge>
                  </div>
                  <ol className="px-4 py-3 space-y-1.5">
                    {steps.map((s, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-xs text-muted-foreground">
                        <span className="w-4 h-4 rounded-full bg-muted text-foreground text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                        <span className="leading-relaxed break-all">{s}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>

            {/* App Store CTA */}
            <div className="mt-8 p-5 rounded-xl border border-violet-500/30 bg-violet-500/5 flex items-start gap-3">
              <Settings className="w-5 h-5 text-violet-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-violet-300">List on the Awajimaa App Store</p>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                  Built an integration or app using this API? Submit it to the{" "}
                  <Link href="/store" className="text-violet-400 hover:underline">Awajimaa App Store</Link>{" "}
                  — vendors can install your integration with one click from their dashboard. A $15 listing fee applies.
                </p>
                <div className="mt-3 flex gap-2 flex-wrap">
                  <Link href="/store">
                    <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-xs gap-1.5">
                      <ExternalLink className="w-3.5 h-3.5" /> Visit App Store
                    </Button>
                  </Link>
                  <a href="mailto:developers@awajimaaai.com">
                    <Button size="sm" variant="outline" className="text-xs">Contact us</Button>
                  </a>
                </div>
              </div>
            </div>
          </section>

          {/* Footer */}
          <div className="pt-8 border-t border-border/40 text-xs text-muted-foreground flex flex-wrap gap-4 items-center justify-between">
            <span>© {new Date().getFullYear()} Awajimaa AI · <a href={BASE} className="hover:text-foreground">{BASE}</a></span>
            <div className="flex gap-4">
              <Link href="/" className="hover:text-foreground">Home</Link>
              <Link href="/pricing" className="hover:text-foreground">Pricing</Link>
              <a href="mailto:developers@awajimaaai.com" className="hover:text-foreground">developers@awajimaaai.com</a>
            </div>
          </div>

        </main>
      </div>
    </div>
  );
}
