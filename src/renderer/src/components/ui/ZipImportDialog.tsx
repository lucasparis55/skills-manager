import React, { useEffect, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Loader2,
  X,
} from 'lucide-react';

interface DetectedZipSkill {
  name: string;
  displayName: string;
  description: string;
  sourcePath: string;
  hasSkillMd: boolean;
  fileCount: number;
  structure: 'folder-per-skill' | 'single-skill' | 'non-standard';
  archiveInfo: {
    zipPath: string;
    fileName: string;
    fileCount: number;
    rootPrefix?: string;
  };
  files: Array<{
    path: string;
    archivePath: string;
    size: number;
  }>;
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
  skipReason?: string;
}

interface ImportProgress {
  current: number;
  total: number;
  currentSkillName: string;
  phase: 'fetching' | 'reading' | 'writing';
  percentComplete: number;
}

type Phase = 'file-select' | 'preview' | 'conflicts' | 'importing' | 'results';

interface ZipImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete?: () => void;
}

const ZipImportDialog: React.FC<ZipImportDialogProps> = ({
  open,
  onOpenChange,
  onImportComplete,
}) => {
  const [phase, setPhase] = useState<Phase>('file-select');
  const [zipPath, setZipPath] = useState('');
  const [archiveInfo, setArchiveInfo] = useState<DetectedZipSkill['archiveInfo'] | null>(null);
  const [detectedSkills, setDetectedSkills] = useState<DetectedZipSkill[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set());
  const [conflicts, setConflicts] = useState<Record<string, boolean>>({});
  const [resolutions, setResolutions] = useState<Record<string, ConflictResolution>>({});
  const [importResults, setImportResults] = useState<ImportResult[]>([]);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      resetState();
    }
  }, [open]);

  useEffect(() => {
    if (phase === 'importing') {
      return window.api.zipImport.onProgress((nextProgress: ImportProgress) => {
        setProgress(nextProgress);
      });
    }
  }, [phase]);

  const resetState = () => {
    setPhase('file-select');
    setZipPath('');
    setArchiveInfo(null);
    setDetectedSkills([]);
    setSelectedSkills(new Set());
    setConflicts({});
    setResolutions({});
    setImportResults([]);
    setProgress(null);
    setError('');
    setLoading(false);
  };

  const handleChooseZip = async () => {
    setLoading(true);
    setError('');

    try {
      const selectedPath = await window.api.dialog.selectFile({
        title: 'Select Skill ZIP Archive',
        filters: [{ name: 'ZIP Archives', extensions: ['zip'] }],
      });

      if (!selectedPath) {
        setLoading(false);
        return;
      }

      setZipPath(selectedPath);
      const analyzeResult = await window.api.zipImport.analyze(selectedPath);
      if (analyzeResult.error) {
        setError(analyzeResult.message || 'Failed to analyze ZIP archive');
        setLoading(false);
        return;
      }

      setArchiveInfo(analyzeResult.archiveInfo);
      setDetectedSkills(analyzeResult.skills);
      setSelectedSkills(new Set(analyzeResult.skills.map((skill: DetectedZipSkill) => skill.name)));
      setPhase('preview');
    } catch (err: any) {
      setError(err.message || 'Failed to select ZIP archive');
    } finally {
      setLoading(false);
    }
  };

  const handleImportSelected = async () => {
    const selectedNames = Array.from(selectedSkills);
    if (selectedNames.length === 0) return;

    setLoading(true);
    setError('');
    try {
      const conflictMap = await window.api.zipImport.checkConflicts(selectedNames);
      setConflicts(conflictMap);

      const hasConflicts = Object.values(conflictMap).some(Boolean);
      if (hasConflicts) {
        const defaultResolutions: Record<string, ConflictResolution> = {};
        for (const [name, exists] of Object.entries(conflictMap)) {
          if (exists) {
            defaultResolutions[name] = { strategy: 'skip' };
          }
        }
        setResolutions(defaultResolutions);
        setPhase('conflicts');
      } else {
        await startImport({});
      }
    } catch (err: any) {
      setError(err.message || 'Failed to check conflicts');
    } finally {
      setLoading(false);
    }
  };

  const startImport = async (resolutionsMap: Record<string, ConflictResolution>) => {
    setPhase('importing');
    setProgress(null);
    setError('');

    try {
      const selected = detectedSkills.filter((skill) => selectedSkills.has(skill.name));
      const results = await window.api.zipImport.importSkills({
        zipPath,
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
    await window.api.zipImport.cancelImport();
  };

  const toggleSkill = (name: string) => {
    setSelectedSkills((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const importedCount = importResults.filter((result) => result.status === 'imported' || result.status === 'renamed').length;
  const skippedCount = importResults.filter((result) => result.status === 'skipped').length;
  const errorCount = importResults.filter((result) => result.status === 'error').length;

  const handleClose = () => {
    if (importedCount > 0) {
      onImportComplete?.();
    }
    onOpenChange(false);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 bg-black/50 data-[state=open]:animate-overlayShow" />
        <DialogPrimitive.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-800 border border-slate-700 rounded-xl w-full max-w-2xl max-h-[85vh] shadow-xl data-[state=open]:animate-contentShow focus:outline-none flex flex-col">
          <div className="flex items-center justify-between p-6 pb-4 border-b border-slate-700">
            <DialogPrimitive.Title className="text-lg font-semibold text-white">
              Import from ZIP
            </DialogPrimitive.Title>
            <DialogPrimitive.Close className="text-slate-500 hover:text-slate-300">
              <X className="w-5 h-5" />
            </DialogPrimitive.Close>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {error && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}

            {phase === 'file-select' && (
              <div className="space-y-4">
                <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
                  <p className="text-sm text-slate-300">
                    Choose a local `.zip` archive containing one or more Codex-style skills.
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
                    onClick={handleChooseZip}
                    disabled={loading}
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
                        Select ZIP
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {phase === 'preview' && archiveInfo && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-white font-medium">{archiveInfo.fileName}</h3>
                  <p className="text-sm text-slate-400 mt-1 break-all">{archiveInfo.zipPath}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                    <span>{detectedSkills.length} skill{detectedSkills.length !== 1 ? 's' : ''} detected</span>
                    <span>{archiveInfo.fileCount} file{archiveInfo.fileCount !== 1 ? 's' : ''} indexed</span>
                  </div>
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
                        <p className="text-xs text-slate-400 mt-0.5">
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
                      onClick={() => {
                        setPhase('file-select');
                        setError('');
                      }}
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

            {phase === 'conflicts' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-white font-medium">Resolve Conflicts</h3>
                  <p className="text-sm text-slate-400 mt-1">
                    Some skills have the same name as existing skills. Choose how to handle each conflict.
                  </p>
                </div>

                <div className="space-y-3">
                  {Object.entries(conflicts)
                    .filter(([, exists]) => exists)
                    .map(([name]) => (
                      <ConflictCard
                        key={name}
                        name={name}
                        resolution={resolutions[name] || { strategy: 'skip' }}
                        onChange={(resolution) => {
                          setResolutions((prev) => ({ ...prev, [name]: resolution }));
                        }}
                      />
                    ))}
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={() => {
                      setPhase('preview');
                      setError('');
                    }}
                    className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => startImport(resolutions)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                  >
                    Proceed with Import
                  </button>
                </div>
              </div>
            )}

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
                      {progress.phase === 'reading' ? 'Reading' : 'Writing'} {progress.currentSkillName}... ({progress.current}/{progress.total})
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
                      {importResults.map((result, index) => (
                        <div
                          key={index}
                          className={`p-3 rounded-lg border ${
                            result.status === 'imported' || result.status === 'renamed'
                              ? 'bg-green-500/5 border-green-500/20'
                              : result.status === 'skipped'
                                ? 'bg-amber-500/5 border-amber-500/20'
                                : 'bg-red-500/5 border-red-500/20'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            {(result.status === 'imported' || result.status === 'renamed') && (
                              <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                            )}
                            {(result.status === 'skipped' || result.status === 'error') && (
                              <AlertCircle className={`w-4 h-4 flex-shrink-0 ${result.status === 'skipped' ? 'text-amber-400' : 'text-red-400'}`} />
                            )}
                            <span className="text-sm font-medium text-slate-200">{result.skillName}</span>
                            {result.status === 'renamed' && result.originalName && (
                              <span className="text-xs text-slate-400">(renamed from {result.originalName})</span>
                            )}
                          </div>
                          {result.status === 'skipped' && (
                            <p className="text-xs text-amber-300/80 ml-6">
                              {result.skipReason || 'Skipped — no action taken'}
                            </p>
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
      </div>
    </div>
  );
};

export default ZipImportDialog;
