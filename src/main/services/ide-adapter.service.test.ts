import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IDEAdapterService } from './ide-adapter.service';

describe('IDEAdapterService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists supported IDE definitions', () => {
    const service = new IDEAdapterService();
    const ides = service.list();

    expect(ides.length).toBeGreaterThanOrEqual(6);
    expect(ides.map((ide) => ide.id)).toEqual(
      expect.arrayContaining(['claude-code', 'codex-cli', 'codex-desktop', 'opencode', 'cursor', 'kimi-cli']),
    );
  });

  it('detects roots and marks existing paths', () => {
    vi.spyOn(fs, 'existsSync').mockImplementation((candidate) => {
      const normalized = String(candidate).toLowerCase();
      return normalized.includes('.claude') || normalized.includes('codex');
    });

    const service = new IDEAdapterService();
    const roots = service.detectRoots();

    expect(roots.length).toBeGreaterThan(0);
    expect(roots.some((root) => root.isPrimary)).toBe(true);
    expect(roots.some((root) => root.exists)).toBe(true);
    expect(roots.every((root) => typeof root.root === 'string')).toBe(true);
  });

  it('detects kimi-cli when ~/.kimi directory exists without skills subdir', () => {
    vi.spyOn(fs, 'existsSync').mockImplementation((candidate) => {
      const normalized = String(candidate).toLowerCase();
      return normalized.endsWith('.kimi');
    });

    const service = new IDEAdapterService();
    const roots = service.detectRoots();

    const kimiRoots = roots.filter((r) => r.ideId === 'kimi-cli');
    expect(kimiRoots.some((r) => r.exists)).toBe(true);
    expect(kimiRoots.some((r) => r.root.toLowerCase().endsWith('.kimi'))).toBe(true);
  });

  it('returns exists=false when fs lookup throws', () => {
    vi.spyOn(fs, 'existsSync').mockImplementation(() => {
      throw new Error('filesystem unavailable');
    });

    const service = new IDEAdapterService();
    const roots = service.detectRoots();

    expect(roots.length).toBeGreaterThan(0);
    expect(roots.every((root) => root.exists === false)).toBe(true);
    expect(roots.every((root) => root.isConfigured === false)).toBe(true);
  });

  it('marks isConfigured when root exists and matches effective global root', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);

    const service = new IDEAdapterService();
    const roots = service.detectRoots();
    const cursorPrimary = roots.find((root) => root.ideId === 'cursor' && root.isPrimary);

    expect(cursorPrimary).toBeDefined();
    expect(cursorPrimary!.exists).toBe(true);
    expect(cursorPrimary!.isConfigured).toBe(true);

    const cursorSecondary = roots.filter((root) => root.ideId === 'cursor' && !root.isPrimary);
    expect(cursorSecondary.every((root) => root.isConfigured === false)).toBe(true);
  });

  it('marks isConfigured using ideRootOverrides when override path matches a resolved root', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);

    const service = new IDEAdapterService();
    const kimiSecondary = service
      .detectRoots()
      .find((root) => root.ideId === 'kimi-cli' && root.root.toLowerCase().endsWith('.kimi') && !root.root.toLowerCase().includes('skills'));

    expect(kimiSecondary).toBeDefined();

    const roots = service.detectRoots({ 'kimi-cli': kimiSecondary!.root });
    const configured = roots.filter((root) => root.ideId === 'kimi-cli' && root.isConfigured);

    expect(configured).toHaveLength(1);
    expect(configured[0].root).toBe(kimiSecondary!.root);
    expect(configured[0].isPrimary).toBe(false);
  });

  it('uses .agents/skills as first projectRelative for codex-desktop', () => {
    const service = new IDEAdapterService();
    const ides = service.list();
    const codexDesktop = ides.find((ide) => ide.id === 'codex-desktop');

    expect(codexDesktop).toBeDefined();
    expect(codexDesktop!.roots.projectRelative[0]).toBe('.agents/skills');
  });

  it('deduplicates the same skill root shared by multiple IDEs', () => {
    vi.spyOn(fs, 'lstatSync').mockReturnValue({
      isDirectory: () => true,
      isSymbolicLink: () => false,
    } as fs.Stats);

    const roots = new IDEAdapterService().detectSkillRoots();
    const shared = roots.find((root) => root.root.endsWith(path.normalize('.agents/skills')));

    expect(shared).toBeDefined();
    expect(shared!.ideIds).toEqual(
      expect.arrayContaining(['codex-cli', 'codex-desktop', 'opencode', 'kimi-cli']),
    );
  });

  it('uses an override as the only skill root for that IDE', () => {
    vi.spyOn(fs, 'lstatSync').mockReturnValue({
      isDirectory: () => true,
      isSymbolicLink: () => false,
    } as fs.Stats);

    const roots = new IDEAdapterService().detectSkillRoots({
      'codex-cli': 'C:/custom/codex',
    });

    expect(roots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          root: path.normalize('C:/custom/codex/skills'),
          ideIds: ['codex-cli'],
        }),
      ]),
    );
  });

  it('keeps overridden skill roots inside a skills directory', () => {
    vi.spyOn(fs, 'lstatSync').mockReturnValue({
      isDirectory: () => true,
      isSymbolicLink: () => false,
    } as fs.Stats);

    const roots = new IDEAdapterService().detectSkillRoots({
      cursor: 'C:/custom/cursor',
    });

    expect(roots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          root: path.normalize('C:/custom/cursor/skills'),
          ideIds: ['cursor'],
        }),
      ]),
    );
  });
});
