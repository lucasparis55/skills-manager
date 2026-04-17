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
            props.onSubmit({
              name: 'new-skill',
              displayName: 'New Skill',
              description: 'desc',
            })
          }
        >
          submit-skill
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
        list: vi.fn(async () => [{ id: 'l1' }, { id: 'l2' }, { id: 'l3' }]),
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
    await waitFor(() => {
      expect(api.projects.scan).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText('Scan Complete')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Create Skill' }));
    await userEvent.click(screen.getByRole('button', { name: 'submit-skill' }));
    await waitFor(() => {
      expect(api.skills.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'new-skill' }));
    });
    expect(await screen.findByText('Skill created')).toBeInTheDocument();
  });
});
