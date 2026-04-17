import React, { useState, useEffect } from 'react';
import { Link2, Plus, Trash2, RefreshCw, ArrowRight, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import CreateLinkDialog from '../components/ui/CreateLinkDialog';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { useToast } from '../components/ui/Toast';

interface LinkData {
  id: string;
  skillId: string;
  projectId: string;
  ideName: string;
  scope: 'global' | 'project';
  sourcePath: string;
  destinationPath: string;
  status: 'linked' | 'broken' | 'conflict';
  createdAt: string;
}

interface Skill {
  id: string;
  name: string;
  displayName: string;
}

interface Project {
  id: string;
  name: string;
  path: string;
  detectedIDEs: string[];
}

interface IDE {
  id: string;
  name: string;
}

const ideColors: Record<string, string> = {
  'claude-code': 'bg-purple-500/20 text-purple-400',
  'cursor': 'bg-blue-500/20 text-blue-400',
  'opencode': 'bg-green-500/20 text-green-400',
  'codex-cli': 'bg-yellow-500/20 text-yellow-400',
  'codex-desktop': 'bg-yellow-500/20 text-yellow-400',
};

const statusConfig: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  linked: { icon: CheckCircle, color: 'text-green-400', label: 'Linked' },
  broken: { icon: XCircle, color: 'text-red-400', label: 'Broken' },
  conflict: { icon: AlertTriangle, color: 'text-yellow-400', label: 'Conflict' },
};

