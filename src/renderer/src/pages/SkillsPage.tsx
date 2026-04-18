import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit, Search, Download, ChevronDown } from 'lucide-react';
import FormDialog, { FormField } from '../components/ui/FormDialog';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import SkillEditDialog from '../components/ui/SkillEditDialog';
import GitHubImportDialog from '../components/ui/GitHubImportDialog';
import ZipImportDialog from '../components/ui/ZipImportDialog';
import { useToast } from '../components/ui/Toast';

interface Skill {
  id: string;
  name: string;
  displayName: string;
  description: string;
  version: string;
  targetIDEs: string[];
  tags: string[];
  sourcePath: string;
}

const createSkillFields: FormField[] = [
  { name: 'name', label: 'Skill Name', placeholder: 'e.g., my-skill', required: true },
  { name: 'displayName', label: 'Display Name', placeholder: 'My Skill' },
  { name: 'description', label: 'Description', placeholder: 'What this skill does...' },
];

const SkillsPage: React.FC = () => {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [confirmState, setConfirmState] = useState<{ skill: Skill } | null>(null);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showImportMenu, setShowImportMenu] = useState(false);
  const [showGithubImportDialog, setShowGithubImportDialog] = useState(false);
  const [showZipImportDialog, setShowZipImportDialog] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadSkills();
  }, []);

  const loadSkills = async () => {
    try {
      const data = await window.api.skills.list();
      setSkills(data || []);
    } catch (err) {
      console.error('Failed to load skills:', err);
    } finally {
      setLoading(false);
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

      await loadSkills();
      toast({ title: 'Skill created', description: `"${displayName}" has been created.`, variant: 'success' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'error' });
    }
  };

  const handleDeleteSkill = async (skill: Skill) => {
    try {
      await window.api.skills.delete(skill.id);
      await loadSkills();
      setConfirmState(null);
      setSelectedIds(prev => {
        if (!prev.has(skill.id)) {
          return prev;
        }
        const next = new Set(prev);
        next.delete(skill.id);
        return next;
      });
      toast({ title: 'Skill deleted', description: `"${skill.displayName}" has been removed.`, variant: 'success' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'error' });
    }
  };

  const handleEditSkill = (skill: Skill) => {
    setEditingSkill(skill);
    setShowEditDialog(true);
  };

  const handleSaveEdit = async () => {
    await loadSkills();
  };

  const filteredSkills = skills.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.displayName.toLowerCase().includes(search.toLowerCase()) ||
    s.description.toLowerCase().includes(search.toLowerCase())
  );

  const selectedVisibleCount = filteredSkills.filter(skill => selectedIds.has(skill.id)).length;

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

  const selectAll = () => setSelectedIds(new Set(filteredSkills.map(skill => skill.id)));
  const deselectAll = () => setSelectedIds(new Set());
  const toggleSelectAll = () => {
    if (selectedVisibleCount === filteredSkills.length && filteredSkills.length > 0) {
      deselectAll();
    } else {
      selectAll();
    }
  };

  const handleBulkDeleteSkills = async () => {
    try {
      setBulkDeleting(true);
      const ids = Array.from(selectedIds);
      const results = await Promise.all(
        ids.map(async id => {
          try {
            await window.api.skills.delete(id);
            return { id, success: true };
          } catch {
            return { id, success: false };
          }
        }),
      );

      await loadSkills();
      setSelectedIds(new Set());
      setShowBulkConfirm(false);

      const succeeded = results.filter(result => result.success).length;
      const failed = results.filter(result => !result.success).length;

      if (failed === 0) {
        toast({
          title: 'Skills deleted',
          description: `${succeeded} skill${succeeded !== 1 ? 's' : ''} removed successfully.`,
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
      setBulkDeleting(false);
    }
  };

  if (loading) {
    return <div className="text-center py-12">Loading skills...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search skills..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setShowImportMenu((prev) => !prev)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors text-slate-300"
            >
              <Download className="w-4 h-4" />
              Import
              <ChevronDown className="w-4 h-4" />
            </button>
            {showImportMenu && (
              <div className="absolute right-0 top-full mt-2 w-48 rounded-lg border border-slate-700 bg-slate-800 shadow-xl z-10 overflow-hidden">
                <button
                  onClick={() => {
                    setShowImportMenu(false);
                    setShowGithubImportDialog(true);
                  }}
                  className="w-full px-4 py-2.5 text-left text-sm text-slate-200 hover:bg-slate-700 transition-colors"
                >
                  From GitHub
                </button>
                <button
                  onClick={() => {
                    setShowImportMenu(false);
                    setShowZipImportDialog(true);
                  }}
                  className="w-full px-4 py-2.5 text-left text-sm text-slate-200 hover:bg-slate-700 transition-colors"
                >
                  From ZIP
                </button>
              </div>
            )}
          </div>
          <button
            onClick={() => setShowCreateDialog(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Skill
          </button>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 border border-slate-700 rounded-lg bg-slate-800/50 p-3">
          <span className="text-sm text-slate-400">{selectedIds.size} selected</span>
          <button
            onClick={() => setShowBulkConfirm(true)}
            disabled={bulkDeleting}
            className="flex items-center gap-2 px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg text-sm transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Remove Selected
          </button>
        </div>
      )}

      {/* Skills List */}
      {filteredSkills.length === 0 ? (
        <div className="text-center py-12 bg-slate-800 rounded-lg border border-slate-700">
          <p className="text-slate-400 mb-4">
            {search ? 'No skills match your search' : 'No skills yet'}
          </p>
          {!search && (
            <button
              onClick={() => setShowCreateDialog(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              Create your first skill
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4">
          <div className="flex items-center gap-3 px-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedVisibleCount === filteredSkills.length && filteredSkills.length > 0}
                ref={(el) => {
                  if (el) {
                    el.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < filteredSkills.length;
                  }
                }}
                onChange={toggleSelectAll}
                className="accent-blue-500 w-4 h-4"
              />
              <span className="text-sm text-slate-400">
                {selectedVisibleCount > 0 ? `${selectedVisibleCount} of ${filteredSkills.length} selected` : 'Select all'}
              </span>
            </label>
          </div>
          {filteredSkills.map((skill) => (
            <SkillCard
              key={skill.id}
              skill={skill}
              onDelete={(s) => setConfirmState({ skill: s })}
              onEdit={handleEditSkill}
              selected={selectedIds.has(skill.id)}
              onToggleSelect={() => toggleSelection(skill.id)}
            />
          ))}
        </div>
      )}

      <FormDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        title="Create New Skill"
        description="Add a new skill to your collection."
        fields={createSkillFields}
        onSubmit={handleCreateSkill}
        submitLabel="Create"
      />

      <SkillEditDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        skill={editingSkill}
        onSave={handleSaveEdit}
      />

      {confirmState && (
        <ConfirmDialog
          open={true}
          onOpenChange={(open) => { if (!open) setConfirmState(null); }}
          title="Delete Skill"
          description={`Are you sure you want to delete "${confirmState.skill.displayName}"? This cannot be undone.`}
          onConfirm={() => handleDeleteSkill(confirmState.skill)}
          confirmLabel="Delete"
          variant="danger"
        />
      )}

      {showBulkConfirm && (
        <ConfirmDialog
          open={true}
          onOpenChange={(open) => {
            if (!open && !bulkDeleting) {
              setShowBulkConfirm(false);
            }
          }}
          title={`Delete ${selectedIds.size} Skills`}
          description={`Are you sure you want to delete ${selectedIds.size} skill${selectedIds.size !== 1 ? 's' : ''}? This cannot be undone.`}
          onConfirm={handleBulkDeleteSkills}
          confirmLabel={bulkDeleting ? 'Deleting...' : 'Delete'}
          variant="danger"
        />
      )}

      <GitHubImportDialog
        open={showGithubImportDialog}
        onOpenChange={setShowGithubImportDialog}
        onImportComplete={loadSkills}
      />

      <ZipImportDialog
        open={showZipImportDialog}
        onOpenChange={setShowZipImportDialog}
        onImportComplete={loadSkills}
      />
    </div>
  );
};

const SkillCard: React.FC<{
  skill: Skill;
  onDelete: (skill: Skill) => void;
  onEdit: (skill: Skill) => void;
  selected?: boolean;
  onToggleSelect?: () => void;
}> = ({ skill, onDelete, onEdit, selected = false, onToggleSelect }) => {
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
            aria-label={`Select ${skill.displayName}`}
            className="accent-blue-500 w-4 h-4 mt-1 flex-shrink-0"
          />
        )}
        <div className="flex items-start justify-between flex-1">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-white">{skill.displayName}</h3>
            <p className="text-sm text-slate-400 mt-1">{skill.description || 'No description'}</p>
            <div className="flex items-center gap-4 mt-3 text-sm text-slate-500">
              <span>v{skill.version}</span>
              {skill.targetIDEs.length > 0 && (
                <span>IDEs: {skill.targetIDEs.join(', ')}</span>
              )}
            </div>
            {skill.tags.length > 0 && (
              <div className="flex gap-2 mt-2">
                {skill.tags.map((tag, i) => (
                  <span key={i} className="px-2 py-1 bg-slate-700 rounded text-xs text-slate-300">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onEdit(skill)}
              className="p-2 text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
              title="Edit skill"
            >
              <Edit className="w-4 h-4" />
            </button>
            <button
              onClick={() => onDelete(skill)}
              className="p-2 text-red-400 hover:bg-red-500/10 rounded transition-colors"
              title="Delete skill"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SkillsPage;
