import React, { useState, useEffect } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as SelectPrimitive from '@radix-ui/react-select';
import { X, ChevronDown, Check, Link2, Loader2, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { useToast } from './Toast';

interface Skill {
  id: string;
  name: string;
  displayName: string;
}

interface Project {
  id: string;
  name: string;
  path: string;
}

interface IDE {
  id: string;
  name: string;
}

interface LinkCreationResult {
  skillId: string;
  skillName: string;
  status: 'created' | 'error' | 'skipped';
  error?: string;
}

interface LinkCreationProgress {
  current: number;
  total: number;
  currentSkillName: string;
  percentComplete: number;
}

interface CreateLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skills: Skill[];
  projects: Project[];
  ides: IDE[];
  onSubmit: (values: { skillIds: string[]; projectId: string; ideName: string; scope: 'global' | 'project' }) => void;
  onComplete?: (results: LinkCreationResult[]) => void;
}

const CreateLinkDialog: React.FC<CreateLinkDialogProps> = ({
  open,
  onOpenChange,
  skills,
  projects,
  ides,
  onSubmit,
  onComplete,
}) => {
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set());
  const [projectId, setProjectId] = useState('');
  const [ideName, setIdeName] = useState('');
  const [scope, setScope] = useState<'global' | 'project'>('project');
  const [phase, setPhase] = useState<'form-input' | 'creating' | 'results'>('form-input');
  const [creationResults, setCreationResults] = useState<LinkCreationResult[]>([]);
  const [progress, setProgress] = useState<LinkCreationProgress | null>(null);
  const { toast } = useToast();

  // Subscribe to progress events when in creating phase
  useEffect(() => {
    if (phase === 'creating') {
      const unsubscribe = window.api.links.onCreateProgress((p) => setProgress(p));
      return unsubscribe;
    }
  }, [phase]);

  // Reset or initialize form when dialog opens/closes
  useEffect(() => {
    if (open) {
      setSelectedSkills(new Set(skills.map(s => s.id)));
      setPhase('form-input');
      setCreationResults([]);
      setProgress(null);
    } else {
      setProjectId('');
      setIdeName('');
      setScope('project');
    }
  }, [open, skills]);

  const toggleSkill = (id: string) => {
    setSelectedSkills(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedSkills(new Set(skills.map(s => s.id)));
  const deselectAll = () => setSelectedSkills(new Set());

  const isSubmitDisabled = selectedSkills.size === 0 || !projectId || !ideName;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitDisabled) return;

    setPhase('creating');

    try {
      const results = await window.api.links.createMultiple({
        skillIds: Array.from(selectedSkills),
        projectId,
        ideName,
        scope,
      });
      setCreationResults(results);
      setPhase('results');
      await onSubmit({ skillIds: Array.from(selectedSkills), projectId, ideName, scope });
    } catch (err: any) {
      setPhase('form-input');
      toast({
        title: 'Link creation failed',
        description: err?.message || 'Could not create selected links.',
        variant: 'error',
      });
    }
  };

  const handleClose = () => {
    setPhase('form-input');
    onOpenChange(false);
    if (creationResults.length > 0) {
      onComplete?.(creationResults);
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 bg-black/50 data-[state=open]:animate-overlayShow" />
        <DialogPrimitive.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 glass-dialog rounded-xl p-6 w-full max-w-md shadow-xl data-[state=open]:animate-contentShow focus:outline-none">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Link2 className="w-5 h-5 text-blue-400" />
              <DialogPrimitive.Title className="text-lg font-semibold text-white">
                Create Link
              </DialogPrimitive.Title>
            </div>
            <DialogPrimitive.Close className="text-white/40 hover:text-white/80">
              <X className="w-4 h-4" />
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Description className="text-sm text-white/45 mb-4">
            Link skills to a project for a specific IDE. Symlinks will be created in the project's IDE directory.
          </DialogPrimitive.Description>

          {phase === 'form-input' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Skills Checkbox List */}
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">
                  Skills <span className="text-red-400">*</span>
                </label>

                {/* Select All / Deselect All buttons */}
                <div className="flex gap-2 mb-2">
                  <button
                    type="button"
                    onClick={selectAll}
                    className="px-3 py-1.5 glass hover:bg-white/[0.10] rounded-lg text-xs text-white/70 transition-colors"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={deselectAll}
                    className="px-3 py-1.5 glass hover:bg-white/[0.10] rounded-lg text-xs text-white/70 transition-colors"
                  >
                    Deselect All
                  </button>
                </div>

                {/* Scrollable checkbox list */}
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {skills.map((skill) => (
                    <label
                      key={skill.id}
                      className={`flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition-colors ${
                        selectedSkills.has(skill.id)
                          ? 'bg-blue-500/10 border-blue-500/30'
                          : 'glass-input border-white/[0.08] hover:border-white/[0.12]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedSkills.has(skill.id)}
                        onChange={() => toggleSkill(skill.id)}
                        className="accent-blue-500"
                      />
                      <span className="text-sm text-white/80">{skill.displayName || skill.name}</span>
                    </label>
                  ))}
                </div>

                {/* Counter */}
                <span className="text-xs text-white/40 mt-1 block">
                  {selectedSkills.size} of {skills.length} selected
                </span>
              </div>

              {/* Project Select */}
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">
                  Project <span className="text-red-400">*</span>
                </label>
                <SelectPrimitive.Root value={projectId} onValueChange={setProjectId}>
                  <SelectPrimitive.Trigger className="flex items-center justify-between w-full px-3 py-2 glass-input text-white placeholder:text-white/35 focus:outline-none focus:border-blue-500">
                    <SelectPrimitive.Value placeholder="Select a project..." />
                    <SelectPrimitive.Icon>
                      <ChevronDown className="w-4 h-4 text-white/45" />
                    </SelectPrimitive.Icon>
                  </SelectPrimitive.Trigger>
                  <SelectPrimitive.Portal>
                    <SelectPrimitive.Content className="glass-dialog border-white/[0.08] rounded-lg shadow-xl z-50 max-h-60 overflow-auto">
                      <SelectPrimitive.Viewport>
                        {projects.map((project) => (
                          <SelectPrimitive.Item
                            key={project.id}
                            value={project.id}
                            className="flex items-center gap-2 px-3 py-2 text-sm text-white/80 outline-none cursor-pointer hover:bg-white/[0.06] data-[highlighted]:bg-white/[0.06]"
                          >
                            <SelectPrimitive.ItemText>{project.name}</SelectPrimitive.ItemText>
                            <SelectPrimitive.ItemIndicator>
                              <Check className="w-4 h-4 text-blue-400" />
                            </SelectPrimitive.ItemIndicator>
                          </SelectPrimitive.Item>
                        ))}
                      </SelectPrimitive.Viewport>
                    </SelectPrimitive.Content>
                  </SelectPrimitive.Portal>
                </SelectPrimitive.Root>
              </div>

              {/* IDE Select */}
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">
                  IDE <span className="text-red-400">*</span>
                </label>
                <SelectPrimitive.Root value={ideName} onValueChange={setIdeName}>
                  <SelectPrimitive.Trigger className="flex items-center justify-between w-full px-3 py-2 glass-input text-white placeholder:text-white/35 focus:outline-none focus:border-blue-500">
                    <SelectPrimitive.Value placeholder="Select an IDE..." />
                    <SelectPrimitive.Icon>
                      <ChevronDown className="w-4 h-4 text-white/45" />
                    </SelectPrimitive.Icon>
                  </SelectPrimitive.Trigger>
                  <SelectPrimitive.Portal>
                    <SelectPrimitive.Content className="glass-dialog border-white/[0.08] rounded-lg shadow-xl z-50 max-h-60 overflow-auto">
                      <SelectPrimitive.Viewport>
                        {ides.map((ide) => (
                          <SelectPrimitive.Item
                            key={ide.id}
                            value={ide.id}
                            className="flex items-center gap-2 px-3 py-2 text-sm text-white/80 outline-none cursor-pointer hover:bg-white/[0.06] data-[highlighted]:bg-white/[0.06]"
                          >
                            <SelectPrimitive.ItemText>{ide.name}</SelectPrimitive.ItemText>
                            <SelectPrimitive.ItemIndicator>
                              <Check className="w-4 h-4 text-blue-400" />
                            </SelectPrimitive.ItemIndicator>
                          </SelectPrimitive.Item>
                        ))}
                      </SelectPrimitive.Viewport>
                    </SelectPrimitive.Content>
                  </SelectPrimitive.Portal>
                </SelectPrimitive.Root>
              </div>

              {/* Scope Select */}
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">
                  Scope
                </label>
                <SelectPrimitive.Root value={scope} onValueChange={(v) => setScope(v as 'global' | 'project')}>
                  <SelectPrimitive.Trigger className="flex items-center justify-between w-full px-3 py-2 glass-input text-white focus:outline-none focus:border-blue-500">
                    <SelectPrimitive.Value />
                    <SelectPrimitive.Icon>
                      <ChevronDown className="w-4 h-4 text-white/45" />
                    </SelectPrimitive.Icon>
                  </SelectPrimitive.Trigger>
                  <SelectPrimitive.Portal>
                    <SelectPrimitive.Content className="glass-dialog border-white/[0.08] rounded-lg shadow-xl z-50">
                      <SelectPrimitive.Viewport>
                        <SelectPrimitive.Item
                          value="project"
                          className="flex items-center gap-2 px-3 py-2 text-sm text-white/80 outline-none cursor-pointer hover:bg-white/[0.06] data-[highlighted]:bg-white/[0.06]"
                        >
                          <SelectPrimitive.ItemText>Project (symlink in project dir)</SelectPrimitive.ItemText>
                          <SelectPrimitive.ItemIndicator>
                            <Check className="w-4 h-4 text-blue-400" />
                          </SelectPrimitive.ItemIndicator>
                        </SelectPrimitive.Item>
                        <SelectPrimitive.Item
                          value="global"
                          className="flex items-center gap-2 px-3 py-2 text-sm text-white/80 outline-none cursor-pointer hover:bg-white/[0.06] data-[highlighted]:bg-white/[0.06]"
                        >
                          <SelectPrimitive.ItemText>Global (symlink in global IDE dir)</SelectPrimitive.ItemText>
                          <SelectPrimitive.ItemIndicator>
                            <Check className="w-4 h-4 text-blue-400" />
                          </SelectPrimitive.ItemIndicator>
                        </SelectPrimitive.Item>
                      </SelectPrimitive.Viewport>
                    </SelectPrimitive.Content>
                  </SelectPrimitive.Portal>
                </SelectPrimitive.Root>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-2">
                <DialogPrimitive.Close asChild>
                  <button
                    type="button"
                    className="px-4 py-2 text-white/45 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                </DialogPrimitive.Close>
                <button
                  type="submit"
                  disabled={isSubmitDisabled}
                  className={`px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors ${
                    isSubmitDisabled ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  Create {selectedSkills.size > 1 ? `${selectedSkills.size} Links` : 'Link'}
                </button>
              </div>
            </form>
          )}

          {phase === 'creating' && (
            <div className="space-y-4">
              {/* Progress bar */}
              <div className="bg-white/10 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-blue-500 h-full transition-all duration-300"
                  style={{ width: `${progress?.percentComplete ?? 0}%` }}
                />
              </div>

              {/* Status text */}
              <div className="flex items-center gap-2 text-sm text-white/70">
                <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                <span>
                  Creating link for {progress?.currentSkillName}... ({progress?.current}/{progress?.total})
                </span>
              </div>
            </div>
          )}

          {phase === 'results' && (
            <div className="space-y-4">
              {/* Summary counts */}
              <div className="flex items-center gap-4 text-sm">
                <span className="text-green-400">
                  ✓ {creationResults.filter(r => r.status === 'created').length} created
                </span>
                <span className="text-yellow-400">
                  ⊘ {creationResults.filter(r => r.status === 'skipped').length} skipped
                </span>
                <span className="text-red-400">
                  ✗ {creationResults.filter(r => r.status === 'error').length} errors
                </span>
              </div>

              {/* Scrollable results list */}
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {creationResults.map((result) => (
                  <div
                    key={result.skillId}
                    className={`p-3 rounded-lg border ${
                      result.status === 'created'
                        ? 'bg-green-500/5 border-green-500/20'
                        : result.status === 'skipped'
                        ? 'bg-yellow-500/5 border-yellow-500/20'
                        : 'bg-red-500/5 border-red-500/20'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {result.status === 'created' ? (
                        <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                      ) : result.status === 'skipped' ? (
                        <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                      )}
                      <span className="text-sm text-white/80 flex-1">
                        {skills.find(s => s.id === result.skillId)?.displayName || result.skillId}
                      </span>
                    </div>
                    {result.error && (
                      <p className="text-xs text-white/45 mt-1 ml-6">{result.error}</p>
                    )}
                  </div>
                ))}
              </div>

              {/* Close button */}
              <div className="flex justify-end pt-2">
                <button
                  onClick={handleClose}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

export default CreateLinkDialog;
