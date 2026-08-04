import React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { AlertCircle, Loader2, X } from 'lucide-react';

interface GlobalSkillPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: GlobalSkillPreview | null;
  loading: boolean;
  error: string | null;
}

const GlobalSkillPreviewDialog: React.FC<GlobalSkillPreviewDialogProps> = ({
  open,
  onOpenChange,
  preview,
  loading,
  error,
}) => {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/60 data-[state=open]:animate-overlayShow" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[calc(100%-2rem)] max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl glass-dialog shadow-xl data-[state=open]:animate-contentShow focus:outline-none">
          <div className="flex items-center justify-between border-b border-white/[0.08] p-5">
            <div className="min-w-0">
              <DialogPrimitive.Title className="truncate text-lg font-semibold text-white">
                {preview ? preview.displayName : 'Skill preview'}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 truncate text-xs text-white/40">
                {preview?.path || 'Read-only SKILL.md preview'}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close className="rounded-lg p-2 text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white" aria-label="Close preview">
              <X className="h-5 w-5" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-white/50" role="status">
                <Loader2 className="h-5 w-5 animate-spin text-blue-300" aria-hidden="true" />
                Loading SKILL.md...
              </div>
            ) : error ? (
              <div className="flex items-start gap-3 rounded-lg border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-200" role="alert">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            ) : preview?.content ? (
              <pre className="max-h-[58vh] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-white/[0.08] bg-black/35 p-4 font-mono text-xs leading-6 text-white/75">
                {preview.content}
              </pre>
            ) : (
              <div className="py-16 text-center text-sm text-white/45" role="status">
                SKILL.md is not available for this entry.
              </div>
            )}
          </div>

          {preview?.truncated && (
            <div className="border-t border-amber-400/10 bg-amber-400/5 px-5 py-3 text-xs text-amber-200/80">
              Preview truncated to keep the interface responsive.
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

export default GlobalSkillPreviewDialog;
