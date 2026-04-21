import React, { useState, useEffect } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X, Save, Loader2 } from 'lucide-react';
import { InlineForm, FormField } from './FormDialog';
import FileBrowser from './FileBrowser';
import { useToast } from './Toast';

interface Skill {
  id: string;
  name: string;
  displayName: string;
  description: string;
  version: string;
  targetIDEs: string[];
  tags: string[];
}

interface SkillEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skill: Skill | null;
  onSave: () => void;
}

type Tab = 'metadata' | 'content' | 'files';

const SkillEditDialog: React.FC<SkillEditDialogProps> = ({
  open,
  onOpenChange,
  skill,
  onSave,
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('metadata');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const { toast } = useToast();

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open && skill) {
      setActiveTab('metadata');
      setContent('');
      setLoading(false);
      setSaving(false);
      setFormKey((k) => k + 1);
    }
    if (!open) {
      setContent('');
    }
  }, [open, skill]);

  // Load content when switching to content tab
  useEffect(() => {
    if (activeTab === 'content' && skill && !content) {
      loadContent();
    }
  }, [activeTab, skill]);

  const loadContent = async () => {
    if (!skill) return;
    setLoading(true);
    try {
      const data = await window.api.skills.getContent(skill.id);
      setContent(data);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveContent = async () => {
    if (!skill || !content) return;
    setSaving(true);
    try {
      await window.api.skills.saveContent(skill.id, content);
      onSave();
      toast({ title: 'Saved', description: 'SKILL.md content updated.', variant: 'success' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveMetadata = async (values: Record<string, string>) => {
    if (!skill) return;
    try {
      await window.api.skills.update(skill.id, {
        displayName: values.displayName,
        description: values.description,
        version: values.version,
        targetIDEs: values.targetIDEs
          ? values.targetIDEs.split(',').map((s: string) => s.trim()).filter(Boolean)
          : [],
        tags: values.tags
          ? values.tags.split(',').map((s: string) => s.trim()).filter(Boolean)
          : [],
      });
      onSave();
      setFormKey((k) => k + 1);
      toast({ title: 'Saved', description: 'Skill metadata updated.', variant: 'success' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'error' });
    }
  };

  if (!skill) return null;

  const editFields: FormField[] = [
    { name: 'displayName', label: 'Display Name', placeholder: 'My Skill', required: true },
    { name: 'description', label: 'Description', placeholder: 'What this skill does...', type: 'textarea', rows: 3 },
    { name: 'version', label: 'Version', placeholder: '1.0.0' },
    { name: 'targetIDEs', label: 'Target IDEs', placeholder: 'claude-code, cursor, opencode, kimi-cli (comma-separated)' },
    { name: 'tags', label: 'Tags', placeholder: 'Add tags...', type: 'tags' },
  ];

  const initialValues: Record<string, string> = {
    displayName: skill.displayName,
    description: skill.description,
    version: skill.version,
    targetIDEs: skill.targetIDEs.join(', '),
    tags: skill.tags.join(', '),
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'metadata', label: 'Metadata' },
    { id: 'content', label: 'SKILL.md' },
    { id: 'files', label: 'Files' },
  ];

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 bg-black/50 data-[state=open]:animate-overlayShow" />
        <DialogPrimitive.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 glass-dialog rounded-xl w-full max-w-3xl max-h-[85vh] shadow-xl data-[state=open]:animate-contentShow focus:outline-none flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 pb-4 border-b border-white/[0.08]">
            <DialogPrimitive.Title className="text-lg font-semibold text-white">
              Edit Skill: {skill.displayName}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close className="text-white/40 hover:text-white/80">
              <X className="w-5 h-5" />
            </DialogPrimitive.Close>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 px-6 pt-2 border-b border-white/[0.08]">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                  activeTab === tab.id
                    ? 'bg-white/10 text-white'
                    : 'text-white/45 hover:text-white hover:bg-white/[0.06]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'metadata' && (
              <InlineForm
                key={formKey}
                fields={editFields}
                onSubmit={handleSaveMetadata}
                submitLabel="Save Metadata"
                initialValues={initialValues}
              />
            )}

            {activeTab === 'content' && (
              <div className="space-y-4">
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                    <span className="ml-2 text-white/45">Loading...</span>
                  </div>
                ) : (
                  <>
                    <textarea
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      placeholder="Edit SKILL.md content..."
                      className="w-full h-96 px-4 py-3 glass-input text-white placeholder:text-white/35 focus:outline-none focus:border-blue-500 resize-y font-mono text-sm"
                      onKeyDown={(e) => {
                        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                          e.preventDefault();
                          handleSaveContent();
                        }
                      }}
                    />
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-white/40">
                        {content.length} characters | {content.split('\n').length} lines
                      </span>
                      <button
                        onClick={handleSaveContent}
                        disabled={saving || !content}
                        className={`flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors ${
                          saving || !content ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                      >
                        {saving ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Save className="w-4 h-4" />
                        )}
                        Save Content
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {activeTab === 'files' && (
              <FileBrowser skillId={skill.id} onFileChange={onSave} />
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

export default SkillEditDialog;
