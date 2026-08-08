import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { ImportPathService } from './import-path.service';

describe('ImportPathService', () => {
  let root: string;

  afterEach(() => {
    if (root && fs.existsSync(root)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('normalizes repository paths and rejects traversal', () => {
    expect(ImportPathService.normalizeRepositoryPath('skills\\review\\SKILL.md')).toBe('skills/review/SKILL.md');
    expect(() => ImportPathService.normalizeRepositoryPath('../outside.txt')).toThrow('outside');
    expect(() => ImportPathService.normalizeRepositoryPath('/absolute.txt')).toThrow('absolute');
  });

  it('resolves only paths inside the requested root', () => {
    const service = new ImportPathService();
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'import-path-'));

    expect(service.resolveInside(root, 'nested/file.txt')).toBe(path.join(root, 'nested', 'file.txt'));
    expect(() => service.resolveInside(root, '../../outside.txt')).toThrow('outside');
  });

  it('rejects a destination whose existing path crosses a symlink', () => {
    const service = new ImportPathService();
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'import-path-'));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'import-path-outside-'));
    const link = path.join(root, 'linked');

    try {
      fs.symlinkSync(outside, link, 'junction');
    } catch {
      return;
    }

    expect(() => service.assertSafeDestination(path.join(link, 'file.txt'), root)).toThrow('symlink');
    fs.rmSync(outside, { recursive: true, force: true });
  });

  it('accepts a new destination below a normal directory', () => {
    const service = new ImportPathService();
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'import-path-'));
    const destination = path.join(root, 'new', 'file.txt');

    expect(service.assertSafeDestination(destination, root)).toBe(destination);
  });
});
