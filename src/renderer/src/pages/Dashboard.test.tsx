import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Dashboard from './Dashboard';
import { createApiMock, renderWithProviders } from '../test-utils';

vi.mock('../components/ui/FormDialog', () => ({
  default: (props: any) =>
    props.open ? (
      <div>
        <button
          onClick={() =>
            props.onSubmit(
              props.title === 'Create New Skill'
                ? {
                    name: 'new-skill',
                    displayName: 'New Skill',
                    description: 'desc',
                  }
                : {
                    path: 'C:/projects',
                    depth: '2',
                  },
            )
          }
        >
          {props.submitLabel}
        </button>
      </div>
    ) : null,
}));

describe('Dashboard', () => {
  it('loads stats, scans projects, and creates a skill from quick actions', async () => {
    const api = createApiMock({
      skills: {
        list: vi.fn(async () => [{ id: 's1' }, { id: 's2' }]),
        create: vi.fn(async () => ({})),
      },
      projects: {
        list: vi.fn(async () => [{ id: 'p1' }]),
        scan: vi.fn(async () => [{ id: 'p1' }, { id: 'p2' }]),
      },
      links: {
        list: vi.fn(async () => [
          { id: 'l1', status: 'linked' },
          { id: 'l2', status: 'linked' },
          { id: 'l3', status: 'linked' },
        ]),
      },
      ides: {
        list: vi.fn(async () => [{ id: 'claude-code', name: 'Claude Code' }]),
        detectRoots: vi.fn(async () => [{ ideId: 'claude-code', exists: true }]),
      },
    });

    renderWithProviders(<Dashboard />);

    expect(await screen.findByText('Skills')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Scan Projects' }));
    await userEvent.click(screen.getByRole('button', { name: 'Scan' }));
    await waitFor(() => {
      expect(api.projects.scan).toHaveBeenCalledWith('C:/projects', 2);
    });
    expect(await screen.findByText('Scan Complete')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Create Skill' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => {
      expect(api.skills.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'new-skill' }));
    });
    expect(await screen.findByText('Skill created')).toBeInTheDocument();
  });

  it('counts only linked links as active and broken|conflict as warnings', async () => {
    createApiMock({
      skills: {
        list: vi.fn(async () => [{ id: 's1' }]),
      },
      projects: {
        list: vi.fn(async () => [{ id: 'p1' }]),
      },
      links: {
        list: vi.fn(async () => [
          { id: 'l1', status: 'linked' },
          { id: 'l2', status: 'linked' },
          { id: 'l3', status: 'broken' },
          { id: 'l4', status: 'conflict' },
          { id: 'l5', status: 'pending' },
        ]),
      },
      ides: {
        list: vi.fn(async () => []),
        detectRoots: vi.fn(async () => []),
      },
    });

    renderWithProviders(<Dashboard />);

    expect(await screen.findByText('Active Links')).toBeInTheDocument();
    expect(screen.getByText('Warnings')).toBeInTheDocument();

    const activeCard = screen.getByText('Active Links').closest('div');
    const warningsCard = screen.getByText('Warnings').closest('div');
    expect(activeCard).toHaveTextContent('2');
    expect(warningsCard).toHaveTextContent('2');
  });

  it('shows a recoverable error when workspace stats fail to load', async () => {
    const api = createApiMock({
      skills: {
        list: vi.fn()
          .mockRejectedValueOnce(new Error('Database unavailable'))
          .mockResolvedValue([{ id: 's1' }]),
      },
      projects: { list: vi.fn(async () => []) },
      links: { list: vi.fn(async () => []) },
      ides: {
        list: vi.fn(async () => []),
        detectRoots: vi.fn(async () => []),
      },
    });

    renderWithProviders(<Dashboard />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load workspace overview');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Skills')).toBeInTheDocument();
    expect(api.skills.list).toHaveBeenCalledTimes(2);
  });
});
