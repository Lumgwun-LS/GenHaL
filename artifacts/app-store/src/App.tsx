import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { Nav } from '@/components/nav';
import HomePage from '@/pages/home';
import SearchPage from '@/pages/search';
import AppDetailPage from '@/pages/app-detail';
import DeveloperPortalPage from '@/pages/developer-portal';
import DeveloperSignupPage from '@/pages/developer-signup';
import AdminPage from '@/pages/admin';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

function Router() {
  return (
    <div className="min-h-screen bg-[#07070f] text-white">
      <Nav />
      <Switch>
        <Route path="/" component={HomePage} />
        <Route path="/search" component={SearchPage} />
        <Route path="/apps/:slug" component={AppDetailPage} />
        <Route path="/developer" component={DeveloperPortalPage} />
        <Route path="/developer/signup" component={DeveloperSignupPage} />
        <Route path="/admin" component={AdminPage} />
        <Route component={NotFound} />
      </Switch>
    </div>
  );
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
