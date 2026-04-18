import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Target, FolderGit2, Link, Settings } from 'lucide-react';

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/skills', icon: Target, label: 'Skills' },
  { path: '/projects', icon: FolderGit2, label: 'Projects' },
  { path: '/links', icon: Link, label: 'Links' },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

const Sidebar: React.FC = () => {
  return (
    <aside className="w-64 bg-slate-800 border-r border-slate-700 flex flex-col">
      <div className="p-6 border-b border-slate-700">
        <h1 className="text-xl font-bold text-white">Skills Manager</h1>
        <p className="text-sm text-slate-400 mt-1">LLM Skill Organization</p>
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
                  : 'text-slate-300 hover:bg-slate-700 hover:text-white'
              }`
            }
          >
            <item.icon className="w-5 h-5" />
            <span className="font-medium">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-700">
        <div className="text-xs text-slate-500">
          <p>v{__APP_VERSION__}</p>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
