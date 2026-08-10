import { ReactNode, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import {
  Network,
  BookOpen,
  Globe2,
  Sparkles,
  LayoutDashboard,
  Menu,
  ChevronLeft,
  ChevronRight,
  Search,
  Moon,
  Sun,
  UserCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
}

interface NavGroup {
  group: string;
  items: NavItem[];
}

/** One accent per nav group, drawn from the heritage palette. */
const PALETTE = [
  { dot: '#E2673A', bg: 'rgba(226,103,58,0.15)', label: '#E2673Acc' }, // terracotta
  { dot: '#68A06B', bg: 'rgba(104,160,107,0.15)', label: '#68A06Bcc' }, // forest
  { dot: '#E3B341', bg: 'rgba(227,179,65,0.15)', label: '#E3B341cc' }, // gold
] as const;

const NAV_GROUPS: NavGroup[] = [
  {
    group: 'Overview',
    items: [
      {
        label: 'Dashboard',
        href: '/',
        icon: <LayoutDashboard className="h-4 w-4" />,
      },
    ],
  },
  {
    group: 'Archive',
    items: [
      {
        label: 'Genealogy',
        href: '/genealogy',
        icon: <Network className="h-4 w-4" />,
      },
      {
        label: 'Heritage',
        href: '/heritage',
        icon: <BookOpen className="h-4 w-4" />,
      },
      {
        label: 'Language',
        href: '/language',
        icon: <Globe2 className="h-4 w-4" />,
      },
    ],
  },
  {
    group: 'Studio',
    items: [
      {
        label: 'AI Studio',
        href: '/ai',
        icon: <Sparkles className="h-4 w-4" />,
      },
    ],
  },
];

const PAGE_TITLES: Array<{ match: (path: string) => boolean; title: string }> =
  [
    { match: (p) => p === '/', title: 'Dashboard' },
    { match: (p) => p.startsWith('/genealogy'), title: 'Genealogy' },
    { match: (p) => p.startsWith('/heritage'), title: 'Heritage' },
    { match: (p) => p.startsWith('/language'), title: 'Language' },
    { match: (p) => p.startsWith('/ai'), title: 'AI Studio' },
  ];

const THEME_KEY = 'genhal:theme';

function useDarkMode() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(THEME_KEY);
    const prefersDark =
      stored === 'dark' ||
      (stored === null &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    setIsDark(prefersDark);
    document.documentElement.classList.toggle('dark', prefersDark);
  }, []);

  const toggle = () => {
    setIsDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle('dark', next);
      localStorage.setItem(THEME_KEY, next ? 'dark' : 'light');
      return next;
    });
  };

  return { isDark, toggle };
}

