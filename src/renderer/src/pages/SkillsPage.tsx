import React, { useState, useEffect, useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Plus, Trash2, Edit, Search, Download, ChevronDown, Check, X, Target, Library, CircleSlash2 } from 'lucide-react';
import * as SelectPrimitive from '@radix-ui/react-select';
import FormDialog, { FormField } from '../components/ui/FormDialog';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import SkillEditDialog from '../components/ui/SkillEditDialog';
import GitHubImportDialog from '../components/ui/GitHubImportDialog';
import ZipImportDialog from '../components/ui/ZipImportDialog';
import { useToast } from '../components/ui/Toast';
import GlobalSkillsView from '../components/ui/GlobalSkillsView';

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
  const location = useLocation();
  const showGlobalSkills = location.pathname === '/skills/global';
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [targetIdeFilter, setTargetIdeFilter] = useState('__all__');
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
    if (!showGlobalSkills) {
      loadSkills();
    }
  }, [showGlobalSkills]);

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

  const availableTargetIdes = useMemo(
    () => Array.from(new Set(skills.flatMap(skill => skill.targetIDEs))).sort(),
    [skills],
  );
  const targetedCount = skills.filter(skill => skill.targetIDEs.length > 0).length;
  const withoutTargetCount = skills.length - targetedCount;
  const hasActiveFilters = search.trim() !== '' || targetIdeFilter !== '__all__';

  const filteredSkills = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();

    return skills.filter(skill => {
      if (targetIdeFilter === '__none__' && skill.targetIDEs.length > 0) return false;
      if (targetIdeFilter !== '__all__' && targetIdeFilter !== '__none__' && !skill.targetIDEs.includes(targetIdeFilter)) return false;

      if (!normalizedSearch) return true;

      return [skill.name, skill.displayName, skill.description, ...skill.targetIDEs, ...skill.tags]
        .join(' ')
        .toLocaleLowerCase()
        .includes(normalizedSearch);
    });
  }, [skills, search, targetIdeFilter]);

  useEffect(() => {
    const visibleIds = new Set(filteredSkills.map(skill => skill.id));
    setSelectedIds(previous => {
      const next = new Set(Array.from(previous).filter(id => visibleIds.has(id)));
      return next.size === previous.size ? previous : next;
    });
  }, [filteredSkills]);

  const clearFilters = () => {
    setSearch('');
    setTargetIdeFilter('__all__');
  };

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

  if (showGlobalSkills) {
    return (
      <div className="space-y-6">
        <SkillsScopeTabs />
        <GlobalSkillsView />
      </div>
    );
  }

  if (loading) return <SkillsPageSkeleton />;

  return (
    <div className="mx-auto max-w-screen-2xl space-y-5">
      <SkillsScopeTabs />

      <section className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between" aria-labelledby="managed-skills-title">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h3 id="managed-skills-title" className="text-xl font-semibold text-white">
              {hasActiveFilters ? `${filteredSkills.length} of ${skills.length} Managed Skills` : `${skills.length} Managed Skills`}
            </h3>
            {skills.length > 0 && (
              <div className="flex items-center gap-3 text-xs" aria-label="Managed skill target summary">
                <span className="flex items-center gap-1.5 text-blue-400">
                  <Target className="h-3.5 w-3.5" aria-hidden="true" />
                  {targetedCount} IDE-targeted
                </span>
                <span className="flex items-center gap-1.5 text-white/45">
                  <CircleSlash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  {withoutTargetCount} without target
                </span>
              </div>
            )}
          </div>
          <p className="mt-1 text-sm text-white/45">Create, import, and maintain the reusable instructions managed by Skills Manager.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setShowImportMenu((prev) => !prev)}
              aria-expanded={showImportMenu}
              aria-haspopup="menu"
              className="flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white/75 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <Download className="w-4 h-4" />
              Import
              <ChevronDown className="w-4 h-4" />
            </button>
            {showImportMenu && (
              <div role="menu" className="glass-dialog absolute right-0 top-full z-20 mt-2 w-48 overflow-hidden rounded-lg border-white/[0.08] shadow-xl">
                <button
                  onClick={() => {
                    setShowImportMenu(false);
                    setShowGithubImportDialog(true);
                  }}
                  role="menuitem"
                  className="w-full px-4 py-2.5 text-left text-sm text-white/80 transition-colors hover:bg-white/[0.06] focus-visible:bg-white/[0.08] focus-visible:outline-none"
                >
                  From GitHub
                </button>
                <button
                  onClick={() => {
                    setShowImportMenu(false);
                    setShowZipImportDialog(true);
                  }}
                  role="menuitem"
                  className="w-full px-4 py-2.5 text-left text-sm text-white/80 transition-colors hover:bg-white/[0.06] focus-visible:bg-white/[0.08] focus-visible:outline-none"
                >
                  From ZIP
                </button>
              </div>
            )}
          </div>
          <button
            onClick={() => setShowCreateDialog(true)}
            className="flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          >
            <Plus className="w-4 h-4" />
            New Skill
          </button>
        </div>
      </section>

      {skills.length > 0 && (
        <section className="glass-panel p-3" aria-label="Find and filter managed skills">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" aria-hidden="true" />
              <input
                type="search"
                aria-label="Search managed skills"
                placeholder="Search skills..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="glass-input h-10 w-full pl-9 pr-3 text-sm focus-visible:ring-2 focus-visible:ring-blue-500/40"
              />
            </div>

            <SelectPrimitive.Root value={targetIdeFilter} onValueChange={setTargetIdeFilter}>
              <SelectPrimitive.Trigger aria-label="Filter by target IDE" className="glass-input flex h-10 min-w-52 items-center justify-between gap-2 px-3 text-sm text-white/80 focus-visible:ring-2 focus-visible:ring-blue-500/40">
                <SelectPrimitive.Value />
                <SelectPrimitive.Icon><ChevronDown className="h-4 w-4 text-white/45" /></SelectPrimitive.Icon>
              </SelectPrimitive.Trigger>
              <SelectPrimitive.Portal>
                <SelectPrimitive.Content className="glass-dialog z-50 max-h-60 overflow-auto rounded-lg border-white/[0.08] shadow-xl">
                  <SelectPrimitive.Viewport>
                    <SkillFilterItem value="__all__">All target IDEs ({skills.length})</SkillFilterItem>
                    {availableTargetIdes.map(ide => (
                      <SkillFilterItem key={ide} value={ide}>
                        {ide} ({skills.filter(skill => skill.targetIDEs.includes(ide)).length})
                      </SkillFilterItem>
                    ))}
                    <SkillFilterItem value="__none__">Without target ({withoutTargetCount})</SkillFilterItem>
                  </SelectPrimitive.Viewport>
                </SelectPrimitive.Content>
              </SelectPrimitive.Portal>
            </SelectPrimitive.Root>

            {hasActiveFilters && (
              <button onClick={clearFilters} className="flex h-10 items-center gap-1.5 px-2 text-sm text-white/50 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                <X className="h-3.5 w-3.5" /> Clear
              </button>
            )}
          </div>
        </section>
      )}

      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3" role="status">
          <span className="text-sm font-medium text-blue-100">{selectedIds.size} skill{selectedIds.size !== 1 ? 's' : ''} selected</span>
          <div className="flex items-center gap-3">
            <button onClick={deselectAll} className="text-sm text-white/60 hover:text-white">Clear selection</button>
            <button
              onClick={() => setShowBulkConfirm(true)}
              disabled={bulkDeleting}
              className="flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium transition-colors hover:bg-red-500 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Remove Selected
            </button>
          </div>
        </div>
      )}

      {filteredSkills.length === 0 ? (
        skills.length === 0 ? (
          <div className="glass-panel flex flex-col items-center px-6 py-16 text-center" role="status">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400"><Library className="h-6 w-6" /></div>
            <h3 className="text-lg font-semibold text-white">No Managed Skills Yet</h3>
            <p className="mb-5 mt-2 max-w-md text-sm text-white/50">Create a skill from scratch or import an existing package from GitHub or ZIP.</p>
            <button
              onClick={() => setShowCreateDialog(true)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold transition-colors hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              Create your first skill
            </button>
          </div>
        ) : (
          <div className="glass-panel flex flex-col items-center px-6 py-14 text-center" role="status">
            <Search className="mb-4 h-8 w-8 text-white/30" />
            <h3 className="text-lg font-semibold text-white">No Matching Skills</h3>
            <p className="mb-4 mt-1 text-sm text-white/45">No skills match your search or target filter.</p>
            <span className="sr-only">No skills match your search</span>
            <button onClick={clearFilters} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white">Clear all filters</button>
          </div>
        )
      ) : (
        <section className="glass-panel overflow-hidden" aria-label="Managed skills list">
          <div className="flex min-h-11 items-center gap-4 border-b border-white/[0.08] bg-white/[0.025] px-4 text-xs font-medium uppercase tracking-wide text-white/35">
            <label className="flex cursor-pointer items-center gap-3 normal-case tracking-normal">
              <input
                type="checkbox"
                checked={selectedVisibleCount === filteredSkills.length && filteredSkills.length > 0}
                ref={(el) => {
                  if (el) {
                    el.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < filteredSkills.length;
                  }
                }}
                onChange={toggleSelectAll}
                className="h-4 w-4 accent-blue-500"
              />
              <span className="whitespace-nowrap text-xs text-white/45">
                {selectedVisibleCount > 0 ? `${selectedVisibleCount} of ${filteredSkills.length} selected` : 'Select all'}
              </span>
            </label>
            <span className="ml-auto hidden lg:block lg:w-60">Targets & tags</span>
            <span className="hidden md:block md:w-20">Version</span>
            <span className="w-20 text-right">Actions</span>
          </div>
          <div className="divide-y divide-white/[0.06]">
            {filteredSkills.map((skill) => (
              <SkillRow
                key={skill.id}
                skill={skill}
                onDelete={(item) => setConfirmState({ skill: item })}
                onEdit={handleEditSkill}
                selected={selectedIds.has(skill.id)}
                onToggleSelect={() => toggleSelection(skill.id)}
              />
            ))}
          </div>
        </section>
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

const SkillsScopeTabs: React.FC = () => {
  const tabs = [
    { to: '/skills', label: 'Managed', end: true },
    { to: '/skills/global', label: 'Global by tool', end: false },
    { to: '/projects', label: 'Project', end: true },
  ];

  return (
    <nav className="flex flex-wrap items-center gap-1 border-b border-white/[0.08]" aria-label="Skill scopes">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            `border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
              isActive
                ? 'border-blue-400 text-white'
                : 'border-transparent text-white/45 hover:border-white/20 hover:text-white/80'
            }`
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
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

const SkillRow: React.FC<{
  skill: Skill;
  onDelete: (skill: Skill) => void;
  onEdit: (skill: Skill) => void;
  selected?: boolean;
  onToggleSelect?: () => void;
}> = ({ skill, onDelete, onEdit, selected = false, onToggleSelect }) => {
  return (
    <div className={`group flex min-h-20 items-center gap-4 px-4 py-3 transition-colors hover:bg-white/[0.025] ${selected ? 'bg-blue-500/[0.08]' : ''}`}>
      {onToggleSelect && (
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          aria-label={`Select ${skill.displayName}`}
          className="h-4 w-4 flex-shrink-0 accent-blue-500"
        />
      )}

      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="hidden h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-white/35 xl:flex">
          <Library className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-white">{skill.displayName}</h3>
            {skill.name !== skill.displayName && <span className="hidden truncate font-mono text-xs text-white/30 sm:inline">{skill.name}</span>}
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/45">{skill.description || 'No description provided'}</p>
          <div className="mt-2 flex flex-wrap gap-1.5 lg:hidden">
            {skill.targetIDEs.length > 0 ? skill.targetIDEs.map(ide => (
              <span key={ide} className={`rounded px-1.5 py-0.5 text-xs ${ideColors[ide] || 'bg-white/[0.08] text-white/65'}`}>{ide}</span>
            )) : <span className="text-xs text-white/35">No IDE target</span>}
            {skill.tags.slice(0, 2).map(tag => <span key={tag} className="rounded bg-white/[0.06] px-1.5 py-0.5 text-xs text-white/50">#{tag}</span>)}
          </div>
        </div>
      </div>

      <div className="hidden w-60 flex-wrap items-center gap-1.5 lg:flex">
        {skill.targetIDEs.length > 0 ? skill.targetIDEs.map(ide => (
          <span key={ide} className={`rounded px-2 py-1 text-xs ${ideColors[ide] || 'bg-white/[0.08] text-white/65'}`}>{ide}</span>
        )) : (
          <span className="flex items-center gap-1.5 text-xs text-white/35"><Target className="h-3.5 w-3.5" />No IDE target</span>
        )}
        {skill.tags.slice(0, 2).map(tag => <span key={tag} className="rounded bg-white/[0.06] px-2 py-1 text-xs text-white/50">#{tag}</span>)}
        {skill.tags.length > 2 && <span className="text-xs text-white/35">+{skill.tags.length - 2}</span>}
      </div>

      <div className="hidden w-20 md:block">
        <span className="rounded bg-white/[0.05] px-2 py-1 font-mono text-xs text-white/50">v{skill.version}</span>
      </div>

      <div className="flex w-20 flex-shrink-0 justify-end gap-1">
        <button
          onClick={() => onEdit(skill)}
          className="rounded-md p-2 text-white/30 transition-colors hover:bg-blue-500/10 hover:text-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          title="Edit skill"
          aria-label={`Edit ${skill.displayName}`}
        >
          <Edit className="h-4 w-4" />
        </button>
        <button
          onClick={() => onDelete(skill)}
          className="rounded-md p-2 text-white/30 transition-colors hover:bg-red-500/10 hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
          title="Delete skill"
          aria-label={`Delete ${skill.displayName}`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

const SkillFilterItem: React.FC<React.PropsWithChildren<{ value: string }>> = ({ value, children }) => (
  <SelectPrimitive.Item value={value} className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-white/80 outline-none data-[highlighted]:bg-white/[0.08]">
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    <SelectPrimitive.ItemIndicator><Check className="h-4 w-4 text-blue-400" /></SelectPrimitive.ItemIndicator>
  </SelectPrimitive.Item>
);

const SkillsPageSkeleton: React.FC = () => (
  <div className="mx-auto max-w-screen-2xl space-y-5" aria-busy="true" aria-label="Loading skills">
    <div className="h-12 border-b border-white/[0.08]" />
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-2">
        <div className="h-6 w-40 animate-pulse rounded bg-white/[0.08]" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded bg-white/[0.05]" />
      </div>
      <div className="h-10 w-32 animate-pulse rounded-lg bg-white/[0.08]" />
    </div>
    <div className="h-16 animate-pulse rounded-xl border border-white/[0.06] bg-white/[0.03]" />
    <div className="space-y-px overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.03]">
      {Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-20 animate-pulse border-b border-white/[0.04] bg-white/[0.015]" />)}
    </div>
  </div>
);

export default SkillsPage;
