import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Switch, Route, useLocation, Redirect, Router as WouterRouter } from 'wouter';
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";

import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "sonner";
import { Layout } from "@/components/layout";

import LandingPage from "@/pages/landing";
import VendorStorefront from "@/pages/store";
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
import VoiceCampaigns from "@/pages/voice-campaigns/index";
import VoiceCampaignDetail from "@/pages/voice-campaigns/detail";

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
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-white",
    headerSubtitle: "text-gray-400",
    socialButtonsBlockButtonText: "text-white",
    formFieldLabel: "text-gray-300",
    footerActionLink: "text-blue-500",
    footerActionText: "text-gray-400",
    dividerText: "text-gray-500",
    identityPreviewEditButton: "text-blue-500",
    formFieldSuccessText: "text-emerald-500",
    alertText: "text-red-400",
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/10 via-background to-background -z-10"></div>
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/10 via-background to-background -z-10"></div>
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
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

function AuthenticatedRoute({ component: Component }: { component: React.ComponentType<any> }) {
  return (
    <>
      <Show when="signed-in">
        <Layout>
          <Component />
        </Layout>
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
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
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <Switch>
          <Route path="/" component={HomeRedirect} />
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          <Route path="/store/:id" component={VendorStorefront} />

          {/* Authenticated Routes */}
          <Route path="/dashboard" component={() => <AuthenticatedRoute component={Dashboard} />} />
          <Route path="/vendors" component={() => <AuthenticatedRoute component={Vendors} />} />
          <Route path="/vendors/:id" component={() => <AuthenticatedRoute component={VendorDetail} />} />
          <Route path="/social" component={() => <AuthenticatedRoute component={Social} />} />
          <Route path="/social/create" component={() => <AuthenticatedRoute component={CreatePost} />} />
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
          <Route path="/analytics" component={() => <AuthenticatedRoute component={Analytics} />} />
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