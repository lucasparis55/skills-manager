import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SkillService } from './skill.service';
import type { CreateSkillInput } from '../types/domain';

describe('SkillService operations', () => {
  let tempDir: string;
  let service: SkillService;

  const input: CreateSkillInput = {
    name: 'alpha-skill',
    displayName: 'Alpha Skill',
    description: 'Initial description',
    format: 'folder',
    version: '1.0.0',
    targetIDEs: ['claude-code'],
    tags: ['alpha'],
  };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-service-ops-'));
    service = new SkillService(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates, lists, gets, scans, updates and deletes skills', () => {
    const created = service.create(input);
    expect(created.name).toBe('alpha-skill');
    expect(created.displayName).toBe('Alpha Skill');
    expect(created.targetIDEs).toEqual(['claude-code']);

    const listed = service.list();
    expect(listed).toHaveLength(1);
    expect(service.scan()).toHaveLength(1);

    const loaded = service.get('alpha-skill');
    expect(loaded?.description).toBe('Initial description');

    const updated = service.update('alpha-skill', {
      displayName: 'Alpha Skill Updated',
      description: 'Updated description',
      version: '2.0.0',
      targetIDEs: ['codex-cli', 'cursor'],
      tags: ['beta', 'gamma'],
    });
    expect(updated.displayName).toBe('Alpha Skill Updated');
    expect(updated.version).toBe('2.0.0');
    expect(updated.targetIDEs).toEqual(['codex-cli', 'cursor']);
    expect(updated.tags).toEqual(['beta', 'gamma']);

    expect(service.getSkillPath('alpha-skill')).toBe(path.join(tempDir, 'alpha-skill'));

    service.delete('alpha-skill');
    expect(service.list()).toEqual([]);
    expect(service.get('alpha-skill')).toBeNull();
    expect(() => service.getSkillPath('alpha-skill')).toThrow('not found');
  });

  it('supports content and file CRUD with recursive listing', () => {
    service.create(input);

    const original = service.getContent('alpha-skill');
    expect(original).toContain('name: alpha-skill');

    service.saveContent('alpha-skill', '---\nname: alpha-skill\n---\n# Updated');
    expect(service.getContent('alpha-skill')).toContain('# Updated');

    service.writeFile('alpha-skill', 'docs/guide.md', 'Guide');
    service.writeFile('alpha-skill', 'docs/config.json', '{"ok":true}');

    const files = service.listFiles('alpha-skill');
    const normalizedPaths = files.map((f) => ({
      ...f,
      path: f.path.replaceAll('\\', '/'),
    }));
    expect(normalizedPaths.some((f) => f.path === 'docs' && f.isDirectory)).toBe(true);
    expect(normalizedPaths.some((f) => f.path === 'docs/guide.md' && !f.isDirectory)).toBe(true);
    expect(service.readFile('alpha-skill', 'docs/guide.md')).toBe('Guide');

    expect(() => service.readFile('alpha-skill', 'docs')).toThrow('directory');
    expect(() => service.readFile('alpha-skill', 'missing.txt')).toThrow('not found');

    service.deleteFile('alpha-skill', 'docs/config.json');
    expect(() => service.readFile('alpha-skill', 'docs/config.json')).toThrow('not found');

    expect(() => service.deleteFile('alpha-skill', 'docs')).toThrow('Cannot delete directory');
    expect(() => service.deleteFile('alpha-skill', 'missing.txt')).toThrow('not found');
  });

  it('imports from file buffer with generated SKILL.md and overwrite behavior', () => {
    const imported = service.importFromBuffer(
      'imported-skill',
      [
        { path: 'README.md', content: '# readme' },
        { path: '../escape.txt', content: 'should skip' },
        { path: 'nested/rules.md', content: 'rules' },
      ],
      {
        sourceRepo: 'https://github.com/acme/skills',
        importedAt: '2024-01-01T00:00:00.000Z',
        displayName: 'Imported Skill',
        description: 'Imported description',
      },
    );

    expect(imported.name).toBe('imported-skill');
    const skillPath = service.getSkillPath('imported-skill');
    expect(fs.existsSync(path.join(skillPath, 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'escape.txt'))).toBe(false);
    expect(service.readFile('imported-skill', 'nested/rules.md')).toBe('rules');

    expect(() =>
      service.importFromBuffer('imported-skill', [{ path: 'SKILL.md', content: 'x' }]),
    ).toThrow('already exists');

    const overwritten = service.importFromBuffer(
      'imported-skill',
      [{ path: 'SKILL.md', content: '---\nname: imported-skill\n---\n# overwritten' }],
      undefined,
      { overwrite: true },
    );
    expect(overwritten.name).toBe('imported-skill');
    expect(service.getContent('imported-skill')).toContain('overwritten');
  });

  it('guards invalid names, invalid file paths, and exists() edge cases', () => {
    expect(service.exists('missing')).toBe(false);
    expect(service.exists('../escape')).toBe(false);

    service.create(input);
    expect(service.exists('alpha-skill')).toBe(true);

    expect(() => service.getContent('missing')).toThrow('not found');
    expect(() => service.saveContent('missing', 'x')).toThrow('not found');
    expect(() => service.update('missing', { displayName: 'x' })).toThrow('not found');
    expect(() => service.delete('missing')).toThrow('not found');

    expect(() => service.writeFile('alpha-skill', '', 'x')).toThrow('Invalid file path');
    expect(() => service.writeFile('alpha-skill', '/absolute.txt', 'x')).toThrow('Invalid file path');
    expect(() => service.writeFile('alpha-skill', '../escape.txt', 'x')).toThrow('path traversal');
  });
});
