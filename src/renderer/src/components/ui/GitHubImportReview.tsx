import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Code2, Loader2, ShieldAlert } from 'lucide-react';
import type {
  ImportActivationPreview,
  ImportComponentResult,
  ImportPlan,
  ImportPlanItem,
} from '../../../../main/types/import';

interface GitHubImportReviewProps {
  plan: ImportPlan;
  results: ImportComponentResult[];
  onBack: () => void;
  onInstall: () => void;
  onActivateHook: (item: ImportPlanItem, activation: ImportActivationPreview) => void;
  onRunFallback: (item: ImportPlanItem) => void;
  installing: boolean;
}

export const GitHubImportReview: React.FC<GitHubImportReviewProps> = ({
  plan,
  results,
  onBack,
  onInstall,
  onActivateHook,
  onRunFallback,
  installing,
}) => {
  const resultByKey = new Map(results.map((result) => [`${result.componentId}@${result.targetId}`, result]));
  const hasBlockers = plan.blockers.length > 0 || plan.items.some((item) => item.status === 'blocked' || item.status === 'conflict');
  const isInstalled = results.length > 0;

  return (
    <section aria-labelledby="github-import-review-title" className="space-y-4">
      <div>
        <h3 id="github-import-review-title" className="text-white font-medium">Review installation</h3>
        <p className="text-sm text-white/45 mt-1">
          Nothing is activated silently. Resolve the highlighted items before installing.
        </p>
      </div>

      {(plan.blockers.length > 0 || plan.warnings.length > 0) && (
        <div className="space-y-2" role="status">
          {plan.blockers.map((blocker) => (
            <div key={blocker} className="flex items-start gap-2 p-2 rounded border border-red-500/25 bg-red-500/10 text-xs text-red-200">
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />{blocker}
            </div>
          ))}
          {plan.warnings.map((warning) => (
            <div key={warning} className="flex items-start gap-2 p-2 rounded border border-amber-500/20 bg-amber-500/10 text-xs text-amber-200">
              <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />{warning}
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">
        {plan.items.map((item) => {
          const result = resultByKey.get(`${item.component.id}@${item.target.id}`);
          return (
            <ReviewItem
              key={`${item.component.id}@${item.target.id}`}
              item={item}
              result={result}
              onActivateHook={onActivateHook}
              onRunFallback={onRunFallback}
            />
          );
        })}
      </div>

      <div className="flex justify-between gap-3 pt-2">
        <button type="button" onClick={onBack} className="px-4 py-2 text-white/45 hover:text-white transition-colors">
          Back
        </button>
        {!isInstalled && (
          <button
            type="button"
            onClick={onInstall}
            disabled={hasBlockers || installing}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
          >
            {installing && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            {installing ? 'Installing...' : 'Install reviewed components'}
          </button>
        )}
      </div>
    </section>
  );
};

const ReviewItem: React.FC<{
  item: ImportPlanItem;
  result?: ImportComponentResult;
  onActivateHook: (item: ImportPlanItem, activation: ImportActivationPreview) => void;
  onRunFallback: (item: ImportPlanItem) => void;
}> = ({ item, result, onActivateHook, onRunFallback }) => {
  const activation = result?.activation;
  const unsupported = !item.target.supportedKinds.includes(item.component.kind);
  const status = result?.status || item.status;
  const tone = status === 'ready' || status === 'installed' || status === 'activated'
    ? 'border-green-500/20 bg-green-500/5'
    : status === 'needs-approval' || status === 'conflict'
      ? 'border-amber-500/25 bg-amber-500/5'
      : 'border-red-500/20 bg-red-500/5';

  return (
    <article className={`p-3 rounded-lg border ${tone}`}>
      <div className="flex items-start gap-2">
        {status === 'installed' || status === 'activated' ? <CheckCircle2 className="w-4 h-4 text-green-300 mt-0.5" aria-hidden="true" /> : <ShieldAlert className="w-4 h-4 text-amber-300 mt-0.5" aria-hidden="true" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-white">{item.component.displayName}</span>
            <span className="text-[11px] text-white/45">→ {item.target.label}</span>
            <span className="text-[11px] uppercase text-white/40">{status}</span>
          </div>
          <p className="text-xs text-white/45 mt-1 break-all">Destination: {item.destinationPath}</p>
          {item.conflict && (
            <div className="mt-2 p-2 rounded border border-amber-500/20 text-xs text-amber-200">
              <p>Conflict: existing destination is protected by default.</p>
              <p className="mt-1 text-white/50">Source: {item.conflict.sourcePath} · Destination: {item.conflict.destinationPath}</p>
              <p className="mt-1">Strategy: {item.conflict.strategy}</p>
            </div>
          )}
          {result?.message && <p className="mt-2 text-xs text-white/60">{result.message}</p>}
          {(result?.stdout || result?.stderr) && (
            <pre className="mt-2 max-h-32 overflow-auto p-2 rounded bg-black/30 text-[11px] text-white/60 whitespace-pre-wrap">
              {result.stdout ? `stdout:\n${result.stdout}` : ''}{result.stderr ? `\nstderr:\n${result.stderr}` : ''}
            </pre>
          )}

          {activation && (
            <div className="mt-3 p-3 rounded border border-orange-500/25 bg-orange-500/10 space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-orange-200">
                <ShieldAlert className="w-4 h-4" aria-hidden="true" /> Hook activation review required
              </div>
              <p className="text-xs text-white/60">Events: {activation.events.join(', ') || 'none declared'}</p>
              <p className="text-xs text-white/60 break-all">Command: {activation.command || 'No command declared'}</p>
              <pre className="max-h-32 overflow-auto p-2 rounded bg-black/30 text-[11px] text-white/70 whitespace-pre-wrap">{activation.content}</pre>
              {activation.currentlyActive ? (
                <p className="text-xs text-green-200">This hook is already active.</p>
              ) : (
                <button
                  type="button"
                  onClick={() => onActivateHook(item, activation)}
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded text-xs transition-colors"
                >
                  Confirm and activate hook
                </button>
              )}
            </div>
          )}

          {unsupported && item.component.fallback && (
            <div className="mt-3 p-3 rounded border border-red-500/25 bg-red-500/10 space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-red-200"><Code2 className="w-4 h-4" aria-hidden="true" /> Native adapter unavailable</div>
              <code className="block text-xs text-white/70 break-all">{item.component.fallback.executable} {item.component.fallback.args.join(' ')}</code>
              <p className="text-xs text-white/60">Working directory: {item.component.fallback.cwd || item.target.projectPath || item.target.rootPath}</p>
              <p className="text-xs text-red-200/80">Risk: {item.component.risk} · This command can change files outside the native adapter.</p>
              <p className="text-xs text-red-200/80">{item.component.fallback.reason}</p>
              {item.selection.fallbackAuthorized ? (
                <button type="button" onClick={() => onRunFallback(item)} className="px-3 py-1.5 bg-red-700 hover:bg-red-800 text-white rounded text-xs transition-colors">
                  Run authorized fallback
                </button>
              ) : (
                <p className="text-xs text-red-200/80">Return to the inventory and explicitly authorize this command before running it.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
};
