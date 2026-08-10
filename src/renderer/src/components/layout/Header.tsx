import React from 'react';
import { useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/skills': 'Skills',
  '/duplicates': 'Duplicates',
  '/plugins': 'Plugins',
  '/projects': 'Projects',
  '/links': 'Links',
  '/settings': 'Settings',
};

interface HeaderProps {
  onMenuClick?: () => void;
}

const Header: React.FC<HeaderProps> = ({ onMenuClick }) => {
  const location = useLocation();
  const title = location.pathname.startsWith('/skills')
    ? 'Skills'
    : pageTitles[location.pathname] || 'Skills Manager';

  return (
    <header className="glass-header flex min-h-[4.5rem] items-center gap-3 px-4 py-3 sm:px-6">
      <button
        type="button"
        aria-label="Open navigation"
        className="rounded-lg p-2 text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 md:hidden"
        onClick={onMenuClick}
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>
      <div className="min-w-0">
        <p className="hidden text-[11px] font-medium uppercase tracking-[0.18em] text-blue-300/75 sm:block">Workspace</p>
        <h2 className="truncate text-xl font-semibold text-white sm:text-2xl">{title}</h2>
      </div>
      <span className="ml-auto hidden items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-xs text-white/45 sm:flex">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" aria-hidden="true" />
        Local workspace
      </span>
    </header>
  );
};

export default Header;
