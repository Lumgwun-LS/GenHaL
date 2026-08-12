import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { Layout } from '@/components/layout';
import { ClerkProvider, useAuth } from '@clerk/react';

const base = import.meta.env.BASE_URL.replace(/\/$/, '');

// Pages — lazy loaded so only the current route's bundle downloads on first paint
const Home              = lazy(() => import('@/pages/home'));
const HeritageCollector = lazy(() => import('@/pages/collect/index'));
const GenealogyList     = lazy(() => import('@/pages/genealogy/index'));
const TreeDetail        = lazy(() => import('@/pages/genealogy/tree'));
const HeritageHub       = lazy(() => import('@/pages/heritage/index'));
const CommunityDetail   = lazy(() => import('@/pages/heritage/community'));
const FamiliesList      = lazy(() => import('@/pages/families/index'));
const FamilyDetail      = lazy(() => import('@/pages/families/detail'));
const KingdomsList      = lazy(() => import('@/pages/kingdoms/index'));
const KingdomDetail     = lazy(() => import('@/pages/kingdoms/detail'));
const TownsList         = lazy(() => import('@/pages/towns/index'));
const TownDetail        = lazy(() => import('@/pages/towns/detail'));
const LanguageCenter    = lazy(() => import('@/pages/language/index'));
const Dictionary        = lazy(() => import('@/pages/language/dictionary'));
const LanguageOrgsPage  = lazy(() => import('@/pages/language-orgs/index'));
const RegisterOrgPage   = lazy(() => import('@/pages/language-orgs/register'));
const OrgDetailPage     = lazy(() => import('@/pages/language-orgs/detail'));
const LanguageCorpus    = lazy(() => import('@/pages/corpus/index'));
const AiStudio          = lazy(() => import('@/pages/ai/index'));
const SignInPage        = lazy(() => import('@/pages/sign-in'));
const SignUpPage        = lazy(() => import('@/pages/sign-up'));
const VerifyPage        = lazy(() => import('@/pages/verify'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const Spinner = () => (
  <div className="flex items-center justify-center h-screen bg-background">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" />
  </div>
);

/** Redirect unauthenticated users to /sign-in; show spinner while Clerk loads */
function AuthGuard({ children }: { children: ReactNode }) {
  const { isSignedIn, isLoaded } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      setLocation('/sign-in');
    }
  }, [isLoaded, isSignedIn, setLocation]);

  if (!isLoaded || !isSignedIn) return <Spinner />;
  return <>{children}</>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function Router() {
  return (
    <Suspense fallback={<Spinner />}>
      <Switch>
        {/* Public auth routes — no Layout, no auth guard */}
        <Route path="/sign-in"        component={SignInPage} />
        <Route path="/sign-in/:rest*" component={SignInPage} />
        <Route path="/sign-up"        component={SignUpPage} />
        <Route path="/sign-up/:rest*" component={SignUpPage} />

        {/*
         * /verify is reached from a link in the quarterly proof-of-life email by
         * someone who may not be a signed-in browser of the archive, and it ships
         * its own full-page centred layout — so it sits outside the app shell
         * rather than inside the sidebar chrome.
         */}
        <Route path="/verify" component={VerifyPage} />

        {/* All other routes require a signed-in Clerk session */}
        <Route>
          <AuthGuard>
            <Layout>
              <RoutedErrorBoundary>
                <Suspense fallback={<Spinner />}>
                  <Switch>
                    <Route path="/"                         component={Home} />

                    <Route path="/collect"                  component={HeritageCollector} />

                    <Route path="/genealogy"                component={GenealogyList} />
                    <Route path="/genealogy/:id"            component={TreeDetail} />

                    <Route path="/heritage"                 component={HeritageHub} />
                    <Route path="/heritage/:id"             component={CommunityDetail} />

                    <Route path="/families"                 component={FamiliesList} />
                    <Route path="/families/:id"             component={FamilyDetail} />

                    <Route path="/kingdoms"                 component={KingdomsList} />
                    <Route path="/kingdoms/:id"             component={KingdomDetail} />

                    <Route path="/towns"                    component={TownsList} />
                    <Route path="/towns/:id"                component={TownDetail} />

                    <Route path="/language"                 component={LanguageCenter} />
                    <Route path="/language/:code"           component={Dictionary} />

                    {/* /register must be before /:id or the literal segment would
                        be swallowed as an organisation id. */}
                    <Route path="/language-orgs"            component={LanguageOrgsPage} />
                    <Route path="/language-orgs/register"   component={RegisterOrgPage} />
                    <Route path="/language-orgs/:id"        component={OrgDetailPage} />

                    <Route path="/corpus"                   component={LanguageCorpus} />

                    <Route path="/ai"                       component={AiStudio} />

                    <Route component={NotFound} />
                  </Switch>
                </Suspense>
              </RoutedErrorBoundary>
            </Layout>
          </AuthGuard>
        </Route>
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? ''}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={base}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

export default App;
