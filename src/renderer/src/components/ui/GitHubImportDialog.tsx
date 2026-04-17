import React, { useState, useEffect, useCallback } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Circle,
  ChevronRight,
  Info,
  AlertTriangle,
} from 'lucide-react';
import { useToast } from './Toast';

// ─── Types ───────────────────────────────────────────────────────────

interface DetectedSkill {
  name: string;
  displayName: string;
  description: string;
  sourcePath: string;
  hasSkillMd: boolean;
  fileCount: number;
  structure: 'folder-per-skill' | 'single-skill' | 'non-standard';
  repoInfo: {
    fullName: string;
    htmlUrl: string;
    description: string;
    starsCount: number;
  };
}

interface ConflictResolution {
  strategy: 'skip' | 'rename' | 'overwrite';
  newName?: string;
}

interface ImportResult {
  skillName: string;
  status: 'imported' | 'skipped' | 'renamed' | 'error';
  error?: string;
  originalName?: string;
}

interface ImportProgress {
  current: number;
  total: number;
  currentSkillName: string;
  phase: 'fetching' | 'writing';
  percentComplete: number;
}

type Phase = 'url-input' | 'preview' | 'conflicts' | 'importing' | 'results';

interface GitHubImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete?: () => void;
}

// ─── Component ───────────────────────────────────────────────────────

