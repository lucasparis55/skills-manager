import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { ImportFileService } from './import-file.service';

describe('ImportFileService', () => {
  let root: string;

  afterEach(() => {
    if (root && fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true });
  });

  it('writes new files and blocks an existing destination by default', () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'import-files-'));
    const source = path.join(root, 'source.txt');
    const destination = path.join(root, 'target.txt');
    fs.writeFileSync(source, 'new');

    const service = new ImportFileService({ backupRoot: root });
    service.apply([{ sourcePath: source, destinationPath: destination, allowedRoot: root }]);
    expect(fs.readFileSync(destination, 'utf8')).toBe('new');
    expect(() => service.apply([{ sourcePath: source, destinationPath: destination, allowedRoot: root }])).toThrow('conflict');
  });

  it('backs up an overwrite and restores it on rollback', () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'import-files-'));
    const source = path.join(root, 'source.txt');
    const destination = path.join(root, 'target.txt');
    fs.writeFileSync(source, 'new');
    fs.writeFileSync(destination, 'old');

    const service = new ImportFileService({ backupRoot: root });
    const operation = service.apply([{ sourcePath: source, destinationPath: destination, allowedRoot: root }], { overwrite: true });
    expect(fs.readFileSync(destination, 'utf8')).toBe('new');
    expect(operation.backupPath).toBeDefined();

    operation.rollback();
    expect(fs.readFileSync(destination, 'utf8')).toBe('old');
  });
});
