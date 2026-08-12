import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { Layout } from '@/components/layout';

// Pages
import Home from '@/pages/home';
import HeritageCollector from '@/pages/collect/index';
import GenealogyList from '@/pages/genealogy/index';
import TreeDetail from '@/pages/genealogy/tree';
import HeritageHub from '@/pages/heritage/index';
import CommunityDetail from '@/pages/heritage/community';
import FamiliesList from '@/pages/families/index';
import FamilyDetail from '@/pages/families/detail';
import KingdomsList from '@/pages/kingdoms/index';
import KingdomDetail from '@/pages/kingdoms/detail';
import TownsList from '@/pages/towns/index';
import TownDetail from '@/pages/towns/detail';
import LanguageCenter from '@/pages/language/index';
import Dictionary from '@/pages/language/dictionary';
import LanguageOrgsPage from '@/pages/language-orgs/index';
import RegisterOrgPage from '@/pages/language-orgs/register';
import OrgDetailPage from '@/pages/language-orgs/detail';
import LanguageCorpus from '@/pages/corpus/index';
import AiStudio from '@/pages/ai/index';
import VerifyAlivePage from '@/pages/verify';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <Switch>
      {/*
       * /verify is reached from a link in the quarterly proof-of-life email by
       * someone who may not be a signed-in browser of the archive, and it ships
       * its own full-page centred layout — so it sits outside the app shell
       * rather than inside the sidebar chrome.
       */}
      <Route path="/verify" component={VerifyAlivePage} />

      <Route>
        <Layout>
          <RoutedErrorBoundary>
            <Switch>
              <Route path="/" component={Home} />

              <Route path="/collect" component={HeritageCollector} />

              <Route path="/genealogy" component={GenealogyList} />
              <Route path="/genealogy/:id" component={TreeDetail} />

              <Route path="/heritage" component={HeritageHub} />
              <Route path="/heritage/:id" component={CommunityDetail} />

              <Route path="/families" component={FamiliesList} />
              <Route path="/families/:id" component={FamilyDetail} />

              <Route path="/kingdoms" component={KingdomsList} />
              <Route path="/kingdoms/:id" component={KingdomDetail} />

              <Route path="/towns" component={TownsList} />
              <Route path="/towns/:id" component={TownDetail} />

              <Route path="/language" component={LanguageCenter} />
              <Route path="/language/:code" component={Dictionary} />

              {/* /register must be declared before /:id or the literal segment
                  would be swallowed as an organisation id. */}
              <Route path="/language-orgs" component={LanguageOrgsPage} />
              <Route path="/language-orgs/register" component={RegisterOrgPage} />
              <Route path="/language-orgs/:id" component={OrgDetailPage} />

              <Route path="/corpus" component={LanguageCorpus} />

              <Route path="/ai" component={AiStudio} />

              <Route component={NotFound} />
            </Switch>
          </RoutedErrorBoundary>
        </Layout>
      </Route>
    </Switch>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
