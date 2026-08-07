/**
 * Unified Platform Notifications Panel
 *
 * Lets admins send the "your account works everywhere" email to all Clerk users,
 * and shows a link to trigger the same blast on the Spring Boot side (AwaHub users).
 */
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Globe, Mail, Send, CheckCircle2, AlertCircle, ExternalLink, Users } from "lucide-react";
import { authFetch } from "@/lib/authFetch";
import { toast } from "sonner";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

type BlastResult = { total: number; sent: number; failed: number };

export default function UnifiedPlatformNotifyPanel() {
  const [bizSuiteRunning, setBizSuiteRunning] = useState(false);
  const [bizSuiteResult, setBizSuiteResult] = useState<BlastResult | null>(null);
  const [bizSuiteError, setBizSuiteError] = useState<string | null>(null);

  async function runBizSuiteBlast() {
    if (!confirm("This will email ALL Awa Biz Suite (Clerk) users about the unified platform. Proceed?")) return;
    setBizSuiteRunning(true);
    setBizSuiteResult(null);
    setBizSuiteError(null);
    try {
      const res = await authFetch(`${BASE_URL}/api/sso/backfill-notify`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Blast failed");
      setBizSuiteResult(data as BlastResult);
      toast.success(`Sent ${data.sent} / ${data.total} emails`);
    } catch (e: any) {
      setBizSuiteError(e.message);
      toast.error("Blast failed: " + e.message);
    } finally {
      setBizSuiteRunning(false);
    }
  }

  return (
    <div className="space-y-6 p-2">
      <div>
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Globe className="w-5 h-5 text-[#7F50FF]" />
          Unified Platform Email Notifications
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Send the "your Awajimaa account now works everywhere" announcement to users across all platforms.
          Run each blast once — there is no deduplication guard, so sending twice will double-email users.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* ── Awa Biz Suite (Clerk) blast ────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="w-4 h-4 text-[#7F50FF]" />
              Awa Biz Suite Users
            </CardTitle>
            <CardDescription>
              Emails every user registered in Clerk (the Biz Suite identity store). Includes vendors,
              store developers, and any user who signed up via SSO from AwaHub.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {bizSuiteResult && (
              <Alert className="border-green-200 bg-green-50">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertTitle className="text-green-700">Blast complete</AlertTitle>
                <AlertDescription className="text-green-700">
                  {bizSuiteResult.sent} sent · {bizSuiteResult.failed} failed · {bizSuiteResult.total} total
                </AlertDescription>
              </Alert>
            )}
            {bizSuiteError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Failed</AlertTitle>
                <AlertDescription>{bizSuiteError}</AlertDescription>
              </Alert>
            )}
            <Button
              onClick={runBizSuiteBlast}
              disabled={bizSuiteRunning || !!bizSuiteResult}
              className="w-full bg-[#7F50FF] hover:bg-[#6b3fe0]"
            >
              <Send className="w-4 h-4 mr-2" />
              {bizSuiteRunning ? "Sending…" : bizSuiteResult ? "Already sent ✓" : "Send to Biz Suite Users"}
            </Button>
          </CardContent>
        </Card>

        {/* ── AwaHub / Spring Boot blast ─────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4 text-[#FF7F50]" />
              AwaHub App Users
            </CardTitle>
            <CardDescription>
              Emails every user registered in the Spring Boot backend (AwaHub Android app users).
              This blast is triggered from the Spring Boot admin panel (requires ROLE_ADMIN JWT).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Alert className="border-amber-200 bg-amber-50">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertTitle className="text-amber-700">Requires Spring Boot admin token</AlertTitle>
              <AlertDescription className="text-amber-700 text-xs">
                Log in as an admin on the AwaHub backend and call:
                <code className="block mt-1 p-2 bg-amber-100 rounded text-[10px] break-all">
                  POST {process.env.SPRING_BOOT_URL ?? "https://api.awajimaaapp.io"}/api/auth/sso/backfill-notify
                </code>
              </AlertDescription>
            </Alert>
            <Button variant="outline" className="w-full" asChild>
              <a
                href="https://api.awajimaaapp.io/swagger-ui/index.html#/SSO/backfillNotify"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Open Spring Boot Swagger UI
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* ── Email preview ────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Email Preview</CardTitle>
          <CardDescription>This is the message sent to every user.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg p-4 bg-white text-sm space-y-3 max-w-lg">
            <h3 style={{ color: "#7F50FF" }} className="font-semibold text-base">
              🎉 Your Awajimaa account now works everywhere!
            </h3>
            <p className="text-gray-700">
              Great news — the entire Awajimaa ecosystem is now unified. Your single account gives you access to:
            </p>
            <ul className="list-none space-y-1 text-gray-700">
              <li>✅ <strong>AwaHub App</strong> — Emergency Response, Marketplace &amp; Community</li>
              <li>✅ <strong>Awa Biz Suite</strong> — Business Management, Payments &amp; Analytics</li>
              <li>✅ <strong>Awajimaa Schools</strong> — Learning Management Platform</li>
            </ul>
            <p className="text-gray-700">Use the same email and password across all platforms — no new account needed.</p>
            <div className="pt-2">
              <span
                style={{ background: "#7F50FF", color: "#fff", padding: "10px 20px", borderRadius: "8px", display: "inline-block" }}
              >
                Open Awa Biz Suite
              </span>
            </div>
            <p className="text-gray-500 text-xs pt-1">
              Or tap <strong>"Awajimaa Biz Suite"</strong> inside the AwaHub App to sign in automatically.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
