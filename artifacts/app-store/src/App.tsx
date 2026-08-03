import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { useEffect, useRef, Component, type ReactNode, type ErrorInfo } from "react";
import { trackPageView } from "./lib/analytics";
import { ClerkProvider, useUser, SignIn, SignUp } from "@clerk/react";
import { dark } from "@clerk/themes";
import { apiFetch } from "./lib/api";
import Nav from "./components/nav";
import Footer from "./components/footer";
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
import DownloadRedirect from "./pages/download-redirect";
import Unsubscribe from "./pages/unsubscribe";

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

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

const clerkAppearance = {
  baseTheme: dark,
  variables: {
    colorPrimary: "#00c853",
    colorBackground: "#0b0f17",
    colorInputBackground: "#0d1420",
    colorText: "#e8eaf0",
    colorTextSecondary: "#8892a4",
    colorNeutral: "#1e2530",
    borderRadius: "12px",
    fontFamily: "Inter, system-ui, sans-serif",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "w-[440px] max-w-full overflow-hidden",
    card: "!bg-[#0b0f17] !border !border-white/10 !shadow-2xl !rounded-2xl",
    footer: "!bg-[#0b0f17] !border-t !border-white/10",
    headerTitle: "!text-white",
    headerSubtitle: "!text-[#8892a4]",
    socialButtonsBlockButtonText: "!text-[#c0c8d8]",
    formFieldLabel: "!text-[#8892a4]",
    formFieldInput: "!bg-[#0d1420] !border-white/10 !text-white",
    formButtonPrimary: "!bg-[#00c853] !text-black hover:!bg-[#00e060]",
    footerActionLink: "!text-[#00c853]",
    footerActionText: "!text-[#8892a4]",
    dividerText: "!text-[#8892a4]",
  },
};

function SignInPage() {
  return (
    <div style={{
      minHeight: "100dvh",
      background: "#060811",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "20px",
    }}>
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
        fallbackRedirectUrl={`${basePath}/my-apps`}
        appearance={clerkAppearance}
      />
    </div>
  );
}

function SignUpPage() {
  return (
    <div style={{
      minHeight: "100dvh",
      background: "#060811",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "20px",
    }}>
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
        fallbackRedirectUrl={`${basePath}/my-apps`}
        appearance={clerkAppearance}
      />
    </div>
  );
}

function AppRoutes() {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey!}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      signInFallbackRedirectUrl={`${basePath}/my-apps`}
      signUpFallbackRedirectUrl={`${basePath}/my-apps`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
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
            <Route path="/dl/:identifier" component={DownloadRedirect} />
            <Route path="/unsubscribe" component={Unsubscribe} />
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            <Route component={NotFound} />
          </Switch>
        </ErrorBoundary>
        <Footer />
      </div>
    </ClerkProvider>
  );
}

export default function App() {
  return (
    <WouterRouter base={basePath}>
      <AppRoutes />
    </WouterRouter>
  );
}
