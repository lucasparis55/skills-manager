import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  Folder,
  Monitor,
  ShieldCheck,
  Trash2,
} from 'lucide-react';

interface GlobalSkillToolSectionProps {
  tool: GlobalSkillTool;
  skills: GlobalSkillEntry[];
  selectedIds: Set<string>;
  hasSearchFilter: boolean;
  onToggleSelection: (id: string) => void;
  onPreview: (entry: GlobalSkillEntry) => void;
  onRemove: (entry: GlobalSkillEntry) => void;
}

const originLabels: Record<GlobalSkillOrigin, string> = {
  managed: 'Managed',
  external: 'External',
  central: 'Central source',
};

const statusLabels: Record<GlobalSkillStatus, string> = {
  available: 'Available',
  broken: 'Broken',
  protected: 'Protected',
};

const GlobalSkillToolSection: React.FC<GlobalSkillToolSectionProps> = ({
  tool,
  skills,
  selectedIds,
  hasSearchFilter,
  onToggleSelection,
  onPreview,
  onRemove,
}) => {
  return (
    <section className="glass-panel overflow-hidden" aria-labelledby={`global-tool-${tool.ideId}`}>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] p-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-300">
            <Monitor className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3 id={`global-tool-${tool.ideId}`} className="font-semibold text-white">
              {tool.ideName}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/45">
              <span className={tool.detected ? 'text-emerald-300' : 'text-white/45'}>
                {tool.detected ? 'Detected' : 'Not detected'}
              </span>
              <span aria-hidden="true">·</span>
              <span>{skills.length} global skill{skills.length === 1 ? '' : 's'}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-white/45">
          {tool.roots.map((root) => (
            <span
              key={root.path}
              className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-1 ${
                root.exists
                  ? 'border-emerald-400/20 bg-emerald-400/5 text-emerald-200/80'
                  : 'border-white/[0.08] bg-white/[0.03] text-white/40'
              }`}
              title={root.path}
            >
              <Folder className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="max-w-[19rem] truncate">{root.path}</span>
            </span>
          ))}
        </div>
      </div>

      {skills.length === 0 ? (
        <div className="p-8 text-center" role="status">
          <Folder className="mx-auto h-8 w-8 text-white/20" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-white/70">
            {hasSearchFilter ? 'No skills match your search' : 'No global skills found'}
          </p>
          <p className="mt-1 text-xs text-white/40">
            {hasSearchFilter
              ? 'Try a different name, description, or path.'
              : tool.detected
              ? 'This tool has a global skills folder, but it is empty.'
              : 'The expected global skills folder was not detected on this machine.'}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-white/[0.06]">
          {skills.map((entry) => (
            <GlobalSkillRow
              key={entry.id}
              entry={entry}
              selected={selectedIds.has(entry.id)}
              onToggleSelection={() => onToggleSelection(entry.id)}
              onPreview={() => onPreview(entry)}
              onRemove={() => onRemove(entry)}
            />
          ))}
        </div>
      )}
    </section>
  );
};

const GlobalSkillRow: React.FC<{
  entry: GlobalSkillEntry;
  selected: boolean;
  onToggleSelection: () => void;
  onPreview: () => void;
  onRemove: () => void;
}> = ({ entry, selected, onToggleSelection, onPreview, onRemove }) => {
  const isProtected = entry.status === 'protected';
  const isBroken = entry.status === 'broken';

  return (
    <article className={`p-4 transition-colors ${selected ? 'bg-blue-500/5' : 'hover:bg-white/[0.025]'}`}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelection}
          aria-label={`Select ${entry.displayName}`}
          disabled={isProtected}
          className="mt-1 h-4 w-4 shrink-0 accent-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {isBroken ? (
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
                ) : entry.origin === 'managed' ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />
                ) : (
                  <ShieldCheck className="h-4 w-4 shrink-0 text-sky-300" aria-hidden="true" />
                )}
                <h4 className="truncate font-medium text-white">{entry.displayName}</h4>
                <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-[11px] text-white/65">
                  {originLabels[entry.origin]}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] ${statusClass(entry.status)}`}>
                  {statusLabels[entry.status]}
                </span>
                {entry.sharedWith.length > 1 && (
                  <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[11px] text-amber-200">
                    Shared by {entry.sharedWith.length} tools
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-white/50">
                {entry.description || 'No description available.'}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={onPreview}
                aria-label={`Preview ${entry.displayName}`}
                className="rounded-lg p-2 text-blue-300 transition-colors hover:bg-blue-500/10 hover:text-blue-200"
                title="Preview SKILL.md"
              >
                <Eye className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={onRemove}
                aria-label={`Remove ${entry.displayName}`}
                disabled={isProtected}
                className="rounded-lg p-2 text-red-300 transition-colors hover:bg-red-500/10 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-30"
                title={isProtected ? 'Central source is protected' : 'Remove global entry'}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="mt-3 grid gap-1 text-xs text-white/40 md:grid-cols-2">
            <span className="truncate" title={entry.path}>
              <span className="text-white/55">Path:</span> {entry.path}
            </span>
            {entry.origin === 'managed' && entry.sourcePath && (
              <span className="truncate" title={entry.sourcePath}>
                <span className="text-white/55">Source:</span> {entry.sourcePath}
              </span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
};

function statusClass(status: GlobalSkillStatus): string {
  if (status === 'available') return 'bg-emerald-400/10 text-emerald-200';
  if (status === 'broken') return 'bg-amber-400/10 text-amber-200';
  return 'bg-white/[0.08] text-white/55';
}

export default GlobalSkillToolSection;
