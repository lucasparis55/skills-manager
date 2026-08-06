import React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { AlertCircle, Calendar, Download, Loader2, Rocket, Tag, X } from 'lucide-react';

type UpdateDialogStatus = 'available' | 'downloading' | 'installing' | 'error';

interface UpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentVersion: string;
  latestVersion: string;
  releaseNotes: string | null;
  publishedAt: string | null;
  updateStatus: UpdateDialogStatus;
  errorMessage: string | null;
  onInstall: () => void;
}

const UpdateDialog: React.FC<UpdateDialogProps> = ({
  open,
  onOpenChange,
  currentVersion,
  latestVersion,
  releaseNotes,
  publishedAt,
  updateStatus,
  errorMessage,
  onInstall,
}) => {
  const isDownloading = updateStatus === 'downloading';
  const isInstalling = updateStatus === 'installing';
  const isBusy = isDownloading || isInstalling;
  const formattedDate = publishedAt
    ? new Date(publishedAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isBusy) {
      return;
    }
    onOpenChange(nextOpen);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 bg-black/60 data-[state=open]:animate-overlayShow" />
        <DialogPrimitive.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 glass-dialog rounded-xl p-6 w-full max-w-lg shadow-xl data-[state=open]:animate-contentShow focus:outline-none">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                <Rocket className="w-5 h-5 text-blue-400" aria-hidden="true" />
              </div>
              <div>
                <DialogPrimitive.Title className="text-lg font-semibold text-white">
                  Update Available
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="text-sm text-white/45">
                  A new version is ready. The app will close and restart after the download finishes; save any ongoing work before continuing.
                </DialogPrimitive.Description>
              </div>
            </div>
            {!isBusy && (
              <DialogPrimitive.Close
                aria-label="Close update dialog"
                className="text-white/40 hover:text-white/80 transition-colors"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </DialogPrimitive.Close>
            )}
          </div>

          <div className="space-y-4 mb-6">
            <div className="flex items-center gap-4 p-3 rounded-lg bg-white/[0.04] border border-white/[0.06]">
              <div className="flex-1">
                <p className="text-xs text-white/40 mb-1">Current Version</p>
                <div className="flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-white/50" aria-hidden="true" />
                  <span className="text-sm font-medium text-white/70">{currentVersion}</span>
                </div>
              </div>
              <div className="w-px h-8 bg-white/[0.08]" aria-hidden="true" />
              <div className="flex-1">
                <p className="text-xs text-white/40 mb-1">Latest Version</p>
                <div className="flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" />
                  <span className="text-sm font-medium text-blue-400">{latestVersion}</span>
                </div>
              </div>
            </div>

            {formattedDate && (
              <div className="flex items-center gap-2 text-xs text-white/40">
                <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Published on {formattedDate}</span>
              </div>
            )}

            {releaseNotes && (
              <div>
                <p className="text-xs font-medium text-white/50 mb-2">What&apos;s New</p>
                <div className="max-h-40 overflow-y-auto rounded-lg bg-black/30 p-3 text-sm text-white/60 whitespace-pre-wrap border border-white/[0.06]">
                  {releaseNotes}
                </div>
              </div>
            )}

            {isBusy && (
              <div role="status" aria-live="polite" className="flex items-center gap-2 rounded-lg bg-blue-500/10 border border-blue-400/20 p-3 text-sm text-blue-200">
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                <span>{isInstalling ? 'Restarting with the new version…' : 'Downloading update…'}</span>
              </div>
            )}

            {errorMessage && (
              <div role="alert" className="flex gap-2 rounded-lg bg-red-500/10 border border-red-400/20 p-3 text-sm text-red-200">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <p className="font-medium">Update failed</p>
                  <p className="mt-1 text-red-200/80">{errorMessage}</p>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3">
            {!isBusy && (
              <DialogPrimitive.Close asChild>
                <button
                  type="button"
                  className="px-4 py-2 text-white/45 hover:text-white transition-colors text-sm"
                >
                  {errorMessage ? 'Close' : 'Remind Me Later'}
                </button>
              </DialogPrimitive.Close>
            )}
            <button
              type="button"
              onClick={onInstall}
              disabled={isBusy}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60 text-white rounded-lg transition-colors text-sm font-medium"
            >
              {isBusy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Download className="w-4 h-4" aria-hidden="true" />}
              {isDownloading ? 'Downloading…' : isInstalling ? 'Restarting…' : errorMessage ? 'Try Again' : 'Download and Install'}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

export default UpdateDialog;
