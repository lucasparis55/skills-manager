import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { ToastProvider } from './components/ui/Toast';

type ApiMock = {
  skills: Record<string, ReturnType<typeof vi.fn>>;
  projects: Record<string, ReturnType<typeof vi.fn>>;
  links: Record<string, ReturnType<typeof vi.fn>>;
  ides: Record<string, ReturnType<typeof vi.fn>>;
  detection: Record<string, ReturnType<typeof vi.fn>>;
  settings: Record<string, ReturnType<typeof vi.fn>>;
  dialog: Record<string, ReturnType<typeof vi.fn>>;
  githubImport: Record<string, ReturnType<typeof vi.fn>>;
  zipImport: Record<string, ReturnType<typeof vi.fn>>;
};

export function createApiMock(partial: Partial<ApiMock> = {}): ApiMock {
  const api: ApiMock = {
    skills: {
      list: vi.fn(async () => []),
      get: vi.fn(async () => null),
      create: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
      delete: vi.fn(async () => ({ success: true })),
      scan: vi.fn(async () => []),
      getContent: vi.fn(async () => ''),
      saveContent: vi.fn(async () => ({ success: true })),
      listFiles: vi.fn(async () => []),
      readFile: vi.fn(async () => ''),
      writeFile: vi.fn(async () => ({ success: true })),
      deleteFile: vi.fn(async () => ({ success: true })),
      getPath: vi.fn(async () => ''),
      openFolder: vi.fn(async () => ({ success: true })),
      ...(partial.skills || {}),
    },
    projects: {
      list: vi.fn(async () => []),
      add: vi.fn(async () => ({})),
      remove: vi.fn(async () => ({ success: true })),
      scan: vi.fn(async () => []),
      ...(partial.projects || {}),
    },
    links: {
      list: vi.fn(async () => []),
      create: vi.fn(async () => ({})),
      createMultiple: vi.fn(async () => []),
      onCreateProgress: vi.fn(() => () => {}),
      remove: vi.fn(async () => ({ success: true })),
      removeMultiple: vi.fn(async () => []),
      verify: vi.fn(async () => ({ valid: true, link: {} })),
      verifyAll: vi.fn(async () => []),
      ...(partial.links || {}),
    },
    ides: {
      list: vi.fn(async () => []),
      detectRoots: vi.fn(async () => []),
      ...(partial.ides || {}),
    },
    detection: {
      checkDuplicates: vi.fn(async () => ({ hasDuplicate: false })),
      ...(partial.detection || {}),
    },
    settings: {
      get: vi.fn(async () => ({
        centralSkillsRoot: 'C:/skills',
        checkForUpdates: true,
        autoScanProjects: true,
        symlinkStrategy: 'auto',
        theme: 'dark',
        hasGithubToken: false,
        ideRootOverrides: {},
      })),
      update: vi.fn(async () => ({})),
      setGithubToken: vi.fn(async () => ({ success: true })),
      clearGithubToken: vi.fn(async () => ({ success: true })),
      ...(partial.settings || {}),
    },
    dialog: {
      selectFolder: vi.fn(async () => 'C:/project'),
      selectFile: vi.fn(async () => 'C:/skills.zip'),
      ...(partial.dialog || {}),
    },
    githubImport: {
      parseUrl: vi.fn(async () => ({ owner: 'acme', repo: 'skills' })),
      analyze: vi.fn(async () => ({ skills: [] })),
      checkConflicts: vi.fn(async () => ({})),
      importSkills: vi.fn(async () => []),
      cancelImport: vi.fn(async () => ({ success: true })),
      onProgress: vi.fn(() => () => {}),
      ...(partial.githubImport || {}),
    },
    zipImport: {
      analyze: vi.fn(async () => ({ archiveInfo: { fileName: 'skills.zip', zipPath: 'C:/skills.zip', fileCount: 1 }, skills: [] })),
      checkConflicts: vi.fn(async () => ({})),
      importSkills: vi.fn(async () => []),
      cancelImport: vi.fn(async () => ({ success: true })),
      onProgress: vi.fn(() => () => {}),
      ...(partial.zipImport || {}),
    },
  };

  Object.defineProperty(window, 'api', {
    value: api,
    configurable: true,
    writable: true,
  });

  return api;
}

export function renderWithProviders(ui: React.ReactNode, route = '/') {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </ToastProvider>,
  );
}
