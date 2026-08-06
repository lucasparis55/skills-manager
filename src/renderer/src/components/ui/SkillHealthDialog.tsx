import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  AlertTriangle,
  CheckCircle2,
  CircleSlash2,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Wrench,
  X,
} from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import { useToast } from './Toast';

interface SkillSummary {
  id: string;
  displayName: string;
}

interface SkillHealthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skill: SkillSummary | null;
  onRepairComplete?: () => void | Promise<void>;
}

type HealthStatus = SkillDistributionStatus;

const statusConfig: Record<HealthStatus, {
  label: string;
  className: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = {
  healthy: { label: 'Healthy', className: 'text-emerald-300 bg-emerald-500/10', Icon: CheckCircle2 },
  broken: { label: 'Broken', className: 'text-amber-300 bg-amber-500/10', Icon: AlertTriangle },
  legacy: { label: 'Legacy path', className: 'text-blue-300 bg-blue-500/10', Icon: RefreshCw },
  conflict: { label: 'Conflict', className: 'text-red-300 bg-red-500/10', Icon: ShieldAlert },
  unavailable: { label: 'Unavailable', className: 'text-white/60 bg-white/[0.08]', Icon: CircleSlash2 },
};

const SkillHealthDialog: React.FC<SkillHealthDialogProps> = ({
  open,
  onOpenChange,
  skill,
  onRepairComplete,
}) => {
  const [report, setReport] = useState<SkillDistributionReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [repairResults, setRepairResults] = useState<SkillDistributionRepairResult[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { toast } = useToast();

  const checkDistribution = useCallback(async () => {
    if (!skill) return;
    setLoading(true);
    setError(null);
    try {
      const nextReport = await window.api.skills.checkDistribution(skill.id);
      setReport(nextReport);
      setSelectedIds(new Set());
    } catch (err: unknown) {
      setError(errorMessage(err, 'Could not verify this skill distribution.'));
    } finally {
      setLoading(false);
    }
  }, [skill]);

  useEffect(() => {
    if (!open || !skill) return;
    setReport(null);
    setRepairResults([]);
    setSelectedIds(new Set());
    void checkDistribution();
  }, [open, skill, checkDistribution]);

  const repairableDestinations = useMemo(
    () => report?.destinations.filter((destination) => destination.repairable) || [],
    [report],
  );

  const allRepairableSelected = repairableDestinations.length > 0
    && repairableDestinations.every((destination) => selectedIds.has(destination.linkId));
  const selectedDestinationSummary = report?.destinations
    .filter((destination) => selectedIds.has(destination.linkId))
    .map((destination) => `${destination.ideName} · ${destination.scope === 'global' ? 'Global' : destination.projectName} → ${destination.expectedPath || destination.destinationPath}`)
    .join(' | ');

  const toggleSelection = (linkId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(linkId)) next.delete(linkId);
      else next.add(linkId);
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedIds(allRepairableSelected
      ? new Set()
      : new Set(repairableDestinations.map((destination) => destination.linkId)));
  };

  const handleRepair = async () => {
    if (!skill || selectedIds.size === 0) return;
    setRepairing(true);
    setConfirmOpen(false);
    try {
      const results = await window.api.skills.repairDistribution(skill.id, [...selectedIds]);
      setRepairResults(results);
      setSelectedIds(new Set());
      await checkDistribution();
      await onRepairComplete?.();
      const repairedCount = results.filter((result) => result.status === 'repaired').length;
      toast({
        title: repairedCount > 0 ? 'Repair completed' : 'No repairs applied',
        description: repairedCount > 0
          ? `${repairedCount} destination${repairedCount === 1 ? '' : 's'} repaired and verified.`
          : 'Selected destinations remain blocked and were left untouched.',
        variant: repairedCount > 0 ? 'success' : 'info',
      });
    } catch (err: unknown) {
      toast({ title: 'Repair failed', description: errorMessage(err, 'Could not repair the selected destinations.'), variant: 'error' });
    } finally {
      setRepairing(false);
    }
  };

  if (!skill) return null;

  return (
    <>
      <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/60 data-[state=open]:animate-overlayShow" />
          <DialogPrimitive.Content
            aria-describedby="skill-health-description"
            className="fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[calc(100%-2rem)] max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl glass-dialog shadow-xl data-[state=open]:animate-contentShow focus:outline-none"
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/[0.08] p-5 sm:p-6">
              <div>
                <DialogPrimitive.Title className="text-lg font-semibold text-white">
                  Distribution health
                </DialogPrimitive.Title>
                <DialogPrimitive.Description id="skill-health-description" className="mt-1 text-sm text-white/50">
                  Verify where “{skill.displayName}” is linked before choosing an explicit repair.
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close asChild>
                <button
                  type="button"
                  aria-label="Close distribution health"
                  className="rounded-md p-1 text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </DialogPrimitive.Close>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
              {loading && !report ? (
                <div className="flex min-h-56 flex-col items-center justify-center gap-3 text-sm text-white/50" role="status" aria-live="polite">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-400" aria-hidden="true" />
                  Checking persisted destinations…
                </div>
              ) : error ? (
                <div className="rounded-lg border border-red-400/20 bg-red-500/[0.08] p-4" role="alert">
                  <p className="text-sm text-red-200">{error}</p>
                  <button
                    type="button"
                    onClick={() => void checkDistribution()}
                    className="mt-3 rounded-md border border-red-300/25 px-3 py-2 text-sm text-red-100 transition-colors hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                  >
                    Try again
                  </button>
                </div>
              ) : report ? (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Distribution summary">
                    <SummaryCard label="Healthy" value={report.summary.healthy} tone="healthy" />
                    <SummaryCard label="Needs attention" value={report.summary.attention} tone="attention" />
                    <SummaryCard label="Blocked" value={report.summary.blocked} tone="blocked" />
                    <SummaryCard label="Repairable" value={report.summary.repairable} tone="repairable" />
                  </div>

                  <div className="flex flex-col gap-3 rounded-lg border border-white/[0.08] bg-white/[0.025] p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium text-white">
                        {report.summary.repairable === 0
                          ? 'No destinations are ready for automatic repair'
                          : `${report.summary.repairable} destination${report.summary.repairable === 1 ? '' : 's'} can be repaired`}
                      </p>
                      <p className="mt-1 text-xs text-white/45">
                        Checked {new Date(report.checkedAt).toLocaleString()}. Filesystem changes are never automatic.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void checkDistribution()}
                        disabled={loading || repairing}
                        className="inline-flex items-center justify-center gap-2 rounded-md border border-white/10 px-3 py-2 text-sm text-white/75 transition-colors hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      >
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
                        Check again
                      </button>
                      {repairableDestinations.length > 0 && (
                        <button
                          type="button"
                          onClick={toggleAll}
                          disabled={repairing}
                          className="rounded-md border border-blue-400/25 px-3 py-2 text-sm text-blue-200 transition-colors hover:bg-blue-500/10 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        >
                          {allRepairableSelected ? 'Clear repair selection' : 'Select repairable'}
                        </button>
                      )}
                    </div>
                  </div>

                  {report.destinations.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-white/10 px-5 py-12 text-center" role="status">
                      <Wrench className="mx-auto h-7 w-7 text-white/30" aria-hidden="true" />
                      <p className="mt-3 text-sm font-medium text-white">No persisted destinations found</p>
                      <p className="mt-1 text-sm text-white/45">This skill is not currently linked to a registered IDE or project.</p>
                    </div>
                  ) : (
                    <div className="space-y-2" aria-label="Skill distribution destinations">
                      {report.destinations.map((destination) => (
                        <DestinationRow
                          key={destination.linkId}
                          destination={destination}
                          selected={selectedIds.has(destination.linkId)}
                          onToggle={() => toggleSelection(destination.linkId)}
                          disabled={repairing}
                        />
                      ))}
                    </div>
                  )}

                  {repairResults.length > 0 && (
                    <div className="rounded-lg border border-white/[0.08] bg-white/[0.025] p-4" aria-live="polite">
                      <p className="text-sm font-medium text-white">Latest repair results</p>
                      <div className="mt-3 space-y-2">
                        {repairResults.map((result) => (
                          <div key={result.linkId} className="flex flex-col gap-1 text-sm sm:flex-row sm:items-start sm:justify-between">
                            <span className="text-white/75">{result.ideName} · {result.projectName}</span>
                            <span className={result.status === 'repaired' ? 'text-emerald-300' : 'text-amber-300'}>
                              {result.status === 'repaired' ? 'Repaired' : result.status === 'blocked' ? 'Blocked' : result.status}
                              {result.message ? ` — ${result.message}` : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-white/[0.08] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <p className="text-xs text-white/40">Repair only changes managed link entries that passed verification.</p>
              <div className="flex justify-end gap-3">
                <DialogPrimitive.Close asChild>
                  <button type="button" className="rounded-md px-3 py-2 text-sm text-white/55 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                    Close
                  </button>
                </DialogPrimitive.Close>
                <button
                  type="button"
                  onClick={() => setConfirmOpen(true)}
                  disabled={selectedIds.size === 0 || repairing || loading}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                >
                  {repairing && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  Repair selected{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
                </button>
              </div>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Repair selected destinations?"
        description={`The app will revalidate the selected managed links in the main process, create only free canonical destinations, and leave conflicts untouched. Selected: ${selectedDestinationSummary || 'none'}`}
        confirmLabel="Repair destinations"
        onConfirm={() => void handleRepair()}
      />
    </>
  );
};

const SummaryCard: React.FC<{ label: string; value: number; tone: 'healthy' | 'attention' | 'blocked' | 'repairable' }> = ({ label, value, tone }) => {
  const toneClass = {
    healthy: 'text-emerald-300',
    attention: 'text-amber-300',
    blocked: 'text-red-300',
    repairable: 'text-blue-300',
  }[tone];

  return (
    <div className="rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-3">
      <p className="text-xs text-white/45">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
};

const DestinationRow: React.FC<{
  destination: SkillDistributionDestination;
  selected: boolean;
  onToggle: () => void;
  disabled: boolean;
}> = ({ destination, selected, onToggle, disabled }) => {
  const config = statusConfig[destination.status];
  const StatusIcon = config.Icon;

  return (
    <div className={`rounded-lg border p-4 transition-colors ${selected ? 'border-blue-400/35 bg-blue-500/[0.07]' : 'border-white/[0.08] bg-white/[0.02]'}`}>
      <div className="flex items-start gap-3">
        {destination.repairable ? (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            disabled={disabled}
            aria-label={`Select ${destination.ideName} — ${destination.projectName}`}
            className="mt-1 h-4 w-4 flex-shrink-0 accent-blue-500"
          />
        ) : (
          <span className="mt-1 block h-4 w-4 flex-shrink-0" aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-white">{destination.ideName}</p>
            <span className="text-xs text-white/40">{destination.scope === 'global' ? 'Global' : destination.projectName}</span>
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${config.className}`}>
              <StatusIcon className="h-3 w-3" aria-hidden="true" />
              {config.label}
            </span>
          </div>
          <p className="mt-2 break-all font-mono text-xs text-white/45">Current: {destination.destinationPath}</p>
          {destination.expectedPath && destination.expectedPath !== destination.destinationPath && (
            <p className="mt-1 break-all font-mono text-xs text-blue-200/60">Expected: {destination.expectedPath}</p>
          )}
          {destination.message && <p className="mt-2 text-xs leading-5 text-white/55">{destination.message}</p>}
        </div>
      </div>
    </div>
  );
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export default SkillHealthDialog;
