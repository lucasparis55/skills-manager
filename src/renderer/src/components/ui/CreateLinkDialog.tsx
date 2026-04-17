import React, { useState, useEffect } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as SelectPrimitive from '@radix-ui/react-select';
import { X, ChevronDown, Check, Link2 } from 'lucide-react';

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

interface CreateLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skills: Skill[];
  projects: Project[];
  ides: IDE[];
  onSubmit: (values: { skillId: string; projectId: string; ideName: string; scope: 'global' | 'project' }) => void;
}

const CreateLinkDialog: React.FC<CreateLinkDialogProps> = ({
  open,
  onOpenChange,
  skills,
  projects,
  ides,
  onSubmit,
}) => {
  const [skillId, setSkillId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [ideName, setIdeName] = useState('');
  const [scope, setScope] = useState<'global' | 'project'>('project');

  useEffect(() => {
    if (!open) {
      setSkillId('');
      setProjectId('');
      setIdeName('');
      setScope('project');
    }
  }, [open]);

  const isSubmitDisabled = !skillId || !projectId || !ideName;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitDisabled) return;
    onSubmit({ skillId, projectId, ideName, scope });
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 bg-black/50 data-[state=open]:animate-overlayShow" />
        <DialogPrimitive.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-md shadow-xl data-[state=open]:animate-contentShow focus:outline-none">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Link2 className="w-5 h-5 text-blue-400" />
              <DialogPrimitive.Title className="text-lg font-semibold text-white">
                Create Link
              </DialogPrimitive.Title>
            </div>
            <DialogPrimitive.Close className="text-slate-500 hover:text-slate-300">
              <X className="w-4 h-4" />
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Description className="text-sm text-slate-400 mb-4">
            Link a skill to a project for a specific IDE. A symlink will be created in the project's IDE directory.
          </DialogPrimitive.Description>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Skill Select */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Skill <span className="text-red-400">*</span>
              </label>
              <SelectPrimitive.Root value={skillId} onValueChange={setSkillId}>
                <SelectPrimitive.Trigger className="flex items-center justify-between w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500">
                  <SelectPrimitive.Value placeholder="Select a skill..." />
                  <SelectPrimitive.Icon>
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  </SelectPrimitive.Icon>
                </SelectPrimitive.Trigger>
                <SelectPrimitive.Portal>
                  <SelectPrimitive.Content className="bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 max-h-60 overflow-auto">
                    <SelectPrimitive.Viewport>
                      {skills.map((skill) => (
                        <SelectPrimitive.Item
                          key={skill.id}
                          value={skill.id}
                          className="flex items-center gap-2 px-3 py-2 text-sm text-slate-200 outline-none cursor-pointer hover:bg-slate-700 data-[highlighted]:bg-slate-700"
                        >
                          <SelectPrimitive.ItemText>{skill.displayName || skill.name}</SelectPrimitive.ItemText>
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

            {/* Project Select */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Project <span className="text-red-400">*</span>
              </label>
              <SelectPrimitive.Root value={projectId} onValueChange={setProjectId}>
                <SelectPrimitive.Trigger className="flex items-center justify-between w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500">
                  <SelectPrimitive.Value placeholder="Select a project..." />
                  <SelectPrimitive.Icon>
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  </SelectPrimitive.Icon>
                </SelectPrimitive.Trigger>
                <SelectPrimitive.Portal>
                  <SelectPrimitive.Content className="bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 max-h-60 overflow-auto">
                    <SelectPrimitive.Viewport>
                      {projects.map((project) => (
                        <SelectPrimitive.Item
                          key={project.id}
                          value={project.id}
                          className="flex items-center gap-2 px-3 py-2 text-sm text-slate-200 outline-none cursor-pointer hover:bg-slate-700 data-[highlighted]:bg-slate-700"
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
              <label className="block text-sm font-medium text-slate-300 mb-1">
                IDE <span className="text-red-400">*</span>
              </label>
              <SelectPrimitive.Root value={ideName} onValueChange={setIdeName}>
                <SelectPrimitive.Trigger className="flex items-center justify-between w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500">
                  <SelectPrimitive.Value placeholder="Select an IDE..." />
                  <SelectPrimitive.Icon>
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  </SelectPrimitive.Icon>
                </SelectPrimitive.Trigger>
                <SelectPrimitive.Portal>
                  <SelectPrimitive.Content className="bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 max-h-60 overflow-auto">
                    <SelectPrimitive.Viewport>
                      {ides.map((ide) => (
                        <SelectPrimitive.Item
                          key={ide.id}
                          value={ide.id}
                          className="flex items-center gap-2 px-3 py-2 text-sm text-slate-200 outline-none cursor-pointer hover:bg-slate-700 data-[highlighted]:bg-slate-700"
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
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Scope
              </label>
              <SelectPrimitive.Root value={scope} onValueChange={(v) => setScope(v as 'global' | 'project')}>
                <SelectPrimitive.Trigger className="flex items-center justify-between w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500">
                  <SelectPrimitive.Value />
                  <SelectPrimitive.Icon>
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  </SelectPrimitive.Icon>
                </SelectPrimitive.Trigger>
                <SelectPrimitive.Portal>
                  <SelectPrimitive.Content className="bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50">
                    <SelectPrimitive.Viewport>
                      <SelectPrimitive.Item
                        value="project"
                        className="flex items-center gap-2 px-3 py-2 text-sm text-slate-200 outline-none cursor-pointer hover:bg-slate-700 data-[highlighted]:bg-slate-700"
                      >
                        <SelectPrimitive.ItemText>Project (symlink in project dir)</SelectPrimitive.ItemText>
                        <SelectPrimitive.ItemIndicator>
                          <Check className="w-4 h-4 text-blue-400" />
                        </SelectPrimitive.ItemIndicator>
                      </SelectPrimitive.Item>
                      <SelectPrimitive.Item
                        value="global"
                        className="flex items-center gap-2 px-3 py-2 text-sm text-slate-200 outline-none cursor-pointer hover:bg-slate-700 data-[highlighted]:bg-slate-700"
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
                  className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
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
                Create Link
              </button>
            </div>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

export default CreateLinkDialog;
