import { useState, useEffect, useCallback, useRef } from 'react';

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'installing'
  | 'upToDate'
  | 'error';

interface UpdateResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string | null;
  releaseUrl: string | null;
  releaseNotes: string | null;
  publishedAt: string | null;
}

interface UseUpdateCheckerReturn {
  status: UpdateStatus;
  result: UpdateResult | null;
  progress: UpdateOperationProgress | null;
  error: string | null;
  checkNow: () => Promise<void>;
  startUpdate: () => Promise<void>;
  openRelease: () => Promise<void>;
}

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to install the update.';
}

export function useUpdateChecker(checkForUpdates: boolean | undefined): UseUpdateCheckerReturn {
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [result, setResult] = useState<UpdateResult | null>(null);
  const [progress, setProgress] = useState<UpdateOperationProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkNow = useCallback(async () => {
    if (!checkForUpdates) {
      setStatus('idle');
      setProgress(null);
      setError(null);
      return;
    }

    setStatus('checking');
    setProgress(null);
    setError(null);
    try {
      const data = await window.api.update.check();
      setResult(data);
      setStatus(data.hasUpdate ? 'available' : 'upToDate');
    } catch (checkError) {
      setStatus('error');
      setError(getErrorMessage(checkError));
    }
  }, [checkForUpdates]);

  const startUpdate = useCallback(async () => {
    if (!result?.hasUpdate) {
      return;
    }

    setProgress({ stage: 'downloading', percent: 0 });
    setStatus('downloading');
    setError(null);
    try {
      await window.api.update.start();
    } catch (updateError) {
      setStatus('error');
      setProgress(null);
      setError(getErrorMessage(updateError));
    }
  }, [result]);

  useEffect(() => {
    if (!checkForUpdates) {
      setStatus('idle');
      setProgress(null);
      return;
    }

    checkNow();

    intervalRef.current = setInterval(() => {
      checkNow();
    }, CHECK_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [checkForUpdates, checkNow]);

  useEffect(() => {
    if (!checkForUpdates) {
      return;
    }

    return window.api.update.onStatus((nextProgress) => {
      setProgress(nextProgress);
      setStatus(nextProgress.stage);
      setError(null);
    });
  }, [checkForUpdates]);

  const openRelease = useCallback(async () => {
    if (result?.latestVersion) {
      await window.api.update.openRelease(result.latestVersion);
    }
  }, [result]);

  return {
    status,
    result,
    progress,
    error,
    checkNow,
    startUpdate,
    openRelease,
  };
}
