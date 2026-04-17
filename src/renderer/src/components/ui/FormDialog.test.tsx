import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Folder } from 'lucide-react';
import FormDialog, { InlineForm, type FormField } from './FormDialog';
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

describe('InlineForm', () => {
  it('validates required fields and submits values', async () => {
    const onSubmit = vi.fn();
    const fields: FormField[] = [
      { name: 'name', label: 'Name', required: true },
      { name: 'description', label: 'Description', type: 'textarea' },
    ];

    renderWithProviders(
      <InlineForm fields={fields} onSubmit={onSubmit} submitLabel="Save" />,
    );

    const [nameInput, descriptionInput] = screen.getAllByRole('textbox');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await userEvent.type(nameInput, 'My Skill');
    await userEvent.type(descriptionInput, 'Useful skill');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'My Skill',
      description: 'Useful skill',
    });
  });

  it('supports tags and action button field helpers', async () => {
    const onSubmit = vi.fn();
    const fields: FormField[] = [
      {
        name: 'path',
        label: 'Path',
        actionButton: {
          icon: Folder,
          tooltip: 'Browse',
          onClick: async () => 'C:/projects/demo',
        },
      },
      {
        name: 'tags',
        label: 'Tags',
        type: 'tags',
      },
    ];

    renderWithProviders(
      <InlineForm fields={fields} onSubmit={onSubmit} submitLabel="Create" />,
    );

    await userEvent.click(screen.getByTitle('Browse'));
    expect(screen.getAllByRole('textbox')[0]).toHaveValue('C:/projects/demo');

    await userEvent.type(screen.getByPlaceholderText('Add a tag...'), 'core');
    await userEvent.keyboard('{Enter}');
    await userEvent.type(screen.getByPlaceholderText('Add a tag...'), 'ui');
    await userEvent.keyboard('{Enter}');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(onSubmit).toHaveBeenCalledWith({
      path: 'C:/projects/demo',
      tags: 'core, ui',
    });
  });

  it('calls cancel and resets when triggerReset changes', async () => {
    const onCancel = vi.fn();
    const onSubmit = vi.fn();
    const fields: FormField[] = [{ name: 'name', label: 'Name' }];

    const { rerender } = renderWithProviders(
      <InlineForm fields={fields} onSubmit={onSubmit} onCancel={onCancel} />,
    );

    await userEvent.type(screen.getByRole('textbox'), 'Temp');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    rerender(
      <InlineForm fields={fields} onSubmit={onSubmit} onCancel={onCancel} triggerReset={true} />,
    );
    expect(screen.getByRole('textbox')).toHaveValue('');
  });
});

describe('FormDialog', () => {
  it('renders title/description and submits via InlineForm', async () => {
    const onSubmit = vi.fn();
    const onOpenChange = vi.fn();

    renderWithProviders(
      <FormDialog
        open={true}
        onOpenChange={onOpenChange}
        title="Create skill"
        description="Fill in the values"
        fields={[{ name: 'name', label: 'Name', required: true }]}
        onSubmit={onSubmit}
        submitLabel="Create"
      />,
    );

    expect(screen.getByText('Create skill')).toBeInTheDocument();
    expect(screen.getByText('Fill in the values')).toBeInTheDocument();

    await userEvent.type(screen.getByRole('textbox'), 'alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(onSubmit).toHaveBeenCalledWith({ name: 'alpha' });
  });
});
