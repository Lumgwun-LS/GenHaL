/**
 * /verify — Proof-of-Life verification page
 *
 * Reached by clicking the link in the quarterly reminder email, or by typing
 * in the 8-character code manually.  Auto-submits on load when a token is in
 * the query string.
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { CheckCircle2, XCircle, Loader2, Clock, KeyRound, FileText, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getApiBaseUrl } from "@/lib/api";

type Status = "idle" | "loading" | "success" | "already_verified" | "expired" | "invalid" | "error";

function useQueryParam(key: string): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(key) ?? "";
}

export default function VerifyAlivePage() {
  const tokenFromUrl = useQueryParam("token").toUpperCase();
  const statusFromUrl = useQueryParam("status"); // "invalid" | "expired" set by server redirect
  const familyIdFromUrl = useQueryParam("verified"); // set after server-side redirect success

  const [token, setToken] = useState(tokenFromUrl);
  const [status, setStatus] = useState<Status>(
    familyIdFromUrl ? "success"
    : statusFromUrl === "invalid" ? "invalid"
    : statusFromUrl === "expired" ? "expired"
    : "idle"
  );
  const [familyId, setFamilyId] = useState<number | null>(
    familyIdFromUrl ? Number(familyIdFromUrl) : null,
  );
  const [, navigate] = useLocation();

  // Auto-submit if token arrived in URL
  useEffect(() => {
    if (tokenFromUrl && status === "idle") {
      void submit(tokenFromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(tok: string) {
    const clean = tok.trim().toUpperCase();
    if (!clean) return;
    setStatus("loading");
    try {
      const res = await fetch(`${getApiBaseUrl()}/genhal/life-check/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: clean }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus(data.alreadyVerified ? "already_verified" : "success");
        if (data.familyId) setFamilyId(data.familyId);
      } else if (res.status === 404 || res.status === 400) {
        setStatus("invalid");
      } else if (res.status === 410) {
        setStatus("expired");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center px-4 py-16">
      {/* Header */}
      <div className="mb-8 text-center">
        <div className="inline-flex items-center gap-2 mb-3">
          <img src="/genhal-logo.webp" alt="GenHaL" className="h-9 w-9 rounded-xl" onError={e => { (e.target as HTMLImageElement).src = '/genhal-logo.png'; }} />
          <span className="text-2xl font-bold text-amber-800 tracking-tight">GenHaL</span>
        </div>
        <p className="text-sm text-stone-500">Genealogy · Heritage · Language</p>
      </div>

      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden">

        {/* ── Verifying (auto-submit in progress) ── */}
        {status === "loading" && (
          <div className="p-10 flex flex-col items-center gap-4 text-center">
            <Loader2 className="h-10 w-10 text-amber-600 animate-spin" />
            <h2 className="text-lg font-semibold text-stone-800">Confirming your check-in…</h2>
            <p className="text-sm text-stone-500">Just a moment.</p>
          </div>
        )}

        {/* ── Success ── */}
        {(status === "success" || status === "already_verified") && (
          <div className="p-8 flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-stone-800 mb-1">
                {status === "already_verified" ? "Already confirmed" : "You're confirmed!"}
              </h2>
              <p className="text-sm text-stone-500 leading-relaxed">
                {status === "already_verified"
                  ? "This check-in was already recorded. Your family records are active."
                  : "Your quarterly check-in has been recorded. Thank you for keeping your family heritage records active."}
              </p>
            </div>

            {/* Action links */}
            <div className="w-full space-y-2 pt-2">
              <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-2">
                While you're here
              </p>
              {familyId && (
                <>
                  <a
                    href={`/families/${familyId}`}
                    className="flex items-center gap-3 p-3 rounded-xl border border-stone-200 hover:bg-stone-50 transition-colors text-left"
                  >
                    <User className="h-4 w-4 text-amber-600 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-stone-700">Update family profile</p>
                      <p className="text-xs text-stone-500">Review and refresh your family details</p>
                    </div>
                  </a>
                  <a
                    href={`/families/${familyId}?tab=wills`}
                    className="flex items-center gap-3 p-3 rounded-xl border border-stone-200 hover:bg-stone-50 transition-colors text-left"
                  >
                    <FileText className="h-4 w-4 text-amber-600 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-stone-700">Review will documents</p>
                      <p className="text-xs text-stone-500">Check your registered wills are up to date</p>
                    </div>
                  </a>
                </>
              )}
              <a
                href="/"
                className="flex items-center gap-3 p-3 rounded-xl border border-stone-200 hover:bg-stone-50 transition-colors text-left"
              >
                <span className="text-sm text-stone-600">Go to dashboard →</span>
              </a>
            </div>
          </div>
        )}

        {/* ── Expired ── */}
        {status === "expired" && (
          <div className="p-8 flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center">
              <Clock className="h-8 w-8 text-orange-500" />
            </div>
            <h2 className="text-xl font-bold text-stone-800">Code has expired</h2>
            <p className="text-sm text-stone-500 leading-relaxed">
              This check-in code is more than 90 days old. A new reminder will be sent to your
              registered email at the next quarterly interval.
            </p>
            <a href="/" className="text-sm text-amber-700 hover:underline">Go to dashboard</a>
          </div>
        )}

        {/* ── Invalid ── */}
        {status === "invalid" && (
          <div className="p-8 flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
              <XCircle className="h-8 w-8 text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-stone-800">Code not recognised</h2>
            <p className="text-sm text-stone-500 leading-relaxed">
              We couldn't find a check-in matching that code. Double-check the email and try again.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl"
              onClick={() => { setToken(""); setStatus("idle"); }}
            >
              Try again
            </Button>
          </div>
        )}

        {/* ── Error ── */}
        {status === "error" && (
          <div className="p-8 flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
              <XCircle className="h-8 w-8 text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-stone-800">Something went wrong</h2>
            <p className="text-sm text-stone-500">Please try again in a moment.</p>
            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setStatus("idle")}>
              Try again
            </Button>
          </div>
        )}

        {/* ── Idle / manual entry ── */}
        {status === "idle" && (
          <div className="p-8 space-y-6">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center">
                <KeyRound className="h-7 w-7 text-amber-700" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-stone-800">Quarterly check-in</h2>
                <p className="text-sm text-stone-500 mt-1 leading-relaxed">
                  Enter the 8-character code from your reminder email to confirm you're reachable and
                  keep your family records active.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="token" className="text-sm font-medium">Verification code</Label>
              <Input
                id="token"
                value={token}
                onChange={e => setToken(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === "Enter" && submit(token)}
                placeholder="A3B7K9X2"
                className="text-center font-mono text-xl tracking-[0.2em] rounded-xl h-12 uppercase"
                maxLength={8}
                autoComplete="off"
                autoFocus
              />
            </div>

            <Button
              className="w-full rounded-xl bg-amber-700 hover:bg-amber-800 text-white h-11"
              disabled={token.trim().length < 8}
              onClick={() => submit(token)}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" /> Confirm I'm Here
            </Button>

            <p className="text-center text-xs text-stone-400">
              Your code was included in the quarterly reminder email from GenHaL.
            </p>
          </div>
        )}
      </div>

      <p className="mt-8 text-xs text-stone-400 text-center max-w-sm">
        This check-in is part of GenHaL's family record integrity programme. Codes expire after 90 days.
        After four unanswered check-ins your designated Next of Kin may be contacted.
      </p>
    </div>
  );
}
