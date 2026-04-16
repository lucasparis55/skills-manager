import React, { useState, useEffect } from 'react';
import { Target, FolderGit2, Link, AlertTriangle, Plus, FolderOpen } from 'lucide-react';
import FormDialog, { FormField } from '../components/ui/FormDialog';
import { useToast } from '../components/ui/Toast';

const createSkillFields: FormField[] = [
  { name: 'name', label: 'Skill Name', placeholder: 'e.g., my-skill', required: true },
  { name: 'displayName', label: 'Display Name', placeholder: 'My Skill' },
  { name: 'description', label: 'Description', placeholder: 'What this skill does...' },
];

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState({ skills: 0, projects: 0, links: 0, warnings: 0 });
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const { toast } = useToast();

  const loadStats = async () => {
    try {
      const [skills, projects, links] = await Promise.all([
        window.api.skills.list(),
        window.api.projects.list(),
        window.api.links.list(),
      ]);

      setStats({
        skills: skills?.length || 0,
        projects: projects?.length || 0,
        links: links?.length || 0,
        warnings: 0,
      });
    } catch (err) {
      console.error('Failed to load stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

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

  const handleScanProjects = async () => {
    try {
      const projects = await window.api.projects.scan();
      await loadStats();
      toast({
        title: 'Scan Complete',
        description: `Found ${projects?.length || 0} projects.`,
        variant: 'info',
      });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'error' });
    }
  };

  if (loading) {
    return <div className="text-center py-12">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
          color="purple"
        />
        <StatCard
          icon={AlertTriangle}
          label="Warnings"
          value={stats.warnings}
          color="yellow"
        />
      </div>

      {/* Quick Actions */}
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Quick Actions</h3>
        <div className="flex gap-4">
          <button
            onClick={() => setShowCreateDialog(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Skill
          </button>
          <button
            onClick={handleScanProjects}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
          >
            <FolderOpen className="w-4 h-4" />
            Scan Projects
          </button>
        </div>
      </div>

      {/* IDE Health Check */}
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
        <h3 className="text-lg font-semibold text-white mb-4">IDE Status</h3>
        <IDEHealthCheck />
      </div>

      <FormDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        title="Create New Skill"
        description="Add a new skill to your collection."
        fields={createSkillFields}
        onSubmit={handleCreateSkill}
        submitLabel="Create"
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
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    green: 'bg-green-500/10 text-green-400 border-green-500/20',
    purple: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    yellow: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  };

  return (
    <div className={`p-4 rounded-lg border ${colorClasses[color]}`}>
      <div className="flex items-center justify-between">
        <Icon className="w-6 h-6" />
        <span className="text-2xl font-bold">{value}</span>
      </div>
      <p className="text-sm mt-2 opacity-80">{label}</p>
    </div>
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
      {ides.map((ide) => {
        const ideRoots = roots.filter(r => r.ideId === ide.id);
        const hasExisting = ideRoots.some(r => r.exists);

        return (
          <div key={ide.id} className="flex items-center justify-between p-3 bg-slate-700/50 rounded">
            <span className="font-medium">{ide.name}</span>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${hasExisting ? 'bg-green-400' : 'bg-slate-500'}`} />
              <span className="text-sm text-slate-400">
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
