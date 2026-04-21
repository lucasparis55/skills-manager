import React, { useState, useEffect } from 'react';

const StatusBar: React.FC = () => {
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
    <footer className="glass-statusbar px-6 py-2 text-sm text-white/45 flex gap-6">
      <span>{stats.skills} skills</span>
      <span>{stats.projects} projects</span>
      <span>{stats.links} links</span>
      <span className="ml-auto text-green-400">Ready</span>
    </footer>
  );
};

export default StatusBar;