const LinksPage: React.FC = () => {
  const [links, setLinks] = useState<LinkData[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [ides, setIdes] = useState<IDE[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [confirmState, setConfirmState] = useState<{ link: LinkData } | null>(null);
  const [verifyingAll, setVerifyingAll] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [linksData, skillsData, projectsData, idesData] = await Promise.all([
        window.api.links.list(),
        window.api.skills.list(),
        window.api.projects.list(),
        window.api.ides.list(),
      ]);
      setLinks(linksData || []);
      setSkills(skillsData || []);
      setProjects(projectsData || []);
      setIdes(idesData || []);
    } catch (err) {
      console.error('Failed to load links data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateLink = async (values: { skillId: string; projectId: string; ideName: string; scope: 'global' | 'project' }) => {
    try {
      await window.api.links.create(values);
      await loadData();
      setShowCreateDialog(false);
      const skill = skills.find(s => s.id === values.skillId);
      const project = projects.find(p => p.id === values.projectId);
      toast({
        title: 'Link created',
        description: `"${skill?.displayName || values.skillId}" linked to "${project?.name || values.projectId}" for ${values.ideName}`,
        variant: 'success',
      });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'error' });
    }
  };

  const handleRemoveLink = async (link: LinkData) => {
    try {
      await window.api.links.remove(link.id);
      await loadData();
      setConfirmState(null);
      toast({ title: 'Link removed', description: `Link has been removed.`, variant: 'success' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'error' });
    }
  };

  const handleVerifyLink = async (link: LinkData) => {
    try {
      const result = await window.api.links.verify(link.id);
      await loadData();
      toast({
        title: result.valid ? 'Link valid' : 'Link broken',
        description: result.valid ? 'The symlink is pointing to a valid target.' : 'The symlink target is missing or invalid.',
        variant: result.valid ? 'success' : 'error',
      });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'error' });
    }
  };

  const handleVerifyAll = async () => {
    try {
      setVerifyingAll(true);
      await window.api.links.verifyAll();
      await loadData();
      toast({ title: 'Verification complete', description: 'All links have been verified.', variant: 'info' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'error' });
    } finally {
      setVerifyingAll(false);
    }
  };

  const getSkillName = (skillId: string): string => {
    const skill = skills.find(s => s.id === skillId);
    return skill?.displayName || skill?.name || skillId;
  };

  const getProjectName = (projectId: string): string => {
    const project = projects.find(p => p.id === projectId);
    return project?.name || projectId;
  };

  const getIdeName = (ideId: string): string => {
    const ide = ides.find(i => i.id === ideId);
    return ide?.name || ideId;
  };

  if (loading) {
    return <div className="text-center py-12 text-slate-400">Loading links...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">{links.length} Links</h3>
        <div className="flex gap-2">
          <button
            onClick={handleVerifyAll}
            disabled={verifyingAll || links.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${verifyingAll ? 'animate-spin' : ''}`} />
            Verify All
          </button>
          <button
            onClick={() => setShowCreateDialog(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Link
          </button>
        </div>
      </div>

      {/* Links Grid */}
      {links.length === 0 ? (
        <div className="text-center py-12 bg-slate-800 rounded-lg border border-slate-700">
          <Link2 className="w-12 h-12 mx-auto text-slate-500 mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">No Links Yet</h3>
          <p className="text-slate-400 mb-4">
            Link skills to projects for specific IDEs via symlinks.
          </p>
          <button
            onClick={() => setShowCreateDialog(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            Create your first link
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {links.map((link) => (
            <LinkCard
              key={link.id}
              link={link}
              skillName={getSkillName(link.skillId)}
              projectName={getProjectName(link.projectId)}
              ideDisplayName={getIdeName(link.ideName)}
              onVerify={handleVerifyLink}
              onRemove={(link) => setConfirmState({ link })}
            />
          ))}
        </div>
      )}

      <CreateLinkDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        skills={skills}
        projects={projects}
        ides={ides}
        onSubmit={handleCreateLink}
      />

      {confirmState && (
        <ConfirmDialog
          open={true}
          onOpenChange={(open) => { if (!open) setConfirmState(null); }}
          title="Remove Link"
          description={`Are you sure you want to remove the link between "${getSkillName(confirmState.link.skillId)}" and "${getProjectName(confirmState.link.projectId)}" for ${getIdeName(confirmState.link.ideName)}? The symlink will be deleted.`}
          onConfirm={() => handleRemoveLink(confirmState.link)}
          confirmLabel="Remove"
          variant="danger"
        />
      )}
    </div>
  );
};

const LinkCard: React.FC<{
  link: LinkData;
  skillName: string;
  projectName: string;
  ideDisplayName: string;
  onVerify: (link: LinkData) => void;
  onRemove: (link: LinkData) => void;
}> = ({ link, skillName, projectName, ideDisplayName, onVerify, onRemove }) => {
  const status = statusConfig[link.status] || statusConfig.linked;
  const StatusIcon = status.icon;

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 hover:border-slate-600 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 text-sm min-w-0 flex-1">
          <span className="font-semibold text-white truncate">{skillName}</span>
          <ArrowRight className="w-4 h-4 text-slate-500 flex-shrink-0" />
          <span className="text-slate-300 truncate">{projectName}</span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
          <button
            onClick={() => onVerify(link)}
            className="p-1 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
            title="Verify link"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => onRemove(link)}
            className="p-1 text-red-400 hover:bg-red-500/10 rounded transition-colors"
            title="Remove link"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* IDE badge + Scope + Status */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className={`px-2 py-1 rounded text-xs ${ideColors[link.ideName] || 'bg-slate-700 text-slate-300'}`}>
          {ideDisplayName}
        </span>
        <span className={`px-2 py-1 rounded text-xs ${
          link.scope === 'global' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'
        }`}>
          {link.scope}
        </span>
        <div className="flex items-center gap-1">
          <StatusIcon className={`w-3.5 h-3.5 ${status.color}`} />
          <span className={`text-xs ${status.color}`}>{status.label}</span>
        </div>
      </div>

      {/* Destination path */}
      <p className="text-xs text-slate-500 truncate" title={link.destinationPath}>
        {link.destinationPath}
      </p>

      {/* Created date */}
      <p className="text-xs text-slate-600 mt-1">
        Created {new Date(link.createdAt).toLocaleDateString()}
      </p>
    </div>
  );
};

export default LinksPage;
