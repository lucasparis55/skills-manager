import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Target, FolderGit2, Link, Settings, CheckCircle2, ArrowUpCircle } from 'lucide-react';

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/skills', icon: Target, label: 'Skills' },
  { path: '/projects', icon: FolderGit2, label: 'Projects' },
  { path: '/links', icon: Link, label: 'Links' },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

interface SidebarProps {
  hasUpdate?: boolean;
  onUpdateClick?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ hasUpdate = false, onUpdateClick }) => {
  return (
    <aside className="w-64 glass-sidebar flex flex-col">
      <div className="p-6 border-b border-white/[0.08]">
        <h1 className="text-xl font-bold text-white">Skills Manager</h1>
        <p className="text-sm text-white/45 mt-1">LLM Skill Organization</p>
      </div>

      <nav className="flex-1 p-4 space-y-2">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-white/70 hover:bg-white/[0.06] hover:text-white'
              }`
            }
          >
            <item.icon className="w-5 h-5" />
            <span className="font-medium">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-white/[0.08]">
        <div className="flex items-center justify-between">
          <div className="text-xs text-white/40">
            <p>{`v${__APP_VERSION__}`}</p>
          </div>
          {hasUpdate ? (
            <button
              onClick={onUpdateClick}
              className="flex items-center gap-1.5 text-xs font-medium text-amber-400 hover:text-amber-300 transition-colors animate-pulse"
              title="Update available"
            >
              <ArrowUpCircle className="w-3.5 h-3.5" />
              Update
            </button>
          ) : (
            <div className="flex items-center gap-1 text-xs text-emerald-400/60" title="Up to date">
              <CheckCircle2 className="w-3 h-3" />
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
