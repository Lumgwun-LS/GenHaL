import { ReactNode, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import {
  Network, BookOpen, Globe2, Sparkles, LayoutDashboard, Menu, X,
  Mic, Database, Building2, Home, Users, LogIn, LogOut, ChevronDown, Palette,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useClerk, useUser } from '@clerk/react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useThemeStore } from '@/store/themeStore';
import { ThemePicker } from '@/components/ui/ThemePicker';

/* ── Theme flash overlay — radial sweep on theme change ─────────────────── */
function ThemeFlashOverlay() {
  const { theme, config } = useThemeStore();
  const [active, setActive] = useState(false);
  const prevTheme = useRef(theme);
  const accentRef = useRef(config.accentColor);

  useEffect(() => {
    if (prevTheme.current !== theme) {
      accentRef.current = config.accentColor;
      prevTheme.current = theme;
      setActive(true);
      const t = setTimeout(() => setActive(false), 750);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [theme, config.accentColor]);

  if (!active) return null;
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9998, pointerEvents: 'none',
        background: `radial-gradient(ellipse at 15% 50%, ${accentRef.current}28 0%, transparent 60%)`,
        animation: 'genhalThemeFlash 0.75s ease-out forwards',
      }}
    />
  );
}

/* ── NavLink — renders different styles per sidebar variant ─────────────── */
function NavItem({
  name, href, icon: Icon, isActive, locked, variant, accentColor, onClick,
}: {
  name: string; href: string; icon: React.ElementType; isActive: boolean;
  locked: boolean; variant: string; accentColor: string; onClick: () => void;
}) {
  const base = 'flex items-center gap-3 text-sm font-medium transition-all duration-200 nav-item';

  if (variant === 'ember') {
    return (
      <Link href={locked ? '/sign-in' : href} onClick={onClick}
        className={cn(base, 'px-4 py-2.5 relative')}
        style={isActive ? {
          borderLeft: `2px solid ${accentColor}`,
          background: `${accentColor}14`,
          color: accentColor,
        } : {
          borderLeft: '2px solid transparent',
          color: locked ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.55)',
        }}>
        <Icon className="w-4 h-4 shrink-0" />
        <span className="truncate flex-1">{name}</span>
        {isActive && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: accentColor }} />}
        {locked && <LogIn className="w-3.5 h-3.5 ml-auto opacity-30 shrink-0" />}
      </Link>
    );
  }

  if (variant === 'golden') {
    return (
      <Link href={locked ? '/sign-in' : href} onClick={onClick}
        className={cn(base, 'px-4 py-3 rounded-2xl harvest-active-item-maybe')}
        style={isActive ? {
          background: `linear-gradient(135deg, ${accentColor}22, ${accentColor}0a)`,
          border: `1px solid ${accentColor}35`,
          color: accentColor,
          boxShadow: `0 2px 14px ${accentColor}18`,
        } : {
          color: locked ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.55)',
          border: '1px solid transparent',
        }}>
        <Icon className="w-4 h-4 shrink-0" />
        <span className="truncate flex-1">{name}</span>
        {locked && <LogIn className="w-3.5 h-3.5 ml-auto opacity-30 shrink-0" />}
      </Link>
    );
  }

  if (variant === 'grove') {
    return (
      <Link href={locked ? '/sign-in' : href} onClick={onClick}
        className={cn(base, 'px-4 py-2.5 rounded-full')}
        style={isActive ? {
          background: `${accentColor}28`,
          border: `1px solid ${accentColor}45`,
          color: accentColor,
          boxShadow: `0 0 12px ${accentColor}20`,
        } : {
          color: locked ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.55)',
          border: '1px solid transparent',
        }}>
        <Icon className="w-4 h-4 shrink-0" />
        <span className="truncate flex-1">{name}</span>
        {locked && <LogIn className="w-3.5 h-3.5 ml-auto opacity-30 shrink-0" />}
      </Link>
    );
  }

  // royal (oba)
  return (
    <Link href={locked ? '/sign-in' : href} onClick={onClick}
      className={cn(base, 'px-4 py-2 tracking-widest')}
      style={{
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: '0.12em',
        color: isActive ? '#FBBF24' : locked ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.45)',
        fontWeight: isActive ? 700 : 500,
      }}>
      <Icon className="w-4 h-4 shrink-0" />
      <span className="truncate flex-1">{name}</span>
      {isActive && <span style={{ color: '#FBBF24', fontSize: 10 }}>✦</span>}
      {locked && <LogIn className="w-3.5 h-3.5 ml-auto opacity-30 shrink-0" />}
    </Link>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const { user, isSignedIn, isLoaded } = useUser();
  const { signOut } = useClerk();
  const { config, theme } = useThemeStore();

  const navigation = [
    { name: 'Dashboard',   href: '/',              icon: LayoutDashboard, public: true  },
    { name: 'Genealogy',   href: '/genealogy',     icon: Network,         public: false },
    { name: 'Heritage',    href: '/heritage',      icon: BookOpen,        public: false },
    { name: 'Language',    href: '/language',      icon: Globe2,          public: false },
    { name: 'AI Studio',   href: '/ai',            icon: Sparkles,        public: false },
    { name: 'Collect',     href: '/collect',       icon: Mic,             public: false },
    { name: 'Kingdoms',    href: '/kingdoms',      icon: Building2,       public: true  },
    { name: 'Families',    href: '/families',      icon: Home,            public: false },
    { name: 'Corpus & AI', href: '/corpus',        icon: Database,        public: false },
    { name: 'Lang. Orgs',  href: '/language-orgs', icon: Users,           public: true  },
  ];

  const sidebarStyle = {
    background: config.sidebarGradient,
    borderRight: `1px solid ${config.sidebarBorderColor}`,
    backdropFilter: config.sidebarVariant === 'grove' ? 'blur(22px) saturate(1.5)' : undefined,
    WebkitBackdropFilter: config.sidebarVariant === 'grove' ? 'blur(22px) saturate(1.5)' : undefined,
    transition: 'background 0.5s ease, border-color 0.4s ease',
  };

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row" data-theme={theme}>
      <ThemeFlashOverlay />
      <ThemePicker open={pickerOpen} onClose={() => setPickerOpen(false)} />

      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 sticky top-0 z-20"
        style={{ background: config.sidebarGradient, borderBottom: `1px solid ${config.sidebarBorderColor}` }}>
        <Link href="/" className="flex items-center">
          <img src="/genhal/genhal-logo.png" alt="GenHaL" className="h-10 w-auto object-contain" />
        </Link>
        <div className="flex items-center gap-2">
          <button onClick={() => setPickerOpen(true)} className="p-2 rounded-lg"
            style={{ color: config.accentColor, background: `${config.accentColor}15` }}>
            <Palette className="w-4 h-4" />
          </button>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2"
            style={{ color: 'rgba(255,255,255,0.6)' }}>
            {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Sidebar */}
      <aside
        data-variant={config.sidebarVariant}
        className={cn(
          'fixed inset-y-0 left-0 z-30 w-64 transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 flex flex-col',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          config.sidebarVariant === 'grove' && 'sidebar-grove',
        )}
        style={sidebarStyle}
      >
        {/* Electric edge glow */}
        {config.sidebarVariant === 'ember' && (
          <div className="sidebar-ember-edge" style={{ background: config.accentColor }} />
        )}

        {/* Logo */}
        <div className="p-4 hidden md:block">
          <Link href="/" className="flex items-center justify-center">
            <img
              src="/genhal/genhal-logo.png"
              alt="GenHaL — Genealogy · Heritage · Language"
              className="w-48 h-auto object-contain drop-shadow-md transition-transform hover:scale-105 duration-300"
            />
          </Link>
        </div>

        {/* Theme label pill */}
        <div className="hidden md:flex items-center justify-center pb-2">
          <button
            onClick={() => setPickerOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all duration-200 hover:scale-105"
            style={{
              background: `${config.accentColor}18`,
              color: config.accentColor,
              border: `1px solid ${config.accentColor}35`,
            }}
          >
            <span>{config.emoji}</span>
            <span>{config.name}</span>
            <Palette className="w-2.5 h-2.5 ml-0.5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto mt-2">
          {navigation.map((item) => {
            const isActive = location === item.href || (item.href !== '/' && location.startsWith(item.href));
            const locked = !item.public && !isSignedIn;
            return (
              <NavItem
                key={item.name}
                name={item.name}
                href={item.href}
                icon={item.icon}
                isActive={isActive}
                locked={locked}
                variant={config.sidebarVariant}
                accentColor={config.accentColor}
                onClick={() => setSidebarOpen(false)}
              />
            );
          })}
        </nav>

        {/* Auth footer */}
        <div className="p-3" style={{ borderTop: `1px solid ${config.sidebarBorderColor}` }}>
          {!isLoaded ? (
            <div className="h-10 rounded-lg animate-pulse" style={{ background: 'rgba(255,255,255,0.08)' }} />
          ) : isSignedIn && user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left"
                  style={{ color: 'rgba(255,255,255,0.75)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  {user.imageUrl ? (
                    <img src={user.imageUrl} alt={user.fullName ?? 'You'}
                      className="w-8 h-8 rounded-full object-cover shrink-0"
                      style={{ border: `2px solid ${config.accentColor}60` }} />
                  ) : (
                    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm font-bold"
                      style={{ background: `${config.accentColor}25`, color: config.accentColor }}>
                      {(user.firstName?.[0] ?? user.emailAddresses[0]?.emailAddress[0] ?? '?').toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {user.fullName ?? user.emailAddresses[0]?.emailAddress ?? 'Account'}
                    </p>
                    <p className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      {user.emailAddresses[0]?.emailAddress}
                    </p>
                  </div>
                  <ChevronDown className="w-4 h-4 shrink-0" style={{ color: 'rgba(255,255,255,0.35)' }} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem asChild>
                  <a href="https://account.awajimaaai.com" target="_blank" rel="noreferrer">
                    Manage account
                  </a>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setPickerOpen(true)}>
                  <Palette className="w-4 h-4 mr-2" /> Change theme
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => signOut({ redirectUrl: '/sign-in' })}
                >
                  <LogOut className="w-4 h-4 mr-2" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link href="/sign-in" onClick={() => setSidebarOpen(false)}>
              <button className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all"
                style={{
                  border: `1px solid ${config.accentColor}35`,
                  color: config.accentColor,
                  background: `${config.accentColor}0e`,
                }}>
                <LogIn className="w-4 h-4" />
                Sign In
              </button>
            </Link>
          )}

          {/* Cross-app links */}
          <div className="mt-3 pt-3 flex flex-col gap-1"
            style={{ borderTop: `1px solid ${config.sidebarBorderColor}` }}>
            <p className="text-[10px] font-bold uppercase tracking-widest px-1 mb-1"
              style={{ color: 'rgba(255,255,255,0.25)' }}>
              Also on Awajimaa
            </p>
            {[
              { href: '/vendor-hub', label: '🛍️ Awa Biz Suite' },
              { href: '/app-store', label: '📱 App Store' },
            ].map(({ href, label }) => (
              <a key={href} href={href}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition-colors"
                style={{ color: 'rgba(255,255,255,0.38)' }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.7)';
                  (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.38)';
                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                }}>
                {label}
              </a>
            ))}
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)} />
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
