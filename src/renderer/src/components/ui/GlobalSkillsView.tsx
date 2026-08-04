import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useToast } from './Toast';
import GlobalSkillPreviewDialog from './GlobalSkillPreviewDialog';
import GlobalSkillRemovalDialog from './GlobalSkillRemovalDialog';
import GlobalSkillToolSection from './GlobalSkillToolSection';

const GlobalSkillsView: React.FC = () => {
  const [inventory, setInventory] = useState<GlobalSkillInventory | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [removalItems, setRemovalItems] = useState<GlobalSkillEntry[]>([]);
  const [removing, setRemoving] = useState(false);
  const [preview, setPreview] = useState<GlobalSkillPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const { toast } = useToast();

  const loadInventory = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const nextInventory = await window.api.globalSkills.scan();
      setInventory(nextInventory);
      setSelectedIds((current) => {
        const availableIds = new Set(nextInventory.tools.flatMap((tool) => tool.skills.map((skill) => skill.id)));
        return new Set([...current].filter((id) => availableIds.has(id)));
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadInventory();
  }, [loadInventory]);

  const uniqueEntries = useMemo(() => {
    const entries = new Map<string, GlobalSkillEntry>();
    for (const tool of inventory?.tools || []) {
      for (const entry of tool.skills) entries.set(entry.id, entry);
    }
    return [...entries.values()];
  }, [inventory]);

  const filteredSkillsByTool = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return new Map(
      (inventory?.tools || []).map((tool) => [
        tool.ideId,
        tool.skills.filter((entry) => {
          if (!normalizedSearch) return true;
          return [entry.name, entry.displayName, entry.description, entry.path, ...entry.ideNames]
            .some((value) => value.toLowerCase().includes(normalizedSearch));
        }),
      ]),
    );
  }, [inventory, search]);

  const visibleSelectedIds = useMemo(() => {
    const visibleIds = new Set(
      [...filteredSkillsByTool.values()].flatMap((skills) => skills.map((skill) => skill.id)),
    );
    return [...selectedIds].filter((id) => visibleIds.has(id));
  }, [filteredSkillsByTool, selectedIds]);

  const toggleSelection = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectVisible = () => {
    setSelectedIds((current) => new Set([...current, ...visibleSelectedIds, ...visibleEntryIds(filteredSkillsByTool)]));
  };

  const deselectVisible = () => {
    const visibleIds = new Set(visibleEntryIds(filteredSkillsByTool));
    setSelectedIds((current) => new Set([...current].filter((id) => !visibleIds.has(id))));
  };

  const openPreview = async (entry: GlobalSkillEntry) => {
    setPreview(entryPreview(entry));
    setPreviewError(null);
    setPreviewLoading(true);
    try {
      const result = await window.api.globalSkills.preview(entry.id);
      setPreview(result);
    } catch (err) {
      setPreviewError(errorMessage(err));
    } finally {
      setPreviewLoading(false);
    }
  };

  const requestRemoval = (entries: GlobalSkillEntry[]) => {
    const unique = new Map(entries.map((entry) => [entry.id, entry]));
    setRemovalItems([...unique.values()]);
  };

  const confirmRemoval = async () => {
    if (removalItems.length === 0) return;
    setRemoving(true);
    try {
      const results = await window.api.globalSkills.remove(removalItems.map((entry) => entry.id));
      const removed = results.filter((result) => result.status === 'trashed').length;
      const failed = results.length - removed;
      const undoTokens = results
        .filter((result) => result.status === 'trashed' && result.canUndo && result.undoToken)
        .map((result) => result.undoToken!);
      setRemovalItems([]);
      setSelectedIds((current) => {
        const removedIds = new Set(results.filter((result) => result.status === 'trashed').map((result) => result.id));
        return new Set([...current].filter((id) => !removedIds.has(id)));
      });
      await loadInventory(true);

      const undo = undoTokens.length > 0
        ? async () => {
            try {
              const undoResults = await window.api.globalSkills.undo(undoTokens);
              const restored = undoResults.filter((result) => result.status === 'restored').length;
              const undoFailed = undoResults.length - restored;
              await loadInventory(true);
              if (undoFailed === 0) {
                toast({ title: 'Skills restored', description: `${restored} global skill${restored === 1 ? '' : 's'} restored.`, variant: 'success' });
              } else {
                toast({ title: 'Partial restore', description: `${restored} restored, ${undoFailed} could not be restored.`, variant: 'error' });
              }
            } catch (err) {
              toast({ title: 'Restore failed', description: errorMessage(err), variant: 'error' });
            }
          }
        : undefined;

      if (failed === 0) {
        toast({
          title: 'Skills removed',
          description: `${removed} global skill${removed === 1 ? '' : 's'} moved to the system trash.`,
          variant: 'success',
          ...(undo ? { action: { label: 'Undo', onClick: undo } } : {}),
        });
      } else {
        toast({
          title: 'Partial removal',
          description: `${removed} removed, ${failed} could not be removed.`,
          variant: 'error',
          ...(undo ? { action: { label: 'Undo', onClick: undo } } : {}),
        });
      }
    } catch (err) {
      toast({ title: 'Removal failed', description: errorMessage(err), variant: 'error' });
    } finally {
      setRemoving(false);
    }
  };

  if (loading && !inventory) {
    return <GlobalSkillsLoading />;
  }

  if (error && !inventory) {
    return <GlobalSkillsError message={error} onRetry={() => void loadInventory()} />;
  }

  if (!inventory) return null;

  const allVisibleSelected = visibleSelectedIds.length > 0 && visibleSelectedIds.length === visibleEntryIds(filteredSkillsByTool).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm text-white/45">Global inventory across detected tools</p>
          <p className="mt-1 text-xs text-white/35">Project-level skills are not scanned or changed here.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="relative min-w-0 sm:min-w-[18rem]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" aria-hidden="true" />
            <span className="sr-only">Search global skills</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search global skills..."
              aria-label="Search global skills"
              className="glass-input w-full py-2 pl-10 pr-4 text-sm text-white placeholder:text-white/35 focus:outline-none focus:border-blue-500"
            />
          </label>
          <button
            type="button"
            onClick={() => void loadInventory(true)}
            disabled={refreshing}
            className="inline-flex items-center justify-center gap-2 rounded-lg glass px-4 py-2 text-sm text-white/75 transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Global skills" value={inventory.totalSkills} icon={<ShieldCheck className="h-4 w-4" />} />
        <SummaryCard label="Managed" value={inventory.managedCount} icon={<CheckCircle2 className="h-4 w-4" />} tone="success" />
        <SummaryCard label="External" value={inventory.externalCount} icon={<ExternalLink className="h-4 w-4" />} tone="info" />
        <SummaryCard label="Tools detected" value={inventory.tools.filter((tool) => tool.detected).length} icon={<ShieldCheck className="h-4 w-4" />} />
        <SummaryCard label="Broken" value={inventory.brokenCount} icon={<AlertCircle className="h-4 w-4" />} tone="warning" />
        <SummaryCard label="Protected" value={inventory.protectedCount} icon={<ShieldCheck className="h-4 w-4" />} tone="muted" />
      </div>

      {selectedIds.size > 0 && (
        <div className="flex flex-col gap-3 rounded-lg border border-blue-400/20 bg-blue-400/5 p-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm text-blue-100/80">{selectedIds.size} global skill{selectedIds.size === 1 ? '' : 's'} selected</span>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={allVisibleSelected ? deselectVisible : selectVisible} className="rounded-lg px-3 py-1.5 text-xs text-white/60 hover:bg-white/[0.06] hover:text-white">
              {allVisibleSelected ? 'Deselect visible' : 'Select visible'}
            </button>
            <button type="button" onClick={() => requestRemoval(uniqueEntries.filter((entry) => selectedIds.has(entry.id)))} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-1.5 text-sm text-white transition-colors hover:bg-red-700">
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Remove selected
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-sm text-amber-100/80" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-4">
        {(inventory.tools || []).map((tool) => (
          <GlobalSkillToolSection
            key={tool.ideId}
            tool={tool}
            skills={filteredSkillsByTool.get(tool.ideId) || []}
            selectedIds={selectedIds}
            hasSearchFilter={Boolean(search.trim())}
            onToggleSelection={toggleSelection}
            onPreview={openPreview}
            onRemove={(entry) => requestRemoval([entry])}
          />
        ))}
      </div>

      <GlobalSkillPreviewDialog
        open={Boolean(preview) || previewLoading}
        onOpenChange={(open) => {
          if (!open) {
            setPreview(null);
            setPreviewError(null);
          }
        }}
        preview={preview}
        loading={previewLoading}
        error={previewError}
      />
      <GlobalSkillRemovalDialog
        open={removalItems.length > 0}
        items={removalItems}
        removing={removing}
        onOpenChange={(open) => {
          if (!open && !removing) setRemovalItems([]);
        }}
        onConfirm={() => void confirmRemoval()}
      />
    </div>
  );
};

