import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Header from './Header';
import Sidebar from './Sidebar';
import StatusBar from './StatusBar';
import { createApiMock } from '../../test-utils';


describe('layout components', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders sidebar navigation links', () => {
    createApiMock();
    render(
      <MemoryRouter initialEntries={['/skills']}>
        <Sidebar />
      </MemoryRouter>,
    );

    expect(screen.getByText('Skills Manager')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Skills' })).toHaveClass('bg-blue-600');
    expect(screen.getByText(`v${__APP_VERSION__}`)).toBeInTheDocument();
    expect(screen.queryByText('Electron + React')).not.toBeInTheDocument();
  });

  it('renders route-based header title with fallback', () => {
    render(
      <MemoryRouter initialEntries={['/projects']}>
        <Header />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Projects' })).toBeInTheDocument();

    render(
      <MemoryRouter initialEntries={['/unknown']}>
        <Header />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Skills Manager' })).toBeInTheDocument();
  });

  it('loads status stats', async () => {
    const api = createApiMock({
      skills: { list: vi.fn(async () => [{ id: 's1' }, { id: 's2' }]) },
      projects: { list: vi.fn(async () => [{ id: 'p1' }]) },
      links: { list: vi.fn(async () => [{ id: 'l1' }, { id: 'l2' }, { id: 'l3' }]) },
    });

    render(
      <MemoryRouter>
        <StatusBar />
      </MemoryRouter>,
    );

    expect(await screen.findByText('2 skills')).toBeInTheDocument();
    expect(screen.getByText('1 projects')).toBeInTheDocument();
    expect(screen.getByText('3 links')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(api.skills.list).toHaveBeenCalledTimes(1);
    expect(api.projects.list).toHaveBeenCalledTimes(1);
    expect(api.links.list).toHaveBeenCalledTimes(1);
  });
});
