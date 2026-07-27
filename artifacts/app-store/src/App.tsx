import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { useEffect, useRef, Component, type ReactNode, type ErrorInfo } from "react";
import { trackPageView } from "./lib/analytics";
import { ClerkProvider, useUser } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { apiFetch } from "./lib/api";
import Nav from "./components/nav";
import { CrossAppBanner } from "./components/cross-app-banner";

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("App error:", error, info); }
  render() {
    if (this.state.error) {
      return (
        <div style={{ textAlign: "center", padding: "80px 20px", color: "#8892a4" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
          <div style={{ fontWeight: 700, fontSize: 18, color: "#e8eaf0", marginBottom: 8 }}>Something went wrong</div>
          <div style={{ fontSize: 14, marginBottom: 24 }}>{(this.state.error as Error).message}</div>
          <button onClick={() => window.location.reload()}
            style={{ background: "#00c853", color: "#000", border: "none", borderRadius: 20, padding: "10px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
import Home from "./pages/home";
import Search from "./pages/search";
import AppDetail from "./pages/app-detail";
import DeveloperPortal from "./pages/developer-portal";
import DeveloperSignup from "./pages/developer-signup";
import Admin from "./pages/admin";
import AppPublicLanding from "./pages/app-public-landing";
import MyApps from "./pages/my-apps";
import NotFound from "./pages/not-found";

function PageViewTracker() {
  const [location] = useLocation();
  useEffect(() => { trackPageView(location); }, [location]);
  return null;
}

/** Fires once per authenticated session to register first-time users. */
function UserTracker() {
  const { isSignedIn, user } = useUser();
  const fired = useRef(false);
  useEffect(() => {
    if (!isSignedIn || fired.current) return;
    fired.current = true;
    apiFetch("/users/track", {
      method: "POST",
      body: JSON.stringify({
        email: user?.primaryEmailAddress?.emailAddress,
        displayName: user?.fullName ?? user?.firstName,
        country: Intl.DateTimeFormat().resolvedOptions().timeZone?.startsWith("Africa") ? "NG" : undefined,
      }),
    }).catch(() => {});
  }, [isSignedIn, user]);
  return null;
}

const CLERK_KEY = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL as string | undefined;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function App() {
  return (
    <ClerkProvider
      publishableKey={CLERK_KEY}
      proxyUrl={clerkProxyUrl}
      signInFallbackRedirectUrl={`${basePath}/my-apps`}
      signUpFallbackRedirectUrl={`${basePath}/my-apps`}
    >
      <WouterRouter base={basePath}>
        <div style={{ minHeight: "100vh", background: "#060811", color: "#e8eaf0" }}>
          <CrossAppBanner />
          <PageViewTracker />
          <UserTracker />
          <Nav />
          <ErrorBoundary>
            <Switch>
              <Route path="/" component={Home} />
              <Route path="/search" component={Search} />
              <Route path="/apps/:slug" component={AppDetail} />
              <Route path="/app/:publicId" component={AppPublicLanding} />
              <Route path="/my-apps" component={MyApps} />
              <Route path="/developer/signup" component={DeveloperSignup} />
              <Route path="/developer" component={DeveloperPortal} />
              <Route path="/admin" component={Admin} />
              <Route component={NotFound} />
            </Switch>
          </ErrorBoundary>
        </div>
      </WouterRouter>
    </ClerkProvider>
  );
}
