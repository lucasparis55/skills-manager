import React, { useState, useEffect, useMemo } from 'react';
import { Link2, Plus, Trash2, RefreshCw, ArrowRight, CheckCircle, XCircle, AlertTriangle, Filter, X, Check, ChevronDown, Search } from 'lucide-react';
import * as SelectPrimitive from '@radix-ui/react-select';
import CreateLinkDialog from '../components/ui/CreateLinkDialog';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { useToast } from '../components/ui/Toast';
import { buildIdeCounts, reconcileSelectedIds } from './links-page.utils';

interface LinkData {
  id: string;
  skillId: string;
  projectId: string | null;
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

interface IDERoot {
  ideId: string;
  exists: boolean;
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
  'kimi-cli': 'bg-red-500/20 text-red-400',
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
  const [ideRoots, setIdeRoots] = useState<IDERoot[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [confirmState, setConfirmState] = useState<{ link: LinkData } | null>(null);
  const [verifyingAll, setVerifyingAll] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkRemoving, setBulkRemoving] = useState(false);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [filterProjectId, setFilterProjectId] = useState('__all__');
  const [filterIdeName, setFilterIdeName] = useState('__all__');
  const [filterStatus, setFilterStatus] = useState('__all__');
  const [searchQuery, setSearchQuery] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [linksData, skillsData, projectsData, idesData, ideRootsData] = await Promise.all([
        window.api.links.list(),
        window.api.skills.list(),
        window.api.projects.list(),
        window.api.ides.list(),
        window.api.ides.detectRoots().catch(() => []),
      ]);
      setLinks(linksData || []);
      setSkills(skillsData || []);
      setProjects(projectsData || []);
      setIdes(idesData || []);
      setIdeRoots(ideRootsData || []);
    } catch (err) {
      console.error('Failed to load links data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Filtering logic
  const filteredLinks = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
    return links.filter(link => {
      if (filterProjectId !== '__all__' && link.projectId !== filterProjectId) return false;
      if (filterIdeName !== '__all__' && link.ideName !== filterIdeName) return false;
      if (filterStatus !== '__all__' && link.status !== filterStatus) return false;

      if (normalizedQuery) {
        const searchableText = [
          getSkillName(link.skillId),
          getProjectName(link.projectId),
          getIdeName(link.ideName),
          link.destinationPath,
        ].join(' ').toLocaleLowerCase();
        if (!searchableText.includes(normalizedQuery)) return false;
      }
      return true;
    });
  }, [links, skills, projects, ides, filterProjectId, filterIdeName, filterStatus, searchQuery]);

  useEffect(() => {
    setSelectedIds(previous => reconcileSelectedIds(previous, filteredLinks.map(link => link.id)));
  }, [filteredLinks]);

  const hasActiveFilters = filterProjectId !== '__all__' || filterIdeName !== '__all__' || filterStatus !== '__all__' || searchQuery.trim() !== '';

  const clearAllFilters = () => {
    setFilterProjectId('__all__');
    setFilterIdeName('__all__');
    setFilterStatus('__all__');
    setSearchQuery('');
  };

