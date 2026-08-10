import React, { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle2, FolderGit2, FolderOpen, Link, Plus, RefreshCw, Target } from 'lucide-react';
import FormDialog, { FormField } from '../components/ui/FormDialog';
import { useToast } from '../components/ui/Toast';

const scanProjectFields = (defaultPath: string, defaultDepth: string): FormField[] => [
  {
    name: 'path',
    label: 'Start Folder',
    placeholder: 'C:\\Users\\...',
    defaultValue: defaultPath,
    required: true,
    actionButton: {
      icon: FolderOpen,
      tooltip: 'Browse for start directory',
      onClick: async () => {
        const selectedPath = await window.api.dialog.selectFolder();
        return selectedPath || undefined;
      },
    },
  },
  {
    name: 'depth',
    label: 'Scan Depth',
    type: 'select',
    defaultValue: defaultDepth,
    options: [
      { label: '1 — Only the selected folder', value: '1' },
      { label: '2 — Selected folder + 1 sublevel', value: '2' },
      { label: '3 — Selected folder + 2 sublevels', value: '3' },
      { label: '4 — Selected folder + 3 sublevels', value: '4' },
      { label: '5 — Selected folder + 4 sublevels', value: '5' },
    ],
  },
];

const createSkillFields: FormField[] = [
  { name: 'name', label: 'Skill Name', placeholder: 'e.g., my-skill', required: true },
  { name: 'displayName', label: 'Display Name', placeholder: 'My Skill' },
  { name: 'description', label: 'Description', placeholder: 'What this skill does...' },
];

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState({ skills: 0, projects: 0, links: 0, warnings: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showScanDialog, setShowScanDialog] = useState(false);
  const [scanDefaults, setScanDefaults] = useState<{ path: string; depth: string }>({ path: '', depth: '2' });
  const { toast } = useToast();

  const loadStats = async () => {
    setError(null);
    try {
      const [skills, projects, links] = await Promise.all([
        window.api.skills.list(),
        window.api.projects.list(),
        window.api.links.list(),
      ]);

      const linkList = links ?? [];
      setStats({
        skills: skills?.length || 0,
        projects: projects?.length || 0,
        links: linkList.filter((l: any) => l.status === 'linked').length,
        warnings: linkList.filter(
          (l: any) => l.status === 'broken' || l.status === 'conflict',
        ).length,
      });
    } catch (err) {
      console.error('Failed to load stats:', err);
      setError(err instanceof Error ? err.message : 'Workspace data could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
    loadScanDefaults();
  }, []);

  const loadScanDefaults = async () => {
    try {
      const settings = await window.api.settings.get();
      const defaultPath = settings.lastProjectScanPath || '';
      const defaultDepth = String(settings.projectScanDepth ?? 2);
      setScanDefaults({ path: defaultPath, depth: defaultDepth });
    } catch {
      // ignore
    }
  };

  const handleCreateSkill = async (values: Record<string, string>) => {
    try {
      const name = values.name;
      const displayName = values.displayName || name;
      const description = values.description || '';

      await window.api.skills.create({
        name,
        displayName,
        description,
        version: '1.0.0',
        format: 'folder',
        targetIDEs: [],
        tags: [],
      });

      await loadStats();
      toast({ title: 'Skill created', description: `"${displayName}" has been created.`, variant: 'success' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'error' });
    }
  };

  const handleScanSubmit = async (values: Record<string, string>) => {
    try {
      const rootPath = values.path;
      const maxDepth = parseInt(values.depth || '2', 10);
      const projects = await window.api.projects.scan(rootPath, maxDepth);
      await window.api.settings.update({ lastProjectScanPath: rootPath, projectScanDepth: maxDepth });
      setScanDefaults({ path: rootPath, depth: String(maxDepth) });
      await loadStats();
      toast({
        title: 'Scan Complete',
        description: `Found ${projects?.length || 0} projects.`,
        variant: 'info',
      });
      setShowScanDialog(false);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'error' });
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-screen-2xl space-y-5" aria-busy="true" aria-label="Loading workspace overview">
        <div className="space-y-2">
          <div className="h-3 w-20 animate-pulse rounded bg-white/[0.08]" />
          <div className="h-8 w-64 max-w-full animate-pulse rounded bg-white/[0.08]" />
          <div className="h-4 w-96 max-w-full animate-pulse rounded bg-white/[0.05]" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-xl border border-white/[0.06] bg-white/[0.03]" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-6 py-14 text-center" role="alert">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-400/10 text-amber-300">
          <AlertTriangle className="h-6 w-6" aria-hidden="true" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-white">Could not load workspace overview</h2>
        <p className="mt-2 max-w-md text-sm text-white/55">{error}</p>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void loadStats();
          }}
          className="mt-5 flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-screen-2xl space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between" aria-labelledby="dashboard-overview-title">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-blue-300/75">Overview</p>
          <h2 id="dashboard-overview-title" className="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Your skills workspace</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">Keep reusable instructions organized, connected to your tools, and ready for the next project.</p>
        </div>
        <div className="flex w-fit items-center gap-2 rounded-full border border-emerald-400/15 bg-emerald-400/[0.06] px-3 py-1.5 text-xs text-emerald-200/80">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          Workspace ready
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Workspace summary">
        <StatCard
          icon={Target}
          label="Skills"
          value={stats.skills}
          color="blue"
        />
        <StatCard
          icon={FolderGit2}
          label="Projects"
          value={stats.projects}
          color="green"
        />
        <StatCard
          icon={Link}
          label="Active Links"
          value={stats.links}
          color="sky"
        />
        <StatCard
          icon={AlertTriangle}
          label="Warnings"
          value={stats.warnings}
          color="yellow"
        />
      </section>

      <section className="glass-panel p-4 sm:p-5" aria-labelledby="quick-actions-title">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="quick-actions-title" className="text-lg font-semibold text-white">Quick actions</h2>
            <p className="mt-1 text-sm text-white/45">Start with the two tasks you use most often.</p>
          </div>
          <span className="hidden text-xs font-medium uppercase tracking-[0.16em] text-white/30 sm:block">Start here</span>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setShowCreateDialog(true)}
            className="flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Create Skill
          </button>
          <button
            type="button"
            onClick={() => setShowScanDialog(true)}
            className="flex min-h-10 items-center justify-center gap-2 rounded-lg border border-white/[0.12] bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
          >
            <FolderOpen className="h-4 w-4" aria-hidden="true" />
            Scan Projects
          </button>
        </div>
      </section>

      <section className="glass-panel p-4 sm:p-5" aria-labelledby="ide-status-title">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 id="ide-status-title" className="text-lg font-semibold text-white">IDE status</h2>
            <p className="mt-1 text-sm text-white/45">See which tools are ready to receive your skills.</p>
          </div>
        </div>
        <IDEHealthCheck />
      </section>

      <FormDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        title="Create New Skill"
        description="Add a new skill to your collection."
        fields={createSkillFields}
        onSubmit={handleCreateSkill}
        submitLabel="Create"
      />

      <FormDialog
        open={showScanDialog}
        onOpenChange={setShowScanDialog}
        title="Scan Projects"
        description="Choose a folder and how deep to search for projects."
        fields={scanProjectFields(scanDefaults.path, scanDefaults.depth)}
        onSubmit={handleScanSubmit}
        submitLabel="Scan"
      />
    </div>
  );
};

