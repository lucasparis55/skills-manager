import React, { useState, useEffect, useMemo } from 'react';
import { Link2, Plus, Trash2, RefreshCw, ArrowRight, CheckCircle, XCircle, AlertTriangle, Filter, X, Check, ChevronDown } from 'lucide-react';
import * as SelectPrimitive from '@radix-ui/react-select';
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

interface LinkCreationResult {
  skillId: string;
  skillName: string;
  status: 'created' | 'error' | 'skipped';
  error?: string;
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkRemoving, setBulkRemoving] = useState(false);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [filterProjectId, setFilterProjectId] = useState('__all__');
  const [filterIdeName, setFilterIdeName] = useState('__all__');
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

  // Filtering logic
  const filteredLinks = useMemo(() => {
    return links.filter(link => {
      if (filterProjectId !== '__all__' && link.projectId !== filterProjectId) return false;
      if (filterIdeName !== '__all__' && link.ideName !== filterIdeName) return false;
      return true;
    });
  }, [links, filterProjectId, filterIdeName]);

  const hasActiveFilters = filterProjectId !== '__all__' || filterIdeName !== '__all__';

  const clearAllFilters = () => {
    setFilterProjectId('__all__');
    setFilterIdeName('__all__');
  };

  const projectCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    links.forEach(l => { counts[l.projectId] = (counts[l.projectId] || 0) + 1; });
    return counts;
  }, [links]);

  const ideCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    links.forEach(l => { counts[l.ideName] = (counts[l.ideName] || 0) + 1; });
    return counts;
  }, [links]);

  // Selection handlers
  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(filteredLinks.map(l => l.id)));
  const deselectAll = () => setSelectedIds(new Set());
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredLinks.length && filteredLinks.length > 0) {
      deselectAll();
    } else {
      selectAll();
    }
  };

  const handleBulkRemove = async () => {
    try {
      setBulkRemoving(true);
      const ids = Array.from(selectedIds);
      const results = await window.api.links.removeMultiple(ids);
      await loadData();
      setSelectedIds(new Set());
      setShowBulkConfirm(false);
      
      const succeeded = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      
      if (failed === 0) {
        toast({ title: 'Links removed', description: `${succeeded} link${succeeded !== 1 ? 's' : ''} removed successfully.`, variant: 'success' });
      } else {
        toast({ title: 'Partial removal', description: `${succeeded} removed, ${failed} failed.`, variant: 'warning' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'error' });
    } finally {
      setBulkRemoving(false);
    }
  };

  const handleCreateLink = async (values: { skillIds: string[]; projectId: string; ideName: string; scope: 'global' | 'project' }) => {
    // The dialog handles the actual creation internally now.
    // This callback is called after creation completes for data refresh.
    await loadData();
  };

  const handleCreateComplete = (results: LinkCreationResult[]) => {
    const created = results.filter(r => r.status === 'created').length;
    const errors = results.filter(r => r.status === 'error').length;
    const skipped = results.filter(r => r.status === 'skipped').length;

    if (errors === 0) {
      toast({
        title: 'Links created',
        description: `${created} link${created !== 1 ? 's' : ''} created successfully${skipped > 0 ? `, ${skipped} skipped` : ''}`,
        variant: 'success',
      });
    } else if (created > 0) {
      toast({
        title: 'Partial success',
        description: `${created} of ${results.length} links created, ${errors} failed`,
        variant: 'warning',
      });
    } else {
      toast({
        title: 'Link creation failed',
        description: `All ${errors} link creation attempts failed`,
        variant: 'error',
      });
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
        <h3 className="text-lg font-semibold text-white">
          {hasActiveFilters ? `${filteredLinks.length} of ${links.length} Links` : `${links.length} Links`}
        </h3>
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

      {/* Filter Bar + Bulk Actions */}
      {(hasActiveFilters || selectedIds.size > 0) && (
        <div className="flex items-center gap-3 flex-wrap bg-slate-800/50 border border-slate-700 rounded-lg p-3">
          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap flex-1">
            <Filter className="w-4 h-4 text-slate-400 flex-shrink-0" />
            
            {/* Project Filter */}
            <SelectPrimitive.Root value={filterProjectId} onValueChange={setFilterProjectId}>
              <SelectPrimitive.Trigger className="flex items-center justify-between min-w-[160px] px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500">
                <SelectPrimitive.Value placeholder="All Projects" />
                <SelectPrimitive.Icon><ChevronDown className="w-4 h-4 text-slate-400" /></SelectPrimitive.Icon>
              </SelectPrimitive.Trigger>
              <SelectPrimitive.Portal>
                <SelectPrimitive.Content className="bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 max-h-60 overflow-auto">
                  <SelectPrimitive.Viewport>
                    <SelectPrimitive.Item value="__all__" className="flex items-center gap-2 px-3 py-2 text-sm text-slate-200 outline-none cursor-pointer hover:bg-slate-700 data-[highlighted]:bg-slate-700">
                      <SelectPrimitive.ItemText>All Projects ({links.length})</SelectPrimitive.ItemText>
                      <SelectPrimitive.ItemIndicator><Check className="w-4 h-4 text-blue-400" /></SelectPrimitive.ItemIndicator>
                    </SelectPrimitive.Item>
                    {projects.map(p => (
                      <SelectPrimitive.Item key={p.id} value={p.id} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-200 outline-none cursor-pointer hover:bg-slate-700 data-[highlighted]:bg-slate-700">
                        <SelectPrimitive.ItemText>{p.name} ({projectCounts[p.id] || 0})</SelectPrimitive.ItemText>
                        <SelectPrimitive.ItemIndicator><Check className="w-4 h-4 text-blue-400" /></SelectPrimitive.ItemIndicator>
                      </SelectPrimitive.Item>
                    ))}
                  </SelectPrimitive.Viewport>
                </SelectPrimitive.Content>
              </SelectPrimitive.Portal>
            </SelectPrimitive.Root>

            {/* IDE Filter */}
            <SelectPrimitive.Root value={filterIdeName} onValueChange={setFilterIdeName}>
              <SelectPrimitive.Trigger className="flex items-center justify-between min-w-[160px] px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500">
                <SelectPrimitive.Value placeholder="All IDEs" />
                <SelectPrimitive.Icon><ChevronDown className="w-4 h-4 text-slate-400" /></SelectPrimitive.Icon>
              </SelectPrimitive.Trigger>
              <SelectPrimitive.Portal>
                <SelectPrimitive.Content className="bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 max-h-60 overflow-auto">
                  <SelectPrimitive.Viewport>
                    <SelectPrimitive.Item value="__all__" className="flex items-center gap-2 px-3 py-2 text-sm text-slate-200 outline-none cursor-pointer hover:bg-slate-700 data-[highlighted]:bg-slate-700">
                      <SelectPrimitive.ItemText>All IDEs ({links.length})</SelectPrimitive.ItemText>
                      <SelectPrimitive.ItemIndicator><Check className="w-4 h-4 text-blue-400" /></SelectPrimitive.ItemIndicator>
                    </SelectPrimitive.Item>
                    {ides.map(ide => (
                      <SelectPrimitive.Item key={ide.id} value={ide.id} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-200 outline-none cursor-pointer hover:bg-slate-700 data-[highlighted]:bg-slate-700">
                        <SelectPrimitive.ItemText>{ide.name} ({ideCounts[ide.name] || 0})</SelectPrimitive.ItemText>
                        <SelectPrimitive.ItemIndicator><Check className="w-4 h-4 text-blue-400" /></SelectPrimitive.ItemIndicator>
                      </SelectPrimitive.Item>
                    ))}
                  </SelectPrimitive.Viewport>
                </SelectPrimitive.Content>
              </SelectPrimitive.Portal>
            </SelectPrimitive.Root>

            {/* Clear Filters */}
            {hasActiveFilters && (
              <button onClick={clearAllFilters} className="flex items-center gap-1 px-2 py-1 text-xs text-slate-400 hover:text-white transition-colors">
                <X className="w-3 h-3" /> Clear Filters
              </button>
            )}
          </div>

          {/* Bulk Actions */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 border-l border-slate-700 pl-3">
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
        </div>
      )}

      {/* Links Grid */}
      {filteredLinks.length === 0 ? (
        links.length === 0 ? (
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
          <div className="text-center py-12 bg-slate-800 rounded-lg border border-slate-700">
            <Filter className="w-12 h-12 mx-auto text-slate-500 mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">No Matching Links</h3>
            <p className="text-slate-400 mb-4">No links match your current filters.</p>
            <button onClick={clearAllFilters} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors">
              Clear all filters
            </button>
          </div>
        )
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Select All row */}
          <div className="col-span-full flex items-center gap-3 px-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedIds.size === filteredLinks.length && filteredLinks.length > 0}
                ref={(el) => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < filteredLinks.length; }}
                onChange={toggleSelectAll}
                className="accent-blue-500 w-4 h-4"
              />
              <span className="text-sm text-slate-400">
                {selectedIds.size > 0 ? `${selectedIds.size} of ${filteredLinks.length} selected` : 'Select all'}
              </span>
            </label>
          </div>
          
          {filteredLinks.map((link) => (
            <LinkCard
              key={link.id}
              link={link}
              skillName={getSkillName(link.skillId)}
              projectName={getProjectName(link.projectId)}
              ideDisplayName={getIdeName(link.ideName)}
              onVerify={handleVerifyLink}
              onRemove={(link) => setConfirmState({ link })}
              selected={selectedIds.has(link.id)}
              onToggleSelect={() => toggleSelection(link.id)}
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
        onComplete={handleCreateComplete}
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

      {showBulkConfirm && (
        <ConfirmDialog
          open={true}
          onOpenChange={(open) => { if (!open && !bulkRemoving) setShowBulkConfirm(false); }}
          title={`Remove ${selectedIds.size} Links`}
          description={`Are you sure you want to remove ${selectedIds.size} link${selectedIds.size !== 1 ? 's' : ''}? The symlinks will be deleted. This cannot be undone.`}
          onConfirm={handleBulkRemove}
          confirmLabel={bulkRemoving ? 'Removing...' : 'Remove'}
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
  selected?: boolean;
  onToggleSelect?: () => void;
}> = ({ link, skillName, projectName, ideDisplayName, onVerify, onRemove, selected = false, onToggleSelect }) => {
  const status = statusConfig[link.status] || statusConfig.linked;
  const StatusIcon = status.icon;

  return (
    <div className={`bg-slate-800 border rounded-lg p-4 transition-colors ${
      selected ? 'border-blue-500/50 bg-blue-500/5' : 'border-slate-700 hover:border-slate-600'
    }`}>
      <div className="flex items-start gap-2 mb-3">
        {onToggleSelect && (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            className="accent-blue-500 w-4 h-4 mt-0.5 flex-shrink-0"
          />
        )}
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
