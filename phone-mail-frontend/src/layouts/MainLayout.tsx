import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  FileText,
  Inbox,
  LogOut,
  Menu,
  PenLine,
  Search,
  Settings,
  ShieldAlert,
  Smartphone,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '../utils/cn';
import { getInitials } from '../utils/formatters';
import { useAuth } from '../hooks/useAuth';
import type { LucideIcon } from 'lucide-react';

interface NavItem {
  to: string;
  label: string;
  desktopLabel?: string;
  icon: LucideIcon;
  /** Mobile has a single unified Home (inbox + sent), so Sent is desktop-only, Gmail-style */
  desktopOnly?: boolean;
}

const NAV: NavItem[] = [
  { to: '/', label: 'Home', desktopLabel: 'Inbox', icon: Inbox },
  { to: '/drafts', label: 'Drafts', icon: FileText },
  { to: '/spam', label: 'Spam', icon: ShieldAlert },
  { to: '/trash', label: 'Trash', icon: Trash2 },
];

export interface LayoutContext {
  search: string;
  setSearch: (value: string) => void;
}

export default function MainLayout() {
  const { pathname, search: routeSearch } = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const name = user?.name || 'You';
  const email = user?.phone ? `${user.phone}@phonemail.com` : '';

  const [search, setSearch] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // A chat thread open on mobile hides our header/FAB — Dashboard renders its own.
  const chatOpen = new URLSearchParams(routeSearch).get('chat') !== null;

  useEffect(() => setDrawerOpen(false), [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const outletContext: LayoutContext = { search, setSearch };

  const linkClass = (collapsed: boolean) =>
    ({ isActive }: { isActive: boolean }) =>
      cn(
        'flex items-center gap-4 rounded-full text-sm transition-all duration-200',
        collapsed ? 'size-12 justify-center' : 'h-11 px-4',
        isActive
          ? 'bg-[#d9e7ff] font-semibold text-[#0b4fe0] shadow-sm'
          : 'text-slate-600 hover:bg-slate-200/60',
      );

  return (
    <div className="flex h-dvh flex-col bg-[#f3f6fb] text-slate-900 md:bg-[#eaf1fb]">
      {/* ── Mobile header (WhatsApp-style) ─────────────────────────── */}
      {!chatOpen && (
        <header className="relative z-20 bg-gradient-to-br from-[#1a66ff] to-[#0b4fe0] px-4 pb-4 pt-[max(env(safe-area-inset-top),0.75rem)] text-white md:hidden">
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <span className="absolute -right-10 -top-14 size-44 rounded-full bg-white/10" />
            <span className="absolute -bottom-12 -left-10 size-32 rounded-full bg-white/10" />
          </div>

          <div className="relative flex items-center justify-between">
            <button
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
              className="flex items-center gap-2.5 rounded-xl transition active:scale-95"
            >
              <span className="grid size-9 place-items-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
                <Smartphone className="size-5" strokeWidth={2.2} />
              </span>
              <span className="font-serif text-xl font-bold tracking-tight">
                Phone<span className="text-blue-200">Mail</span>
              </span>
            </button>

            <button
              onClick={() => setDrawerOpen(true)}
              aria-label="Account"
              className="grid size-10 place-items-center rounded-full bg-[#0b3fbf] text-sm font-semibold ring-2 ring-white/70 transition active:scale-90"
            >
              {getInitials(name)}
            </button>
          </div>

          <label className="relative mt-3 flex h-12 items-center gap-3 rounded-2xl bg-white px-4 text-slate-700 shadow-lg shadow-blue-900/20 transition-all duration-300 focus-within:shadow-xl focus-within:ring-2 focus-within:ring-white/60">
            <Search className="size-5 shrink-0 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search people, emails or phone numbers"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
          </label>
        </header>
      )}

      {/* ── Desktop header (Gmail-style) ────────────────────────────── */}
      <header className="relative z-20 hidden h-16 shrink-0 items-center gap-4 px-4 md:flex">
        <div className="flex w-56 items-center gap-2">
          <button
            onClick={() => setSidebarCollapsed((v) => !v)}
            aria-label="Toggle sidebar"
            className="grid size-11 place-items-center rounded-full text-slate-600 transition hover:bg-slate-200/70 active:scale-90"
          >
            <Menu className="size-5" />
          </button>
          <span className="inline-flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-[#1a66ff] to-[#4d8bff] shadow-md shadow-blue-500/30">
              <Smartphone className="size-5 text-white" strokeWidth={2.2} />
            </span>
            <span className="font-serif text-xl font-bold tracking-tight text-slate-900">
              Phone<span className="text-[#1a66ff]">Mail</span>
            </span>
          </span>
        </div>

        <label className="flex h-12 max-w-2xl flex-1 items-center gap-3 rounded-full bg-slate-100 px-4 text-slate-700 transition-colors focus-within:bg-white focus-within:shadow-md focus-within:ring-1 focus-within:ring-slate-200">
          <Search className="size-5 shrink-0 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search people, emails or phone numbers"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
        </label>

        <div className="ml-auto flex items-center gap-2">
          <Link
            to="/settings"
            aria-label="Settings"
            className="grid size-11 place-items-center rounded-full text-slate-600 transition hover:rotate-45 hover:bg-slate-200/70"
          >
            <Settings className="size-5" />
          </Link>

          <div ref={menuRef} className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Account menu"
              className="grid size-10 place-items-center rounded-full bg-[#1a66ff] text-sm font-semibold text-white shadow-md shadow-blue-500/30 ring-2 ring-white transition active:scale-90"
            >
              {getInitials(name)}
            </button>
            <div
              className={cn(
                'absolute right-0 top-full z-50 mt-2 w-72 origin-top-right overflow-hidden rounded-2xl bg-white text-slate-800 shadow-2xl shadow-blue-900/25 ring-1 ring-slate-200 transition-all duration-200',
                menuOpen ? 'visible scale-100 opacity-100' : 'invisible scale-95 opacity-0',
              )}
            >
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  navigate('/profile');
                }}
                className="flex w-full items-center gap-3 bg-gradient-to-br from-[#1a66ff] to-[#0b4fe0] p-4 text-left text-white"
              >
                <span className="grid size-14 place-items-center rounded-full bg-[#0b3fbf] text-xl font-semibold ring-2 ring-white/60">
                  {getInitials(name)}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{name}</p>
                  <p className="truncate text-sm text-blue-100">{email}</p>
                </div>
              </button>
              <div className="p-2">
                <Link
                  to="/settings"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition hover:bg-slate-100"
                >
                  <Settings className="size-5 text-slate-500" />
                  Settings &amp; aliases
                </Link>
                <Link
                  to="/profile"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition hover:bg-slate-100"
                >
                  <Smartphone className="size-5 text-slate-500" />
                  Profile &amp; shared content
                </Link>
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-rose-600 transition hover:bg-rose-50"
                >
                  <LogOut className="size-5" />
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ── Desktop sidebar ───────────────────────────────────────── */}
        <aside
          className={cn(
            'hidden shrink-0 flex-col gap-1 pb-3 pl-3 transition-[width] duration-300 ease-out md:flex',
            sidebarCollapsed ? 'w-[76px]' : 'w-64',
          )}
        >
          <button
            onClick={() => navigate(`${pathname}?compose=1`)}
            className={cn(
              'group mb-3 mt-1 flex items-center gap-3 self-start rounded-2xl bg-gradient-to-br from-[#1a66ff] to-[#4d8bff] font-semibold text-white shadow-lg shadow-blue-600/30 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-600/40 active:scale-95',
              sidebarCollapsed ? 'size-12 justify-center' : 'h-14 px-6',
            )}
          >
            <PenLine className="size-5 transition-transform duration-300 group-hover:-rotate-12" />
            {!sidebarCollapsed && <span>New Email</span>}
          </button>

          <nav className="flex flex-col gap-0.5">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                title={sidebarCollapsed ? (item.desktopLabel ?? item.label) : undefined}
                className={linkClass(sidebarCollapsed)}
              >
                <item.icon className="size-5 shrink-0" />
                {!sidebarCollapsed && <span className="truncate">{item.desktopLabel ?? item.label}</span>}
              </NavLink>
            ))}
          </nav>
        </aside>

        <main
          className={cn(
            'min-w-0 flex-1 md:mb-3 md:mr-3 md:overflow-y-auto md:rounded-2xl md:bg-white md:shadow-sm md:ring-1 md:ring-slate-200/70',
            chatOpen ? 'overflow-hidden' : 'overflow-y-auto pb-24 md:pb-0',
          )}
        >
          <Outlet context={outletContext} />
        </main>
      </div>

      {/* ── Mobile FAB ─────────────────────────────────────────────── */}
      {!chatOpen && (
        <button
          onClick={() => navigate(`${pathname}?compose=1`)}
          className="fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] right-4 z-30 flex h-14 items-center gap-2 rounded-2xl bg-gradient-to-br from-[#1a66ff] to-[#3d82ff] px-5 font-semibold text-white shadow-xl shadow-blue-600/40 transition-transform active:scale-95 md:hidden"
        >
          <span className="absolute inset-0 -z-10 rounded-2xl bg-[#1a66ff] opacity-40 blur-xl" />
          <PenLine className="size-5" />
          New Email
        </button>
      )}

      {/* ── Mobile drawer ──────────────────────────────────────────── */}
      <div className={cn('fixed inset-0 z-50 md:hidden', drawerOpen ? 'visible' : 'invisible transition-[visibility] delay-300')}>
        <div
          onClick={() => setDrawerOpen(false)}
          className={cn(
            'absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300',
            drawerOpen ? 'opacity-100' : 'opacity-0',
          )}
        />
        <nav
          className={cn(
            'absolute inset-y-0 left-0 flex w-[82%] max-w-xs flex-col bg-white shadow-2xl transition-transform duration-300 ease-out',
            drawerOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <div className="relative overflow-hidden bg-gradient-to-br from-[#1a66ff] to-[#0b4fe0] px-5 pb-5 pt-[max(env(safe-area-inset-top),1.5rem)] text-white">
            <span className="pointer-events-none absolute -right-8 -top-10 size-36 rounded-full bg-white/10" />
            <span className="pointer-events-none absolute -bottom-10 left-10 size-24 rounded-full bg-white/10" />
            <button
              onClick={() => setDrawerOpen(false)}
              aria-label="Close menu"
              className="absolute right-3 top-3 grid size-9 place-items-center rounded-full bg-white/15 transition active:scale-90"
            >
              <X className="size-5" />
            </button>
            <span className="relative grid size-14 place-items-center rounded-full bg-[#0b3fbf] text-xl font-semibold ring-2 ring-white/60">
              {getInitials(name)}
            </span>
            <p className="relative mt-3 truncate text-lg font-semibold">{name}</p>
            <p className="relative truncate text-sm text-blue-100">{email}</p>
          </div>

          <div className="flex-1 space-y-1 overflow-y-auto p-3">
            {NAV.filter((i) => !i.desktopOnly).map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={() => setDrawerOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'flex h-12 items-center gap-4 rounded-2xl px-4 text-[15px] transition-colors',
                    isActive ? 'bg-[#d9e7ff] font-semibold text-[#0b4fe0]' : 'text-slate-700 active:bg-slate-100',
                  )
                }
              >
                <item.icon className="size-5" />
                {item.label}
              </NavLink>
            ))}
          </div>

          <div className="space-y-1 border-t border-slate-100 p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
            <NavLink
              to="/settings"
              onClick={() => setDrawerOpen(false)}
              className="flex h-12 items-center gap-4 rounded-2xl px-4 text-[15px] text-slate-700 transition-colors active:bg-slate-100"
            >
              <Settings className="size-5" />
              Settings
            </NavLink>
            <button
              onClick={() => {
                setDrawerOpen(false);
                handleLogout();
              }}
              className="flex h-12 w-full items-center gap-4 rounded-2xl px-4 text-[15px] text-rose-600 transition-colors active:bg-rose-50"
            >
              <LogOut className="size-5" />
              Sign out
            </button>
          </div>
        </nav>
      </div>
    </div>
  );
}
