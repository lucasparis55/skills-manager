import React, { useState, useEffect } from 'react';
import { FolderGit2, Plus, Scan, Trash2, CheckCircle, FolderOpen } from 'lucide-react';
import FormDialog, { FormField } from '../components/ui/FormDialog';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { useToast } from '../components/ui/Toast';

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
  const [confirmState, setConfirmState] = useState<{ project: Project } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkRemoving, setBulkRemoving] = useState(false);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadProjects();
  }, []);

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

  const handleScanProjects = async () => {
    try {
      const result = await window.api.projects.scan();
      await loadProjects();
      toast({
        title: 'Scan Complete',
        description: `Found ${result?.length || 0} projects.`,
        variant: 'info',
      });
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

  const selectedVisibleCount = projects.filter(project => selectedIds.has(project.id)).length;

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

  const selectAll = () => setSelectedIds(new Set(projects.map(project => project.id)));
  const deselectAll = () => setSelectedIds(new Set());
  const toggleSelectAll = () => {
    if (selectedVisibleCount === projects.length && projects.length > 0) {
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

  if (loading) {
    return <div className="text-center py-12">Loading projects...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">{projects.length} Projects</h3>
        <div className="flex gap-2">
          <button
            onClick={handleScanProjects}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
          >
            <Scan className="w-4 h-4" />
            Scan
          </button>
          <button
            onClick={() => setShowAddDialog(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Project
          </button>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 border border-slate-700 rounded-lg bg-slate-800/50 p-3">
          <span className="text-sm text-slate-400">{selectedIds.size} selected</span>
          <button
            onClick={() => setShowBulkConfirm(true)}
            disabled={bulkRemoving}
            className="flex items-center gap-2 px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg text-sm transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Remove Selected
          </button>
        </div>
      )}

      {/* Projects Grid */}
      {projects.length === 0 ? (
        <div className="text-center py-12 bg-slate-800 rounded-lg border border-slate-700">
          <FolderGit2 className="w-12 h-12 mx-auto text-slate-500 mb-4" />
          <p className="text-slate-400 mb-4">No projects added yet</p>
          <button
            onClick={() => setShowAddDialog(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            Add your first project
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="col-span-full flex items-center gap-3 px-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedVisibleCount === projects.length && projects.length > 0}
                ref={(el) => {
                  if (el) {
                    el.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < projects.length;
                  }
                }}
                onChange={toggleSelectAll}
                className="accent-blue-500 w-4 h-4"
              />
              <span className="text-sm text-slate-400">
                {selectedVisibleCount > 0 ? `${selectedVisibleCount} of ${projects.length} selected` : 'Select all'}
              </span>
            </label>
          </div>
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onRemove={(p) => setConfirmState({ project: p })}
              selected={selectedIds.has(project.id)}
              onToggleSelect={() => toggleSelection(project.id)}
            />
          ))}
        </div>
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

const ProjectCard: React.FC<{
  project: Project;
  onRemove: (project: Project) => void;
  selected?: boolean;
  onToggleSelect?: () => void;
}> = ({ project, onRemove, selected = false, onToggleSelect }) => {
  const ideColors: Record<string, string> = {
    'claude-code': 'bg-purple-500/20 text-purple-400',
    'cursor': 'bg-blue-500/20 text-blue-400',
    'opencode': 'bg-green-500/20 text-green-400',
    'codex-cli': 'bg-yellow-500/20 text-yellow-400',
  };

  return (
    <div className={`border rounded-lg p-4 transition-colors ${
      selected ? 'border-blue-500/50 bg-blue-500/5' : 'bg-slate-800 border-slate-700 hover:border-slate-600'
    }`}>
      <div className="flex items-start gap-2">
        {onToggleSelect && (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            aria-label={`Select ${project.name}`}
            className="accent-blue-500 w-4 h-4 mt-1 flex-shrink-0"
          />
        )}
        <div className="flex-1">
          <div className="flex items-start justify-between mb-3">
            <h4 className="font-semibold text-white">{project.name}</h4>
            <button
              onClick={() => onRemove(project)}
              className="p-1 text-red-400 hover:bg-red-500/10 rounded transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-slate-500 mb-3 truncate" title={project.path}>
            {project.path}
          </p>

          {/* Detected IDEs */}
          <div className="space-y-2">
            <p className="text-xs text-slate-400">Detected IDEs:</p>
            {project.detectedIDEs.length === 0 ? (
              <p className="text-xs text-slate-600">None detected</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {project.detectedIDEs.map((ide) => (
                  <span
                    key={ide}
                    className={`px-2 py-1 rounded text-xs ${ideColors[ide] || 'bg-slate-700 text-slate-300'}`}
                  >
                    {ide}
                  </span>
                ))}
              </div>
            )}
          </div>

          {project.metadata?.hasGit && (
            <div className="flex items-center gap-1 mt-3 text-xs text-green-400">
              <CheckCircle className="w-3 h-3" />
              Git repository
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectsPage;
