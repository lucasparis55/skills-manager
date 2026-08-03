import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import DuplicatesPage from './DuplicatesPage';
import { createApiMock, renderWithProviders } from '../test-utils';

vi.mock('../components/ui/ConfirmDialog', () => ({
  default: (props: any) => props.open ? (
    <div role="dialog">
      <div>{props.title}</div>
      <div>{props.description}</div>
      <button
        type="button"
        onClick={() => {
          props.onConfirm();
          props.onOpenChange(false);
        }}
      >
        {props.confirmLabel || 'Confirm'}
      </button>
    </div>
  ) : null,
}));

const firstPath = 'C:/claude/skills/review';
const secondPath = 'C:/codex/skills/review';

function scanResult(): DuplicateScanResult {
  return {
    scannedAt: '2026-08-03T12:00:00.000Z',
    roots: [
      { root: 'C:/claude/skills', ideIds: ['claude-code'], ideNames: ['Claude Code'] },
      { root: 'C:/codex/skills', ideIds: ['codex-cli'], ideNames: ['Codex CLI'] },
    ],
    groups: [
      {
        id: 'review:hash',
        name: 'review',
        contentHash: 'hash',
        occurrences: [
          {
            path: firstPath,
            name: 'review',
            contentHash: 'hash',
            rootPaths: ['C:/claude/skills'],
            ideIds: ['claude-code'],
            ideNames: ['Claude Code'],
          },
          {
            path: secondPath,
            name: 'review',
            contentHash: 'hash',
            rootPaths: ['C:/codex/skills'],
            ideIds: ['codex-cli'],
            ideNames: ['Codex CLI'],
          },
        ],
      },
    ],
  };
}

