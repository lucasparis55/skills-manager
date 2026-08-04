import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Link2, Loader2, RefreshCw } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import { useToast } from './Toast';

const statusLabels: Record<LinkMigrationCandidate['status'], string> = {
  ready: 'Ready',
  conflict: 'Conflict',
  blocked: 'Blocked',
};

const statusIcons = {
  ready: CheckCircle2,
  conflict: AlertCircle,
  blocked: AlertCircle,
};

const statusClasses: Record<LinkMigrationCandidate['status'], string> = {
  ready: 'text-emerald-400',
  conflict: 'text-amber-400',
  blocked: 'text-red-400',
};

const SkillLinkMigrationPanel: React.FC = () => {
  const [candidates, setCandidates] = useState<LinkMigrationCandidate[]>([]);
  const [results, setResults] = useState<LinkMigrationResult[]>([]);
  const [scanning, setScanning] = useState(false);
  const [applying, setApplying] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const { toast } = useToast();

  const scanMigration = async () => {
    setScanning(true);
    try {
      const preview = await window.api.links.previewMigration();
      setCandidates(preview.candidates);
      setHasScanned(true);
      return true;
    } catch (err: any) {
      toast({ title: 'Migration scan failed', description: err.message || 'Could not scan managed links.', variant: 'error' });
      return false;
    } finally {
      setScanning(false);
    }
  };

  const handleMigrate = async () => {
    const readyIds = candidates.filter((candidate) => candidate.status === 'ready').map((candidate) => candidate.linkId);
    if (readyIds.length === 0) return;

    setApplying(true);
    try {
      const migrationResults = await window.api.links.migrate(readyIds);
      setResults(migrationResults);
      setShowConfirm(false);
      await scanMigration();
      const migratedCount = migrationResults.filter((result) => result.status === 'migrated').length;
      const skippedCount = migrationResults.filter((result) => result.status === 'skipped').length;
      const failedCount = migrationResults.filter((result) => result.status === 'failed').length;
      toast({
        title: failedCount > 0 ? 'Migration completed with issues' : 'Migration completed',
        description: `${migratedCount} link(s) moved, ${skippedCount} skipped, ${failedCount} failed. Conflicts and blocked entries were left untouched.`,
        variant: failedCount > 0 ? 'warning' : 'success',
      });
    } catch (err: any) {
      toast({ title: 'Migration failed', description: err.message || 'Could not migrate managed links.', variant: 'error' });
    } finally {
      setApplying(false);
    }
  };

  const readyCount = candidates.filter((candidate) => candidate.status === 'ready').length;
  const migrateLabel = readyCount === 1 ? 'Migrate 1 ready link' : `Migrate ${readyCount} ready links`;

  return (
    <>
      <div className="glass-panel p-6">
        <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
          <Link2 className="w-5 h-5" />
          Skill Link Migration
        </h3>
        <p className="text-sm text-white/45 mb-4">
          Find managed global links outside each tool&apos;s <code className="text-white/70">skills</code> directory.
          Existing destinations, real directories, and conflicts are never overwritten.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => { void scanMigration(); }}
            disabled={scanning || applying}
            className="flex items-center gap-2 px-3 py-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 rounded-lg text-sm text-white transition-colors"
          >
            {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Scan for misplaced links
          </button>
          {hasScanned && readyCount > 0 && (
            <button
              type="button"
              onClick={() => setShowConfirm(true)}
              disabled={scanning || applying}
              className="px-3 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 rounded-lg text-sm text-white transition-colors"
            >
              {migrateLabel}
            </button>
          )}
        </div>

        {hasScanned && candidates.length === 0 && (
          <p role="status" className="text-sm text-emerald-400 mt-4">
            No misplaced managed links were found.
          </p>
        )}

        {candidates.length > 0 && (
          <ul className="mt-4 space-y-3" aria-busy={scanning}>
            {candidates.map((candidate) => {
              const StatusIcon = statusIcons[candidate.status];
              return (
                <li key={candidate.linkId} className="glass-card p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-white truncate">
                        {candidate.skillName} <span className="text-white/40">·</span> {candidate.ideName}
                      </p>
                      <p className="text-xs text-white/45 truncate" title={candidate.currentPath}>
                        <span>Current: </span><code>{candidate.currentPath}</code>
                      </p>
                      <p className="text-xs text-white/45 truncate" title={candidate.targetPath}>
                        <span>Target: </span><code>{candidate.targetPath}</code>
                      </p>
                    </div>
                    <span className={`flex items-center gap-1 text-xs shrink-0 ${statusClasses[candidate.status]}`}>
                      <StatusIcon className="w-3.5 h-3.5" />
                      {statusLabels[candidate.status]}
                    </span>
                  </div>
                  {candidate.message && <p className="text-xs text-white/45 mt-2">{candidate.message}</p>}
                </li>
              );
            })}
          </ul>
        )}

        {results.length > 0 && (
          <p role="status" className="text-sm text-emerald-400 mt-4">
            Migration completed: {results.filter((result) => result.status === 'migrated').length} link(s) migrated.
          </p>
        )}
      </div>

      <ConfirmDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title="Migrate skill links?"
        description={`This will create canonical links for ${readyCount} ready link(s), then remove only the old managed symlinks. Existing destinations and conflicts will be left untouched.`}
        onConfirm={handleMigrate}
        confirmLabel="Migrate links"
        variant="default"
      />
    </>
  );
};

export default SkillLinkMigrationPanel;
