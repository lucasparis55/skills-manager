import React, { useState, useEffect } from 'react';
import { Settings, FolderOpen, Monitor, Github, Loader2, CheckCircle2, AlertCircle, Code2, XCircle } from 'lucide-react';
import FormDialog, { FormField } from '../components/ui/FormDialog';
import { useToast } from '../components/ui/Toast';

interface AppSettings {
  centralSkillsRoot: string;
  checkForUpdates: boolean;
  autoScanProjects: boolean;
  symlinkStrategy: 'symlink' | 'junction' | 'auto';
  theme: 'light' | 'dark' | 'system';
  hasGithubToken: boolean;
  ideRootOverrides?: Record<string, string>;
}

const SettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPathDialog, setShowPathDialog] = useState(false);
  const [testingToken, setTestingToken] = useState(false);
  const [savingToken, setSavingToken] = useState(false);
  const [githubTokenInput, setGithubTokenInput] = useState('');
  const [tokenTestResult, setTokenTestResult] = useState<'success' | 'error' | null>(null);
  const [ides, setIdes] = useState<any[]>([]);
  const [detectedRoots, setDetectedRoots] = useState<any[]>([]);
  const [ideRootInputs, setIdeRootInputs] = useState<Record<string, string>>({});
  const { toast } = useToast();

  useEffect(() => {
    loadSettings();
    loadIDEs();
  }, []);

  useEffect(() => {
    if (settings?.ideRootOverrides) {
      setIdeRootInputs(settings.ideRootOverrides);
    }
  }, [settings?.ideRootOverrides]);

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

  const loadIDEs = async () => {
    try {
      const [ideList, roots] = await Promise.all([
        window.api.ides.list(),
        window.api.ides.detectRoots(),
      ]);
      setIdes(ideList);
      setDetectedRoots(roots);
    } catch (err) {
      console.error('Failed to load IDE data:', err);
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

  const handlePathSubmit = async (values: Record<string, string>) => {
    try {
      await handleUpdate('centralSkillsRoot', values.centralSkillsRoot);
      toast({ title: 'Settings updated', description: 'Skills root path has been changed.', variant: 'success' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'error' });
    }
  };

  const handleTestToken = async () => {
    setTestingToken(true);
    setTokenTestResult(null);
    try {
      // Use analyze on a known public repo to test the token
      const parseResult = await window.api.githubImport.parseUrl('anthropics/skills');
      if (parseResult.error) {
        setTokenTestResult('error');
        toast({ title: 'Connection Failed', description: parseResult.message, variant: 'error' });
        return;
      }
      const analyzeResult = await window.api.githubImport.analyze(parseResult);
      if (analyzeResult.error) {
        setTokenTestResult('error');
        toast({ title: 'Connection Failed', description: analyzeResult.message, variant: 'error' });
      } else {
        setTokenTestResult('success');
        toast({ title: 'Connection OK', description: 'GitHub API is accessible.', variant: 'success' });
      }
    } catch (err: any) {
      setTokenTestResult('error');
      toast({ title: 'Connection Failed', description: err.message || 'Could not connect to GitHub API.', variant: 'error' });
    } finally {
      setTestingToken(false);
    }
  };

  const handleSaveToken = async () => {
    const token = githubTokenInput.trim();
    if (!token) {
      toast({ title: 'Missing token', description: 'Paste a GitHub token before saving.', variant: 'error' });
      return;
    }

    setSavingToken(true);
    try {
      await window.api.settings.setGithubToken(token);
      setGithubTokenInput('');
      setTokenTestResult(null);
      await loadSettings();
      toast({ title: 'Token saved', description: 'Stored securely on this device.', variant: 'success' });
    } catch (err: any) {
      toast({ title: 'Failed to save token', description: err.message || 'Could not store token securely.', variant: 'error' });
    } finally {
      setSavingToken(false);
    }
  };

  const handleClearToken = async () => {
    setSavingToken(true);
    try {
      await window.api.settings.clearGithubToken();
      setGithubTokenInput('');
      setTokenTestResult(null);
      await loadSettings();
      toast({ title: 'Token removed', description: 'Stored GitHub token was cleared.', variant: 'success' });
    } catch (err: any) {
      toast({ title: 'Failed to clear token', description: err.message || 'Could not clear token.', variant: 'error' });
    } finally {
      setSavingToken(false);
    }
  };

  if (loading) {
    return <div className="text-center py-12">Loading settings...</div>;
  }

  if (!settings) {
    return <div className="text-center py-12">Failed to load settings</div>;
  }

  const pathFields: FormField[] = [
    {
      name: 'centralSkillsRoot',
      label: 'Skills Root Path',
      defaultValue: settings.centralSkillsRoot,
      required: true,
    },
  ];

  return (
    <div className="space-y-6 max-w-2xl">
      {/* General Settings */}
      <div className="glass-panel p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Settings className="w-5 h-5" />
          General
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">
              Skills Root Directory
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={settings.centralSkillsRoot}
                readOnly
                className="flex-1 px-3 py-2 glass-input text-white/70"
              />
              <button
                onClick={() => setShowPathDialog(true)}
                className="p-2 glass hover:bg-white/[0.10] rounded-lg transition-colors"
              >
                <FolderOpen className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">
              Symlink Strategy
            </label>
            <select
              value={settings.symlinkStrategy}
              onChange={(e) => handleUpdate('symlinkStrategy', e.target.value)}
              className="w-full px-3 py-2 glass-input focus:outline-none focus:border-blue-500"
            >
              <option value="auto">Auto (Recommended)</option>
              <option value="symlink">Native Symlink</option>
              <option value="junction">Junction Point</option>
            </select>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-white/70">Check for Updates</p>
              <p className="text-sm text-white/40">Automatically check for app updates</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.checkForUpdates}
                onChange={(e) => handleUpdate('checkForUpdates', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-white/30 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-white/70">Auto-scan Projects</p>
              <p className="text-sm text-white/40">Automatically scan for new projects</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.autoScanProjects}
                onChange={(e) => handleUpdate('autoScanProjects', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-white/30 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
            </label>
          </div>
        </div>
      </div>

      {/* IDE Configuration */}
      <div className="glass-panel p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Monitor className="w-5 h-5" />
          IDE Configuration
        </h3>
        <div className="space-y-3">
          {ides.map((ide) => {
            const roots = detectedRoots.filter((r) => r.ideId === ide.id);
            const primaryRoots = roots.filter((r) => r.isPrimary);
            const secondaryRoots = roots.filter((r) => !r.isPrimary);
            const overrideValue = ideRootInputs[ide.id] || '';
            const hasOverride = !!settings?.ideRootOverrides?.[ide.id];

            return (
              <div key={ide.id} className="glass-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Code2 className="w-4 h-4 text-white/60" />
                    <span className="font-medium text-white">{ide.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-white/50 uppercase">{ide.configFormat}</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-white/50 capitalize">{ide.mode}</span>
                  </div>
                </div>

                <div className="space-y-1.5 mb-4">
                  {primaryRoots.length > 0 && (
                    <div className="text-xs font-medium text-white/40 mb-1">Primary Roots</div>
                  )}
                  {primaryRoots.map((root) => (
                    <div key={root.root} className="flex items-center gap-2 text-sm">
                      {root.exists ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-white/20 shrink-0" />
                      )}
                      <span className={root.exists ? 'text-white/70 truncate' : 'text-white/30 truncate'} title={root.root}>
                        {root.root}
                      </span>
                    </div>
                  ))}
                  {secondaryRoots.length > 0 && (
                    <div className="text-xs font-medium text-white/40 mt-2 mb-1">Secondary Roots</div>
                  )}
                  {secondaryRoots.map((root) => (
                    <div key={root.root} className="flex items-center gap-2 text-sm">
                      {root.exists ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-white/20 shrink-0" />
                      )}
                      <span className={root.exists ? 'text-white/70 truncate' : 'text-white/30 truncate'} title={root.root}>
                        {root.root}
                      </span>
                    </div>
                  ))}
                </div>

                <div>
                  <label className="block text-xs font-medium text-white/50 mb-1.5">Custom Global Root Override</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={overrideValue}
                      onChange={(e) => setIdeRootInputs((prev) => ({ ...prev, [ide.id]: e.target.value }))}
                      placeholder="Override path (optional)"
                      className="flex-1 px-3 py-1.5 glass-input text-sm text-white placeholder:text-white/30"
                    />
                    <button
                      onClick={async () => {
                        const nextOverrides = { ...(settings?.ideRootOverrides || {}), [ide.id]: overrideValue };
                        await handleUpdate('ideRootOverrides', nextOverrides);
                        toast({ title: 'Override saved', description: `${ide.name} global root updated.`, variant: 'success' });
                      }}
                      className="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 rounded-lg text-xs text-white transition-colors"
                    >
                      Save Override
                    </button>
                    {hasOverride && (
                      <button
                        onClick={async () => {
                          const nextOverrides = { ...(settings?.ideRootOverrides || {}) };
                          delete nextOverrides[ide.id];
                          await handleUpdate('ideRootOverrides', nextOverrides);
                          toast({ title: 'Override cleared', description: `${ide.name} using default root.`, variant: 'success' });
                        }}
                        className="px-3 py-1.5 glass hover:bg-white/[0.10] rounded-lg text-xs text-white/70 transition-colors"
                      >
                        Clear Override
                      </button>
                    )}
                  </div>
                  {hasOverride && (
                    <p className="text-xs text-amber-400/80 mt-1.5">
                      Override active: {settings!.ideRootOverrides![ide.id]}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* GitHub Integration */}
      <div className="glass-panel p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Github className="w-5 h-5" />
          GitHub Integration
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">
              GitHub Personal Access Token
            </label>
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={githubTokenInput}
                onChange={(e) => {
                  setGithubTokenInput(e.target.value);
                  setTokenTestResult(null);
                }}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                className="flex-1 px-3 py-2 glass-input text-white placeholder:text-white/35 focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={handleSaveToken}
                disabled={savingToken}
                className="flex items-center gap-2 px-3 py-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 rounded-lg transition-colors text-sm text-white"
              >
                {savingToken ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Save
              </button>
              {settings.hasGithubToken ? (
                <button
                  onClick={handleClearToken}
                  disabled={savingToken}
                  className="px-3 py-2 glass hover:bg-white/[0.10] disabled:opacity-50 rounded-lg transition-colors text-sm text-white/70"
                >
                  Clear
                </button>
              ) : null}
              <button
                onClick={handleTestToken}
                disabled={testingToken}
                className="flex items-center gap-2 px-3 py-2 glass hover:bg-white/[0.10] disabled:opacity-50 rounded-lg transition-colors text-sm text-white/70"
              >
                {testingToken ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : tokenTestResult === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                ) : tokenTestResult === 'error' ? (
                  <AlertCircle className="w-4 h-4 text-red-400" />
                ) : null}
                Test
              </button>
            </div>
            {settings.hasGithubToken ? (
              <p className="text-xs text-emerald-400 mt-2">A GitHub token is currently stored securely.</p>
            ) : (
              <p className="text-xs text-white/40 mt-2">No GitHub token is currently stored.</p>
            )}
            <p className="text-xs text-white/40 mt-2">
              Optional. Without a token: 60 API requests/hour. With a token: 5,000 requests/hour.
              Also enables access to private repositories.
            </p>
            <p className="text-xs text-white/40 mt-1">
              Create a token at GitHub Settings &gt; Developer settings &gt; Personal access tokens.
              No special scopes required for public repos.
            </p>
          </div>
        </div>
      </div>

      <FormDialog
        open={showPathDialog}
        onOpenChange={setShowPathDialog}
        title="Change Skills Root Path"
        description="Update the root directory where skills are stored."
        fields={pathFields}
        onSubmit={handlePathSubmit}
        submitLabel="Update"
      />
    </div>
  );
};

export default SettingsPage;
