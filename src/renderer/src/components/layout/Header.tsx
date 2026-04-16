import React from 'react';
import { useLocation } from 'react-router-dom';

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/skills': 'Skills',
  '/projects': 'Projects',
  '/links': 'Links',
  '/settings': 'Settings',
};

const Header: React.FC = () => {
  const location = useLocation();
  const title = pageTitles[location.pathname] || 'Skills Manager';

  return (
    <header className="bg-slate-800 border-b border-slate-700 px-6 py-4">
      <h2 className="text-2xl font-semibold text-white">{title}</h2>
    </header>
  );
};

export default Header;
