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
  errorMessage: null,
  onInstall: vi.fn(),
};

describe('UpdateDialog', () => {
  it('starts the update only after explicit confirmation', async () => {
    const user = userEvent.setup();
    const onInstall = vi.fn();

    render(<UpdateDialog {...baseProps} onInstall={onInstall} />);

    expect(screen.getByText('Update Available')).toBeInTheDocument();
    expect(screen.getByText(/close and restart after the download/i)).toBeInTheDocument();
    expect(onInstall).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /download and install/i }));

    expect(onInstall).toHaveBeenCalledTimes(1);
  });

  it('shows an indeterminate download state and blocks duplicate actions', () => {
    render(<UpdateDialog {...baseProps} updateStatus="downloading" />);

    expect(screen.getByRole('status')).toHaveTextContent(/downloading update/i);
    expect(screen.getByRole('button', { name: /downloading/i })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /remind me later/i })).not.toBeInTheDocument();
  });

  it('shows the apply state while restarting', () => {
    render(<UpdateDialog {...baseProps} updateStatus="installing" />);

    expect(screen.getByRole('status')).toHaveTextContent(/restarting with the new version/i);
    expect(screen.getByRole('button', { name: /restarting/i })).toBeDisabled();
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
