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