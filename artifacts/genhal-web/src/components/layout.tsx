import { ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { Network, BookOpen, Globe2, Sparkles, LayoutDashboard, Menu, X, UserCircle, Mic, Database, Building2 } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navigation = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Genealogy', href: '/genealogy', icon: Network },
    { name: 'Heritage', href: '/heritage', icon: BookOpen },
    { name: 'Language', href: '/language', icon: Globe2 },
    { name: 'AI Studio', href: '/ai', icon: Sparkles },
    { name: 'Collect', href: '/collect', icon: Mic },
    { name: 'Kingdoms', href: '/kingdoms', icon: Building2 },
    { name: 'Corpus & AI', href: '/corpus', icon: Database },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 border-b bg-card sticky top-0 z-20">
        <Link href="/" className="flex items-center">
          <img src="/genhal/genhal-logo.png" alt="GenHaL" className="h-10 w-auto object-contain" />
        </Link>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 text-muted-foreground">
          {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Sidebar */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-30 w-64 bg-card border-r transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full">
          <div className="p-4 hidden md:block">
            <Link href="/" className="flex items-center justify-center">
              <img
                src="/genhal/genhal-logo.png"
                alt="GenHaL — Genealogy · Heritage · Language"
                className="w-48 h-auto object-contain drop-shadow-md transition-transform hover:scale-105 duration-300"
              />
            </Link>
          </div>

          <nav className="flex-1 px-4 space-y-2 overflow-y-auto mt-6 md:mt-0">
            {navigation.map((item) => {
              const isActive = location === item.href || (item.href !== '/' && location.startsWith(item.href));
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                    isActive 
                      ? "bg-primary text-primary-foreground shadow-md" 
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t">
            <Button variant="ghost" className="w-full justify-start text-muted-foreground">
              <UserCircle className="w-5 h-5 mr-2" />
              Sign In
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 p-4 md:p-8 md:pt-10 max-w-7xl mx-auto w-full">
          {children}
        </div>
      </main>
    </div>
  );
}