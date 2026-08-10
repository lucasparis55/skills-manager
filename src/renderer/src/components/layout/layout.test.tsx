import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
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
    expect(screen.getByRole('link', { name: 'Skills' })).toHaveClass('bg-blue-500/10');
    expect(screen.getByRole('link', { name: 'Duplicates' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Plugins' })).toBeInTheDocument();
    expect(screen.getByText(`v${__APP_VERSION__}`)).toBeInTheDocument();
    expect(screen.queryByText('Electron + React')).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Primary navigation' })).toBeInTheDocument();
  });

  it('closes mobile navigation after choosing a route', () => {
    const onMobileClose = vi.fn();
    createApiMock();

    render(
      <MemoryRouter initialEntries={['/skills']}>
        <Sidebar mobileOpen onMobileClose={onMobileClose} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('link', { name: 'Dashboard' }));

    expect(onMobileClose).toHaveBeenCalledTimes(1);
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

    render(
      <MemoryRouter initialEntries={['/duplicates']}>
        <Header />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Duplicates' })).toBeInTheDocument();

    render(
      <MemoryRouter initialEntries={['/plugins']}>
        <Header />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Plugins' })).toBeInTheDocument();
  });

  it('exposes a mobile navigation trigger', () => {
    const onMenuClick = vi.fn();

    render(
      <MemoryRouter initialEntries={['/projects']}>
        <Header onMenuClick={onMenuClick} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));

    expect(onMenuClick).toHaveBeenCalledTimes(1);
  });

  it('marks duplicates navigation active', () => {
    createApiMock();
    render(
      <MemoryRouter initialEntries={['/duplicates']}>
        <Sidebar />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Duplicates' })).toHaveClass('bg-blue-500/10');
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

  it('communicates when status stats are unavailable', async () => {
    createApiMock({
      links: { list: vi.fn(async () => { throw new Error('Database unavailable'); }) },
    });

    render(
      <MemoryRouter>
        <StatusBar />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Sync unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Ready')).not.toBeInTheDocument();
  });
});
