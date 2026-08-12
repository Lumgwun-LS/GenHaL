import { lazy, Suspense, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { Layout } from '@/components/layout';

// Pages — lazy loaded so only the current route's bundle downloads on first paint
const Home = lazy(() => import('@/pages/home'));
const GenealogyList = lazy(() => import('@/pages/genealogy/index'));
const TreeDetail = lazy(() => import('@/pages/genealogy/tree'));
const HeritageHub = lazy(() => import('@/pages/heritage/index'));
const CommunityDetail = lazy(() => import('@/pages/heritage/community'));
const LanguageCenter = lazy(() => import('@/pages/language/index'));
const Dictionary = lazy(() => import('@/pages/language/dictionary'));
const AiStudio = lazy(() => import('@/pages/ai/index'));

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
        <Suspense fallback={
          <div className="flex items-center justify-center h-screen">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" />
          </div>
        }>
        <Switch>
          <Route path="/" component={Home} />
          
          <Route path="/genealogy" component={GenealogyList} />
          <Route path="/genealogy/:id" component={TreeDetail} />
          
          <Route path="/heritage" component={HeritageHub} />
          <Route path="/heritage/:id" component={CommunityDetail} />
          
          <Route path="/language" component={LanguageCenter} />
          <Route path="/language/:code" component={Dictionary} />
          
          <Route path="/ai" component={AiStudio} />
          
          <Route component={NotFound} />
        </Switch>
        </Suspense>
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