describe('DuplicatesPage', () => {
  it('scans on mount, renders tools, and scans again on demand', async () => {
    const api = createApiMock({
      duplicates: {
        scan: vi.fn(async () => scanResult()),
      },
    });

    renderWithProviders(<DuplicatesPage />);

    expect(await screen.findByText('review')).toBeInTheDocument();
    expect(screen.getByText('Claude Code')).toBeInTheDocument();
    expect(screen.getByText('Codex CLI')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Scan again' }));
    expect(api.duplicates.scan).toHaveBeenCalledTimes(2);
  });

  it('removes only the selected occurrence after confirmation', async () => {
    const api = createApiMock({
      duplicates: {
        scan: vi.fn(async () => scanResult()),
        remove: vi.fn(async (paths: string[]) => paths.map((path) => ({
          action: 'remove' as const,
          path,
          name: 'review',
          status: 'trashed' as const,
        }))),
      },
    });

    renderWithProviders(<DuplicatesPage />);
    await screen.findByText('review');
    await userEvent.click(screen.getByLabelText('Select Claude Code review'));
    await userEvent.click(screen.getByRole('button', { name: 'Remove selected', exact: true }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Remove selected occurrences');
    await userEvent.click(dialog.querySelector('button')!);

    await waitFor(() => {
      expect(api.duplicates.remove).toHaveBeenCalledWith([firstPath]);
    });
    expect(api.duplicates.remove).not.toHaveBeenCalledWith([secondPath]);
    expect(api.duplicates.scan).toHaveBeenCalledTimes(2);
  });

  it('requires an additional confirmation when all copies are selected', async () => {
    const api = createApiMock({
      duplicates: {
        scan: vi.fn(async () => scanResult()),
        remove: vi.fn(async (paths: string[]) => paths.map((path) => ({
          action: 'remove' as const,
          path,
          name: 'review',
          status: 'trashed' as const,
        }))),
      },
    });

    renderWithProviders(<DuplicatesPage />);
    await screen.findByText('review');
    await userEvent.click(screen.getByLabelText('Select Claude Code review'));
    await userEvent.click(screen.getByLabelText('Select Codex CLI review'));
    await userEvent.click(screen.getByRole('button', { name: 'Remove selected', exact: true }));

    const warning = await screen.findByRole('dialog');
    expect(warning).toHaveTextContent('Remove all copies?');
    await userEvent.click(warning.querySelector('button')!);

    const confirmation = await screen.findByRole('dialog');
    expect(confirmation).toHaveTextContent('Remove selected occurrences');
    await userEvent.click(confirmation.querySelector('button')!);

    await waitFor(() => {
      expect(api.duplicates.remove).toHaveBeenCalledWith([firstPath, secondPath]);
    });
  });

  it('migrates selected occurrences through the duplicates API only', async () => {
    const api = createApiMock({
      duplicates: {
        scan: vi.fn(async () => scanResult()),
        migrate: vi.fn(async (paths: string[]) => paths.map((path) => ({
          action: 'migrate' as const,
          path,
          name: 'review',
          status: 'migrated' as const,
          centralPath: 'C:/skills/review',
        }))),
      },
    });

    renderWithProviders(<DuplicatesPage />);
    await screen.findByText('review');
    await userEvent.click(screen.getByLabelText('Select Codex CLI review'));
    await userEvent.click(screen.getByRole('button', { name: 'Migrate selected', exact: true }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(dialog.querySelector('button')!);

    await waitFor(() => {
      expect(api.duplicates.migrate).toHaveBeenCalledWith([secondPath]);
    });
    expect(api.skills.create).not.toHaveBeenCalled();
    expect(api.skills.delete).not.toHaveBeenCalled();
    expect(api.links.create).not.toHaveBeenCalled();
  });

  it('keeps individual results visible and reports partial failures', async () => {
    const results: DuplicateOperationResult[] = [
      { action: 'migrate', path: firstPath, name: 'review', status: 'migrated' },
      { action: 'migrate', path: secondPath, name: 'review', status: 'failed', message: 'Recycle Bin unavailable' },
      { action: 'migrate', path: 'C:/other/one', name: 'one', status: 'blocked', message: 'Central conflict' },
      { action: 'migrate', path: 'C:/other/two', name: 'two', status: 'already-missing', message: 'Gone' },
    ];
    const api = createApiMock({
      duplicates: {
        scan: vi.fn(async () => scanResult()),
        migrate: vi.fn(async () => results),
      },
    });

    renderWithProviders(<DuplicatesPage />);
    await screen.findByText('review');
    await userEvent.click(screen.getByLabelText('Select Claude Code review'));
    await userEvent.click(screen.getByRole('button', { name: 'Migrate selected', exact: true }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(dialog.querySelector('button')!);

    expect(await screen.findByText('Partial operation')).toBeInTheDocument();
    expect(screen.getByText('Migrated')).toBeInTheDocument();
    expect(screen.getByText('Recycle Bin unavailable')).toBeInTheDocument();
    expect(screen.getByText('Central conflict')).toBeInTheDocument();
    expect(screen.getByText('Already missing')).toBeInTheDocument();
    await waitFor(() => expect(api.duplicates.scan).toHaveBeenCalledTimes(2));
  });

  it('shows empty, loading, and scan error states', async () => {
    const emptyApi = createApiMock({
      duplicates: {
        scan: vi.fn(async () => ({ ...scanResult(), groups: [] })),
      },
    });
    renderWithProviders(<DuplicatesPage />);
    expect(await screen.findByText('No duplicate skills found')).toBeInTheDocument();
    expect(emptyApi.duplicates.scan).toHaveBeenCalledTimes(1);
  });

  it('keeps the loading state while a scan is pending and exposes retry after an error', async () => {
    let resolveScan: ((result: DuplicateScanResult) => void) | undefined;
    const pendingApi = createApiMock({
      duplicates: {
        scan: vi.fn(() => new Promise<DuplicateScanResult>((resolve) => {
          resolveScan = resolve;
        })),
      },
    });
    const pendingRender = renderWithProviders(<DuplicatesPage />);
    expect(screen.getByText('Loading duplicate skills...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Scanning...' })).toBeDisabled();
    resolveScan?.({ ...scanResult(), groups: [] });
    await screen.findByText('No duplicate skills found');
    expect(pendingApi.duplicates.scan).toHaveBeenCalledTimes(1);
    pendingRender.unmount();

    const errorApi = createApiMock({
      duplicates: {
        scan: vi.fn(async () => {
          throw new Error('Filesystem unavailable');
        }),
      },
    });
    renderWithProviders(<DuplicatesPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Filesystem unavailable');
    expect(screen.getByRole('button', { name: 'Scan again' })).toBeEnabled();
    expect(errorApi.duplicates.scan).toHaveBeenCalledTimes(1);
  });
});