function isActivePath(location: string, href: string) {
  if (href === '/') return location === '/';
  return location === href || location.startsWith(href + '/');
}

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const { isDark, toggle } = useDarkMode();

  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  useEffect(() => {
    if (!searchOpen) {
      setQuery('');
      return undefined;
    }
    const id = window.setTimeout(() => searchRef.current?.focus(), 60);
    return () => window.clearTimeout(id);
  }, [searchOpen]);

  const title =
    PAGE_TITLES.find((entry) => entry.match(location))?.title ?? 'GenHaL';

  const groups = query
    ? NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          item.label.toLowerCase().includes(query.toLowerCase()),
        ),
      })).filter((group) => group.items.length > 0)
    : NAV_GROUPS;

  const sidebarPanel = (
    <div
      className="flex h-full flex-col overflow-hidden"
      style={{
        background: 'var(--sidebar-gradient)',
        borderRight: '1px solid var(--sidebar-border-color)',
      }}
    >
      {/* Brand */}
      <div
        className="flex shrink-0 items-center gap-2 px-3 py-4"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <Link
          href="/"
          className={cn(
            'flex min-w-0 items-center gap-2.5',
            collapsed && 'mx-auto',
          )}
        >
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl font-serif text-sm font-bold text-white"
            style={{
              background: 'linear-gradient(135deg, #E2673A 0%, #E3B341 100%)',
            }}
          >
            G
          </span>
          {!collapsed && (
            <span className="min-w-0">
              <span className="block truncate font-serif text-lg font-bold leading-tight text-white">
                GenHaL
              </span>
              <span className="block truncate text-[9px] font-bold uppercase tracking-[0.18em] text-white/35">
                Heritage Archive
              </span>
            </span>
          )}
        </Link>

        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            className="ml-auto hidden rounded-lg p-1.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white/80 md:flex"
            title="Collapse sidebar"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={() => setMobileOpen(false)}
          className="ml-auto rounded-lg p-1.5 text-white/40 transition-colors hover:text-white md:hidden"
          aria-label="Close menu"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      {collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          className="mx-auto mt-3 flex rounded-xl p-2 text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/80"
          title="Expand sidebar"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}

      {/* Menu search */}
      {!collapsed && (
        <div className="mx-3 mt-3 shrink-0">
          {searchOpen ? (
            <div
              className="flex items-center gap-2 rounded-xl px-3 py-2"
              style={{
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <Search className="h-3.5 w-3.5 shrink-0 text-white/40" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setSearchOpen(false)}
                placeholder="Search menu…"
                className="flex-1 bg-transparent text-xs text-white placeholder-white/30 outline-none"
              />
              <button
                onClick={() => setSearchOpen(false)}
                className="text-white/30 transition-colors hover:text-white/70"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setSearchOpen(true)}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs transition-colors hover:bg-white/[0.05]"
              style={{
                color: 'rgba(255,255,255,0.35)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <Search className="h-3.5 w-3.5" />
              <span>Search menu…</span>
            </button>
          )}
        </div>
      )}

      {/* Nav */}
      <nav className="scrollbar-slim flex-1 overflow-y-auto py-3">
        {groups.map((group, gi) => {
          const pal = PALETTE[gi % PALETTE.length];

          return (
            <div key={group.group} className={cn('px-2', gi > 0 && 'mt-5')}>
              {!collapsed && (
                <div className="mb-1.5 flex items-center gap-2 px-2.5">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{
                      background: pal.dot,
                      boxShadow: `0 0 6px ${pal.dot}88`,
                    }}
                  />
                  <span
                    className="truncate text-[10px] font-bold uppercase tracking-[0.14em]"
                    style={{ color: pal.label }}
                  >
                    {group.group}
                  </span>
                  <span
                    className="h-px flex-1"
                    style={{
                      background: `linear-gradient(90deg, ${pal.dot}30 0%, transparent 100%)`,
                    }}
                  />
                </div>
              )}

              {collapsed && gi > 0 && (
                <div
                  className="mx-2 my-3 h-px"
                  style={{ background: 'rgba(255,255,255,0.06)' }}
                />
              )}

              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const current = isActivePath(location, item.href);
                  return (
                    <li key={item.href}>
                      <Link href={item.href} className="block">
                        <span
                          className={cn(
                            'group relative flex w-full cursor-pointer select-none items-center gap-2.5 rounded-xl px-2.5 py-2 transition-colors',
                            current ? 'shadow-sm' : 'hover:bg-white/[0.04]',
                            collapsed && 'justify-center',
                          )}
                          style={
                            current
                              ? {
                                  background: `linear-gradient(90deg, ${pal.bg} 0%, rgba(0,0,0,0) 100%)`,
                                  borderLeft: `2px solid ${pal.dot}`,
                                  paddingLeft: collapsed
                                    ? undefined
                                    : 'calc(0.625rem - 2px)',
                                }
                              : undefined
                          }
                          title={collapsed ? item.label : undefined}
                        >
                          <span
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors"
                            style={
                              current
                                ? { background: pal.bg, color: pal.dot }
                                : { color: 'rgba(255,255,255,0.45)' }
                            }
                          >
                            {item.icon}
                          </span>
                          {!collapsed && (
                            <span
                              className={cn(
                                'flex-1 truncate text-[13px] transition-colors',
                                current
                                  ? 'font-semibold text-white'
                                  : 'font-medium text-white/60 group-hover:text-white/90',
                              )}
                            >
                              {item.label}
                            </span>
                          )}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      {/* Account footer */}
      <div
        className="shrink-0 p-2"
        style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
      >
        <button
          className={cn(
            'flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 transition-colors hover:bg-white/[0.06]',
            collapsed && 'justify-center px-2',
          )}
          style={{ background: 'rgba(255,255,255,0.04)' }}
          title={collapsed ? 'Sign in' : undefined}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/60">
            <UserCircle2 className="h-4 w-4" />
          </span>
          {!collapsed && (
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate text-[13px] font-semibold leading-tight text-white">
                Sign in
              </span>
              <span className="block truncate text-[10px] font-medium leading-tight text-white/40">
                Save your work
              </span>
            </span>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <aside
        className="hidden shrink-0 flex-col md:flex"
        style={{
          width: collapsed ? '64px' : '260px',
          minWidth: collapsed ? '64px' : '260px',
          transition:
            'width 0.25s cubic-bezier(0.4,0,0.2,1), min-width 0.25s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        {sidebarPanel}
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="h-full w-[260px] shrink-0">{sidebarPanel}</div>
          <div
            className="flex-1 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Topbar */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-card px-4 shadow-sm md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="truncate text-base font-semibold text-foreground md:text-lg">
              {title}
            </h1>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={toggle}
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label="Toggle colour scheme"
            >
              {isDark ? (
                <Sun className="h-5 w-5" />
              ) : (
                <Moon className="h-5 w-5" />
              )}
            </button>

            <div className="mx-2 hidden h-6 w-px bg-border sm:block" />

            <button className="hidden items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted sm:flex">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <UserCircle2 className="h-4 w-4" />
              </span>
              <span className="text-sm font-medium text-foreground">
                Sign in
              </span>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
