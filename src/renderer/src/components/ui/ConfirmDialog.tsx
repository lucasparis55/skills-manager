import React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X, AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
}) => {
  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 bg-black/50 data-[state=open]:animate-overlayShow" />
        <DialogPrimitive.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 glass-dialog rounded-xl p-6 w-full max-w-md shadow-xl data-[state=open]:animate-contentShow focus:outline-none">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              {variant === 'danger' && (
                <AlertTriangle className="w-5 h-5 text-red-400" />
              )}
              <DialogPrimitive.Title className="text-lg font-semibold text-white">
                {title}
              </DialogPrimitive.Title>
            </div>
            <DialogPrimitive.Close className="text-white/40 hover:text-white/80">
              <X className="w-4 h-4" />
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Description className="text-sm text-white/45 mb-6">
            {description}
          </DialogPrimitive.Description>
          <div className="flex justify-end gap-3">
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                className="px-4 py-2 text-white/45 hover:text-white transition-colors"
              >
                {cancelLabel}
              </button>
            </DialogPrimitive.Close>
            <button
              type="button"
              onClick={handleConfirm}
              className={`px-4 py-2 text-white rounded-lg transition-colors ${
                variant === 'danger'
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {confirmLabel}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

export default ConfirmDialog;
