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
import UpdateDialog from './components/ui/UpdateDialog';
import { ToastProvider } from './components/ui/Toast';
import { useUpdateChecker } from './hooks/useUpdateChecker';

const App: React.FC = () => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [settings, setSettings] = useState<{ checkForUpdates?: boolean } | null>(null);

  React.useEffect(() => {
    window.api.settings.get().then((s) => setSettings(s));
  }, []);

  const { status, result, openRelease } = useUpdateChecker(settings?.checkForUpdates);
  const hasUpdate = status === 'available' && result !== null;

  const handleUpdateClick = () => {
    if (hasUpdate) {
      setDialogOpen(true);
    }
  };

  const handleDownload = async () => {
    await openRelease();
    setDialogOpen(false);
  };

  return (
    <ToastProvider>
      <div className="flex h-screen w-screen bg-black text-white">
        <Sidebar hasUpdate={hasUpdate} onUpdateClick={handleUpdateClick} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />
          <main className="flex-1 overflow-auto p-6">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/skills" element={<SkillsPage />} />
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
          onDownload={handleDownload}
        />
      )}
    </ToastProvider>
  );
};

export default App;