const StatCard: React.FC<{
  icon: React.ElementType;
  label: string;
  value: number;
  color: string;
}> = ({ icon: Icon, label, value, color }) => {
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-400/10 text-blue-200 ring-blue-300/20',
    green: 'bg-emerald-400/10 text-emerald-200 ring-emerald-300/20',
    sky: 'bg-sky-400/10 text-sky-200 ring-sky-300/20',
    yellow: 'bg-amber-400/10 text-amber-200 ring-amber-300/20',
  };

  return (
    <article className="glass-card group p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ring-1 ring-inset ${colorClasses[color]}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <span className="text-3xl font-semibold tracking-tight text-white">{value}</span>
      </div>
      <p className="mt-4 text-sm font-medium text-white/75">{label}</p>
      <p className="mt-1 text-xs text-white/40">Updated from your local workspace</p>
    </article>
  );
};

const IDEHealthCheck: React.FC = () => {
  const [ides, setIdes] = useState<any[]>([]);
  const [roots, setRoots] = useState<any[]>([]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [idesList, rootsList] = await Promise.all([
          window.api.ides.list(),
          window.api.ides.detectRoots(),
        ]);
        setIdes(idesList || []);
        setRoots(rootsList || []);
      } catch {
        // Ignore
      }
    };
    loadData();
  }, []);

  return (
    <div className="space-y-3">
      {ides.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/[0.12] bg-white/[0.02] px-4 py-6 text-center" role="status">
          <p className="text-sm font-medium text-white/70">No IDEs detected yet</p>
          <p className="mt-1 text-xs text-white/40">Add a supported tool or scan again to see its status here.</p>
        </div>
      ) : ides.map((ide) => {
        const ideRoots = roots.filter(r => r.ideId === ide.id);
        const hasExisting = ideRoots.some(r => r.exists);

        return (
          <div key={ide.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.08] bg-white/[0.025] p-3">
            <span className="min-w-0 truncate font-medium text-white/80">{ide.name}</span>
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${hasExisting ? 'bg-emerald-300' : 'bg-white/20'}`} aria-hidden="true" />
              <span className={`text-xs font-medium ${hasExisting ? 'text-emerald-200' : 'text-white/45'}`}>
                {hasExisting ? 'Detected' : 'Not found'}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default Dashboard;
