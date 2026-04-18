import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import LinksPage from './LinksPage';
import { createApiMock, renderWithProviders } from '../test-utils';

vi.mock('../components/ui/CreateLinkDialog', () => ({
  default: (props: any) =>
    props.open ? (
      <div data-testid="create-link-dialog">
        <button
          onClick={() =>
            props.onComplete?.([
              { skillId: 's1', skillName: 'Skill 1', status: 'created' },
              { skillId: 's2', skillName: 'Skill 2', status: 'skipped' },
            ])
          }
        >
          complete-create
        </button>
      </div>
    ) : null,
}));

vi.mock('../components/ui/ConfirmDialog', () => ({
  default: (props: any) =>
    props.open ? (
      <div data-testid="confirm-dialog">
        <div>{props.title}</div>
        <button onClick={props.onConfirm}>{props.confirmLabel || 'confirm'}</button>
      </div>
    ) : null,
}));

const linksPayload = [
  {
    id: 'l1',
    skillId: 's1',
    projectId: 'p1',
    ideName: 'claude-code',
    scope: 'project',
    sourcePath: 'C:/skills/s1',
    destinationPath: 'C:/repo/.claude/agents/s1',
    status: 'linked',
    createdAt: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'l2',
    skillId: 's2',
    projectId: 'p1',
    ideName: 'codex-cli',
    scope: 'global',
    sourcePath: 'C:/skills/s2',
    destinationPath: 'C:/users/test/.agents/skills/s2',
    status: 'broken',
    createdAt: '2024-01-01T00:00:00.000Z',
  },
];

describe('LinksPage', () => {
  it('loads links and verifies all links with user feedback', async () => {
    const api = createApiMock({
      links: {
        list: vi.fn(async () => linksPayload),
        verifyAll: vi.fn(async () => linksPayload),
      },
      skills: {
        list: vi.fn(async () => [
          { id: 's1', name: 's1', displayName: 'Skill 1' },
          { id: 's2', name: 's2', displayName: 'Skill 2' },
        ]),
      },
      projects: {
        list: vi.fn(async () => [{ id: 'p1', name: 'Project 1', path: 'C:/repo', detectedIDEs: [] }]),
      },
      ides: {
        list: vi.fn(async () => [
          { id: 'claude-code', name: 'Claude Code CLI' },
          { id: 'codex-cli', name: 'Codex CLI' },
        ]),
      },
    });

    renderWithProviders(<LinksPage />);

    expect(await screen.findByText('2 Links')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Verify All' }));

    await waitFor(() => {
      expect(api.links.verifyAll).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText('Verification complete')).toBeInTheDocument();
  });

  it('removes selected links in bulk and reports partial failures', async () => {
    const api = createApiMock({
      links: {
        list: vi.fn(async () => linksPayload),
        removeMultiple: vi.fn(async () => [
          { id: 'l1', success: true },
          { id: 'l2', success: false },
        ]),
      },
      skills: {
        list: vi.fn(async () => [
          { id: 's1', name: 's1', displayName: 'Skill 1' },
          { id: 's2', name: 's2', displayName: 'Skill 2' },
        ]),
      },
      projects: {
        list: vi.fn(async () => [{ id: 'p1', name: 'Project 1', path: 'C:/repo', detectedIDEs: [] }]),
      },
      ides: {
        list: vi.fn(async () => [
          { id: 'claude-code', name: 'Claude Code CLI' },
          { id: 'codex-cli', name: 'Codex CLI' },
        ]),
      },
    });

    renderWithProviders(<LinksPage />);
    await screen.findByText('2 Links');

    await userEvent.click(screen.getByLabelText('Select all'));
    await userEvent.click(screen.getByRole('button', { name: 'Remove Selected' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => {
      expect(api.links.removeMultiple).toHaveBeenCalledWith(['l1', 'l2']);
    });
    expect(await screen.findByText('Partial removal')).toBeInTheDocument();
  });

  it('shows link creation toast summary based on CreateLinkDialog completion', async () => {
    createApiMock({
      links: { list: vi.fn(async () => []) },
      skills: { list: vi.fn(async () => []) },
      projects: { list: vi.fn(async () => []) },
      ides: { list: vi.fn(async () => []) },
    });

    renderWithProviders(<LinksPage />);
    await screen.findByText('No Links Yet');

    await userEvent.click(screen.getByRole('button', { name: 'Create Link' }));
    await userEvent.click(screen.getByRole('button', { name: 'complete-create' }));

    expect(await screen.findByText('Links created')).toBeInTheDocument();
    expect(screen.getAllByText(/1 link created successfully, 1 skipped/i)[0]).toBeInTheDocument();
  });
});
