import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Package, Wrench } from 'lucide-react';
import type { ImportComponent, ImportComponentSelection, ImportTarget } from '../../../../main/types/import';
import { GitHubImportComponentRow } from './GitHubImportComponentRow';
import {
  getBulkSelectableComponents,
  getDefaultSelection,
  getInventoryGroups,
  isTechnicalComponent,
  type ImportInventoryGroup,
} from './github-import-inventory.utils';

interface GitHubImportInventoryProps {
  components: ImportComponent[];
  targets: ImportTarget[];
  selections: Record<string, ImportComponentSelection>;
  onSelectionChange: (selection: ImportComponentSelection) => void;
  onBulkSelectionChange?: (selections: ImportComponentSelection[]) => void;
  onPreview: (component: ImportComponent) => void;
}

const getSelection = (
  component: ImportComponent,
  selections: Record<string, ImportComponentSelection>,
  targets: ImportTarget[],
): ImportComponentSelection => selections[component.id] || {
  componentId: component.id,
  targetId: targets.find((target) => target.supportedKinds.includes(component.kind))?.id || targets[0]?.id || '',
  selected: getDefaultSelection(component),
  conflictStrategy: 'block',
  activate: false,
  fallbackAuthorized: false,
};

export const GitHubImportInventory: React.FC<GitHubImportInventoryProps> = ({
  components,
  targets,
  selections,
  onSelectionChange,
  onBulkSelectionChange,
  onPreview,
}) => {
  const groups = getInventoryGroups(components);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    skills: true,
    commands: false,
    agents: false,
    hooks: true,
    bundles: false,
    manual: false,
    technical: false,
  });
  const selectedChoices = components
    .filter((component) => !isTechnicalComponent(component) && component.kind !== 'bundle')
    .filter((component) => selections[component.id]?.selected).length;
  const selectedTechnical = components
    .filter((component) => isTechnicalComponent(component) && selections[component.id]?.selected).length;
  const selectedBundle = components
    .filter((component) => component.kind === 'bundle' && selections[component.id]?.selected).length;

  const updateMany = (items: ImportComponent[], selected: boolean) => {
    const nextSelections = items.map((component) => ({
      ...getSelection(component, selections, targets),
      selected,
    }));
    if (onBulkSelectionChange) onBulkSelectionChange(nextSelections);
    else nextSelections.forEach((selection) => onSelectionChange(selection));
  };

  const toggleGroup = (group: ImportInventoryGroup) => {
    const selectedCount = group.components.filter((component) => selections[component.id]?.selected).length;
    updateMany(group.components, selectedCount !== group.components.length);
  };

  return (
    <section aria-labelledby="github-import-inventory-title" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 id="github-import-inventory-title" className="text-white font-medium">Choose what to import</h3>
          <p className="mt-1 text-sm text-white/45">
            Choose capabilities first. Files needed by a selected capability are included automatically.
          </p>
        </div>
        <div className="text-xs text-white/55 sm:text-right" aria-live="polite">
          <div>{selectedChoices} choice{selectedChoices === 1 ? '' : 's'} selected</div>
          {selectedTechnical > 0 && <div>{selectedTechnical} technical file{selectedTechnical === 1 ? '' : 's'} selected</div>}
          {selectedBundle > 0 && <div>{selectedBundle} package route selected</div>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] p-3">
        <span className="mr-1 text-xs font-medium text-white/70">Selection</span>
        <button
          type="button"
          onClick={() => updateMany(getBulkSelectableComponents(components), true)}
          className="rounded border border-blue-400/25 bg-blue-500/10 px-2.5 py-1.5 text-xs text-blue-100 hover:bg-blue-500/20 transition-colors"
        >
          Select all choices
        </button>
        <button
          type="button"
          onClick={() => updateMany(components, false)}
          className="rounded border border-white/[0.12] px-2.5 py-1.5 text-xs text-white/65 hover:bg-white/[0.06] hover:text-white transition-colors"
        >
          Clear all
        </button>
        <span className="text-[11px] text-white/40">Support files are not selected separately.</span>
      </div>

      <div className="space-y-3">
        {groups.map((group) => (
          <InventoryGroup
            key={group.id}
            group={group}
            expanded={expandedGroups[group.id] === true}
            selections={selections}
            targets={targets}
            onToggleExpanded={() => setExpandedGroups((previous) => ({
              ...previous,
              [group.id]: !previous[group.id],
            }))}
            onToggleGroup={() => toggleGroup(group)}
            onSelectionChange={onSelectionChange}
            onPreview={onPreview}
          />
        ))}
      </div>
    </section>
  );
};

const InventoryGroup: React.FC<{
  group: ImportInventoryGroup;
  expanded: boolean;
  selections: Record<string, ImportComponentSelection>;
  targets: ImportTarget[];
  onToggleExpanded: () => void;
  onToggleGroup: () => void;
  onSelectionChange: (selection: ImportComponentSelection) => void;
  onPreview: (component: ImportComponent) => void;
}> = ({
  group,
  expanded,
  selections,
  targets,
  onToggleExpanded,
  onToggleGroup,
  onSelectionChange,
  onPreview,
}) => {
  const selectedCount = group.components.filter((component) => selections[component.id]?.selected).length;
  const allSelected = selectedCount === group.components.length;
  const isTechnical = group.id === 'technical';
  const isBundle = group.id === 'bundles';

  return (
    <section className="rounded-lg border border-white/[0.08] bg-black/10" aria-labelledby={`github-import-group-${group.id}`}>
      <div className="flex items-start gap-3 p-3">
        <button
          type="button"
          onClick={onToggleExpanded}
          aria-expanded={expanded}
          aria-controls={`github-import-group-content-${group.id}`}
          className="mt-0.5 text-white/50 hover:text-white transition-colors"
          aria-label={`${expanded ? 'Hide' : 'Show'} ${group.label}`}
        >
          {expanded ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {isTechnical ? <Wrench className="h-4 w-4 text-white/45" aria-hidden="true" /> : <Package className="h-4 w-4 text-white/45" aria-hidden="true" />}
            <h4 id={`github-import-group-${group.id}`} className="text-sm font-medium text-white">{group.label}</h4>
            <span className="text-[11px] text-white/45">{group.components.length}</span>
            <span className="text-[11px] text-white/45">{selectedCount} selected</span>
          </div>
          <p className="mt-1 text-xs text-white/45">{group.description}</p>
          {isBundle && (
            <p className="mt-1 text-[11px] text-amber-200/80">
              Use this only when you want the repository as one package; it overlaps with individual choices.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onToggleGroup}
          className="shrink-0 rounded border border-white/[0.12] px-2 py-1 text-[11px] text-white/60 hover:bg-white/[0.06] hover:text-white transition-colors"
        >
          {allSelected ? 'Clear group' : 'Select group'}
        </button>
      </div>

      {expanded && (
        <div id={`github-import-group-content-${group.id}`} className="space-y-2 border-t border-white/[0.06] p-2" role="list">
          {group.components.map((component) => (
            <GitHubImportComponentRow
              key={component.id}
              component={component}
              selection={selections[component.id]}
              targets={targets}
              onSelectionChange={onSelectionChange}
              onPreview={onPreview}
            />
          ))}
        </div>
      )}
    </section>
  );
};
