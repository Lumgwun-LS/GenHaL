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
    <Layout>
      <RoutedErrorBoundary>
        <Switch>
          <Route path="/" component={Home} />
          
          <Route path="/genealogy" component={GenealogyList} />
          <Route path="/genealogy/:id" component={TreeDetail} />
          
          <Route path="/heritage" component={HeritageHub} />
          <Route path="/heritage/:id" component={CommunityDetail} />
          
          <Route path="/language" component={LanguageCenter} />
          <Route path="/language/:code" component={Dictionary} />
          
          <Route path="/ai" component={AiStudio} />
          
          <Route path="/collect" component={HeritageCollector} />
          <Route path="/corpus" component={LanguageCorpus} />
          <Route path="/kingdoms" component={KingdomsList} />
          <Route path="/kingdoms/:id" component={KingdomDetail} />
          <Route path="/families" component={FamiliesList} />
          <Route path="/families/:id" component={FamilyDetail} />
          <Route path="/verify" component={VerifyAlive} />

          <Route component={NotFound} />
        </Switch>
      </RoutedErrorBoundary>
    </Layout>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

// When served at genhal.awajimaa.com the app lives at the domain root,
// so the Wouter base must be "" rather than "/genhal" or every route 404s.
const _onCustomDomain =
  typeof window !== "undefined" &&
  (window.location.hostname === "genhal.awajimaa.com" ||
    window.location.hostname === "www.genhal.awajimaa.com");

const _builtBase = import.meta.env.BASE_URL.replace(/\/$/, ""); // "/genhal"

function App() {
  const basePath = _onCustomDomain ? "" : _builtBase;
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={basePath}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;