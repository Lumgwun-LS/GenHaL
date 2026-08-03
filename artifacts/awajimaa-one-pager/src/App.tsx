import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import OnePager from '@/pages/OnePager';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <OnePager />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
