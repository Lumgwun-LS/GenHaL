import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClerkProvider, useAuth } from '@clerk/react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { Layout } from '@/components/layout';

// Pages
import Home from '@/pages/home';
import SignInPage from '@/pages/sign-in';
import SignUpPage from '@/pages/sign-up';
import GenealogyList from '@/pages/genealogy/index';
import TreeDetail from '@/pages/genealogy/tree';
import HeritageHub from '@/pages/heritage/index';
import CommunityDetail from '@/pages/heritage/community';
import LanguageCenter from '@/pages/language/index';
import Dictionary from '@/pages/language/dictionary';
import AiStudio from '@/pages/ai/index';
import HeritageCollector from '@/pages/collect/index';
import LanguageCorpus from '@/pages/corpus/index';
import KingdomsList from '@/pages/kingdoms/index';
import KingdomDetail from '@/pages/kingdoms/detail';
import FamiliesList from '@/pages/families/index';
import FamilyDetail from '@/pages/families/detail';
import VerifyAlive from '@/pages/verify';
import LanguageOrgs from '@/pages/language-orgs/index';
import RegisterOrg from '@/pages/language-orgs/register';
import OrgDetail from '@/pages/language-orgs/detail';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/** Pages that are publicly accessible without signing in */
const PUBLIC_PATHS = ['/sign-in', '/sign-up', '/verify', '/'];

function Router() {
  const [location] = useLocation();
  const isPublic = PUBLIC_PATHS.some(p =>
    p === '/' ? location === '/' : location.startsWith(p)
  );

  return (
    <Layout>
      <RoutedErrorBoundary>
        <Switch>
          {/* Auth pages — no layout chrome wrapping needed, rendered inside layout for nav */}
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />

          {/* Public pages */}
          <Route path="/" component={Home} />
          <Route path="/verify" component={VerifyAlive} />
          <Route path="/kingdoms" component={KingdomsList} />
          <Route path="/kingdoms/:id" component={KingdomDetail} />
          <Route path="/language-orgs/register" component={RegisterOrg} />
          <Route path="/language-orgs/:id" component={OrgDetail} />
          <Route path="/language-orgs" component={LanguageOrgs} />

          {/* Auth-gated pages */}
          <Route path="/genealogy" component={ProtectedPage(GenealogyList)} />
          <Route path="/genealogy/:id" component={ProtectedPage(TreeDetail)} />
          <Route path="/heritage" component={ProtectedPage(HeritageHub)} />
          <Route path="/heritage/:id" component={ProtectedPage(CommunityDetail)} />
          <Route path="/language" component={ProtectedPage(LanguageCenter)} />
          <Route path="/language/:code" component={ProtectedPage(Dictionary)} />
          <Route path="/ai" component={ProtectedPage(AiStudio)} />
          <Route path="/collect" component={ProtectedPage(HeritageCollector)} />
          <Route path="/corpus" component={ProtectedPage(LanguageCorpus)} />
          <Route path="/families" component={ProtectedPage(FamiliesList)} />
          <Route path="/families/:id" component={ProtectedPage(FamilyDetail)} />

          <Route component={NotFound} />
        </Switch>
      </RoutedErrorBoundary>
    </Layout>
  );
}

/** Wraps a page so it redirects to /sign-in when the user is not authenticated */
function ProtectedPage<P extends object>(Component: React.ComponentType<P>): React.ComponentType<P> {
  return function Protected(props: P) {
    const { isSignedIn, isLoaded } = useAuth();
    const [, setLocation] = useLocation();

    if (!isLoaded) return null; // still loading session
    if (!isSignedIn) {
      setLocation('/sign-in');
      return null;
    }
    return <Component {...props} />;
  };
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

// When served at genhal.awajimaa.com the app lives at the domain root,
// so the Wouter base must be "" rather than "/genhal" or every route 404s.
const _onCustomDomain =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'genhal.awajimaa.com' ||
    window.location.hostname === 'www.genhal.awajimaa.com');

const _builtBase = import.meta.env.BASE_URL.replace(/\/$/, ''); // "/genhal"

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL as string | undefined;

function App() {
  const basePath = _onCustomDomain ? '' : _builtBase;

  if (!clerkPubKey) {
    return (
      <div style={{ padding: 32, fontFamily: 'monospace' }}>
        <p>
          <strong>VITE_CLERK_PUBLISHABLE_KEY</strong> is not set. Add it as an
          environment variable to enable authentication.
        </p>
      </div>
    );
  }

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={{
        variables: {
          colorPrimary: '#b45309',
          colorBackground: 'hsl(222 47% 7%)',
          borderRadius: '0.75rem',
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={basePath}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

export default App;
