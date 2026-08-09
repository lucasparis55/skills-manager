import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import UpdateDialog from './UpdateDialog';

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  currentVersion: '1.0.1',
  latestVersion: 'v1.0.2',
  releaseNotes: 'Improved updates',
  publishedAt: '2025-01-01T00:00:00Z',
  updateStatus: 'available' as const,
  updateProgress: null,
  errorMessage: null,
  onInstall: vi.fn(),
};

describe('UpdateDialog', () => {
  it('starts the update only after explicit confirmation', async () => {
    const user = userEvent.setup();
    const onInstall = vi.fn();

    render(<UpdateDialog {...baseProps} onInstall={onInstall} />);

    expect(screen.getByText('Update Available')).toBeInTheDocument();
    expect(screen.getByText(/close and restart after the update/i)).toBeInTheDocument();
    expect(onInstall).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /download and install/i }));

    expect(onInstall).toHaveBeenCalledTimes(1);
  });

  it('shows the real download percentage and blocks duplicate actions', () => {
    render(
      <UpdateDialog
        {...baseProps}
        updateStatus="downloading"
        updateProgress={{ stage: 'downloading', percent: 42 }}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent(/downloading update/i);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42');
    expect(screen.getByRole('progressbar').firstElementChild).toHaveStyle({ width: '42%' });
    expect(screen.getByText('42%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /downloading/i })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /remind me later/i })).not.toBeInTheDocument();
  });

  it('shows the apply state while restarting', () => {
    render(
      <UpdateDialog
        {...baseProps}
        updateStatus="installing"
        updateProgress={{ stage: 'installing', percent: 75 }}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent(/installing update/i);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '75');
    expect(screen.getByRole('button', { name: /installing/i })).toBeDisabled();
  });

  it('keeps the dialog open and offers retry after an update error', async () => {
    const user = userEvent.setup();
    const onInstall = vi.fn();

    render(
      <UpdateDialog
        {...baseProps}
        updateStatus="error"
        errorMessage="Feed unavailable"
        onInstall={onInstall}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Feed unavailable');
    await user.click(screen.getByRole('button', { name: /try again/i }));

    expect(onInstall).toHaveBeenCalledTimes(1);
  });
});