const SummaryCard: React.FC<{
  label: string;
  value: number;
  icon: React.ReactNode;
  tone?: 'success' | 'info' | 'warning' | 'muted';
}> = ({ label, value, icon, tone }) => (
  <div className="glass-card flex items-center justify-between p-4">
    <div>
      <p className="text-xs uppercase tracking-wide text-white/40">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    </div>
    <div className={`rounded-lg p-2 ${summaryToneClass(tone)}`}>
      {icon}
    </div>
  </div>
);

function summaryToneClass(tone?: 'success' | 'info' | 'warning' | 'muted'): string {
  if (tone === 'success') return 'bg-emerald-400/10 text-emerald-300';
  if (tone === 'info') return 'bg-sky-400/10 text-sky-300';
  if (tone === 'warning') return 'bg-amber-400/10 text-amber-300';
  if (tone === 'muted') return 'bg-white/[0.08] text-white/55';
  return 'bg-blue-400/10 text-blue-300';
}

const GlobalSkillsLoading: React.FC = () => (
  <div className="space-y-4" aria-busy="true" aria-label="Loading global skills">
    <div className="h-10 w-72 animate-pulse rounded-lg bg-white/[0.06]" />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-24 animate-pulse rounded-lg bg-white/[0.04]" />)}
    </div>
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-white/45" role="status">
      <Loader2 className="h-5 w-5 animate-spin text-blue-300" aria-hidden="true" />
      Loading global skills...
    </div>
  </div>
);

const GlobalSkillsError: React.FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => (
  <div className="glass-panel flex flex-col items-center justify-center p-12 text-center" role="alert">
    <AlertCircle className="h-10 w-10 text-red-300" aria-hidden="true" />
    <h3 className="mt-4 font-semibold text-white">Could not load global skills</h3>
    <p className="mt-2 max-w-md text-sm text-white/45">{message}</p>
    <button type="button" onClick={onRetry} className="mt-5 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">
      Try again
    </button>
  </div>
);

function visibleEntryIds(skillsByTool: Map<string, GlobalSkillEntry[]>): string[] {
  return [...new Set([...skillsByTool.values()].flatMap((skills) => skills.map((skill) => skill.id)))];
}

function entryPreview(entry: GlobalSkillEntry): GlobalSkillPreview {
  return {
    id: entry.id,
    name: entry.name,
    displayName: entry.displayName,
    description: entry.description,
    path: entry.path,
    rootPath: entry.rootPath,
    origin: entry.origin,
    status: entry.status,
    content: '',
    truncated: false,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default GlobalSkillsView;