  const projectCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    links.forEach(l => {
      if (l.projectId) counts[l.projectId] = (counts[l.projectId] || 0) + 1;
    });
    return counts;
  }, [links]);

  const ideCounts = useMemo(() => {
    return buildIdeCounts(links);
  }, [links]);

  const availableIdes = useMemo(() => {
    const detectedIdeIds = new Set(ideRoots.filter(root => root.exists).map(root => root.ideId));
    return ides.filter(ide => detectedIdeIds.has(ide.id));
  }, [ides, ideRoots]);

  const healthyCount = links.filter(link => link.status === 'linked').length;
  const attentionCount = links.length - healthyCount;

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

  const handleCreateLink = async () => {
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

  function getSkillName(skillId: string): string {
    const skill = skills.find(s => s.id === skillId);
    return skill?.displayName || skill?.name || skillId;
  }

  function getProjectName(projectId: string | null): string {
    const project = projects.find(p => p.id === projectId);
    return project?.name || projectId || 'Global';
  }

  function getIdeName(ideId: string): string {
    const ide = ides.find(i => i.id === ideId);
    return ide?.name || ideId;
  }

  if (loading) return <LinksPageSkeleton />;

  return (
    <div className="mx-auto max-w-screen-2xl space-y-5">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between" aria-labelledby="links-overview-title">
        <div>
          <div className="flex items-center gap-3">
            <h3 id="links-overview-title" className="text-xl font-semibold text-white">
              {hasActiveFilters ? `${filteredLinks.length} of ${links.length} Links` : `${links.length} Links`}
            </h3>
            {links.length > 0 && (
              <div className="flex items-center gap-3 text-xs" aria-label="Link health summary">
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  {healthyCount} healthy
                </span>
                <span className={attentionCount > 0 ? 'flex items-center gap-1.5 text-amber-400' : 'flex items-center gap-1.5 text-white/45'}>
                  <span className={`h-1.5 w-1.5 rounded-full ${attentionCount > 0 ? 'bg-amber-400' : 'bg-white/30'}`} />
                  {attentionCount} needs attention
                </span>
              </div>
            )}
          </div>
          <p className="mt-1 text-sm text-white/45">Manage where each skill is available and check whether its connection is working.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleVerifyAll}
            disabled={verifyingAll || links.length === 0}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <RefreshCw className={`w-4 h-4 ${verifyingAll ? 'animate-spin' : ''}`} />
            {verifyingAll ? 'Verifying...' : 'Verify All'}
          </button>
          <button
            onClick={() => setShowCreateDialog(true)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          >
            <Plus className="w-4 h-4" />
            Create Link
          </button>
        </div>
      </section>

      {links.length > 0 && (
        <section className="glass-panel p-3" aria-label="Find and filter links">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
              <input
                type="search"
                aria-label="Search links"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search by skill, project, IDE, or path"
                className="glass-input h-10 w-full pl-9 pr-3 text-sm focus-visible:ring-2 focus-visible:ring-blue-500/40"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Filter className="hidden h-4 w-4 text-white/35 sm:block" aria-hidden="true" />
            <SelectPrimitive.Root value={filterProjectId} onValueChange={setFilterProjectId}>
              <SelectPrimitive.Trigger aria-label="Filter by project" className="glass-input flex h-10 min-w-40 items-center justify-between gap-2 px-3 text-sm text-white/80 focus-visible:ring-2 focus-visible:ring-blue-500/40">
                <SelectPrimitive.Value placeholder="All Projects" />
                <SelectPrimitive.Icon><ChevronDown className="w-4 h-4 text-white/45" /></SelectPrimitive.Icon>
              </SelectPrimitive.Trigger>
              <SelectPrimitive.Portal>
                <SelectPrimitive.Content className="glass-dialog border-white/[0.08] rounded-lg shadow-xl z-50 max-h-60 overflow-auto">
                  <SelectPrimitive.Viewport>
                    <SelectPrimitive.Item value="__all__" className="flex items-center gap-2 px-3 py-2 text-sm text-white/80 outline-none cursor-pointer hover:bg-white/[0.06] data-[highlighted]:bg-white/[0.06]">
                      <SelectPrimitive.ItemText>All Projects ({links.length})</SelectPrimitive.ItemText>
                      <SelectPrimitive.ItemIndicator><Check className="w-4 h-4 text-blue-400" /></SelectPrimitive.ItemIndicator>
                    </SelectPrimitive.Item>
                    {projects.map(p => (
                      <SelectPrimitive.Item key={p.id} value={p.id} className="flex items-center gap-2 px-3 py-2 text-sm text-white/80 outline-none cursor-pointer hover:bg-white/[0.06] data-[highlighted]:bg-white/[0.06]">
                        <SelectPrimitive.ItemText>{p.name} ({projectCounts[p.id] || 0})</SelectPrimitive.ItemText>
                        <SelectPrimitive.ItemIndicator><Check className="w-4 h-4 text-blue-400" /></SelectPrimitive.ItemIndicator>
                      </SelectPrimitive.Item>
                    ))}
                  </SelectPrimitive.Viewport>
                </SelectPrimitive.Content>
              </SelectPrimitive.Portal>
            </SelectPrimitive.Root>

            <SelectPrimitive.Root value={filterIdeName} onValueChange={setFilterIdeName}>
              <SelectPrimitive.Trigger aria-label="Filter by IDE" className="glass-input flex h-10 min-w-36 items-center justify-between gap-2 px-3 text-sm text-white/80 focus-visible:ring-2 focus-visible:ring-blue-500/40">
                <SelectPrimitive.Value placeholder="All IDEs" />
                <SelectPrimitive.Icon><ChevronDown className="w-4 h-4 text-white/45" /></SelectPrimitive.Icon>
              </SelectPrimitive.Trigger>
              <SelectPrimitive.Portal>
                <SelectPrimitive.Content className="glass-dialog border-white/[0.08] rounded-lg shadow-xl z-50 max-h-60 overflow-auto">
                  <SelectPrimitive.Viewport>
                    <SelectPrimitive.Item value="__all__" className="flex items-center gap-2 px-3 py-2 text-sm text-white/80 outline-none cursor-pointer hover:bg-white/[0.06] data-[highlighted]:bg-white/[0.06]">
                      <SelectPrimitive.ItemText>All IDEs ({links.length})</SelectPrimitive.ItemText>
                      <SelectPrimitive.ItemIndicator><Check className="w-4 h-4 text-blue-400" /></SelectPrimitive.ItemIndicator>
                    </SelectPrimitive.Item>
                    {ides.map(ide => (
                      <SelectPrimitive.Item key={ide.id} value={ide.id} className="flex items-center gap-2 px-3 py-2 text-sm text-white/80 outline-none cursor-pointer hover:bg-white/[0.06] data-[highlighted]:bg-white/[0.06]">
                        <SelectPrimitive.ItemText>{ide.name} ({ideCounts[ide.id] || 0})</SelectPrimitive.ItemText>
                        <SelectPrimitive.ItemIndicator><Check className="w-4 h-4 text-blue-400" /></SelectPrimitive.ItemIndicator>
                      </SelectPrimitive.Item>
                    ))}
                  </SelectPrimitive.Viewport>
                </SelectPrimitive.Content>
              </SelectPrimitive.Portal>
            </SelectPrimitive.Root>

            <SelectPrimitive.Root value={filterStatus} onValueChange={setFilterStatus}>
              <SelectPrimitive.Trigger aria-label="Filter by status" className="glass-input flex h-10 min-w-36 items-center justify-between gap-2 px-3 text-sm text-white/80 focus-visible:ring-2 focus-visible:ring-blue-500/40">
                <SelectPrimitive.Value placeholder="All statuses" />
                <SelectPrimitive.Icon><ChevronDown className="w-4 h-4 text-white/45" /></SelectPrimitive.Icon>
              </SelectPrimitive.Trigger>
              <SelectPrimitive.Portal>
                <SelectPrimitive.Content className="glass-dialog z-50 max-h-60 overflow-auto rounded-lg border-white/[0.08] shadow-xl">
                  <SelectPrimitive.Viewport>
                    {[
                      ['__all__', `All statuses (${links.length})`],
                      ['linked', `Healthy (${healthyCount})`],
                      ['broken', `Broken (${links.filter(link => link.status === 'broken').length})`],
                      ['conflict', `Conflict (${links.filter(link => link.status === 'conflict').length})`],
                    ].map(([value, label]) => (
                      <SelectPrimitive.Item key={value} value={value} className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-white/80 outline-none data-[highlighted]:bg-white/[0.08]">
                        <SelectPrimitive.ItemText>{label}</SelectPrimitive.ItemText>
                        <SelectPrimitive.ItemIndicator><Check className="w-4 h-4 text-blue-400" /></SelectPrimitive.ItemIndicator>
                      </SelectPrimitive.Item>
                    ))}
                  </SelectPrimitive.Viewport>
                </SelectPrimitive.Content>
              </SelectPrimitive.Portal>
            </SelectPrimitive.Root>

            {hasActiveFilters && (
              <button onClick={clearAllFilters} className="flex h-10 items-center gap-1.5 px-2 text-sm text-white/50 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                <X className="w-3.5 h-3.5" /> Clear
              </button>
            )}
            </div>
          </div>
        </section>
      )}

      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3" role="status">
          <span className="text-sm font-medium text-blue-100">{selectedIds.size} link{selectedIds.size !== 1 ? 's' : ''} selected</span>
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

      {filteredLinks.length === 0 ? (
        links.length === 0 ? (
          <div className="glass-panel flex flex-col items-center px-6 py-16 text-center" role="status">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400"><Link2 className="h-6 w-6" /></div>
            <h3 className="text-lg font-semibold text-white">No Links Yet</h3>
            <p className="mb-5 mt-2 max-w-md text-sm text-white/50">Create a link to make a skill available in an IDE, globally or inside a specific project.</p>
            <button
              onClick={() => setShowCreateDialog(true)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold transition-colors hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              Create your first link
            </button>
          </div>
        ) : (
          <div className="glass-panel flex flex-col items-center px-6 py-14 text-center" role="status">
            <Search className="mb-4 h-8 w-8 text-white/30" />
            <h3 className="text-lg font-semibold text-white">No Matching Links</h3>
            <p className="mb-4 mt-1 text-sm text-white/45">Try another search or remove some filters.</p>
            <button onClick={clearAllFilters} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white">
              Clear all filters
            </button>
          </div>
        )
      ) : (
        <section className="glass-panel overflow-hidden" aria-label="Links list">
          <div className="flex min-h-11 items-center gap-4 border-b border-white/[0.08] bg-white/[0.025] px-4 text-xs font-medium uppercase tracking-wide text-white/35">
            <label className="flex cursor-pointer items-center gap-3 normal-case tracking-normal">
              <input
                type="checkbox"
                checked={selectedIds.size === filteredLinks.length && filteredLinks.length > 0}
                ref={(el) => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < filteredLinks.length; }}
                onChange={toggleSelectAll}
                className="h-4 w-4 accent-blue-500"
              />
              <span className="whitespace-nowrap text-xs text-white/45">
                {selectedIds.size > 0 ? `${selectedIds.size} of ${filteredLinks.length} selected` : 'Select all'}
              </span>
            </label>
            <span className="ml-auto hidden md:block md:w-28">Status</span>
            <span className="hidden xl:block xl:w-72">Destination</span>
            <span className="w-20 text-right">Actions</span>
          </div>
          <div className="divide-y divide-white/[0.06]">
            {filteredLinks.map((link) => (
              <LinkRow
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
        </section>
      )}

      <CreateLinkDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        skills={skills}
        projects={projects}
        ides={availableIdes}
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

const LinkRow: React.FC<{
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
    <div className={`group flex min-h-16 items-center gap-4 px-4 py-3 transition-colors hover:bg-white/[0.025] ${selected ? 'bg-blue-500/[0.08]' : ''}`}>
      {onToggleSelect && (
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          aria-label={`Select ${skillName} link for ${projectName}`}
          className="h-4 w-4 flex-shrink-0 accent-blue-500"
        />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <span className="truncate font-semibold text-white">{skillName}</span>
          <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-white/25" aria-hidden="true" />
          <span className="truncate text-white/65">{projectName}</span>
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-2 text-xs">
          <span className={`rounded px-1.5 py-0.5 ${ideColors[link.ideName] || 'bg-white/[0.06] text-white/60'}`}>{ideDisplayName}</span>
          <span className="capitalize text-white/35">{link.scope}</span>
          <span className="truncate text-white/25 xl:hidden" title={link.destinationPath}>{link.destinationPath}</span>
        </div>
      </div>

      <div className="hidden w-28 items-center gap-1.5 md:flex">
        <StatusIcon className={`h-3.5 w-3.5 ${status.color}`} aria-hidden="true" />
        <span className={`text-xs font-medium ${status.color}`}>{status.label}</span>
      </div>

      <div className="hidden w-72 min-w-0 xl:block">
        <p className="truncate font-mono text-xs text-white/40" title={link.destinationPath}>{link.destinationPath}</p>
        <p className="mt-0.5 text-xs text-white/25">Created {new Date(link.createdAt).toLocaleDateString()}</p>
      </div>

      <div className="flex w-20 flex-shrink-0 items-center justify-end gap-1">
        <button
          onClick={() => onVerify(link)}
          className="rounded-md p-2 text-white/40 transition-colors hover:bg-blue-500/10 hover:text-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label={`Verify ${skillName} link`}
          title="Verify link"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
        <button
          onClick={() => onRemove(link)}
          className="rounded-md p-2 text-white/30 transition-colors hover:bg-red-500/10 hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
          aria-label={`Remove ${skillName} link`}
          title="Remove link"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

const LinksPageSkeleton: React.FC = () => (
  <div className="mx-auto max-w-screen-2xl space-y-5" aria-busy="true" aria-label="Loading links">
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-2">
        <div className="h-6 w-28 animate-pulse rounded bg-white/[0.08]" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded bg-white/[0.05]" />
      </div>
      <div className="h-10 w-36 animate-pulse rounded-lg bg-white/[0.08]" />
    </div>
    <div className="h-16 animate-pulse rounded-xl border border-white/[0.06] bg-white/[0.03]" />
    <div className="space-y-px overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.03]">
      {Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-16 animate-pulse border-b border-white/[0.04] bg-white/[0.015]" />)}
    </div>
  </div>
);

export default LinksPage;
