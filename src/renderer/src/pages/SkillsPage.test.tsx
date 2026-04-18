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
  default: (props: any) =>
    props.open ? (
      <div>
        <div>{props.title}</div>
        <button onClick={props.onConfirm}>{props.confirmLabel || 'confirm'}</button>
      </div>
    ) : null,
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

vi.mock('../components/ui/ZipImportDialog', () => ({
  default: (props: any) =>
    props.open ? (
      <div>
        <button onClick={props.onImportComplete}>zip-import-complete</button>
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

    await userEvent.click(screen.getByRole('button', { name: 'Import' }));
    await userEvent.click(screen.getByRole('button', { name: 'From GitHub' }));
    await userEvent.click(screen.getByRole('button', { name: 'import-complete' }));
    await waitFor(() => {
      expect(api.skills.list).toHaveBeenCalledTimes(3);
    });

    await userEvent.click(screen.getByRole('button', { name: 'Import' }));
    await userEvent.click(screen.getByRole('button', { name: 'From ZIP' }));
    await userEvent.click(screen.getByRole('button', { name: 'zip-import-complete' }));
    await waitFor(() => {
      expect(api.skills.list).toHaveBeenCalledTimes(4);
    });
  });

  it('selects filtered skills and removes selected items with partial failure feedback', async () => {
    const api = createApiMock({
      skills: {
        list: vi.fn(async () => [
          {
            id: 's1',
            name: 'dev-skill-one',
            displayName: 'Dev Skill One',
            description: 'First',
            version: '1.0.0',
            targetIDEs: [],
            tags: [],
            sourcePath: 'C:/skills/dev-skill-one',
          },
          {
            id: 's2',
            name: 'dev-skill-two',
            displayName: 'Dev Skill Two',
            description: 'Second',
            version: '1.0.0',
            targetIDEs: [],
            tags: [],
            sourcePath: 'C:/skills/dev-skill-two',
          },
          {
            id: 's3',
            name: 'ops-skill',
            displayName: 'Ops Skill',
            description: 'Third',
            version: '1.0.0',
            targetIDEs: [],
            tags: [],
            sourcePath: 'C:/skills/ops-skill',
          },
        ]),
        delete: vi
          .fn()
          .mockResolvedValueOnce({ success: true })
          .mockRejectedValueOnce(new Error('remove failed')),
      },
    });

    renderWithProviders(<SkillsPage />);

    expect(await screen.findByText('Dev Skill One')).toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText('Search skills...'), 'dev');

    await userEvent.click(screen.getByLabelText('Select all'));
    await userEvent.click(screen.getByRole('button', { name: 'Remove Selected' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(api.skills.delete).toHaveBeenCalledTimes(2);
    });
    expect(api.skills.delete).toHaveBeenNthCalledWith(1, 's1');
    expect(api.skills.delete).toHaveBeenNthCalledWith(2, 's2');
    expect(api.skills.delete).not.toHaveBeenCalledWith('s3');
    expect(await screen.findByText('Partial removal')).toBeInTheDocument();
  });
});
