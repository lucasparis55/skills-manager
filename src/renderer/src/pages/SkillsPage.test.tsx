import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SkillsPage from './SkillsPage';
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
              description: 'new description',
            })
          }
        >
          submit-skill
        </button>
      </div>
    ) : null,
}));

vi.mock('../components/ui/ConfirmDialog', () => ({
  default: () => null,
}));

vi.mock('../components/ui/SkillEditDialog', () => ({
  default: () => null,
}));

vi.mock('../components/ui/GitHubImportDialog', () => ({
  default: (props: any) =>
    props.open ? (
      <div>
        <button onClick={props.onImportComplete}>import-complete</button>
      </div>
    ) : null,
}));

describe('SkillsPage', () => {
  it('loads skills, filters by search, creates skill, and refreshes after import callback', async () => {
    const api = createApiMock({
      skills: {
        list: vi
          .fn()
          .mockResolvedValueOnce([
            {
              id: 's1',
              name: 'debugger',
              displayName: 'Debugger',
              description: 'Troubleshoot code',
              version: '1.0.0',
              targetIDEs: [],
              tags: [],
              sourcePath: 'C:/skills/debugger',
            },
          ])
          .mockResolvedValue([
            {
              id: 's1',
              name: 'debugger',
              displayName: 'Debugger',
              description: 'Troubleshoot code',
              version: '1.0.0',
              targetIDEs: [],
              tags: [],
              sourcePath: 'C:/skills/debugger',
            },
          ]),
        create: vi.fn(async () => ({})),
      },
    });

    renderWithProviders(<SkillsPage />);

    expect(await screen.findByText('Debugger')).toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText('Search skills...'), 'missing');
    expect(screen.getByText('No skills match your search')).toBeInTheDocument();

    await userEvent.clear(screen.getByPlaceholderText('Search skills...'));
    await userEvent.click(screen.getByRole('button', { name: 'New Skill' }));
    await userEvent.click(screen.getByRole('button', { name: 'submit-skill' }));
    await waitFor(() => {
      expect(api.skills.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'new-skill' }));
    });
    expect(await screen.findByText('Skill created')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Import from GitHub' }));
    await userEvent.click(screen.getByRole('button', { name: 'import-complete' }));
    await waitFor(() => {
      expect(api.skills.list).toHaveBeenCalledTimes(3);
    });
  });
});
