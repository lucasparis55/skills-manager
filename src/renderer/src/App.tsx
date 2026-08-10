import React, { useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import Sidebar from './components/layout/Sidebar';
import Header from './components/layout/Header';
import StatusBar from './components/layout/StatusBar';
import Dashboard from './pages/Dashboard';
import SkillsPage from './pages/SkillsPage';
import ProjectsPage from './pages/ProjectsPage';
import LinksPage from './pages/LinksPage';
import SettingsPage from './pages/SettingsPage';
import DuplicatesPage from './pages/DuplicatesPage';
import PluginsPage from './pages/PluginsPage';
import UpdateDialog from './components/ui/UpdateDialog';
import { ToastProvider } from './components/ui/Toast';
import { useUpdateChecker } from './hooks/useUpdateChecker';

const App: React.FC = () => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [settings, setSettings] = useState<{ checkForUpdates?: boolean } | null>(null);

  React.useEffect(() => {
    window.api.settings.get().then((s) => setSettings(s));
  }, []);

  const { status, result, progress, error, startUpdate } = useUpdateChecker(settings?.checkForUpdates);
  const hasUpdate = result?.hasUpdate === true && (status === 'available' || status === 'error');

  const handleUpdateClick = () => {
    if (hasUpdate) {
      setDialogOpen(true);
    }
  };

  const handleInstall = () => {
    void startUpdate();
  };

  const updateDialogStatus =
    status === 'downloading' || status === 'installing' || status === 'error'
      ? status
      : 'available';

  return (
    <ToastProvider>
      <div className="flex h-screen min-h-0 w-full overflow-hidden bg-[var(--bg-base)] text-white">
        {mobileNavOpen && (
          <button
            type="button"
            aria-label="Close navigation"
            className="fixed inset-0 z-40 bg-black/60 md:hidden"
            onClick={() => setMobileNavOpen(false)}
          />
        )}
        <Sidebar
          hasUpdate={hasUpdate}
          onUpdateClick={handleUpdateClick}
          mobileOpen={mobileNavOpen}
          onMobileClose={() => setMobileNavOpen(false)}
        />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Header onMenuClick={() => setMobileNavOpen(true)} />
          <main className="min-w-0 flex-1 overflow-auto px-4 py-5 sm:px-6 lg:py-7">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/skills/*" element={<SkillsPage />} />
              <Route path="/duplicates" element={<DuplicatesPage />} />
              <Route path="/plugins" element={<PluginsPage />} />
              <Route path="/projects" element={<ProjectsPage />} />
              <Route path="/links" element={<LinksPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </main>
          <StatusBar hasUpdate={hasUpdate} onUpdateClick={handleUpdateClick} />
        </div>
      </div>

      {result && (
        <UpdateDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          currentVersion={result.currentVersion}
          latestVersion={result.latestVersion ?? ''}
          releaseNotes={result.releaseNotes}
          publishedAt={result.publishedAt}
          updateStatus={updateDialogStatus}
          updateProgress={progress}
          errorMessage={error}
          onInstall={handleInstall}
        />
      )}
    </ToastProvider>
  );
};

export default App;
