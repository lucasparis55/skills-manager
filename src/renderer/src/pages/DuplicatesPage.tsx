import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Copy, Info, RefreshCw, Trash2, XCircle } from 'lucide-react';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { useToast } from '../components/ui/Toast';

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const formatScanTime = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const statusLabel: Record<DuplicateOperationStatus, string> = {
  trashed: 'Sent to trash',
  migrated: 'Migrated',
  'already-missing': 'Already missing',
  blocked: 'Blocked',
  failed: 'Failed',
};

const DuplicatesPage: React.FC = () => {
  const [scanResult, setScanResult] = useState<DuplicateScanResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [pendingAction, setPendingAction] = useState<DuplicateOperationAction | null>(null);
  const [showAllCopiesWarning, setShowAllCopiesWarning] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [operating, setOperating] = useState(false);
  const [operationResults, setOperationResults] = useState<DuplicateOperationResult[]>([]);
  const scanRequestRef = useRef(0);
  const warningTransitionRef = useRef(false);
  const { toast } = useToast();

  const loadScan = useCallback(async (showSpinner = false, clearResults = false) => {
    const requestId = ++scanRequestRef.current;
    if (showSpinner) {
      setScanning(true);
    }
    if (clearResults) {
      setOperationResults([]);
    }
    setScanError(null);
    setSelectedPaths(new Set());

    try {
      const result = await window.api.duplicates.scan();
      if (requestId !== scanRequestRef.current) {
        return;
      }
      setScanResult(result);
    } catch (error) {
      if (requestId !== scanRequestRef.current) {
        return;
      }
      const message = errorMessage(error);
      setScanError(message);
      toast({
        title: 'Duplicate scan failed',
        description: message,
        variant: 'error',
      });
    } finally {
      if (requestId === scanRequestRef.current) {
        setLoading(false);
        setScanning(false);
      }
    }
  }, [toast]);

  useEffect(() => {
    void loadScan(true);
  }, [loadScan]);

  const togglePath = (candidatePath: string) => {
    setSelectedPaths((previous) => {
      const next = new Set(previous);
      if (next.has(candidatePath)) {
        next.delete(candidatePath);
      } else {
        next.add(candidatePath);
      }
      return next;
    });
  };

  const allCopiesSelected = (group: DuplicateGroup): boolean =>
    group.occurrences.length > 0 && group.occurrences.every((occurrence) => selectedPaths.has(occurrence.path));

  const toggleGroup = (group: DuplicateGroup) => {
    const select = !allCopiesSelected(group);
    setSelectedPaths((previous) => {
      const next = new Set(previous);
      for (const occurrence of group.occurrences) {
        if (select) {
          next.add(occurrence.path);
        } else {
          next.delete(occurrence.path);
        }
      }
      return next;
    });
  };

  const requestAction = (action: DuplicateOperationAction) => {
    if (selectedPaths.size === 0 || !scanResult || operating) {
      return;
    }

    setPendingAction(action);
    if (action === 'remove' && scanResult.groups.some(allCopiesSelected)) {
      setShowAllCopiesWarning(true);
      return;
    }
    setShowConfirm(true);
  };

  const continueAfterAllCopiesWarning = () => {
    warningTransitionRef.current = true;
    setShowAllCopiesWarning(false);
    setShowConfirm(true);
  };

  const handleAllCopiesWarningChange = (open: boolean) => {
    if (open) {
      setShowAllCopiesWarning(true);
      return;
    }

    setShowAllCopiesWarning(false);
    if (warningTransitionRef.current) {
      warningTransitionRef.current = false;
      return;
    }
    setPendingAction(null);
  };

  const executeAction = async () => {
    if (!pendingAction || selectedPaths.size === 0 || operating) {
      return;
    }

    const action = pendingAction;
    const paths = [...selectedPaths];
    setOperating(true);
    setPendingAction(null);
    setShowConfirm(false);
    setShowAllCopiesWarning(false);

    try {
      const results = action === 'remove'
        ? await window.api.duplicates.remove(paths)
        : await window.api.duplicates.migrate(paths);

      setOperationResults(results);
      const failed = results.filter(
        (result) => result.status === 'failed' || result.status === 'blocked',
      ).length;
      toast({
        title: failed === 0 ? 'Duplicate operation complete' : 'Partial operation',
        description: `${results.length - failed} succeeded, ${failed} failed or blocked.`,
        variant: failed === 0 ? 'success' : 'error',
      });
    } catch (error) {
      toast({
        title: 'Duplicate operation failed',
        description: errorMessage(error),
        variant: 'error',
      });
    } finally {
      setOperating(false);
      await loadScan(true);
    }
  };

  const actionLabel = pendingAction === 'migrate' ? 'Migrate selected' : 'Remove selected';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Copy className="w-6 h-6 text-blue-400" />
            <h1 className="text-xl font-semibold text-white">Duplicate skills</h1>
          </div>
          <p className="text-sm text-white/45 mt-2">
            Exact copies found in detected global tool skill roots.
          </p>
          {scanResult && (
            <p className="text-xs text-white/35 mt-2">
              {scanResult.groups.length} group{scanResult.groups.length === 1 ? '' : 's'} ·{' '}
              {scanResult.groups.reduce((total, group) => total + group.occurrences.length, 0)} occurrence{scanResult.groups.reduce((total, group) => total + group.occurrences.length, 0) === 1 ? '' : 's'} ·{' '}
              Scanned {formatScanTime(scanResult.scannedAt)}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => void loadScan(true, true)}
          disabled={loading || scanning || operating}
          className="flex items-center gap-2 px-4 py-2 glass hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors text-white/80"
        >
          <RefreshCw className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />
          {scanning ? 'Scanning...' : 'Scan again'}
        </button>
      </div>

      {scanError && (
        <div role="alert" className="flex items-start gap-3 p-4 rounded-lg border border-red-500/30 bg-red-500/10">
          <XCircle className="w-5 h-5 text-red-400 shrink-0" />
          <div>
            <p className="font-medium text-red-200">Unable to scan duplicate skills</p>
            <p className="text-sm text-red-200/70 mt-1">{scanError}</p>
          </div>
        </div>
      )}

      {loading && !scanResult ? (
        <div className="text-center py-12 text-white/55">Loading duplicate skills...</div>
      ) : scanResult && scanResult.groups.length === 0 ? (
        <div className="glass-panel p-8 text-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
          <p className="text-white/80 font-medium">No duplicate skills found</p>
          <p className="text-sm text-white/45 mt-2">
            Checked {scanResult.roots.length} detected global skill root{scanResult.roots.length === 1 ? '' : 's'}.
          </p>
        </div>
      ) : scanResult ? (
        <>
          {selectedPaths.size > 0 && (
            <div className="flex flex-wrap items-center gap-3 border border-white/[0.08] rounded-lg glass p-3">
              <span className="text-sm text-white/55">{selectedPaths.size} selected</span>
              <button
                type="button"
                onClick={() => requestAction('remove')}
                disabled={operating}
                className="flex items-center gap-2 px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Remove selected
              </button>
              <button
                type="button"
                onClick={() => requestAction('migrate')}
                disabled={operating}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
                Migrate selected
              </button>
            </div>
          )}

          <div className="grid gap-4">
            {scanResult.groups.map((group) => {
              const selectedCount = group.occurrences.filter((occurrence) => selectedPaths.has(occurrence.path)).length;
              const allSelected = allCopiesSelected(group);
              return (
                <section key={group.id} className="glass-card p-4" aria-labelledby={`duplicate-group-${group.id}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                    <div>
                      <h2 id={`duplicate-group-${group.id}`} className="text-lg font-semibold text-white">
                        {group.name}
                      </h2>
                      <p className="text-xs text-white/40 mt-1">
                        {group.occurrences.length} identical occurrence{group.occurrences.length === 1 ? '' : 's'} · SHA-256 {group.contentHash}
                      </p>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-white/55 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={(element) => {
                          if (element) {
                            element.indeterminate = selectedCount > 0 && !allSelected;
                          }
                        }}
                        onChange={() => toggleGroup(group)}
                        aria-label={`${allSelected ? 'Deselect' : 'Select'} all ${group.name} copies`}
                        className="accent-blue-500 w-4 h-4"
                      />
                      {allSelected ? 'Deselect all' : 'Select all'}
                    </label>
                  </div>

                  <div className="space-y-2">
                    {group.occurrences.map((occurrence) => (
                      <label
                        key={occurrence.path}
                        className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          selectedPaths.has(occurrence.path)
                            ? 'border-blue-500/50 bg-blue-500/5'
                            : 'border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedPaths.has(occurrence.path)}
                          onChange={() => togglePath(occurrence.path)}
                          aria-label={`Select ${occurrence.ideNames.join(', ')} ${occurrence.name}`}
                          className="accent-blue-500 w-4 h-4 mt-1 shrink-0"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-white/85">
                            {occurrence.ideNames.join(', ')}
                          </span>
                          <span className="block text-xs text-white/45 mt-1 break-all">{occurrence.path}</span>
                          {occurrence.rootPaths.length > 0 && (
                            <span className="block text-[11px] text-white/30 mt-1 break-all">
                              Root: {occurrence.rootPaths.join(', ')}
                            </span>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      ) : null}

      {operationResults.length > 0 && (
        <section className="glass-panel p-4" aria-labelledby="duplicate-operation-results">
          <div className="flex items-center gap-2 mb-3">
            <Info className="w-4 h-4 text-blue-400" />
            <h2 id="duplicate-operation-results" className="text-base font-semibold text-white">
              Operation results
            </h2>
          </div>
          <ul className="space-y-2" aria-label="Duplicate operation results">
            {operationResults.map((result) => (
              <li key={`${result.action}-${result.path}`} className="flex flex-wrap items-start gap-2 text-sm">
                <span className={`font-medium ${
                  result.status === 'failed' || result.status === 'blocked'
                    ? 'text-red-300'
                    : result.status === 'already-missing'
                      ? 'text-amber-300'
                      : 'text-emerald-300'
                }`}>
                  {statusLabel[result.status]}
                </span>
                <span className="text-white/70 break-all">{result.name}</span>
                <span className="text-white/35 break-all">{result.path}</span>
                {result.message && <span className="text-white/50 basis-full">{result.message}</span>}
                {result.centralPath && (
                  <span className="text-white/35 basis-full break-all">Central: {result.centralPath}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {showAllCopiesWarning && (
        <ConfirmDialog
          open
          onOpenChange={handleAllCopiesWarningChange}
          title="Remove all copies?"
          description="You selected every occurrence in at least one duplicate group. All copies in that group will be sent to the operating system trash. Continue to the final confirmation?"
          onConfirm={continueAfterAllCopiesWarning}
          confirmLabel="Continue"
          variant="danger"
        />
      )}

      {showConfirm && pendingAction && (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open && !operating) {
              setShowConfirm(false);
              setPendingAction(null);
            }
          }}
          title={pendingAction === 'remove' ? 'Remove selected occurrences' : 'Migrate selected occurrences'}
          description={pendingAction === 'remove'
            ? `Send ${selectedPaths.size} selected skill occurrence${selectedPaths.size === 1 ? '' : 's'} to the operating system trash?`
            : `Create or reuse one validated central copy, then send ${selectedPaths.size} selected source occurrence${selectedPaths.size === 1 ? '' : 's'} to the operating system trash?`}
          onConfirm={executeAction}
          confirmLabel={operating ? 'Processing...' : actionLabel}
          variant={pendingAction === 'remove' ? 'danger' : 'default'}
        />
      )}
    </div>
  );
};

export default DuplicatesPage;
