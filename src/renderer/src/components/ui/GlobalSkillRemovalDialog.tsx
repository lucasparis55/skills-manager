import React, { useMemo } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { AlertTriangle, X } from 'lucide-react';

interface GlobalSkillRemovalDialogProps {
  open: boolean;
  items: GlobalSkillEntry[];
  removing: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

const GlobalSkillRemovalDialog: React.FC<GlobalSkillRemovalDialogProps> = ({
  open,
  items,
  removing,
  onOpenChange,
  onConfirm,
}) => {
  const groups = useMemo(() => {
    const grouped = new Map<string, GlobalSkillEntry[]>();
    for (const item of items) {
      const toolLabel = item.ideNames.join(' · ') || 'Global tool';
      const current = grouped.get(toolLabel) || [];
      current.push(item);
      grouped.set(toolLabel, current);
    }
    return [...grouped.entries()];
  }, [items]);

  const hasExternal = items.some((item) => item.origin === 'external');

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(nextOpen) => !removing && onOpenChange(nextOpen)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/60 data-[state=open]:animate-overlayShow" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl glass-dialog p-6 shadow-xl data-[state=open]:animate-contentShow focus:outline-none">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-red-400/10 p-2 text-red-300">
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <DialogPrimitive.Title className="text-lg font-semibold text-white">
                  Remove {items.length} global skill{items.length === 1 ? '' : 's'}?
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="mt-1 text-sm text-white/50">
                  Only the global entries below will be moved to the system trash.
                </DialogPrimitive.Description>
              </div>
            </div>
            <DialogPrimitive.Close className="rounded-lg p-2 text-white/40 hover:bg-white/[0.06] hover:text-white" aria-label="Close removal confirmation">
              <X className="h-5 w-5" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>

          <div className="mt-5 space-y-4">
            {groups.map(([toolLabel, groupItems]) => (
              <div key={toolLabel} className="rounded-lg border border-white/[0.08] bg-black/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-white/50">{toolLabel}</p>
                <ul className="mt-2 space-y-2">
                  {groupItems.map((item) => (
                    <li key={item.id} className="min-w-0">
                      <p className="truncate text-sm text-white/80">{item.displayName}</p>
                      <p className="truncate text-xs text-white/40" title={item.path}>{item.path}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {hasExternal && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-xs leading-5 text-amber-100/80" role="alert">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>External skills are not preserved by Skills Manager. The source may only be recoverable from the system trash.</span>
            </div>
          )}

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <DialogPrimitive.Close asChild>
              <button type="button" className="rounded-lg px-4 py-2 text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white">
                Cancel
              </button>
            </DialogPrimitive.Close>
            <button
              type="button"
              onClick={onConfirm}
              disabled={removing || items.length === 0}
              className="rounded-lg bg-red-600 px-4 py-2 font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {removing ? 'Removing...' : 'Remove skills'}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

export default GlobalSkillRemovalDialog;
