import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit, Search } from 'lucide-react';

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

const SkillsPage: React.FC = () => {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

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

  const handleCreateSkill = async () => {
    try {
      const name = prompt('Enter skill name (e.g., my-skill):');
      if (!name) return;

      const displayName = prompt('Enter display name:') || name;
      const description = prompt('Enter description:') || '';

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
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleDeleteSkill = async (skill: Skill) => {
    if (!confirm(`Delete skill "${skill.displayName}"?`)) return;

    try {
      await window.api.skills.delete(skill.id);
      await loadSkills();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
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
        <button
          onClick={handleCreateSkill}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Skill
        </button>
      </div>

      {/* Skills List */}
      {filteredSkills.length === 0 ? (
        <div className="text-center py-12 bg-slate-800 rounded-lg border border-slate-700">
          <p className="text-slate-400 mb-4">
            {search ? 'No skills match your search' : 'No skills yet'}
          </p>
          {!search && (
            <button
              onClick={handleCreateSkill}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              Create your first skill
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredSkills.map((skill) => (
            <SkillCard key={skill.id} skill={skill} onDelete={handleDeleteSkill} />
          ))}
        </div>
      )}
    </div>
  );
};

const SkillCard: React.FC<{ skill: Skill; onDelete: (skill: Skill) => void }> = ({ skill, onDelete }) => {
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
            onClick={() => onDelete(skill)}
            className="p-2 text-red-400 hover:bg-red-500/10 rounded transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default SkillsPage;