const GitHubImportDialog: React.FC<GitHubImportDialogProps> = ({
  open,
  onOpenChange,
  onImportComplete,
}) => {
  const [phase, setPhase] = useState<Phase>('url-input');
  const [url, setUrl] = useState('');
  const [parsed, setParsed] = useState<any>(null);
  const [repoInfo, setRepoInfo] = useState<any>(null);
  const [detectedSkills, setDetectedSkills] = useState<DetectedSkill[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set());
  const [conflicts, setConflicts] = useState<Record<string, boolean>>({});
  const [resolutions, setResolutions] = useState<Record<string, ConflictResolution>>({});
  const [importResults, setImportResults] = useState<ImportResult[]>([]);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      resetState();
    }
  }, [open]);

  const resetState = () => {
    setPhase('url-input');
    setUrl('');
    setParsed(null);
    setRepoInfo(null);
    setDetectedSkills([]);
    setSelectedSkills(new Set());
    setConflicts({});
    setResolutions({});
    setImportResults([]);
    setProgress(null);
    setError('');
    setLoading(false);
  };

  // Subscribe to import progress
  useEffect(() => {
    if (phase === 'importing') {
      const unsubscribe = window.api.githubImport.onProgress((p: ImportProgress) => {
        setProgress(p);
      });
      return unsubscribe;
    }
  }, [phase]);

  // ─── URL validation ──────────────────────────────────────────────

  const isValidUrl = useCallback((value: string): boolean => {
    const trimmed = value.trim();
    // Shorthand: owner/repo
    if (/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(trimmed)) return true;
    // Full GitHub URL
    if (/^https?:\/\/github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+/.test(trimmed)) return true;
    return false;
  }, []);

  // ─── Phase 1: Analyze ────────────────────────────────────────────

  const handleAnalyze = async () => {
    setError('');
    setLoading(true);
    try {
      const parseResult = await window.api.githubImport.parseUrl(url.trim());
      if (parseResult.error) {
        setError(parseResult.message);
        setLoading(false);
        return;
      }
      setParsed(parseResult);

      const analyzeResult = await window.api.githubImport.analyze(parseResult);
      if (analyzeResult.error) {
        setError(analyzeResult.message);
        setLoading(false);
        return;
      }

      setRepoInfo(analyzeResult.repoInfo);
      setDetectedSkills(analyzeResult.skills);

      // Select all skills by default
      const allNames = new Set(analyzeResult.skills.map((s: DetectedSkill) => s.name));
      setSelectedSkills(allNames);

      setPhase('preview');
    } catch (err: any) {
      setError(err.message || 'Failed to analyze repository');
    } finally {
      setLoading(false);
    }
  };

  // ─── Phase 2: Selection → check conflicts ────────────────────────

  const handleImportSelected = async () => {
    const selectedNames = Array.from(selectedSkills);
    if (selectedNames.length === 0) return;

    setLoading(true);
    setError('');
    try {
      const conflictMap = await window.api.githubImport.checkConflicts(selectedNames);
      setConflicts(conflictMap);

      const hasConflicts = Object.values(conflictMap).some(Boolean);
      if (hasConflicts) {
        // Initialize default resolutions for conflicts (skip)
        const defaultResolutions: Record<string, ConflictResolution> = {};
        for (const [name, exists] of Object.entries(conflictMap)) {
          if (exists) {
            defaultResolutions[name] = { strategy: 'skip' };
          }
        }
        setResolutions(defaultResolutions);
        setPhase('conflicts');
      } else {
        startImport({});
      }
    } catch (err: any) {
      setError(err.message || 'Failed to check conflicts');
    } finally {
      setLoading(false);
    }
  };

  // ─── Phase 3/4: Import execution ─────────────────────────────────

  const startImport = async (resolutionsMap: Record<string, ConflictResolution>) => {
    setPhase('importing');
    setProgress(null);
    setError('');

    const selected = detectedSkills.filter(s => selectedSkills.has(s.name));

    try {
      const results = await window.api.githubImport.importSkills({
        parsed,
        skills: selected,
        resolutions: resolutionsMap,
      });
      setImportResults(results);
      setPhase('results');
    } catch (err: any) {
      setError(err.message || 'Import failed');
      setPhase('results');
    }
  };

  const handleCancelImport = async () => {
    await window.api.githubImport.cancelImport();
  };

  // ─── Selection helpers ───────────────────────────────────────────

  const toggleSkill = (name: string) => {
    setSelectedSkills(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedSkills(new Set(detectedSkills.map(s => s.name)));
  };

  const deselectAll = () => {
    setSelectedSkills(new Set());
  };

  // ─── Conflict resolution handler ─────────────────────────────────

  const handleResolutionChange = (name: string, resolution: ConflictResolution) => {
    setResolutions(prev => ({ ...prev, [name]: resolution }));
  };

  const handleProceedFromConflicts = () => {
    startImport(resolutions);
  };

  // ─── Results summary ─────────────────────────────────────────────

  const importedCount = importResults.filter(r => r.status === 'imported' || r.status === 'renamed').length;
  const skippedCount = importResults.filter(r => r.status === 'skipped').length;
  const errorCount = importResults.filter(r => r.status === 'error').length;

  const handleClose = () => {
    if (importedCount > 0) {
      onImportComplete?.();
    }
    onOpenChange(false);
  };

  // ─── Render helpers ──────────────────────────────────────────────

  const getStructureLabel = (structure: string) => {
    switch (structure) {
      case 'folder-per-skill': return 'Folder-per-skill';
      case 'single-skill': return 'Single skill';
      case 'non-standard': return 'Non-standard';
      default: return structure;
    }
  };

  // ─── Render ──────────────────────────────────────────────────────

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 bg-black/50 data-[state=open]:animate-overlayShow" />
        <DialogPrimitive.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-800 border border-slate-700 rounded-xl w-full max-w-2xl max-h-[85vh] shadow-xl data-[state=open]:animate-contentShow focus:outline-none flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 pb-4 border-b border-slate-700">
            <DialogPrimitive.Title className="text-lg font-semibold text-white">
              Import from GitHub
            </DialogPrimitive.Title>
            <DialogPrimitive.Close className="text-slate-500 hover:text-slate-300">
              <X className="w-5 h-5" />
            </DialogPrimitive.Close>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {error && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}

            {/* ── Phase 1: URL Input ── */}
            {phase === 'url-input' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    GitHub Repository URL <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="https://github.com/owner/repo"
                    value={url}
                    onChange={(e) => { setUrl(e.target.value); setError(''); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && isValidUrl(url) && !loading) handleAnalyze();
                    }}
                    className={`w-full px-3 py-2 bg-slate-900 border rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none ${
                      url && !isValidUrl(url) ? 'border-red-500' :
                      url && isValidUrl(url) ? 'border-green-500' :
                      'border-slate-700 focus:border-blue-500'
                    }`}
                    autoFocus
                  />
                </div>

                <div className="text-xs text-slate-500 space-y-1">
                  <p>Supported formats:</p>
                  <ul className="list-disc list-inside pl-2 space-y-0.5">
                    <li>https://github.com/owner/repo</li>
                    <li>https://github.com/owner/repo/tree/branch/path</li>
                    <li>owner/repo</li>
                  </ul>
                </div>

                <div className="flex items-start gap-2 p-3 bg-slate-700/30 rounded-lg border border-slate-700">
                  <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-slate-400">
                    Add a GitHub token in Settings for higher rate limits (5,000/hr vs 60/hr) and private repo access.
                  </p>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={() => onOpenChange(false)}
                    className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAnalyze}
                    disabled={!isValidUrl(url) || loading}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <ChevronRight className="w-4 h-4" />
                        Analyze
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* ── Phase 2: Preview & Selection ── */}
            {phase === 'preview' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-white font-medium">{repoInfo?.fullName}</h3>
                  <p className="text-sm text-slate-400 mt-1">
                    {repoInfo?.description || 'No description'}
                  </p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                    <span>Structure: {detectedSkills.length > 0 ? getStructureLabel(detectedSkills[0].structure) : 'Unknown'}</span>
                    <span>{detectedSkills.length} skill{detectedSkills.length !== 1 ? 's' : ''} detected</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button onClick={selectAll} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs text-slate-300 transition-colors">
                    Select All
                  </button>
                  <button onClick={deselectAll} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs text-slate-300 transition-colors">
                    Deselect All
                  </button>
                </div>

                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {detectedSkills.map((skill) => (
                    <label
                      key={skill.name}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedSkills.has(skill.name)
                          ? 'bg-blue-500/10 border-blue-500/30'
                          : 'bg-slate-900 border-slate-700 hover:border-slate-600'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedSkills.has(skill.name)}
                        onChange={() => toggleSkill(skill.name)}
                        className="mt-1 accent-blue-500"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-white">{skill.displayName}</span>
                          <span className="text-xs text-slate-500">{skill.fileCount} files</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5 truncate">
                          {skill.description || 'No description'}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-slate-500">Source: {skill.sourcePath || '/'}</span>
                          {!skill.hasSkillMd && (
                            <span className="text-xs text-amber-400 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              SKILL.md will be generated
                            </span>
                          )}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>

                <div className="flex justify-between items-center pt-2">
                  <span className="text-xs text-slate-500">
                    {selectedSkills.size} of {detectedSkills.length} selected
                  </span>
                  <div className="flex gap-3">
                    <button
                      onClick={() => { setPhase('url-input'); setError(''); }}
                      className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleImportSelected}
                      disabled={selectedSkills.size === 0 || loading}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Checking...
                        </>
                      ) : (
                        `Import Selected (${selectedSkills.size})`
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Phase 3: Conflict Resolution ── */}
            {phase === 'conflicts' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-white font-medium">Resolve Conflicts</h3>
                  <p className="text-sm text-slate-400 mt-1">
                    Some skills have the same name as existing skills. Choose how to handle each conflict.
                  </p>
                </div>

                <div className="space-y-3">
                  {Object.entries(conflicts).filter(([, exists]) => exists).map(([name, _]) => (
                    <ConflictCard
                      key={name}
                      name={name}
                      resolution={resolutions[name] || { strategy: 'skip' }}
                      onChange={(resolution) => handleResolutionChange(name, resolution)}
                    />
                  ))}
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={() => { setPhase('preview'); setError(''); }}
                    className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleProceedFromConflicts}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                  >
                    Proceed with Import
                  </button>
                </div>
              </div>
            )}

            {/* ── Phase 4: Import Progress & Results ── */}
            {(phase === 'importing' || phase === 'results') && (
              <div className="space-y-4">
                {phase === 'importing' && progress && (
                  <>
                    <div className="w-full bg-slate-700 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full transition-all"
                        style={{ width: `${progress.percentComplete}%` }}
                      />
                    </div>
                    <p className="text-sm text-slate-400">
                      {progress.phase === 'fetching' ? 'Fetching' : 'Writing'} {progress.currentSkillName}... ({progress.current}/{progress.total})
                    </p>
                  </>
                )}

                {phase === 'importing' && !progress && (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                    <span className="ml-2 text-slate-400">Starting import...</span>
                  </div>
                )}

                {phase === 'results' && (
                  <>
                    <div className="flex gap-4">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-green-400" />
                        <span className="text-sm text-slate-300">{importedCount} imported</span>
                      </div>
                      {skippedCount > 0 && (
                        <div className="flex items-center gap-2">
                          <AlertCircle className="w-5 h-5 text-amber-400" />
                          <span className="text-sm text-slate-300">{skippedCount} skipped</span>
                        </div>
                      )}
                      {errorCount > 0 && (
                        <div className="flex items-center gap-2">
                          <AlertCircle className="w-5 h-5 text-red-400" />
                          <span className="text-sm text-slate-300">{errorCount} errors</span>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {importResults.map((result, i) => (
                        <div key={i} className={`p-3 rounded-lg border ${
                          result.status === 'imported' || result.status === 'renamed' ? 'bg-green-500/5 border-green-500/20' :
                          result.status === 'skipped' ? 'bg-amber-500/5 border-amber-500/20' :
                          'bg-red-500/5 border-red-500/20'
                        }`}>
                          <div className="flex items-center gap-2 mb-1">
                            {result.status === 'imported' && <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />}
                            {result.status === 'renamed' && <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />}
                            {result.status === 'skipped' && <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />}
                            {result.status === 'error' && <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />}
                            <span className="text-sm font-medium text-slate-200">{result.skillName}</span>
                            {result.status === 'renamed' && result.originalName && (
                              <span className="text-xs text-slate-400">(renamed from {result.originalName})</span>
                            )}
                          </div>
                          {result.status === 'skipped' && result.skipReason && (
                            <p className="text-xs text-amber-300/80 ml-6">{result.skipReason}</p>
                          )}
                          {result.status === 'skipped' && !result.skipReason && (
                            <p className="text-xs text-amber-300/80 ml-6">Skipped — no action taken</p>
                          )}
                          {result.status === 'error' && result.error && (
                            <p className="text-xs text-red-300 ml-6">{result.error}</p>
                          )}
                          {(result.status === 'imported' || result.status === 'renamed') && (
                            <p className="text-xs text-green-300/80 ml-6">Successfully imported</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}

                <div className="flex justify-end gap-3 pt-2">
                  {phase === 'importing' && (
                    <button
                      onClick={handleCancelImport}
                      className="px-4 py-2 text-red-400 hover:text-red-300 transition-colors"
                    >
                      Cancel Import
                    </button>
                  )}
                  {phase === 'results' && (
                    <button
                      onClick={handleClose}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                    >
                      Close
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

// ─── Conflict Card Sub-component ─────────────────────────────────────

const ConflictCard: React.FC<{
  name: string;
  resolution: ConflictResolution;
  onChange: (resolution: ConflictResolution) => void;
}> = ({ name, resolution, onChange }) => {
  const [renameValue, setRenameValue] = useState(`${name}-2`);

  return (
    <div className="p-4 bg-slate-900 border border-amber-500/30 rounded-lg">
      <p className="text-sm text-amber-300 font-medium mb-3">
        A skill named &quot;{name}&quot; already exists.
      </p>

      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name={`conflict-${name}`}
            checked={resolution.strategy === 'skip'}
            onChange={() => onChange({ strategy: 'skip' })}
            className="accent-blue-500"
          />
          <span className="text-sm text-slate-300">Skip this skill</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name={`conflict-${name}`}
            checked={resolution.strategy === 'rename'}
            onChange={() => onChange({ strategy: 'rename', newName: renameValue })}
            className="accent-blue-500"
          />
          <span className="text-sm text-slate-300">Rename to:</span>
          <input
            type="text"
            value={renameValue}
            onChange={(e) => {
              setRenameValue(e.target.value);
              if (resolution.strategy === 'rename') {
                onChange({ strategy: 'rename', newName: e.target.value });
              }
            }}
            onFocus={() => {
              if (resolution.strategy !== 'rename') {
                onChange({ strategy: 'rename', newName: renameValue });
              }
            }}
            className="flex-1 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-sm text-slate-100 focus:outline-none focus:border-blue-500"
          />
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name={`conflict-${name}`}
            checked={resolution.strategy === 'overwrite'}
            onChange={() => onChange({ strategy: 'overwrite' })}
            className="accent-blue-500"
          />
          <span className="text-sm text-slate-300">Overwrite existing skill</span>
        </label>

        {resolution.strategy === 'overwrite' && (
          <div className="flex items-start gap-2 ml-6 p-2 bg-red-500/10 rounded border border-red-500/20">
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-300">
              Overwriting will replace all files in the existing skill directory. This cannot be undone.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default GitHubImportDialog;
