import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import CreateLinkDialog from './CreateLinkDialog';
import { createApiMock, renderWithProviders } from '../../test-utils';

vi.mock('@radix-ui/react-dialog', () => ({
  Root: ({ open, children }: any) => (open ? <div>{children}</div> : null),
  Portal: ({ children }: any) => <>{children}</>,
  Overlay: ({ children }: any) => <div>{children}</div>,
  Content: ({ children }: any) => <div>{children}</div>,
  Title: ({ children }: any) => <div>{children}</div>,
  Description: ({ children }: any) => <div>{children}</div>,
  Close: ({ children }: any) => <>{children}</>,
}));

vi.mock('@radix-ui/react-select', async () => {
  const ReactModule = await import('react');
  const SelectContext = ReactModule.createContext<{
    value: string;
    onValueChange: (value: string) => void;
  }>({ value: '', onValueChange: () => {} });

  return {
    Root: ({ value, onValueChange, children }: any) => (
      <SelectContext.Provider value={{ value, onValueChange }}>{children}</SelectContext.Provider>
    ),
    Trigger: ({ children }: any) => <div>{children}</div>,
    Value: ({ placeholder }: any) => <span>{placeholder}</span>,
    Icon: ({ children }: any) => <span>{children}</span>,
    Portal: ({ children }: any) => <>{children}</>,
    Content: ({ children }: any) => <div>{children}</div>,
    Viewport: ({ children }: any) => <div>{children}</div>,
    Item: ({ value, children }: any) => {
      const ctx = ReactModule.useContext(SelectContext);
      return (
        <button type="button" onClick={() => ctx.onValueChange(value)}>
          {children}
        </button>
      );
    },
    ItemText: ({ children }: any) => <span>{children}</span>,
    ItemIndicator: ({ children }: any) => <span>{children}</span>,
  };
});

const skills = [
  { id: 's1', name: 'skill-1', displayName: 'Skill 1' },
  { id: 's2', name: 'skill-2', displayName: 'Skill 2' },
];
const projects = [{ id: 'p1', name: 'Project 1', path: 'C:/project' }];
const ides = [{ id: 'claude-code', name: 'Claude Code CLI' }];

describe('CreateLinkDialog', () => {
  it('renders form with all skills selected by default', async () => {
    createApiMock();

    renderWithProviders(
      <CreateLinkDialog
        open={true}
        onOpenChange={vi.fn()}
        skills={skills}
        projects={projects}
        ides={ides}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByText('2 of 2 selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create 2 Links' })).toBeDisabled();
  });

  it('creates links, renders results, and notifies completion on close', async () => {
    const onSubmit = vi.fn(async () => {});
    const onComplete = vi.fn();
    const onOpenChange = vi.fn();
    const results = [
      { skillId: 's1', skillName: 'Skill 1', status: 'created' as const },
      { skillId: 's2', skillName: 'Skill 2', status: 'error' as const, error: 'Already exists' },
    ];

    const api = createApiMock({
      links: {
        createMultiple: vi.fn(async () => results),
        onCreateProgress: vi.fn(() => () => {}),
      },
    });

    renderWithProviders(
      <CreateLinkDialog
        open={true}
        onOpenChange={onOpenChange}
        skills={skills}
        projects={projects}
        ides={ides}
        onSubmit={onSubmit}
        onComplete={onComplete}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /Project 1/i }));
    await userEvent.click(screen.getByRole('button', { name: /Claude Code CLI/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Create 2 Links' }));

    await waitFor(() => {
      expect(api.links.createMultiple).toHaveBeenCalledWith({
        skillIds: ['s1', 's2'],
        projectId: 'p1',
        ideName: 'claude-code',
        scope: 'project',
      });
    });
    expect(onSubmit).toHaveBeenCalledWith({
      skillIds: ['s1', 's2'],
      projectId: 'p1',
      ideName: 'claude-code',
      scope: 'project',
    });
    expect(await screen.findByText('✓ 1 created')).toBeInTheDocument();
    expect(screen.getByText('✗ 1 errors')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onComplete).toHaveBeenCalledWith(results);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows error toast and recovers to form when creation fails', async () => {
    const onSubmit = vi.fn(async () => {});
    createApiMock({
      links: {
        createMultiple: vi.fn(async () => {
          throw new Error('Network error');
        }),
      },
    });

    renderWithProviders(
      <CreateLinkDialog
        open={true}
        onOpenChange={vi.fn()}
        skills={skills}
        projects={projects}
        ides={ides}
        onSubmit={onSubmit}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /Project 1/i }));
    await userEvent.click(screen.getByRole('button', { name: /Claude Code CLI/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Create 2 Links' }));

    expect(await screen.findByText('Link creation failed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create 2 Links' })).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
