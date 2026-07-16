import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { useEffect } from "react";
import { trackPageView } from "./lib/analytics";
import { ClerkProvider } from "@clerk/react";
import Nav from "./components/nav";
import Home from "./pages/home";
import Search from "./pages/search";
import AppDetail from "./pages/app-detail";
import DeveloperPortal from "./pages/developer-portal";
import DeveloperSignup from "./pages/developer-signup";
import Admin from "./pages/admin";

function PageViewTracker() {
  const [location] = useLocation();
  useEffect(() => { trackPageView(location); }, [location]);
  return null;
}

const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function App() {
  return (
    <ClerkProvider publishableKey={CLERK_KEY}>
      <WouterRouter base={basePath}>
        <div style={{ minHeight: "100vh", background: "#060811", color: "#e8eaf0" }}>
          <PageViewTracker />
          <Nav />
          <Switch>
            <Route path="/" component={Home} />
            <Route path="/search" component={Search} />
            <Route path="/apps/:slug" component={AppDetail} />
            <Route path="/developer/signup" component={DeveloperSignup} />
            <Route path="/developer" component={DeveloperPortal} />
            <Route path="/admin" component={Admin} />
          </Switch>
        </div>
      </WouterRouter>
    </ClerkProvider>
  );
}
