import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SkillService } from './skill.service';
import type { CreateSkillInput } from '../types/domain';

describe('SkillService hardening', () => {
  let tempDir: string;
  let service: SkillService;

  const baseInput: CreateSkillInput = {
    name: 'safe-skill',
    displayName: 'Safe Skill',
    description: 'test',
    format: 'folder',
    targetIDEs: ['codex-cli'],
    tags: ['test'],
  };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-service-test-'));
    service = new SkillService(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should reject invalid skill names in create()', () => {
    const invalidNames = ['../escaped', '..\\escaped', '', ' ', '.', '..', 'bad/name', 'bad\\name'];

    for (const name of invalidNames) {
      expect(() => {
        service.create({ ...baseInput, name });
      }).toThrow(/Invalid skill name/);
    }
  });

  it('should block file path traversal in writeFile()', () => {
    service.create(baseInput);
    const escapedPath = path.join(tempDir, 'escaped.txt');

    expect(() => {
      service.writeFile(baseInput.name, '../escaped.txt', 'escaped');
    }).toThrow(/path traversal/i);

    expect(fs.existsSync(escapedPath)).toBe(false);
  });

  it('should require explicit overwrite in importFromBuffer()', () => {
    service.create(baseInput);
    const files = [{ path: 'SKILL.md', content: '---\nname: safe-skill\n---\n' }];

    expect(() => {
      service.importFromBuffer(baseInput.name, files);
    }).toThrow(/already exists/);

    expect(() => {
      service.importFromBuffer('!!!', files);
    }).toThrow(/Invalid skill name/);

    const updated = service.importFromBuffer(baseInput.name, files, undefined, { overwrite: true });
    expect(updated.name).toBe(baseInput.name);
  });
});

