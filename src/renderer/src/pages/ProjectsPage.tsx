import React, { useState, useEffect, useMemo } from 'react';
import { FolderGit2, Plus, Scan, Trash2, CheckCircle, FolderOpen, Search, Filter, X, ChevronDown, Check, CircleAlert, GitBranch } from 'lucide-react';
import * as SelectPrimitive from '@radix-ui/react-select';
import FormDialog, { FormField } from '../components/ui/FormDialog';
import ConfirmDialog from '../components/ui/ConfirmDialog';
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

interface Project {
  id: string;
  name: string;
  path: string;
  detectedIDEs: string[];
  addedAt: string;
  metadata?: { hasGit?: boolean };
}

const addProjectFields: FormField[] = [
  { 
    name: 'path', 
    label: 'Project Path', 
    placeholder: 'C:\\Users\\...\\my-project', 
    required: true,
    actionButton: {
      icon: FolderOpen,
      tooltip: 'Browse for project directory',
      onClick: async () => {
        const selectedPath = await window.api.dialog.selectFolder();
        return selectedPath || undefined;
      },
    },
  },
];

const ProjectsPage: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showScanDialog, setShowScanDialog] = useState(false);
  const [scanDefaults, setScanDefaults] = useState<{ path: string; depth: string }>({ path: '', depth: '2' });
  const [confirmState, setConfirmState] = useState<{ project: Project } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkRemoving, setBulkRemoving] = useState(false);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterIde, setFilterIde] = useState('__all__');
  const [filterRepository, setFilterRepository] = useState('__all__');
  const { toast } = useToast();

  useEffect(() => {
    loadProjects();
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

  const loadProjects = async () => {
    try {
      const data = await window.api.projects.list();
      setProjects(data || []);
    } catch (err) {
      console.error('Failed to load projects:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddProject = async (values: Record<string, string>) => {
    try {
      await window.api.projects.add(values.path);
      await loadProjects();
      toast({ title: 'Project added', description: `"${values.path}" has been added.`, variant: 'success' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'error' });
    }
  };

  const handleScanSubmit = async (values: Record<string, string>) => {
    try {
      const rootPath = values.path;
      const maxDepth = parseInt(values.depth || '2', 10);
      const result = await window.api.projects.scan(rootPath, maxDepth);
      await window.api.settings.update({ lastProjectScanPath: rootPath, projectScanDepth: maxDepth });
      setScanDefaults({ path: rootPath, depth: String(maxDepth) });
      await loadProjects();
      toast({
        title: 'Scan Complete',
        description: `Found ${result?.length || 0} projects.`,
        variant: 'info',
      });
      setShowScanDialog(false);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'error' });
    }
  };

  const handleRemoveProject = async (project: Project) => {
    try {
      await window.api.projects.remove(project.id);
      await loadProjects();
      setConfirmState(null);
      setSelectedIds(prev => {
        if (!prev.has(project.id)) {
          return prev;
        }
        const next = new Set(prev);
        next.delete(project.id);
        return next;
      });
      toast({ title: 'Project removed', description: `"${project.name}" has been removed.`, variant: 'success' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'error' });
    }
  };

  const filteredProjects = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase();

    return projects.filter(project => {
      if (filterIde === '__none__' && project.detectedIDEs.length > 0) return false;
      if (filterIde !== '__all__' && filterIde !== '__none__' && !project.detectedIDEs.includes(filterIde)) return false;
      if (filterRepository === 'git' && !project.metadata?.hasGit) return false;
      if (filterRepository === 'no-git' && project.metadata?.hasGit) return false;

      if (normalizedQuery) {
        const searchableText = [project.name, project.path, ...project.detectedIDEs].join(' ').toLocaleLowerCase();
        if (!searchableText.includes(normalizedQuery)) return false;
      }

      return true;
    });
  }, [projects, searchQuery, filterIde, filterRepository]);

  const availableIdes = useMemo(
    () => Array.from(new Set(projects.flatMap(project => project.detectedIDEs))).sort(),
    [projects],
  );

  const ideReadyCount = projects.filter(project => project.detectedIDEs.length > 0).length;
  const needsSetupCount = projects.length - ideReadyCount;
  const gitCount = projects.filter(project => project.metadata?.hasGit).length;
  const hasActiveFilters = searchQuery.trim() !== '' || filterIde !== '__all__' || filterRepository !== '__all__';

  useEffect(() => {
    const visibleIds = new Set(filteredProjects.map(project => project.id));
    setSelectedIds(previous => {
      const next = new Set(Array.from(previous).filter(id => visibleIds.has(id)));
      return next.size === previous.size ? previous : next;
    });
  }, [filteredProjects]);

  const clearAllFilters = () => {
    setSearchQuery('');
    setFilterIde('__all__');
    setFilterRepository('__all__');
  };

  const selectedVisibleCount = filteredProjects.filter(project => selectedIds.has(project.id)).length;

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(filteredProjects.map(project => project.id)));
  const deselectAll = () => setSelectedIds(new Set());
  const toggleSelectAll = () => {
    if (selectedVisibleCount === filteredProjects.length && filteredProjects.length > 0) {
      deselectAll();
    } else {
      selectAll();
    }
  };

  const handleBulkRemoveProjects = async () => {
    try {
      setBulkRemoving(true);
      const ids = Array.from(selectedIds);
      const results = await Promise.all(
        ids.map(async id => {
          try {
            await window.api.projects.remove(id);
            return { id, success: true };
          } catch {
            return { id, success: false };
          }
        }),
      );

      await loadProjects();
      setSelectedIds(new Set());
      setShowBulkConfirm(false);

      const succeeded = results.filter(result => result.success).length;
      const failed = results.filter(result => !result.success).length;

      if (failed === 0) {
        toast({
          title: 'Projects removed',
          description: `${succeeded} project${succeeded !== 1 ? 's' : ''} removed successfully.`,
          variant: 'success',
        });
      } else {
        toast({
          title: 'Partial removal',
          description: `${succeeded} removed, ${failed} failed.`,
          variant: 'warning',
        });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'error' });
    } finally {
      setBulkRemoving(false);
    }
  };

  if (loading) return <ProjectsPageSkeleton />;

  return (
    <div className="mx-auto max-w-screen-2xl space-y-5">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between" aria-labelledby="projects-overview-title">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h3 id="projects-overview-title" className="text-xl font-semibold text-white">
              {hasActiveFilters ? `${filteredProjects.length} of ${projects.length} Projects` : `${projects.length} Projects`}
            </h3>
            {projects.length > 0 && (
              <div className="flex items-center gap-3 text-xs" aria-label="Project readiness summary">
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  {ideReadyCount} IDE-ready
                </span>
                <span className={needsSetupCount > 0 ? 'flex items-center gap-1.5 text-amber-400' : 'flex items-center gap-1.5 text-white/45'}>
                  <span className={`h-1.5 w-1.5 rounded-full ${needsSetupCount > 0 ? 'bg-amber-400' : 'bg-white/30'}`} />
                  {needsSetupCount} needs setup
                </span>
              </div>
            )}
          </div>
          <p className="mt-1 text-sm text-white/45">Manage project locations and see which development tools are available in each workspace.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowScanDialog(true)}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <Scan className="w-4 h-4" />
            Scan
          </button>
          <button
            onClick={() => setShowAddDialog(true)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          >
            <Plus className="w-4 h-4" />
            Add Project
          </button>
        </div>
      </section>

      {projects.length > 0 && (
        <section className="glass-panel p-3" aria-label="Find and filter projects">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" aria-hidden="true" />
              <input
                type="search"
                aria-label="Search projects"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search by project, path, or IDE"
                className="glass-input h-10 w-full pl-9 pr-3 text-sm focus-visible:ring-2 focus-visible:ring-blue-500/40"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Filter className="hidden h-4 w-4 text-white/35 sm:block" aria-hidden="true" />

              <SelectPrimitive.Root value={filterIde} onValueChange={setFilterIde}>
                <SelectPrimitive.Trigger aria-label="Filter by IDE" className="glass-input flex h-10 min-w-40 items-center justify-between gap-2 px-3 text-sm text-white/80 focus-visible:ring-2 focus-visible:ring-blue-500/40">
                  <SelectPrimitive.Value />
                  <SelectPrimitive.Icon><ChevronDown className="h-4 w-4 text-white/45" /></SelectPrimitive.Icon>
                </SelectPrimitive.Trigger>
                <SelectPrimitive.Portal>
                  <SelectPrimitive.Content className="glass-dialog z-50 max-h-60 overflow-auto rounded-lg border-white/[0.08] shadow-xl">
                    <SelectPrimitive.Viewport>
                      <ProjectFilterItem value="__all__">All IDEs ({projects.length})</ProjectFilterItem>
                      {availableIdes.map(ide => (
                        <ProjectFilterItem key={ide} value={ide}>
                          {ide} ({projects.filter(project => project.detectedIDEs.includes(ide)).length})
                        </ProjectFilterItem>
                      ))}
                      <ProjectFilterItem value="__none__">No IDE detected ({needsSetupCount})</ProjectFilterItem>
                    </SelectPrimitive.Viewport>
                  </SelectPrimitive.Content>
                </SelectPrimitive.Portal>
              </SelectPrimitive.Root>

              <SelectPrimitive.Root value={filterRepository} onValueChange={setFilterRepository}>
                <SelectPrimitive.Trigger aria-label="Filter by repository" className="glass-input flex h-10 min-w-44 items-center justify-between gap-2 px-3 text-sm text-white/80 focus-visible:ring-2 focus-visible:ring-blue-500/40">
                  <SelectPrimitive.Value />
                  <SelectPrimitive.Icon><ChevronDown className="h-4 w-4 text-white/45" /></SelectPrimitive.Icon>
                </SelectPrimitive.Trigger>
                <SelectPrimitive.Portal>
                  <SelectPrimitive.Content className="glass-dialog z-50 overflow-hidden rounded-lg border-white/[0.08] shadow-xl">
                    <SelectPrimitive.Viewport>
                      <ProjectFilterItem value="__all__">All repositories ({projects.length})</ProjectFilterItem>
                      <ProjectFilterItem value="git">Git repository ({gitCount})</ProjectFilterItem>
                      <ProjectFilterItem value="no-git">Without Git ({projects.length - gitCount})</ProjectFilterItem>
                    </SelectPrimitive.Viewport>
                  </SelectPrimitive.Content>
                </SelectPrimitive.Portal>
              </SelectPrimitive.Root>

              {hasActiveFilters && (
                <button onClick={clearAllFilters} className="flex h-10 items-center gap-1.5 px-2 text-sm text-white/50 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                  <X className="h-3.5 w-3.5" /> Clear
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3" role="status">
          <span className="text-sm font-medium text-blue-100">{selectedIds.size} project{selectedIds.size !== 1 ? 's' : ''} selected</span>
          <div className="flex items-center gap-3">
            <button onClick={deselectAll} className="text-sm text-white/60 hover:text-white">Clear selection</button>
            <button
              onClick={() => setShowBulkConfirm(true)}
              disabled={bulkRemoving}
              className="flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium transition-colors hover:bg-red-500 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Remove Selected
            </button>
          </div>
        </div>
      )}

      {filteredProjects.length === 0 ? (
        projects.length === 0 ? (
        <div className="glass-panel flex flex-col items-center px-6 py-16 text-center" role="status">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400"><FolderGit2 className="h-6 w-6" /></div>
          <h3 className="text-lg font-semibold text-white">No Projects Yet</h3>
          <p className="mb-5 mt-2 max-w-md text-sm text-white/50">Add a project directly or scan a folder to discover multiple workspaces automatically.</p>
          <button
            onClick={() => setShowAddDialog(true)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold transition-colors hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            Add your first project
          </button>
        </div>
        ) : (
          <div className="glass-panel flex flex-col items-center px-6 py-14 text-center" role="status">
            <Search className="mb-4 h-8 w-8 text-white/30" />
            <h3 className="text-lg font-semibold text-white">No Matching Projects</h3>
            <p className="mb-4 mt-1 text-sm text-white/45">Try another search or remove some filters.</p>
            <button onClick={clearAllFilters} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white">
              Clear all filters
            </button>
          </div>
        )
      ) : (
        <section className="glass-panel overflow-hidden" aria-label="Projects list">
          <div className="flex min-h-11 items-center gap-4 border-b border-white/[0.08] bg-white/[0.025] px-4 text-xs font-medium uppercase tracking-wide text-white/35">
            <label className="flex cursor-pointer items-center gap-3 normal-case tracking-normal">
              <input
                type="checkbox"
                checked={selectedVisibleCount === filteredProjects.length && filteredProjects.length > 0}
                ref={(el) => {
                  if (el) {
                    el.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < filteredProjects.length;
                  }
                }}
                onChange={toggleSelectAll}
                className="h-4 w-4 accent-blue-500"
              />
              <span className="whitespace-nowrap text-xs text-white/45">
                {selectedVisibleCount > 0 ? `${selectedVisibleCount} of ${filteredProjects.length} selected` : 'Select all'}
              </span>
            </label>
            <span className="ml-auto hidden lg:block lg:w-64">Detected IDEs</span>
            <span className="hidden md:block md:w-24">Repository</span>
            <span className="hidden xl:block xl:w-28">Added</span>
            <span className="w-12 text-right">Actions</span>
          </div>
          <div className="divide-y divide-white/[0.06]">
            {filteredProjects.map((project) => (
              <ProjectRow
                key={project.id}
                project={project}
                onRemove={(item) => setConfirmState({ project: item })}
                selected={selectedIds.has(project.id)}
                onToggleSelect={() => toggleSelection(project.id)}
              />
            ))}
          </div>
        </section>
      )}

      <FormDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        title="Add Project"
        description="Enter the path to a project directory."
        fields={addProjectFields}
        onSubmit={handleAddProject}
        submitLabel="Add"
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

      {confirmState && (
        <ConfirmDialog
          open={true}
          onOpenChange={(open) => { if (!open) setConfirmState(null); }}
          title="Remove Project"
          description={`Are you sure you want to remove "${confirmState.project.name}"? This cannot be undone.`}
          onConfirm={() => handleRemoveProject(confirmState.project)}
          confirmLabel="Remove"
          variant="danger"
        />
      )}

      {showBulkConfirm && (
        <ConfirmDialog
          open={true}
          onOpenChange={(open) => {
            if (!open && !bulkRemoving) {
              setShowBulkConfirm(false);
            }
          }}
          title={`Remove ${selectedIds.size} Projects`}
          description={`Are you sure you want to remove ${selectedIds.size} project${selectedIds.size !== 1 ? 's' : ''}? This cannot be undone.`}
          onConfirm={handleBulkRemoveProjects}
          confirmLabel={bulkRemoving ? 'Removing...' : 'Remove'}
          variant="danger"
        />
      )}
    </div>
  );
};

const ideColors: Record<string, string> = {
  'claude-code': 'bg-purple-500/20 text-purple-400',
  'cursor': 'bg-blue-500/20 text-blue-400',
  'opencode': 'bg-green-500/20 text-green-400',
  'codex-cli': 'bg-yellow-500/20 text-yellow-400',
  'codex-desktop': 'bg-white/[0.08] text-white/65',
  'kimi-cli': 'bg-red-500/20 text-red-400',
};

const ProjectRow: React.FC<{
  project: Project;
  onRemove: (project: Project) => void;
  selected?: boolean;
  onToggleSelect?: () => void;
}> = ({ project, onRemove, selected = false, onToggleSelect }) => {
  return (
    <div className={`group flex min-h-16 items-center gap-4 px-4 py-3 transition-colors hover:bg-white/[0.025] ${selected ? 'bg-blue-500/[0.08]' : ''}`}>
      {onToggleSelect && (
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          aria-label={`Select ${project.name}`}
          className="h-4 w-4 flex-shrink-0 accent-blue-500"
        />
      )}

      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="hidden h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-white/35 xl:flex">
          <FolderGit2 className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h4 className="truncate text-sm font-semibold text-white">{project.name}</h4>
          <p className="mt-1 truncate font-mono text-xs text-white/35" title={project.path}>{project.path}</p>
          <div className="mt-1 flex flex-wrap gap-1.5 lg:hidden">
            {project.detectedIDEs.length > 0 ? project.detectedIDEs.map(ide => (
              <span key={ide} className={`rounded px-1.5 py-0.5 text-xs ${ideColors[ide] || 'bg-white/[0.08] text-white/65'}`}>{ide}</span>
            )) : <span className="text-xs text-amber-400/80">No IDE detected</span>}
          </div>
        </div>
      </div>

      <div className="hidden w-64 flex-wrap items-center gap-1.5 lg:flex">
        {project.detectedIDEs.length > 0 ? project.detectedIDEs.map(ide => (
          <span key={ide} className={`rounded px-2 py-1 text-xs ${ideColors[ide] || 'bg-white/[0.08] text-white/65'}`}>{ide}</span>
        )) : (
          <span className="flex items-center gap-1.5 text-xs text-amber-400/80"><CircleAlert className="h-3.5 w-3.5" />Not detected</span>
        )}
      </div>

      <div className="hidden w-24 items-center gap-1.5 md:flex">
        {project.metadata?.hasGit ? (
          <><CheckCircle className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" /><span className="text-xs font-medium text-emerald-400">Git</span></>
        ) : (
          <><GitBranch className="h-3.5 w-3.5 text-white/25" aria-hidden="true" /><span className="text-xs text-white/35">No Git</span></>
        )}
      </div>

      <div className="hidden w-28 xl:block">
        <span className="text-xs text-white/35">{new Date(project.addedAt).toLocaleDateString()}</span>
      </div>

      <div className="flex w-12 flex-shrink-0 justify-end">
        <button
          onClick={() => onRemove(project)}
          className="rounded-md p-2 text-white/30 transition-colors hover:bg-red-500/10 hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
          aria-label={`Remove ${project.name}`}
          title="Remove project"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

const ProjectFilterItem: React.FC<React.PropsWithChildren<{ value: string }>> = ({ value, children }) => (
  <SelectPrimitive.Item value={value} className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-white/80 outline-none data-[highlighted]:bg-white/[0.08]">
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    <SelectPrimitive.ItemIndicator><Check className="h-4 w-4 text-blue-400" /></SelectPrimitive.ItemIndicator>
  </SelectPrimitive.Item>
);

const ProjectsPageSkeleton: React.FC = () => (
  <div className="mx-auto max-w-screen-2xl space-y-5" aria-busy="true" aria-label="Loading projects">
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-2">
        <div className="h-6 w-32 animate-pulse rounded bg-white/[0.08]" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded bg-white/[0.05]" />
      </div>
      <div className="h-10 w-36 animate-pulse rounded-lg bg-white/[0.08]" />
    </div>
    <div className="h-16 animate-pulse rounded-xl border border-white/[0.06] bg-white/[0.03]" />
    <div className="space-y-px overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.03]">
      {Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-16 animate-pulse border-b border-white/[0.04] bg-white/[0.015]" />)}
    </div>
  </div>
);

export default ProjectsPage;
