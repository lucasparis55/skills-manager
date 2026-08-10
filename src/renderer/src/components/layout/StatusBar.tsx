import React, { useState, useEffect } from 'react';
import { AlertTriangle, ArrowUpCircle, CheckCircle2, LoaderCircle } from 'lucide-react';

interface StatusBarProps {
  hasUpdate?: boolean;
  onUpdateClick?: () => void;
}

const StatusBar: React.FC<StatusBarProps> = ({ hasUpdate = false, onUpdateClick }) => {
  const [stats, setStats] = useState({ skills: 0, projects: 0, links: 0 });
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    const loadStats = async () => {
      setStatus('loading');
      try {
        const skills = await window.api.skills.list();
        const projects = await window.api.projects.list();
        const links = await window.api.links.list();
        setStats({
          skills: skills?.length || 0,
          projects: projects?.length || 0,
          links: links?.length || 0,
        });
        setStatus('ready');
      } catch {
        setStatus('error');
      }
    };

    loadStats();
    const interval = setInterval(loadStats, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <footer aria-label="Workspace status" className="glass-statusbar flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-xs text-white/50 sm:gap-6 sm:px-6 sm:text-sm">
      <span>{stats.skills} skills</span>
      <span>{stats.projects} projects</span>
      <span>{stats.links} links</span>
      <span className="ml-auto flex items-center gap-2" role="status" aria-live="polite">
        {hasUpdate && onUpdateClick ? (
          <button
            onClick={onUpdateClick}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-400/10 hover:text-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
          >
            <ArrowUpCircle className="h-3.5 w-3.5" aria-hidden="true" />
            Update available
          </button>
        ) : status === 'loading' ? (
          <span className="flex items-center gap-1.5 text-white/45">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            Syncing
          </span>
        ) : status === 'error' ? (
          <span className="flex items-center gap-1.5 text-amber-300" title="Some workspace statistics could not be loaded">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            Sync unavailable
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            Ready
          </span>
        )}
      </span>
    </footer>
  );
};

export default StatusBar;
