import React, { useState, useEffect } from 'react';
import { ArrowUpCircle } from 'lucide-react';

interface StatusBarProps {
  hasUpdate?: boolean;
  onUpdateClick?: () => void;
}

const StatusBar: React.FC<StatusBarProps> = ({ hasUpdate = false, onUpdateClick }) => {
  const [stats, setStats] = useState({ skills: 0, projects: 0, links: 0 });

  useEffect(() => {
    const loadStats = async () => {
      try {
        const skills = await window.api.skills.list();
        const projects = await window.api.projects.list();
        const links = await window.api.links.list();
        setStats({
          skills: skills?.length || 0,
          projects: projects?.length || 0,
          links: links?.length || 0,
        });
      } catch {
        // Ignore errors
      }
    };

    loadStats();
    const interval = setInterval(loadStats, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <footer className="glass-statusbar px-6 py-2 text-sm text-white/45 flex gap-6 items-center">
      <span>{stats.skills} skills</span>
      <span>{stats.projects} projects</span>
      <span>{stats.links} links</span>
      <span className="ml-auto flex items-center gap-2">
        {hasUpdate && onUpdateClick ? (
          <button
            onClick={onUpdateClick}
            className="flex items-center gap-1.5 text-amber-400 hover:text-amber-300 transition-colors text-xs font-medium"
          >
            <ArrowUpCircle className="w-3.5 h-3.5" />
            Update available
          </button>
        ) : (
          <span className="text-green-400">Ready</span>
        )}
      </span>
    </footer>
  );
};

export default StatusBar;
