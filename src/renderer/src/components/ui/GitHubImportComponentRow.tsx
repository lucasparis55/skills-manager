import React, { useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Eye,
  FileText,
} from 'lucide-react';
import type { ImportComponent, ImportComponentSelection, ImportTarget } from '../../../../main/types/import';
import { getInventoryKindLabel } from './github-import-inventory.utils';

interface GitHubImportComponentRowProps {
  component: ImportComponent;
  selection?: ImportComponentSelection;
  targets: ImportTarget[];
  onSelectionChange: (selection: ImportComponentSelection) => void;
  onPreview: (component: ImportComponent) => void;
}

const riskStyles: Record<ImportComponent['risk'], string> = {
  low: 'text-green-300 bg-green-500/10 border-green-500/20',
  medium: 'text-amber-300 bg-amber-500/10 border-amber-500/20',
  high: 'text-orange-300 bg-orange-500/10 border-orange-500/20',
  critical: 'text-red-300 bg-red-500/10 border-red-500/20',
};

export const GitHubImportComponentRow: React.FC<GitHubImportComponentRowProps> = ({
  component,
  selection,
  targets,
  onSelectionChange,
  onPreview,
}) => {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const currentSelection = selection || {
    componentId: component.id,
    targetId: targets.find((target) => target.supportedKinds.includes(component.kind))?.id || targets[0]?.id || '',
    selected: false,
    conflictStrategy: 'block' as const,
    activate: false,
    fallbackAuthorized: false,
  };
  const supportedTargets = targets.filter((target) => target.supportedKinds.includes(component.kind));
  const options = supportedTargets.length > 0 ? supportedTargets : targets;
  const variants = component.variants || [];
  const detailsId = `component-details-${component.id}`;

  return (
    <article
      role="listitem"
      className={`rounded-lg border p-3 transition-colors ${currentSelection.selected
        ? 'bg-blue-500/10 border-blue-500/30'
        : 'glass-input border-white/[0.08] hover:border-white/[0.12]'}`}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 accent-blue-500"
          aria-label={`Select ${component.displayName}`}
          checked={currentSelection.selected}
          onChange={(event) => onSelectionChange({ ...currentSelection, selected: event.target.checked })}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <FileText className="w-4 h-4 text-white/45" aria-hidden="true" />
            <span className="text-sm font-medium text-white">{component.displayName}</span>
            <span className="rounded border border-white/[0.10] px-1.5 py-0.5 text-[11px] text-white/55">
              {getInventoryKindLabel(component.kind)}
            </span>
            <span className={`rounded border px-1.5 py-0.5 text-[11px] ${riskStyles[component.risk]}`}>
              {component.risk} risk
            </span>
            {variants.length > 1 && <span className="text-[11px] text-blue-200/80">{variants.length} provider variants</span>}
            {component.requiresActivation && <span className="text-[11px] text-orange-200/90">Disabled by default</span>}
            {component.metadata.invalidManifest === true && <span className="text-[11px] text-red-300">Invalid manifest</span>}
          </div>
          <p className="mt-1 text-xs text-white/45">{component.description || 'No description'}</p>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/40">
            <span>{component.files.length} file{component.files.length === 1 ? '' : 's'}</span>
            <span>Source: {component.sourcePath || '/'}</span>
            {component.dependencies.length > 0 && <span>{component.dependencies.length} supporting item{component.dependencies.length === 1 ? '' : 's'} included when needed</span>}
          </div>
          {component.requiresActivation && (
            <p className="mt-1 flex items-center gap-1 text-[11px] text-orange-300/90">
              <AlertTriangle className="h-3 w-3" aria-hidden="true" /> Installed disabled; activation needs a second review.
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onPreview(component)}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs text-white/60 hover:text-white transition-colors"
            >
              <Eye className="h-3.5 w-3.5" aria-hidden="true" /> Review files
            </button>
            <button
              type="button"
              onClick={() => setDetailsOpen((previous) => !previous)}
              aria-expanded={detailsOpen}
              aria-controls={detailsId}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs text-white/60 hover:text-white transition-colors"
            >
              {detailsOpen ? <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />}
              {detailsOpen ? 'Hide details' : 'Show details'}
            </button>
          </div>

          {detailsOpen && (
            <div id={detailsId} className="mt-3 space-y-3 border-t border-white/[0.08] pt-3">
              {variants.length > 1 && (
                <details className="rounded border border-blue-500/20 bg-blue-500/5 p-2" open>
                  <summary className="cursor-pointer text-xs text-blue-100">Source variants ({variants.length})</summary>
                  <div className="mt-2 space-y-1 text-[11px] text-blue-100/70">
                    {variants.map((variant) => <div key={variant.sourcePath}>{variant.sourcePath}</div>)}
                  </div>
                </details>
              )}
              {component.dependencies.length > 0 && (
                <div className="rounded border border-white/[0.08] bg-black/20 p-2 text-[11px] text-white/55">
                  <p className="font-medium text-white/70">Included support</p>
                  <p className="mt-1 break-all">{component.dependencies.join(', ')}</p>
                </div>
              )}
              {component.fallback && (
                <div className="rounded border border-red-500/20 bg-red-500/5 p-2">
                  <label className="flex items-start gap-2 text-[11px] text-red-200 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5 accent-red-500"
                      checked={Boolean(currentSelection.fallbackAuthorized)}
                      onChange={(event) => onSelectionChange({ ...currentSelection, fallbackAuthorized: event.target.checked })}
                    />
                    <span>Authorize fallback command for this component</span>
                  </label>
                  <code className="mt-1 block break-all text-[10px] text-white/55">
                    {component.fallback.executable} {component.fallback.args.join(' ')}
                  </code>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-[11px] text-white/50" htmlFor={`conflict-${component.id}`}>Conflict policy</label>
                <select
                  id={`conflict-${component.id}`}
                  aria-label={`Conflict policy for ${component.displayName}`}
                  value={currentSelection.conflictStrategy || 'block'}
                  onChange={(event) => onSelectionChange({
                    ...currentSelection,
                    conflictStrategy: event.target.value as ImportComponentSelection['conflictStrategy'],
                  })}
                  className="rounded border border-white/[0.12] bg-transparent px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="block" className="bg-neutral-900">Block and review</option>
                  <option value="skip" className="bg-neutral-900">Skip if present</option>
                  <option value="rename" className="bg-neutral-900">Rename if present</option>
                  <option value="overwrite" className="bg-neutral-900">Overwrite with backup</option>
                </select>
                {currentSelection.conflictStrategy === 'rename' && (
                  <input
                    type="text"
                    aria-label={`Rename ${component.displayName}`}
                    placeholder="new destination name"
                    value={currentSelection.renameTo || ''}
                    onChange={(event) => onSelectionChange({ ...currentSelection, renameTo: event.target.value })}
                    className="min-w-40 rounded border border-white/[0.12] bg-transparent px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                )}
              </div>
              {currentSelection.conflictStrategy === 'overwrite' && (
                <p className="text-[11px] text-orange-300/90">Existing content will be backed up before replacement.</p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-[11px] text-white/50" htmlFor={`target-${component.id}`}>Destination</label>
                <select
                  id={`target-${component.id}`}
                  aria-label={`Destination for ${component.displayName}`}
                  value={currentSelection.targetId}
                  onChange={(event) => onSelectionChange({ ...currentSelection, targetId: event.target.value })}
                  className="min-w-48 max-w-full rounded border border-white/[0.12] bg-transparent px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
                >
                  {options.map((target) => (
                    <option key={target.id} value={target.id} className="bg-neutral-900">{target.label}</option>
                  ))}
                </select>
                {supportedTargets.length === 0 && <span className="text-[11px] text-red-200/80">No native adapter for this type.</span>}
              </div>
            </div>
          )}
        </div>
      </div>
    </article>
  );
};
