import React from 'react';
import { AlertTriangle, Eye, FileText, ShieldAlert } from 'lucide-react';
import type { ImportComponent, ImportComponentSelection, ImportTarget } from '../../../../main/types/import';

interface GitHubImportInventoryProps {
  components: ImportComponent[];
  targets: ImportTarget[];
  selections: Record<string, ImportComponentSelection>;
  onSelectionChange: (selection: ImportComponentSelection) => void;
  onPreview: (component: ImportComponent) => void;
}

const riskStyles: Record<ImportComponent['risk'], string> = {
  low: 'text-green-300 bg-green-500/10 border-green-500/20',
  medium: 'text-amber-300 bg-amber-500/10 border-amber-500/20',
  high: 'text-orange-300 bg-orange-500/10 border-orange-500/20',
  critical: 'text-red-300 bg-red-500/10 border-red-500/20',
};

export const GitHubImportInventory: React.FC<GitHubImportInventoryProps> = ({
  components,
  targets,
  selections,
  onSelectionChange,
  onPreview,
}) => {
  const selectedCount = components.filter((component) => selections[component.id]?.selected).length;

  return (
    <section aria-labelledby="github-import-inventory-title" className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id="github-import-inventory-title" className="text-white font-medium">Repository inventory</h3>
          <p className="text-sm text-white/45 mt-1">
            Select each component independently and choose the destination that will receive it.
          </p>
        </div>
        <span className="text-xs text-white/50" aria-live="polite">{selectedCount} of {components.length} selected</span>
      </div>

      <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-1" role="list">
        {components.map((component) => {
          const selection = selections[component.id] || {
            componentId: component.id,
            targetId: targets[0]?.id || '',
            selected: false,
          };
          const supportedTargets = targets.filter((target) => target.supportedKinds.includes(component.kind));
          const options = supportedTargets.length > 0 ? supportedTargets : targets;
          const variants = component.variants || [];

          return (
            <article
              key={component.id}
              role="listitem"
              className={`p-3 rounded-lg border transition-colors ${selection.selected
                ? 'bg-blue-500/10 border-blue-500/30'
                : 'glass-input border-white/[0.08] hover:border-white/[0.12]'}`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 accent-blue-500"
                  aria-label={`Select ${component.displayName}`}
                  checked={selection.selected}
                  onChange={(event) => onSelectionChange({ ...selection, selected: event.target.checked })}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <FileText className="w-4 h-4 text-white/45" aria-hidden="true" />
                    <span className="text-sm font-medium text-white">{component.displayName}</span>
                    <span className="text-[11px] uppercase tracking-wide text-white/45">{component.kind}</span>
                    <span className={`text-[11px] px-1.5 py-0.5 rounded border ${riskStyles[component.risk]}`}>
                      {component.risk} risk
                    </span>
                    <span className="text-[11px] text-white/45">
                      {supportedTargets.length > 0 ? 'Native adapter' : 'Manual/fallback'}
                    </span>
                    {variants.length > 1 && (
                      <span className="text-[11px] text-blue-200/80" aria-label={`${variants.length} source variants`}>
                        {variants.length} source variants
                      </span>
                    )}
                    {component.requiresActivation && <ShieldAlert className="w-3.5 h-3.5 text-orange-300" aria-label="Requires activation confirmation" />}
                    {component.metadata.invalidManifest === true && (
                      <span className="text-[11px] text-red-300">Invalid manifest</span>
                    )}
                  </div>
                  <p className="text-xs text-white/45 mt-1">{component.description || 'No description'}</p>
                  {variants.length > 1 && (
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-[11px] text-blue-200/70" aria-label={`Source variants for ${component.displayName}`}>
                      <span>Sources:</span>
                      {variants.map((variant) => <span key={variant.sourcePath}>{variant.sourcePath}</span>)}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-[11px] text-white/40">
                    <span>{component.files.length} file{component.files.length === 1 ? '' : 's'}</span>
                    <span>Source: {component.sourcePath || '/'}</span>
                    {component.dependencies.length > 0 && <span>Depends on: {component.dependencies.join(', ')}</span>}
                  </div>
                  {component.requiresActivation && (
                    <p className="flex items-center gap-1 mt-1 text-[11px] text-orange-300/90">
                      <AlertTriangle className="w-3 h-3" aria-hidden="true" /> Installed disabled; activation requires a second review.
                    </p>
                  )}
                  {component.fallback && (
                    <div className="mt-2 p-2 rounded border border-red-500/20 bg-red-500/5">
                      <label className="flex items-start gap-2 text-[11px] text-red-200 cursor-pointer">
                        <input
                          type="checkbox"
                          className="mt-0.5 accent-red-500"
                          checked={Boolean(selection.fallbackAuthorized)}
                          onChange={(event) => onSelectionChange({ ...selection, fallbackAuthorized: event.target.checked })}
                        />
                        <span>Authorize fallback command for this component</span>
                      </label>
                      <code className="block mt-1 text-[10px] text-white/55 break-all">
                        {component.fallback.executable} {component.fallback.args.join(' ')}
                      </code>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <label className="text-[11px] text-white/50" htmlFor={`conflict-${component.id}`}>Conflict policy</label>
                    <select
                      id={`conflict-${component.id}`}
                      aria-label={`Conflict policy for ${component.displayName}`}
                      value={selection.conflictStrategy || 'block'}
                      onChange={(event) => onSelectionChange({
                        ...selection,
                        conflictStrategy: event.target.value as ImportComponentSelection['conflictStrategy'],
                      })}
                      className="px-2 py-1 glass border border-white/[0.12] rounded text-xs text-white bg-transparent focus:outline-none focus:border-blue-500"
                    >
                      <option value="block" className="bg-neutral-900">Block and review</option>
                      <option value="skip" className="bg-neutral-900">Skip if present</option>
                      <option value="rename" className="bg-neutral-900">Rename if present</option>
                      <option value="overwrite" className="bg-neutral-900">Overwrite with backup</option>
                    </select>
                    {selection.conflictStrategy === 'rename' && (
                      <input
                        type="text"
                        aria-label={`Rename ${component.displayName}`}
                        placeholder="new destination name"
                        value={selection.renameTo || ''}
                        onChange={(event) => onSelectionChange({ ...selection, renameTo: event.target.value })}
                        className="min-w-40 px-2 py-1 glass border border-white/[0.12] rounded text-xs text-white focus:outline-none focus:border-blue-500"
                      />
                    )}
                  </div>
                  {selection.conflictStrategy === 'overwrite' && (
                    <p className="mt-1 text-[11px] text-orange-300/90">Existing content will be backed up before replacement.</p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <label className="text-[11px] text-white/50" htmlFor={`target-${component.id}`}>Destination</label>
                    <select
                      id={`target-${component.id}`}
                      aria-label={`Destination for ${component.displayName}`}
                      value={selection.targetId}
                      onChange={(event) => onSelectionChange({ ...selection, targetId: event.target.value })}
                      className="min-w-48 max-w-full px-2 py-1 glass border border-white/[0.12] rounded text-xs text-white bg-transparent focus:outline-none focus:border-blue-500"
                    >
                      {options.map((target) => (
                        <option key={target.id} value={target.id} className="bg-neutral-900">{target.label}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => onPreview(component)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs text-white/60 hover:text-white transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" aria-hidden="true" /> Review files
                    </button>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};
