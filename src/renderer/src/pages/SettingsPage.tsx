import React, { useState, useEffect } from 'react';
import { Settings, FolderOpen, Monitor } from 'lucide-react';

interface AppSettings {
  centralSkillsRoot: string;
  checkForUpdates: boolean;
  autoScanProjects: boolean;
  symlinkStrategy: 'symlink' | 'junction' | 'auto';
  theme: 'light' | 'dark' | 'system';
}

const SettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await window.api.settings.get();
      setSettings(data);
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (key: string, value: any) => {
    try {
      await window.api.settings.update({ [key]: value });
      await loadSettings();
    } catch (err) {
      console.error('Failed to update settings:', err);
    }
  };

  if (loading) {
    return <div className="text-center py-12">Loading settings...</div>;
  }

  if (!settings) {
    return <div className="text-center py-12">Failed to load settings</div>;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* General Settings */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Settings className="w-5 h-5" />
          General
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Skills Root Directory
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={settings.centralSkillsRoot}
                readOnly
                className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-300"
              />
              <button
                onClick={() => {
                  const newPath = prompt('Enter new skills root path:', settings.centralSkillsRoot);
                  if (newPath) {
                    handleUpdate('centralSkillsRoot', newPath);
                  }
                }}
                className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
              >
                <FolderOpen className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Symlink Strategy
            </label>
            <select
              value={settings.symlinkStrategy}
              onChange={(e) => handleUpdate('symlinkStrategy', e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-blue-500"
            >
              <option value="auto">Auto (Recommended)</option>
              <option value="symlink">Native Symlink</option>
              <option value="junction">Junction Point</option>
            </select>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-slate-300">Check for Updates</p>
              <p className="text-sm text-slate-500">Automatically check for app updates</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.checkForUpdates}
                onChange={(e) => handleUpdate('checkForUpdates', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-slate-300">Auto-scan Projects</p>
              <p className="text-sm text-slate-500">Automatically scan for new projects</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.autoScanProjects}
                onChange={(e) => handleUpdate('autoScanProjects', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>
      </div>

      {/* IDE Configuration */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Monitor className="w-5 h-5" />
          IDE Configuration
        </h3>
        <p className="text-sm text-slate-400">
          IDE configurations are automatically detected based on your system.
          Custom overrides will be supported in a future update.
        </p>
      </div>
    </div>
  );
};

export default SettingsPage;
