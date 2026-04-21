import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Sidebar from './components/layout/Sidebar';
import Header from './components/layout/Header';
import StatusBar from './components/layout/StatusBar';
import Dashboard from './pages/Dashboard';
import SkillsPage from './pages/SkillsPage';
import ProjectsPage from './pages/ProjectsPage';
import LinksPage from './pages/LinksPage';
import SettingsPage from './pages/SettingsPage';
import { ToastProvider } from './components/ui/Toast';

const App: React.FC = () => {
  return (
    <ToastProvider>
      <div className="flex h-screen w-screen bg-black text-white">
        <Sidebar />
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
          <StatusBar />
        </div>
      </div>
    </ToastProvider>
  );
};

export default App;
