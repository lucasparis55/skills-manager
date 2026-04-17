import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import { createApiMock } from './test-utils';

vi.mock('./pages/Dashboard', () => ({ default: () => <div>Dashboard Page</div> }));
vi.mock('./pages/SkillsPage', () => ({ default: () => <div>Skills Page</div> }));
vi.mock('./pages/ProjectsPage', () => ({ default: () => <div>Projects Page</div> }));
vi.mock('./pages/LinksPage', () => ({ default: () => <div>Links Page</div> }));
vi.mock('./pages/SettingsPage', () => ({ default: () => <div>Settings Page</div> }));

describe('App', () => {
  it('renders layout and selected route content', async () => {
    createApiMock();

    render(
      <MemoryRouter initialEntries={['/settings']}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByText('Skills Manager')).toBeInTheDocument();
    expect(screen.getByText('Settings Page')).toBeInTheDocument();
    expect(await screen.findByText('Ready')).toBeInTheDocument();
  });
});
