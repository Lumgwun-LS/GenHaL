import { useEffect, useRef } from "react";
import { trackPageView } from "@/lib/analytics";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Switch, Route, useLocation, Redirect, Router as WouterRouter } from 'wouter';
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useIsAdminStatus } from "@/hooks/useIsAdmin";
import { useCurrentVendor } from "@/hooks/useCurrentVendor";

import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "sonner";
import { Layout } from "@/components/layout";

import LandingPage from "@/pages/landing";
import VendorStorefront from "@/pages/store";
import ShopLinkPage from "@/pages/shop";
import Dashboard from "@/pages/dashboard";
import Vendors from "@/pages/vendors";
import VendorDetail from "@/pages/vendors/detail";
import Social from "@/pages/social";
import CreatePost from "@/pages/social/create";
import AiStudio from "@/pages/ai-studio";
import Products from "@/pages/products";
import Inventory from "@/pages/inventory";
import Orders from "@/pages/orders";
import OrderDetail from "@/pages/orders/detail";
import Leads from "@/pages/leads";
import EmailCampaigns from "@/pages/email-campaigns";
import EmailCampaignEditor from "@/pages/email-campaigns/detail";
import SmsCampaigns from "@/pages/sms-campaigns";
import Payments from "@/pages/payments";
import AdminPanel from "@/pages/admin";
import Analytics from "@/pages/analytics";
import Account from "@/pages/account";
import Onboarding from "@/pages/onboarding";
import VoiceCampaigns from "@/pages/voice-campaigns/index";
import VoiceCampaignDetail from "@/pages/voice-campaigns/detail";
import Sales from "@/pages/sales/index";
import Expenses from "@/pages/expenses/index";
import Investments from "@/pages/investments/index";
import FinanceAnalytics from "@/pages/finance-analytics/index";
import Branches from "@/pages/branches/index";
import Workers from "@/pages/workers/index";
import AdsPage from "@/pages/ads/index";
import ContactPage from "@/pages/contact";
import PricingPage from "@/pages/pricing";
import WebsitePage from "@/pages/website/index";
import PublicSitePage from "@/pages/site/index";
import DataAnalysisPage from "@/pages/data-analysis/index";
import InvoicesPage from "@/pages/invoices/index";
import InvoicePublicPage from "@/pages/invoice-public/index";
import RealEstatePage from "@/pages/real-estate/index";
import PublicPropertyListings from "@/pages/real-estate/public";
import ArchitectPage from "@/pages/architect/index";
import DevelopersPage from "@/pages/developers";
import OAuthConsent from "@/pages/oauth-consent";

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.png`,
  },
  variables: {
    colorPrimary: "hsl(217 91% 60%)",
    colorForeground: "hsl(210 40% 98%)",
    colorMutedForeground: "hsl(215 20% 65%)",
    colorDanger: "hsl(0 63% 31%)",
    colorBackground: "hsl(224 71% 7%)",
    colorInput: "hsl(224 71% 15%)",
    colorInputForeground: "hsl(210 40% 98%)",
    colorNeutral: "hsl(224 71% 15%)",
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    borderRadius: "0.5rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-[#0b0e14] rounded-xl w-[440px] max-w-full overflow-hidden border border-[#161d2d]",
    logoBox: "h-10 w-auto flex items-center justify-center shrink-0 overflow-hidden",
    logoImage: "h-10 w-auto object-contain",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none !pt-6",
    headerTitle: "text-white",
    headerSubtitle: "text-gray-400",
    socialButtonsBlockButtonText: "text-white",
    formFieldLabel: "text-gray-300",
    footerAction: "!pt-2",
    footerActionLink: "text-blue-500",
    footerActionText: "text-gray-400",
    dividerText: "text-gray-500",
    identityPreviewEditButton: "text-blue-500",
    formFieldSuccessText: "text-emerald-500",
    alertText: "text-red-400",
  },
};

const PRIVACY_URL =
  "https://docs.google.com/document/d/1GQ7NOKDXFORu1vLKtP7EMpXZlIA1NIR6/edit?usp=drive_link";

function PrivacyLink() {
  return (
    <div className="mt-4 text-center">
      <a
        href={PRIVACY_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        Privacy Policy
      </a>
    </div>
  );
}

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/10 via-background to-background -z-10"></div>
      <div className="w-full flex flex-col items-center">
        <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
        <PrivacyLink />
      </div>
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/10 via-background to-background -z-10"></div>
      <div className="w-full flex flex-col items-center">
        <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} forceRedirectUrl={`${basePath}/onboarding`} />
        <PrivacyLink />
      </div>
    </div>
  );
}

function OnboardingRoute() {
  const { isAdmin, isLoading: isAdminLoading } = useIsAdminStatus();
  const { hasVendor, isLoading: isVendorLoading } = useCurrentVendor();

  // Wait for both checks before deciding — avoids a flash-redirect on slow networks.
  if (isAdminLoading || isVendorLoading) {
    return (
      <Show when="signed-in">
        <div className="flex h-screen items-center justify-center text-muted-foreground">Loading…</div>
      </Show>
    );
  }

  // Admin users never need a vendor row — send them straight to the dashboard.
  if (isAdmin) return <Redirect to="/dashboard" />;

  // Already onboarded — no need to show the form again.
  if (hasVendor) return <Redirect to="/dashboard" />;

  return (
    <>
      <Show when="signed-in">
        <Onboarding />
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/dashboard" />
      </Show>
      <Show when="signed-out">
        <LandingPage />
      </Show>
    </>
  );
}

/**
 * Signed-in but hasn't finished onboarding yet (e.g. closed the tab mid-signup) — send them
 * back. Platform admins are exempt: they're identified by Clerk user id (ADMIN_USER_IDS), not
 * by owning a vendor row, so an admin account may legitimately have no vendor profile at all.
 */
function RequireVendorProfile({ children }: { children: React.ReactNode }) {
  const { isAdmin, isLoading: isAdminLoading } = useIsAdminStatus();
  const { hasVendor, isLoading: isVendorLoading } = useCurrentVendor();

  // Wait for both checks to settle — isAdmin defaults to false while its query is in flight,
  // so redirecting before it resolves would briefly (or, on a slow admin-check response,
  // not-so-briefly) send legitimate admins without a vendor row to /onboarding.
  if (isVendorLoading || isAdminLoading) {
    return <div className="flex h-screen items-center justify-center text-muted-foreground">Loading...</div>;
  }
  if (!hasVendor && !isAdmin) {
    return <Redirect to="/onboarding" />;
  }
  return <>{children}</>;
}

function AuthenticatedRoute({ component: Component }: { component: React.ComponentType<any> }) {
  return (
    <>
      <Show when="signed-in">
        <RequireVendorProfile>
          <Layout>
            <Component />
          </Layout>
        </RequireVendorProfile>
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function PageViewTracker() {
  const [location] = useLocation();
  useEffect(() => { trackPageView(location); }, [location]);
  return null;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
      localization={{
        signIn: {
          start: {
            title: "Sign in to Awajimaa AI Business Suite",
            subtitle: "Welcome back! Please sign in to continue",
          },
        },
        signUp: {
          start: {
            title: "Create your Awajimaa AI Business Suite account",
            subtitle: "Welcome! Please fill in the details to get started",
          },
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <PageViewTracker />
        <Switch>
          <Route path="/" component={HomeRedirect} />
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          <Route path="/onboarding" component={OnboardingRoute} />
          <Route path="/home" component={LandingPage} />
          <Route path="/developers" component={DevelopersPage} />
          <Route path="/oauth/authorize" component={OAuthConsent} />
          <Route path="/contact" component={ContactPage} />
          <Route path="/pricing" component={PricingPage} />
          <Route path="/site/:slug" component={PublicSitePage} />
          <Route path="/awajimaaai/:slug" component={PublicSitePage} />
          <Route path="/store/:id" component={VendorStorefront} />
          <Route path="/p/:token" component={ShopLinkPage} />
          <Route path="/invoice/:token" component={InvoicePublicPage} />
          <Route path="/properties/:vendorId" component={PublicPropertyListings} />

          {/* Authenticated Routes */}
          <Route path="/dashboard" component={() => <AuthenticatedRoute component={Dashboard} />} />
          <Route path="/vendors" component={() => <AuthenticatedRoute component={Vendors} />} />
          <Route path="/vendors/:id" component={() => <AuthenticatedRoute component={VendorDetail} />} />
          <Route path="/social" component={() => <AuthenticatedRoute component={Social} />} />
          <Route path="/social/create" component={() => <AuthenticatedRoute component={CreatePost} />} />
          <Route path="/ads" component={() => <AuthenticatedRoute component={AdsPage} />} />
          <Route path="/ai-studio" component={() => <AuthenticatedRoute component={AiStudio} />} />
          <Route path="/products" component={() => <AuthenticatedRoute component={Products} />} />
          <Route path="/inventory" component={() => <AuthenticatedRoute component={Inventory} />} />
          <Route path="/orders" component={() => <AuthenticatedRoute component={Orders} />} />
          <Route path="/orders/:id" component={() => <AuthenticatedRoute component={OrderDetail} />} />
          <Route path="/leads" component={() => <AuthenticatedRoute component={Leads} />} />
          <Route path="/email-campaigns" component={() => <AuthenticatedRoute component={EmailCampaigns} />} />
          <Route path="/email-campaigns/:id" component={() => <AuthenticatedRoute component={EmailCampaignEditor} />} />
          <Route path="/sms-campaigns" component={() => <AuthenticatedRoute component={SmsCampaigns} />} />
          <Route path="/payments" component={() => <AuthenticatedRoute component={Payments} />} />
          <Route path="/voice-campaigns" component={() => <AuthenticatedRoute component={VoiceCampaigns} />} />
          <Route path="/voice-campaigns/:id" component={() => <AuthenticatedRoute component={VoiceCampaignDetail} />} />
          <Route path="/admin" component={() => <AuthenticatedRoute component={AdminPanel} />} />
          <Route path="/sales" component={() => <AuthenticatedRoute component={Sales} />} />
          <Route path="/expenses" component={() => <AuthenticatedRoute component={Expenses} />} />
          <Route path="/investments" component={() => <AuthenticatedRoute component={Investments} />} />
          <Route path="/finance-analytics" component={() => <AuthenticatedRoute component={FinanceAnalytics} />} />
          <Route path="/branches" component={() => <AuthenticatedRoute component={Branches} />} />
          <Route path="/workers" component={() => <AuthenticatedRoute component={Workers} />} />
          <Route path="/invoices" component={() => <AuthenticatedRoute component={InvoicesPage} />} />
          <Route path="/analytics" component={() => <AuthenticatedRoute component={Analytics} />} />
          <Route path="/data-analysis" component={() => <AuthenticatedRoute component={DataAnalysisPage} />} />
          <Route path="/real-estate" component={() => <AuthenticatedRoute component={RealEstatePage} />} />
          <Route path="/architect" component={() => <AuthenticatedRoute component={ArchitectPage} />} />
          <Route path="/website" component={() => <AuthenticatedRoute component={WebsitePage} />} />
          <Route path="/account" component={() => <AuthenticatedRoute component={Account} />} />
          
          <Route path="/:rest*">
            <div className="flex h-screen items-center justify-center">
              <div className="text-center">
                <h1 className="text-4xl font-bold">404</h1>
                <p className="mt-2 text-muted-foreground">Page not found</p>
              </div>
            </div>
          </Route>
        </Switch>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="dark">
      <WouterRouter base={basePath}>
        <ClerkProviderWithRoutes />
      </WouterRouter>
      <Toaster theme="dark" />
    </ThemeProvider>
  );
}

export default App;