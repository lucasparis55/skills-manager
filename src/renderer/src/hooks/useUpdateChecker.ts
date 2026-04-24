import { useState, useEffect, useCallback, useRef } from 'react';

type UpdateStatus = 'idle' | 'checking' | 'available' | 'upToDate' | 'error';

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
  checkNow: () => Promise<void>;
  openRelease: () => Promise<void>;
}

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function useUpdateChecker(checkForUpdates: boolean | undefined): UseUpdateCheckerReturn {
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [result, setResult] = useState<UpdateResult | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkNow = useCallback(async () => {
    if (!checkForUpdates) {
      setStatus('idle');
      return;
    }

    setStatus('checking');
    try {
      const data = await window.api.update.check();
      setResult(data);
      setStatus(data.hasUpdate ? 'available' : 'upToDate');
    } catch {
      setStatus('error');
    }
  }, [checkForUpdates]);

  useEffect(() => {
    if (!checkForUpdates) {
      setStatus('idle');
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

  const openRelease = useCallback(async () => {
    if (result?.latestVersion) {
      await window.api.update.openRelease(result.latestVersion);
    }
  }, [result]);

  return {
    status,
    result,
    checkNow,
    openRelease,
  };
}
