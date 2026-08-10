import React from 'react';
import { NavLink } from 'react-router-dom';
import { ArrowUpCircle, CheckCircle2, Copy, FolderGit2, LayoutDashboard, Link, Puzzle, Settings, Sparkles, Target, X } from 'lucide-react';

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/skills', icon: Target, label: 'Skills' },
  { path: '/duplicates', icon: Copy, label: 'Duplicates' },
  { path: '/plugins', icon: Puzzle, label: 'Plugins' },
  { path: '/projects', icon: FolderGit2, label: 'Projects' },
  { path: '/links', icon: Link, label: 'Links' },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

interface SidebarProps {
  hasUpdate?: boolean;
  onUpdateClick?: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ hasUpdate = false, onUpdateClick, mobileOpen = false, onMobileClose }) => {
  return (
    <aside
      aria-label="Application sidebar"
      className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[calc(100vw-2rem)] flex-col glass-sidebar transition-transform duration-200 md:static md:z-auto md:w-64 md:max-w-none md:translate-x-0 ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div className="flex items-start justify-between border-b border-white/[0.08] p-4 sm:p-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-300 ring-1 ring-inset ring-blue-400/20">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-white">Skills Manager</h1>
            <p className="mt-0.5 truncate text-xs text-white/45">LLM skill workspace</p>
          </div>
        </div>
        <button
          type="button"
          aria-label="Close navigation"
          className="rounded-lg p-2 text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 md:hidden"
          onClick={onMobileClose}
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <nav aria-label="Primary navigation" className="flex-1 space-y-1.5 overflow-y-auto p-3 sm:p-4">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            onClick={onMobileClose}
            className={({ isActive }) =>
              `group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                isActive
                  ? 'bg-blue-500/10 text-white ring-1 ring-inset ring-blue-400/20'
                  : 'text-white/60 hover:bg-white/[0.06] hover:text-white'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span
                  aria-hidden="true"
                  className={`absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full ${isActive ? 'bg-blue-300' : 'bg-transparent'}`}
                />
                <item.icon className="h-4 w-4" aria-hidden="true" />
                <span className="font-medium">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-white/[0.08] p-3 sm:p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs text-white/40">
            <p className="font-medium text-white/55">Local workspace</p>
            <p className="mt-0.5">v{__APP_VERSION__}</p>
          </div>
          {hasUpdate ? (
            <button
              onClick={onUpdateClick}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-400/10 hover:text-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
              title="Update available"
            >
              <ArrowUpCircle className="h-3.5 w-3.5" aria-hidden="true" />
              Update
            </button>
          ) : (
            <div className="flex items-center gap-1 text-xs text-emerald-300/70" title="Up to date">
              <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
