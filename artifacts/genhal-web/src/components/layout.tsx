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
  Palette,
  Upload,
  Users,
  Crown,
  Landmark,
  Building2,
  Library,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThemePicker } from '@/components/ui/ThemePicker';
import { useThemeStore } from '@/store/themeStore';

interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
}

interface NavGroup {
  group: string;
  items: NavItem[];
}

/**
 * One accent per nav group, drawn from the heritage palette but lifted for the
 * near-black sidebar — the mid-tone versions used on light surfaces only reach
 * ~3.8:1 here, below the 4.5:1 needed for the small-caps group labels.
 */
const PALETTE = [
  { dot: '#F2906A', bg: 'rgba(242,144,106,0.16)' }, // terracotta
  { dot: '#8FBFE0', bg: 'rgba(143,191,224,0.16)' }, // sky
  { dot: '#93C795', bg: 'rgba(147,199,149,0.16)' }, // forest
  { dot: '#EFC65E', bg: 'rgba(239,198,94,0.16)' }, // gold
  { dot: '#D5A6E0', bg: 'rgba(213,166,224,0.16)' }, // mauve
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
    group: 'Contribute',
    items: [
      {
        label: 'Collect',
        href: '/collect',
        icon: <Upload className="h-4 w-4" />,
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
        label: 'Families',
        href: '/families',
        icon: <Users className="h-4 w-4" />,
      },
      {
        label: 'Kingdoms',
        href: '/kingdoms',
        icon: <Crown className="h-4 w-4" />,
      },
      {
        label: 'Towns',
        href: '/towns',
        icon: <Landmark className="h-4 w-4" />,
      },
    ],
  },
  {
    group: 'Language',
    items: [
      {
        label: 'Language',
        href: '/language',
        icon: <Globe2 className="h-4 w-4" />,
      },
      {
        label: 'Organisations',
        href: '/language-orgs',
        icon: <Building2 className="h-4 w-4" />,
      },
      {
        label: 'Corpus',
        href: '/corpus',
        icon: <Library className="h-4 w-4" />,
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

/*
 * Matched top-to-bottom, so the longer prefix has to be listed first:
 * `/language-orgs` would otherwise be claimed by `/language`. Each entry uses
 * the same segment-boundary test as the nav highlight, so the topbar title and
 * the highlighted nav row can never disagree about which section you are in.
 */
const PAGE_TITLES: Array<{ prefix: string; title: string }> = [
  { prefix: '/', title: 'Dashboard' },
  { prefix: '/collect', title: 'Heritage Collector' },
  { prefix: '/genealogy', title: 'Genealogy' },
  { prefix: '/heritage', title: 'Heritage' },
  { prefix: '/families', title: 'Families' },
  { prefix: '/kingdoms', title: 'Kingdoms' },
  { prefix: '/towns', title: 'Towns' },
  { prefix: '/language-orgs', title: 'Language Organisations' },
  { prefix: '/language', title: 'Language' },
  { prefix: '/corpus', title: 'Language Corpus' },
  { prefix: '/ai', title: 'AI Studio' },
];

const THEME_KEY = 'genhal:theme';

function resolveInitialTheme() {
  if (typeof window === 'undefined') return false;
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === 'dark') return true;
  if (stored === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function useDarkMode() {
  /*
   * Resolved in the state initialiser rather than in an effect: reading it
   * after mount meant the first paint was always light, so a dark-mode visitor
   * got a full-page white flash on every load. The class is applied before
   * paint by the inline script in index.html; this keeps React's copy of the
   * flag in step with it.
   */
  const [isDark, setIsDark] = useState(resolveInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  // Follow the OS only while the visitor hasn't expressed a preference.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => {
      if (localStorage.getItem(THEME_KEY) === null) setIsDark(e.matches);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const toggle = () => {
    setIsDark((prev) => {
      const next = !prev;
      localStorage.setItem(THEME_KEY, next ? 'dark' : 'light');
      return next;
    });
  };

  return { isDark, toggle };
}

/**
 * Section matching is done on whole path segments, never on raw string
 * prefixes. A bare `location.startsWith(href)` lights up Language *and*
 * Language Organisations at the same time, because "/language-orgs" starts
 * with "/language" — the trailing slash is what makes "/language-orgs" fail
 * against "/language/" while "/language/yor" still passes.
 */
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
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const { isDark, toggle } = useDarkMode();
  const { config: themeConfig } = useThemeStore();

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
    PAGE_TITLES.find((entry) => isActivePath(location, entry.prefix))?.title ??
    'GenHaL';

  const groups = query
    ? NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          item.label.toLowerCase().includes(query.toLowerCase()),
        ),
      })).filter((group) => group.items.length > 0)
    : NAV_GROUPS;

  const renderPanel = (collapsed: boolean) => (
    <div
      className="flex h-full flex-col overflow-hidden"
      style={{
        background: themeConfig.sidebarGradient,
        borderRight: `1px solid ${themeConfig.sidebarBorderColor}`,
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
              <span className="block truncate text-[9px] font-bold uppercase tracking-[0.18em] text-white/60">
                Heritage Archive
              </span>
            </span>
          )}
        </Link>

        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            className="ml-auto hidden rounded-lg p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white/80 md:flex"
            title="Collapse sidebar"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={() => setMobileOpen(false)}
          className="ml-auto rounded-lg p-1.5 text-white/60 transition-colors hover:text-white md:hidden"
          aria-label="Close menu"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      {collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          className="mx-auto mt-3 flex rounded-xl p-2 text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white/80"
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
              <Search className="h-3.5 w-3.5 shrink-0 text-white/60" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setSearchOpen(false)}
                placeholder="Search menu…"
                className="flex-1 bg-transparent text-xs text-white placeholder-white/55 outline-none"
              />
              <button
                onClick={() => setSearchOpen(false)}
                className="text-white/55 transition-colors hover:text-white/70"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setSearchOpen(true)}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs transition-colors hover:bg-white/[0.05]"
              style={{
                color: 'rgba(255,255,255,0.62)',
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
      {/* min-h-0 lets this shrink below its content height inside the flex
          column, so overflow scrolls *here* instead of pushing the account
          block off the bottom of the panel. */}
      <nav className="scrollbar-slim min-h-0 flex-1 overflow-y-auto py-3">
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
                    style={{ color: pal.dot }}
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
                                : { color: 'rgba(255,255,255,0.68)' }
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
                                  : 'font-medium text-white/75 group-hover:text-white',
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

      {/* Account status — this app has no sign-in flow wired up, so this is
          deliberately a status block rather than a button that does nothing. */}
      <div
        className="shrink-0 p-2"
        style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div
          className={cn(
            'flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5',
            collapsed && 'justify-center px-2',
          )}
          style={{ background: 'rgba(255,255,255,0.04)' }}
          title={collapsed ? 'Browsing as guest' : undefined}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/70">
            <UserCircle2 className="h-4 w-4" />
          </span>
          {!collapsed && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold leading-tight text-white">
                Browsing as guest
              </span>
              <span className="block truncate text-[10px] font-medium leading-tight text-white/60">
                Contributions are public
              </span>
            </span>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
    {/*
     * h-dvh (not h-screen) so mobile browser chrome retracting doesn't leave a
     * gap; overflow-hidden on the shell plus overflow-y-auto on <main> keeps
     * the sidebar and topbar pinned while only the content column scrolls.
     */}
    <div className="flex h-dvh overflow-hidden bg-background">
      {/*
       * The sidebar is pinned to the viewport, not laid out in the scrolling
       * flow: `fixed inset-y-0` means its height is the window's, so it can
       * never be stretched to the height of a long page (which is what left
       * that tall band of empty dark space below the nav on Dashboard and
       * Collect, and made the whole bar scroll away with the content). The
       * spacer beside it reserves the column width in the flex row.
       */}
      <div
        aria-hidden="true"
        className="hidden shrink-0 md:block"
        style={{
          width: collapsed ? '64px' : '260px',
          transition: 'width 0.25s cubic-bezier(0.4,0,0.2,1)',
        }}
      />
      <aside
        className="fixed inset-y-0 left-0 z-40 hidden flex-col md:flex"
        style={{
          width: collapsed ? '64px' : '260px',
          transition: 'width 0.25s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        {renderPanel(collapsed)}
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="h-full w-[260px] shrink-0">{renderPanel(false)}</div>
          <div
            className="flex-1 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Topbar */}
        <header
          className="flex h-16 shrink-0 items-center justify-between bg-card px-4 shadow-sm md:px-6"
          style={{ borderBottom: `1px solid ${themeConfig.sidebarBorderColor}` }}
        >
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
            {/* Theme picker */}
            <button
              onClick={() => setThemePickerOpen(true)}
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Change dashboard theme"
              aria-label="Dashboard themes"
            >
              <Palette className="h-5 w-5" />
            </button>
            {/* Light / dark mode toggle */}
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
          </div>
        </header>

        <main
          className="flex-1 overflow-y-auto p-4 md:p-6"
          style={{
            /* Subtle accent tint at the top of the content area so each
             * theme visually "bleeds" from the sidebar into the canvas.
             * The 08 / 06 hex suffix is ~3-4 % opacity — barely perceptible
             * but enough for the eye to detect a colour shift on switch. */
            background: `linear-gradient(180deg, ${themeConfig.accentColor}08 0px, transparent 200px)`,
          }}
        >
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
    <ThemePicker open={themePickerOpen} onClose={() => setThemePickerOpen(false)} />
    </>
  );
}
