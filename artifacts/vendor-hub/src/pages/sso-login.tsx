/**
 * SSO Login page — handles the redirect from any Awajimaa platform.
 *
 * Flow:
 *   1. Android / Schools opens this page with ?code=<spring-boot-sso-code>
 *   2. This page calls the Express /api/sso/exchange endpoint
 *   3. Express validates the code with Spring Boot server-to-server
 *   4. Express creates/finds a Clerk user and returns a Clerk sign-in token
 *   5. This page redirects to the Clerk magic-link URL → user is logged in
 *
 * Also handles ?token=<clerk-sign-in-token> which is the final Clerk redirect.
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useClerk } from "@clerk/react";
import { Loader2, ShieldCheck, AlertCircle, Smartphone } from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

type Stage = "verifying" | "signing-in" | "redirecting" | "error";

export default function SsoLoginPage() {
  const [, setLocation] = useLocation();
  const { setActive } = useClerk();
  const [stage, setStage] = useState<Stage>("verifying");
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const token = params.get("token");
    const emailParam = params.get("email");

    if (emailParam) setEmail(emailParam);

    if (code) {
      // Step 1: Exchange the Spring Boot code for a Clerk sign-in token
      exchangeCode(code);
    } else if (token) {
      // Step 2: We already have the Clerk sign-in token — use it
      useClerkToken(token);
    } else {
      setStage("error");
      setError("No authentication code provided. Please try opening Awa Biz Suite from the app again.");
    }
  }, []);

  async function exchangeCode(code: string) {
    try {
      setStage("verifying");
      const resp = await fetch(`${BASE_URL}/api/sso/exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error((err as any).error || "Authentication failed");
      }

      const { signInUrl, email: userEmail } = await resp.json();
      if (userEmail) setEmail(userEmail);

      // signInUrl is a Clerk magic link — navigate to it
      setStage("signing-in");
      window.location.href = signInUrl;
    } catch (e: any) {
      setStage("error");
      setError(e.message || "Failed to verify your identity. Please try again.");
    }
  }

  async function useClerkToken(token: string) {
    try {
      setStage("signing-in");
      // Use the Clerk sign-in token to establish a session
      // This is handled by Clerk's own magic-link mechanism via the URL
      // The token in the URL is consumed by Clerk's JS automatically on load
      // Give Clerk a moment to process it
      await new Promise(r => setTimeout(r, 800));
      setStage("redirecting");
      await new Promise(r => setTimeout(r, 500));
      setLocation("/");
    } catch (e: any) {
      setStage("error");
      setError("Session could not be established. Please sign in manually.");
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 to-orange-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-sm w-full p-8 text-center space-y-6">
        {/* Logo / Brand */}
        <div className="flex items-center justify-center gap-2">
          <Smartphone className="w-7 h-7 text-violet-600" />
          <span className="text-xl font-bold text-slate-800">Awa Biz Suite</span>
        </div>

        {stage !== "error" ? (
          <>
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-violet-100 flex items-center justify-center">
                {stage === "redirecting" ? (
                  <ShieldCheck className="w-8 h-8 text-violet-600" />
                ) : (
                  <Loader2 className="w-8 h-8 text-violet-600 animate-spin" />
                )}
              </div>
              <div>
                <h1 className="text-lg font-semibold text-slate-800">
                  {stage === "verifying" && "Verifying your identity…"}
                  {stage === "signing-in" && "Signing you in…"}
                  {stage === "redirecting" && "Welcome back!"}
                </h1>
                {email && (
                  <p className="text-sm text-slate-500 mt-1">{email}</p>
                )}
                <p className="text-sm text-slate-400 mt-2">
                  {stage === "verifying" && "Checking your Awajimaa account credentials"}
                  {stage === "signing-in" && "Establishing your secure session"}
                  {stage === "redirecting" && "Redirecting to your dashboard…"}
                </p>
              </div>
            </div>

            <div className="text-xs text-slate-400 bg-slate-50 rounded-xl p-3">
              🔒 Your credentials are verified securely by the Awajimaa identity server.
              No password is needed when signing in from the app.
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                <AlertCircle className="w-8 h-8 text-red-500" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-slate-800">Sign-in failed</h1>
                <p className="text-sm text-slate-500 mt-2">{error}</p>
              </div>
            </div>

            <div className="space-y-3">
              <a
                href="/sign-in"
                className="block w-full bg-violet-600 hover:bg-violet-700 text-white font-semibold py-3 px-4 rounded-xl transition-colors text-sm"
              >
                Sign in manually
              </a>
              <a
                href="/sign-up"
                className="block w-full border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium py-3 px-4 rounded-xl transition-colors text-sm"
              >
                Create an account
              </a>
            </div>

            <p className="text-xs text-slate-400">
              SSO codes expire in 90 seconds. If yours expired, go back to the app and tap "Awajimaa Biz Suite" again.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
