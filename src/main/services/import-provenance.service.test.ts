import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { ImportProvenanceService } from './import-provenance.service';
import type { ImportProvenanceRecord } from '../types/import';

describe('ImportProvenanceService', () => {
  let root: string;

  afterEach(() => {
    if (root && fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true });
  });

  const record: ImportProvenanceRecord = {
    id: 'import-1',
    componentId: 'skill:skills/review',
    componentKind: 'skill',
    componentName: 'review',
    source: {
      type: 'github',
      url: 'https://github.com/acme/repo',
      owner: 'acme',
      repo: 'repo',
      ref: 'main',
      commitSha: 'commit-1',
      treeSha: 'tree-1',
      sourcePath: 'skills/review',
      acquisition: 'github-api',
    },
    target: {
      targetId: 'central',
      adapterId: 'central',
      scope: 'central',
      destinationPath: 'C:/skills/review',
      activated: false,
    },
    installedAt: '2026-08-07T00:00:00.000Z',
    updatedAt: '2026-08-07T00:00:00.000Z',
    status: 'installed',
    fileHashes: { 'SKILL.md': 'hash-1' },
  };

  it('persists provenance and updates the same source/target identity', () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'import-provenance-'));
    const service = new ImportProvenanceService(root, () => new Date('2026-08-07T00:00:00.000Z'));

    service.upsert(record);
    const updated = service.upsert({
      ...record,
      source: { ...record.source, commitSha: 'commit-2', treeSha: 'tree-2' },
      status: 'active',
      target: { ...record.target, activated: true },
    });

    expect(service.list()).toHaveLength(1);
    expect(updated.source.commitSha).toBe('commit-2');
    expect(updated.status).toBe('active');
    expect(JSON.parse(fs.readFileSync(path.join(root, 'imports.json'), 'utf8'))).toHaveLength(1);
  });

  it('recovers from a malformed provenance file without exposing it to callers', () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'import-provenance-'));
    fs.writeFileSync(path.join(root, 'imports.json'), '{broken', 'utf8');

    const service = new ImportProvenanceService(root);
    expect(service.list()).toEqual([]);
  });
});
