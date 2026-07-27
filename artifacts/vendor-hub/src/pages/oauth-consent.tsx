import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useUser, SignIn } from "@clerk/react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2, Shield, CheckCircle2, XCircle, ExternalLink, Lock } from "lucide-react";
import { toast } from "sonner";

interface ClientInfo {
  clientId: string;
  name: string;
  description: string | null;
  websiteUrl: string | null;
  logoUrl: string | null;
  requestedScopes: string[];
  redirectUri: string;
  state: string;
}

const SCOPE_LABELS: Record<string, { label: string; description: string }> = {
  read:               { label: "Read access",        description: "View your posts, leads, products, orders, and analytics" },
  "write:posts":      { label: "Manage posts",        description: "Create, edit, and delete your social media posts" },
  "write:leads":      { label: "Manage leads",        description: "Create, update, and delete your leads" },
  "write:products":   { label: "Manage products",     description: "Create, edit, and delete your products" },
  "write:orders":     { label: "Manage orders",       description: "Create and update orders on your behalf" },
  "write:inventory":  { label: "Manage inventory",    description: "Update inventory levels and transactions" },
  "write:campaigns":  { label: "Run campaigns",       description: "Create and send email and SMS campaigns" },
  analytics:          { label: "Analytics",           description: "Access your detailed analytics and reports" },
};

export default function OAuthConsent() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const clientId   = params.get("client_id") ?? "";
  const redirectUri = params.get("redirect_uri") ?? "";
  const scope       = params.get("scope") ?? "";
  const state       = params.get("state") ?? "";

  const { isSignedIn, isLoaded } = useUser();
  const [, setLocation] = useLocation();
  const [client, setClient] = useState<ClientInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);

  useEffect(() => {
    if (!clientId) { setError("Missing client_id parameter"); setLoading(false); return; }

    const q = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, scope, state });
    fetch(`/api/oauth/client-info?${q}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setError(data.error); return; }
        setClient(data as ClientInfo);
        setSelectedScopes(data.requestedScopes ?? []);
      })
      .catch(() => setError("Could not load application details. Please try again."))
      .finally(() => setLoading(false));
  }, [clientId, redirectUri, scope, state]);

  function toggleScope(s: string) {
    setSelectedScopes((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  }

  async function handleDecision(approved: boolean) {
    if (!client) return;
    setApproving(true);
    try {
      const res = await fetch("/api/oauth/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: client.clientId,
          approved,
          scopes: approved ? selectedScopes : [],
          redirectUri: client.redirectUri,
          state: client.state,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Authorization failed");
      // Navigate to the redirect URL (keeps the user in the same tab)
      window.location.href = data.redirectUrl;
    } catch (err: any) {
      toast.error(err?.message ?? "Authorization failed. Please try again.");
      setApproving(false);
    }
  }

  // ── Not signed in ───────────────────────────────────────────────────────────
  if (isLoaded && !isSignedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-violet-950/20 p-4">
        <div className="w-full max-w-sm space-y-4">
          <div className="text-center space-y-1">
            <Lock className="w-8 h-8 mx-auto text-violet-400" />
            <h2 className="text-lg font-semibold">Sign in to continue</h2>
            <p className="text-sm text-muted-foreground">
              You need to be signed in to authorise <strong>{clientId}</strong>.
            </p>
          </div>
          <SignIn routing="hash" forceRedirectUrl={window.location.href} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-violet-950/20 p-4">
      <div className="w-full max-w-md space-y-4">

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center gap-2 text-muted-foreground py-16">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading application details…</span>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <XCircle className="w-5 h-5" /> Invalid request
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            </CardContent>
            <CardFooter>
              <Button variant="outline" onClick={() => setLocation("/")}>Go home</Button>
            </CardFooter>
          </Card>
        )}

        {/* Consent card */}
        {client && !loading && (
          <Card className="border-border/60 shadow-2xl">
            <CardHeader className="pb-4">
              {/* App identity */}
              <div className="flex items-center gap-3 mb-3">
                {client.logoUrl ? (
                  <img src={client.logoUrl} alt={client.name} className="w-12 h-12 rounded-xl object-contain border border-border/40 bg-background p-1" />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 font-bold text-lg">
                    {client.name.charAt(0)}
                  </div>
                )}
                <div>
                  <CardTitle className="text-base leading-tight">{client.name}</CardTitle>
                  {client.websiteUrl && (
                    <a href={client.websiteUrl} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                      {new URL(client.websiteUrl).hostname}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>

              <CardDescription className="text-sm text-foreground/80 leading-relaxed">
                <strong>{client.name}</strong> is requesting access to your Awa Biz Suite account.
                {client.description && ` ${client.description}`}
              </CardDescription>
            </CardHeader>

            <Separator />

            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                <Shield className="w-3.5 h-3.5 text-green-400" />
                <span>You control exactly which permissions to grant</span>
              </div>

              {client.requestedScopes.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No specific permissions requested.</p>
              ) : (
                <div className="space-y-2">
                  {client.requestedScopes.map((s) => {
                    const meta = SCOPE_LABELS[s] ?? { label: s, description: `Access to ${s}` };
                    const checked = selectedScopes.includes(s);
                    return (
                      <label key={s} className="flex items-start gap-3 p-2.5 rounded-lg border border-border/40 hover:border-border cursor-pointer transition-colors group" htmlFor={`scope-${s}`}>
                        <Checkbox
                          id={`scope-${s}`}
                          checked={checked}
                          onCheckedChange={() => toggleScope(s)}
                          className="mt-0.5 flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{meta.label}</span>
                            {s !== "read" && !s.startsWith("write") ? (
                              <Badge variant="secondary" className="text-xs py-0 px-1.5">{s}</Badge>
                            ) : null}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{meta.description}</p>
                        </div>
                        {checked && <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />}
                      </label>
                    );
                  })}
                </div>
              )}

              <p className="text-xs text-muted-foreground pt-1">
                You can revoke this access at any time from <strong>Account → Developer</strong>.
              </p>
            </CardContent>

            <Separator />

            <CardFooter className="pt-4 flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => handleDecision(false)}
                disabled={approving}
              >
                {approving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <XCircle className="w-4 h-4 mr-2" />}
                Deny
              </Button>
              <Button
                className="flex-1 bg-violet-600 hover:bg-violet-700"
                onClick={() => handleDecision(true)}
                disabled={approving || selectedScopes.length === 0}
              >
                {approving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                Allow access
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* Branding */}
        <p className="text-center text-xs text-muted-foreground">
          Powered by <span className="font-semibold text-violet-400">Awa Biz Suite</span> — your data is never shared without your permission.
        </p>
      </div>
    </div>
  );
}
