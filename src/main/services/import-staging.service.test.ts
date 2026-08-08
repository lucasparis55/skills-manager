import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { ImportStagingService } from './import-staging.service';
import type { ImportComponent } from '../types/import';

describe('ImportStagingService', () => {
  const roots: string[] = [];
  const component: ImportComponent = {
    id: 'asset:assets/logo.svg',
    kind: 'asset',
    name: 'logo.svg',
    displayName: 'Logo',
    description: 'asset',
    sourcePath: 'assets/logo.svg',
    files: [
      { path: 'assets/logo.svg', sha: 'asset', type: 'blob', size: 4 },
      { path: 'assets/readme.txt', sha: 'text', type: 'blob', size: 4 },
    ],
    dependencies: [],
    risk: 'low',
    hasExecutableFiles: false,
    requiresActivation: false,
    events: [],
    nativeTargets: [],
    metadata: {},
  };

  afterEach(() => {
    for (const root of roots.splice(0)) {
      if (fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('stages text and binary files without changing their bytes', async () => {
    const service = new ImportStagingService({ tempRoot: os.tmpdir() });
    const staged = await service.stage(
      component,
      async (file) => file.path.endsWith('.svg') ? Buffer.from([0, 255, 16, 32]) : 'read me',
      'import-123',
    );
    roots.push(staged.rootPath);

    expect(staged.files.map((file) => file.path)).toEqual(['assets/logo.svg', 'assets/readme.txt']);
    expect(fs.readFileSync(path.join(staged.rootPath, 'assets/logo.svg'))).toEqual(Buffer.from([0, 255, 16, 32]));
    expect(fs.readFileSync(path.join(staged.rootPath, 'assets/readme.txt'), 'utf8')).toBe('read me');
    expect(staged.rootPath).toContain(path.join('import-123', 'source'));
  });

  it('rejects repository traversal and enforces the total size limit', async () => {
    const service = new ImportStagingService({ tempRoot: os.tmpdir(), maxTotalBytes: 3 });

    await expect(service.stage(component, async () => 'four')).rejects.toThrow('size limit');

    const unsafe = { ...component, files: [{ path: '../outside.txt', sha: 'x', type: 'blob' as const }] };
    await expect(new ImportStagingService({ tempRoot: os.tmpdir() }).stage(unsafe, async () => 'x')).rejects.toThrow('outside');
  });
});
