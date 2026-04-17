import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit, Search, Download } from 'lucide-react';
import FormDialog, { FormField } from '../components/ui/FormDialog';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import SkillEditDialog from '../components/ui/SkillEditDialog';
import GitHubImportDialog from '../components/ui/GitHubImportDialog';
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
  const [showImportDialog, setShowImportDialog] = useState(false);
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
          <button
            onClick={() => setShowImportDialog(true)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors text-slate-300"
          >
            <Download className="w-4 h-4" />
            Import from GitHub
          </button>
          <button
            onClick={() => setShowCreateDialog(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Skill
          </button>
        </div>
      </div>

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
          {filteredSkills.map((skill) => (
            <SkillCard
              key={skill.id}
              skill={skill}
              onDelete={(s) => setConfirmState({ skill: s })}
              onEdit={handleEditSkill}
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

      <GitHubImportDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        onImportComplete={loadSkills}
      />
    </div>
  );
};

const SkillCard: React.FC<{
  skill: Skill;
  onDelete: (skill: Skill) => void;
  onEdit: (skill: Skill) => void;
}> = ({ skill, onDelete, onEdit }) => {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 hover:border-slate-600 transition-colors">
      <div className="flex items-start justify-between">
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
  );
};

export default SkillsPage;
