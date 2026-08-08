import React from 'react';
import { ChevronRight, CheckCircle2, Loader2 } from 'lucide-react';
import type {
  ImportActivationPreview,
  ImportComponent,
  ImportComponentResult,
  ImportComponentSelection,
  ImportPlan,
  ImportPlanItem,
  ImportProgress,
  ImportTarget,
} from '../../../../main/types/import';
import { GitHubImportInventory } from './GitHubImportInventory';
import { GitHubImportReview } from './GitHubImportReview';

export interface GitHubComponentPreview {
  componentId: string;
  files: Array<{ path: string; content: string; truncated: boolean }>;
  revision: { ref: string; commitSha?: string; treeSha?: string };
}

type ComponentFlowPhase = 'preview' | 'component-review' | 'component-importing' | 'component-results';

interface RepositoryInfo {
  fullName?: string;
  description?: string;
  revision?: { commitSha?: string };
}

interface GitHubImportComponentFlowProps {
  phase: ComponentFlowPhase;
  repoInfo: RepositoryInfo | null;
  components: ImportComponent[];
  targets: ImportTarget[];
  selections: Record<string, ImportComponentSelection>;
  plan: ImportPlan | null;
  results: ImportComponentResult[];
  progress: ImportProgress | null;
  preview: GitHubComponentPreview | null;
  loading: boolean;
  onSelectionChange: (selection: ImportComponentSelection) => void;
  onPreview: (component: ImportComponent) => void;
  onClosePreview: () => void;
  onBackToUrl: () => void;
  onReview: () => void;
  onBackToInventory: () => void;
  onInstall: () => void;
  onActivateHook: (item: ImportPlanItem, activation: ImportActivationPreview) => void;
  onRunFallback: (item: ImportPlanItem) => void;
  onClose: () => void;
}

export const GitHubImportComponentFlow: React.FC<GitHubImportComponentFlowProps> = ({
  phase,
  repoInfo,
  components,
  targets,
  selections,
  plan,
  results,
  progress,
  preview,
  loading,
  onSelectionChange,
  onPreview,
  onClosePreview,
  onBackToUrl,
  onReview,
  onBackToInventory,
  onInstall,
  onActivateHook,
  onRunFallback,
  onClose,
}) => {
  const selectedCount = Object.values(selections).filter((selection) => selection.selected).length;
  const installedCount = results.filter((result) => result.status === 'installed' || result.status === 'activated').length;
  const skippedCount = results.filter((result) => result.status === 'skipped' || result.status === 'needs-approval').length;
  const errorCount = results.filter((result) => result.status === 'failed' || result.status === 'blocked').length;

  return (
    <>
      {preview && (
        <div className="mb-4 p-3 rounded-lg border border-blue-500/25 bg-blue-500/5 space-y-3" role="dialog" aria-label="Component file preview">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium text-white">Component file preview</h3>
              <p className="text-xs text-white/45 mt-1">Revision: {preview.revision.commitSha || preview.revision.ref}</p>
            </div>
            <button type="button" onClick={onClosePreview} className="px-2 py-1 text-xs text-white/55 hover:text-white transition-colors">
              Close preview
            </button>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {preview.files.map((file) => (
              <div key={file.path} className="rounded border border-white/[0.08] bg-black/20 p-2">
                <p className="text-xs text-white/70 break-all">{file.path}</p>
                <pre className="mt-1 max-h-36 overflow-auto text-[11px] text-white/60 whitespace-pre-wrap">{file.content}{file.truncated ? '\n… preview truncated …' : ''}</pre>
              </div>
            ))}
          </div>
        </div>
      )}

      {phase === 'preview' && (
        <div className="space-y-4">
          <div>
            <h3 className="text-white font-medium">{repoInfo?.fullName}</h3>
            <p className="text-sm text-white/45 mt-1">{repoInfo?.description || 'No description'}</p>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-white/40">
              <span>{components.length} installable component{components.length !== 1 ? 's' : ''} detected</span>
              {repoInfo?.revision?.commitSha && <span>Revision: {repoInfo.revision.commitSha}</span>}
            </div>
          </div>

          <GitHubImportInventory
            components={components}
            targets={targets}
            selections={selections}
            onSelectionChange={onSelectionChange}
            onPreview={onPreview}
          />

          <div className="flex justify-between items-center pt-2">
            <span className="text-xs text-white/40">{selectedCount} of {components.length} selected</span>
            <div className="flex gap-3">
              <button type="button" onClick={onBackToUrl} className="px-4 py-2 text-white/45 hover:text-white transition-colors">
                Back
              </button>
              <button
                type="button"
                onClick={onReview}
                disabled={selectedCount === 0 || loading}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                {loading ? 'Creating plan...' : `Review selected (${selectedCount})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {phase === 'component-review' && plan && (
        <GitHubImportReview
          plan={plan}
          results={[]}
          onBack={onBackToInventory}
          onInstall={onInstall}
          onActivateHook={onActivateHook}
          onRunFallback={onRunFallback}
          installing={loading}
        />
      )}

      {(phase === 'component-importing' || phase === 'component-results') && plan && (
        <div className="space-y-4">
          {phase === 'component-importing' && (
            <div className="p-3 rounded-lg border border-blue-500/20 bg-blue-500/5">
              {progress ? (
                <>
                  <div className="w-full bg-white/10 rounded-full h-2">
                    <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${progress.percentComplete}%` }} />
                  </div>
                  <p className="text-sm text-white/50 mt-2">{progress.phase} {progress.currentSkillName}...</p>
                </>
              ) : (
                <div className="flex items-center justify-center py-2 text-white/50 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" /> Installing reviewed components...
                </div>
              )}
            </div>
          )}
          <GitHubImportReview
            plan={plan}
            results={results}
            onBack={onBackToInventory}
            onInstall={onInstall}
            onActivateHook={onActivateHook}
            onRunFallback={onRunFallback}
            installing={phase === 'component-importing' || loading}
          />
          {phase === 'component-results' && (
            <div className="flex flex-wrap gap-4 text-sm text-white/70">
              <span className="flex items-center gap-1"><CheckCircle2 className="w-4 h-4 text-green-400" /> {installedCount} installed/activated</span>
              {skippedCount > 0 && <span>{skippedCount} awaiting approval/skipped</span>}
              {errorCount > 0 && <span>{errorCount} errors</span>}
              <button type="button" onClick={onClose} className="ml-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
                Close
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
};
