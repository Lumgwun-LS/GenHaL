import { useEffect, useRef } from "react";
import { trackPageView } from "@/lib/analytics";
import { useUser } from "@clerk/react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from '@clerk/react';
import { shadcn } from '@clerk/themes';
import { setBaseUrl } from '@workspace/api-client-react';

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
import Tasks from "@/pages/tasks/index";
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
import MarketplacePage from "@/pages/marketplace";
import DocsPage from "@/pages/docs";
import BecomeAConnectedBusinessPage from "@/pages/become-a-connected-business";
import PartnerToolkitPage from "@/pages/partner-toolkit";
import ConnectedBusinessPage from "@/pages/connected-business";
import OAuthConsent from "@/pages/oauth-consent";
import CustomerDashboard from "@/pages/customer/dashboard";
import CustomerOrders from "@/pages/customer/orders";
import CustomerOrderDetail from "@/pages/customer/order-detail";
import CustomerVendors from "@/pages/customer/vendors";
import CustomerInbox from "@/pages/customer/inbox";
import CustomerAIDashboard from "@/pages/customer/ai-dashboard";
import CustomerProfile from "@/pages/customer/profile";
import MessagesPage from "@/pages/messages/index";
import WalletPage from "@/pages/wallet/index";
import InterswitchPage from "@/pages/interswitch/index";
import MobileAppPage from "@/pages/mobile-app";
import BlogManagement from "@/pages/blog/index";
import BlogEditor from "@/pages/blog/editor";
import PublicBlogIndex from "@/pages/public-blog/index";
import PublicBlogPost from "@/pages/public-blog/post";
import VendorBlogPage from "@/pages/vendor-blog/index";
import MyActivityPage from "@/pages/my-activity/index";

declare const __CF_PAGES__: boolean;

// Must run after all imports — sets the base URL for all Orval-generated hooks.
setBaseUrl(__CF_PAGES__ ? 'https://account.awajimaaai.com' : ((import.meta.env as Record<string, string>).VITE_API_BASE_URL ?? null));

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
// On Cloudflare Pages the live key works on any domain — no proxy needed.
// On Replit dev/preview the proxy routes Clerk FAPI through the API server.
const clerkProxyUrl = __CF_PAGES__ ? undefined : import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}

// Render a readable error instead of a blank page when the key is missing.
function MissingKeyScreen() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0b0e14', color: '#e8eaf0', fontFamily: 'sans-serif', gap: 12, padding: 24, textAlign: 'center' }}>
      <div style={{ fontSize: 40 }}>⚙️</div>
      <div style={{ fontSize: 20, fontWeight: 700 }}>Configuration required</div>
      <div style={{ fontSize: 14, color: '#8892a4', maxWidth: 420 }}>
        The <code style={{ background: '#161d2d', padding: '2px 6px', borderRadius: 4 }}>VITE_CLERK_PUBLISHABLE_KEY</code> environment variable is not set.<br />
        Add it in your Cloudflare Pages project settings and redeploy.
      </div>
    </div>
  );
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
  const { user } = useUser();
  const { vendor } = useCurrentVendor();
  useEffect(() => {
    trackPageView(location, {
      isAuthenticated: !!user,
      vendorId: vendor?.id ?? null,
    });
  }, [location, user, vendor]);
  return null;
}

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

/**
 * Fires once per Clerk session to send a "Log In" notification email to the
 * signed-in user. Uses a ref so it fires at most once per page load even if
 * React re-renders the component. Attaches a Clerk Bearer token so the request
 * reaches the API server through the production proxy (same as authFetch.ts).
 */
function LoginTracker() {
  const { isSignedIn, user } = useUser();
  const { session } = useClerk();
  const fired = useRef(false);
  useEffect(() => {
    if (!isSignedIn || !session || fired.current) return;
    fired.current = true;
    session.getToken().then((token) => {
      if (!token) return;
      fetch(`${BASE_URL}/api/vendors/login-ping`, {
        method: "POST",
        credentials: "include",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      }).catch(() => {/* best-effort */});
    }).catch(() => {/* best-effort */});
  }, [isSignedIn, session]);
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
        <LoginTracker />
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
          <Route path="/public-blog/:siteSlug" component={PublicBlogIndex} />
          <Route path="/public-blog/:siteSlug/:postSlug" component={PublicBlogPost} />
          <Route path="/vendor-blog" component={VendorBlogPage} />
          <Route path="/my-activity" component={MyActivityPage} />
          <Route path="/store/:id" component={VendorStorefront} />
          <Route path="/p/:token" component={ShopLinkPage} />
          <Route path="/invoice/:token" component={InvoicePublicPage} />
          <Route path="/properties/:vendorId" component={PublicPropertyListings} />
          <Route path="/docs/:slug" component={DocsPage} />
          <Route path="/become-a-connected-business" component={BecomeAConnectedBusinessPage} />
          <Route path="/partner/:slug" component={PartnerToolkitPage} />

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
          <Route path="/tasks" component={() => <AuthenticatedRoute component={Tasks} />} />
          <Route path="/invoices" component={() => <AuthenticatedRoute component={InvoicesPage} />} />
          <Route path="/analytics" component={() => <AuthenticatedRoute component={Analytics} />} />
          <Route path="/data-analysis" component={() => <AuthenticatedRoute component={DataAnalysisPage} />} />
          <Route path="/real-estate" component={() => <AuthenticatedRoute component={RealEstatePage} />} />
          <Route path="/architect" component={() => <AuthenticatedRoute component={ArchitectPage} />} />
          <Route path="/website" component={() => <AuthenticatedRoute component={WebsitePage} />} />
          <Route path="/mobile-app" component={() => <AuthenticatedRoute component={MobileAppPage} />} />
          <Route path="/blog" component={() => <AuthenticatedRoute component={BlogManagement} />} />
          <Route path="/blog/new" component={() => <AuthenticatedRoute component={BlogEditor} />} />
          <Route path="/blog/:id/edit" component={() => <AuthenticatedRoute component={BlogEditor} />} />
          <Route path="/account" component={() => <AuthenticatedRoute component={Account} />} />
          <Route path="/marketplace" component={() => <AuthenticatedRoute component={MarketplacePage} />} />
          <Route path="/connected-business" component={() => <AuthenticatedRoute component={ConnectedBusinessPage} />} />

          <Route path="/messages" component={() => <AuthenticatedRoute component={MessagesPage} />} />
          <Route path="/wallet"      component={() => <AuthenticatedRoute component={WalletPage} />} />
          <Route path="/interswitch" component={() => <AuthenticatedRoute component={InterswitchPage} />} />

          {/* Customer Portal — uses Clerk auth but has its own layout (no vendor sidebar) */}
          <Route path="/customer/dashboard"   component={CustomerDashboard} />
          <Route path="/customer/orders/:id"  component={CustomerOrderDetail} />
          <Route path="/customer/orders"      component={CustomerOrders} />
          <Route path="/customer/vendors"     component={CustomerVendors} />
          <Route path="/customer/inbox"       component={CustomerInbox} />
          <Route path="/customer/ai"          component={CustomerAIDashboard} />
          <Route path="/customer/profile"     component={CustomerProfile} />
          <Route path="/customer"             component={CustomerDashboard} />

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
  if (!clerkPubKey) return <MissingKeyScreen />;
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