import fs from 'fs';
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
});
