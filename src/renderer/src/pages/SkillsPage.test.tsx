import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SkillsPage from './SkillsPage';
import { createApiMock, renderWithProviders } from '../test-utils';

Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
  configurable: true,
  value: () => false,
});

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
  default: (props: any) => props.open ? <button onClick={() => props.onSave('s1')}>simulate-skill-save</button> : null,
}));

vi.mock('../components/ui/SkillHealthDialog', () => ({
  default: (props: any) => props.open ? <div>health-check-for-{props.skill?.id}</div> : null,
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
    await userEvent.click(screen.getByRole('menuitem', { name: 'From GitHub' }));
    await userEvent.click(screen.getByRole('button', { name: 'import-complete' }));
    await waitFor(() => {
      expect(api.skills.list).toHaveBeenCalledTimes(3);
    });

    await userEvent.click(screen.getByRole('button', { name: 'Import' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'From ZIP' }));
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

  it('renders the global scope without loading the managed skills list', async () => {
    const api = createApiMock();

    renderWithProviders(<SkillsPage />, '/skills/global');

    expect(await screen.findByText('Global inventory across detected tools')).toBeInTheDocument();
    expect(api.skills.list).not.toHaveBeenCalled();
    expect(api.globalSkills.scan).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'Global by tool' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Managed' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Project' })).toBeInTheDocument();
  });

  it('summarizes and filters managed skills by search and target IDE', async () => {
    createApiMock({
      skills: {
        list: vi.fn(async () => [
          {
            id: 's1',
            name: 'review-code',
            displayName: 'Review Code',
            description: 'Review changes before merge',
            version: '1.2.0',
            targetIDEs: ['codex-cli'],
            tags: ['quality'],
            sourcePath: 'C:/skills/review-code',
          },
          {
            id: 's2',
            name: 'write-docs',
            displayName: 'Write Docs',
            description: 'Document important decisions',
            version: '1.0.0',
            targetIDEs: [],
            tags: ['documentation'],
            sourcePath: 'C:/skills/write-docs',
          },
        ]),
      },
    });

    renderWithProviders(<SkillsPage />);

    expect(await screen.findByText('2 Managed Skills')).toBeInTheDocument();
    expect(screen.getByText('1 IDE-targeted')).toBeInTheDocument();
    expect(screen.getByText('1 without target')).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search managed skills' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Filter by target IDE' })).toBeInTheDocument();

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search managed skills' }), 'documentation');
    expect(screen.getByText('1 of 2 Managed Skills')).toBeInTheDocument();
    expect(screen.queryByText('Review Code')).not.toBeInTheDocument();
    expect(screen.getByText('Write Docs')).toBeInTheDocument();

    await userEvent.clear(screen.getByRole('searchbox', { name: 'Search managed skills' }));
    screen.getByRole('combobox', { name: 'Filter by target IDE' }).focus();
    await userEvent.keyboard('{Enter}{End}{Enter}');

    expect(screen.queryByText('Review Code')).not.toBeInTheDocument();
    expect(screen.getByText('Write Docs')).toBeInTheDocument();
  });

  it('opens distribution health from a skill row and after saving the skill', async () => {
    createApiMock({
      skills: {
        list: vi.fn(async () => [{
          id: 's1',
          name: 'review-code',
          displayName: 'Review Code',
          description: 'Review changes',
          version: '1.0.0',
          targetIDEs: [],
          tags: [],
          sourcePath: 'C:/skills/review-code',
        }]),
        checkDistribution: vi.fn(async () => ({
          checkedAt: 'now',
          skillId: 's1',
          skillName: 'review-code',
          sourcePath: 'C:/skills/review-code',
          destinations: [],
          summary: { total: 1, healthy: 0, attention: 1, blocked: 1, repairable: 0 },
        })),
      },
    });

    renderWithProviders(<SkillsPage />);

    expect(await screen.findByText('Review Code')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Check distribution health for Review Code' }));
    expect(screen.getByText('health-check-for-s1')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Edit Review Code' }));
    await userEvent.click(screen.getByRole('button', { name: 'simulate-skill-save' }));
    expect(await screen.findByText('Distribution needs attention')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'View report' }));
    expect(screen.getByText('health-check-for-s1')).toBeInTheDocument();
  });
});
