import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createApiMock } from '../test-utils';
import { useUpdateChecker } from './useUpdateChecker';

const availableUpdate = {
  hasUpdate: true,
  currentVersion: '1.0.1',
  latestVersion: 'v1.0.2',
  releaseUrl: 'https://github.com/lucasparis55/skills-manager/releases/tag/v1.0.2',
  releaseNotes: 'Improved updates',
  publishedAt: '2025-01-01T00:00:00Z',
};

describe('useUpdateChecker', () => {
  it('tracks an available update and starts the confirmed update', async () => {
    const check = vi.fn(async () => availableUpdate);
    const start = vi.fn(async () => ({ success: true }));
    let statusHandler: ((status: UpdateOperationStatus) => void) | undefined;
    const onStatus = vi.fn((callback: (status: UpdateOperationStatus) => void) => {
      statusHandler = callback;
      return () => {};
    });
    createApiMock({ update: { check, start, onStatus } });

    const { result } = renderHook(() => useUpdateChecker(true));

    await waitFor(() => expect(result.current.status).toBe('available'));
    expect(result.current.result).toEqual(availableUpdate);

    await act(async () => {
      await result.current.startUpdate();
    });

    expect(start).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('downloading');

    act(() => statusHandler?.('installing'));
    expect(result.current.status).toBe('installing');
  });

  it('exposes a retryable error when starting the update fails', async () => {
    const start = vi.fn(async () => {
      throw new Error('Feed unavailable');
    });
    createApiMock({
      update: {
        check: vi.fn(async () => availableUpdate),
        start,
        onStatus: vi.fn(() => () => {}),
      },
    });

    const { result } = renderHook(() => useUpdateChecker(true));
    await waitFor(() => expect(result.current.status).toBe('available'));

    await act(async () => {
      await result.current.startUpdate();
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Feed unavailable');
    expect(result.current.result?.hasUpdate).toBe(true);
  });
});
