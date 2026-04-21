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
  });
});
