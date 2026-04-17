import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ConfirmDialog from './ConfirmDialog';
import { renderWithProviders } from '../../test-utils';

vi.mock('@radix-ui/react-dialog', () => ({
  Root: ({ open, children }: any) => (open ? <div>{children}</div> : null),
  Portal: ({ children }: any) => <>{children}</>,
  Overlay: ({ children }: any) => <div>{children}</div>,
  Content: ({ children }: any) => <div>{children}</div>,
  Title: ({ children }: any) => <div>{children}</div>,
  Description: ({ children }: any) => <div>{children}</div>,
  Close: ({ children }: any) => <>{children}</>,
}));

describe('ConfirmDialog', () => {
  it('renders dialog content and confirms action', async () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();

    renderWithProviders(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title="Remove Item"
        description="Confirm removal?"
        onConfirm={onConfirm}
        confirmLabel="Remove"
        variant="danger"
      />,
    );

    expect(screen.getByText('Remove Item')).toBeInTheDocument();
    expect(screen.getByText('Confirm removal?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
