import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ZipImportService } from './zip-import.service';
import { SkillService } from './skill.service';

type ZipFixtureEntry = {
  path: string;
  content: Buffer | string;
  externalFileAttributes?: number;
};

describe('ZipImportService', () => {
  let tempRoot: string;
  let zipPath: string;
  let service: ZipImportService;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-import-test-'));
    zipPath = path.join(tempRoot, 'skills.zip');
    service = new ZipImportService({
      get: () => ({
        centralSkillsRoot: tempRoot,
      }),
    } as any);
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('detects a single skill inside a common root folder and imports it', async () => {
    writeZip(zipPath, [
      {
        path: 'build-premium-frontend-skill/SKILL.md',
        content: '---\nname: build-premium-frontend\ndescription: desc\n---\n',
      },
      {
        path: 'build-premium-frontend-skill/assets/mock.png',
        content: Buffer.from([0, 1, 2, 3]),
      },
    ]);

    const analyzed = await service.analyze(zipPath);
    expect(analyzed.archiveInfo.rootPrefix).toBe('build-premium-frontend-skill');
    expect(analyzed.skills).toHaveLength(1);
    expect(analyzed.skills[0].structure).toBe('single-skill');

    const results = await service.importSkills(zipPath, analyzed.skills, {});
    expect(results).toEqual([
      expect.objectContaining({ skillName: 'build-premium-frontend-skill', status: 'imported' }),
    ]);

    expect(fs.existsSync(path.join(tempRoot, 'build-premium-frontend-skill', 'assets', 'mock.png'))).toBe(true);
    expect(fs.readFileSync(path.join(tempRoot, 'build-premium-frontend-skill', 'assets', 'mock.png'))).toEqual(
      Buffer.from([0, 1, 2, 3]),
    );
  });

  it('detects multiple skills, skips junk paths, and supports conflict strategies', async () => {
    writeZip(zipPath, [
      {
        path: 'bundle/alpha/SKILL.md',
        content: '---\nname: alpha\n---\n',
      },
      {
        path: 'bundle/alpha/notes.md',
        content: '# alpha',
      },
      {
        path: 'bundle/beta/README.md',
        content: '# beta',
      },
      {
        path: 'bundle/__MACOSX/nope.txt',
        content: 'ignore',
      },
      {
        path: 'bundle/.DS_Store',
        content: 'ignore',
      },
      {
        path: 'bundle/link',
        content: 'ignored symlink',
        externalFileAttributes: 0o120000 << 16,
      },
    ]);

    const analyzed = await service.analyze(zipPath);
    expect(analyzed.skills).toHaveLength(1);
    expect(analyzed.skills[0].name).toBe('alpha');

    const skillService = new SkillService(tempRoot);
    skillService.create({
      name: 'alpha',
      displayName: 'Alpha',
      description: 'existing',
      format: 'folder',
      targetIDEs: [],
      tags: [],
    });

    const renamed = await service.importSkills(zipPath, analyzed.skills, {
      alpha: { strategy: 'rename', newName: 'alpha-renamed' },
    });
    expect(renamed[0]).toEqual(expect.objectContaining({ status: 'renamed', skillName: 'alpha-renamed' }));

    const skipped = await service.importSkills(zipPath, analyzed.skills, {
      alpha: { strategy: 'skip' },
    });
    expect(skipped[0]).toEqual(expect.objectContaining({ status: 'skipped' }));

    const overwritten = await service.importSkills(zipPath, analyzed.skills, {
      alpha: { strategy: 'overwrite' },
    });
    expect(overwritten[0]).toEqual(expect.objectContaining({ status: 'imported', skillName: 'alpha' }));
  });

  it('creates a non-standard skill and rejects unsafe paths during sanitization', async () => {
    writeZip(zipPath, [
      {
        path: 'plain/readme.md',
        content: '# plain',
      },
      {
        path: 'plain/Thumbs.db',
        content: 'ignore',
      },
    ]);

    const analyzed = await service.analyze(zipPath);
    expect(analyzed.skills).toHaveLength(1);
    expect(analyzed.skills[0].structure).toBe('non-standard');

    const results = await service.importSkills(zipPath, analyzed.skills, {});
    expect(results[0].status).toBe('imported');
    expect(fs.existsSync(path.join(tempRoot, 'plain', 'SKILL.md'))).toBe(true);
    expect((service as any).sanitizeArchivePath('plain/../escape.txt')).toBeNull();
    expect((service as any).sanitizeArchivePath('C:/escape.txt')).toBeNull();
    expect(fs.existsSync(path.join(tempRoot, 'escape.txt'))).toBe(false);
  });
});

function writeZip(targetPath: string, entries: ZipFixtureEntry[]): void {
  const files = entries.map((entry) => ({
    ...entry,
    content: Buffer.isBuffer(entry.content) ? entry.content : Buffer.from(entry.content, 'utf-8'),
  }));

  let offset = 0;
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];

  for (const file of files) {
    const fileName = Buffer.from(file.path.replace(/\\/g, '/'));
    const crc = crc32(file.content);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(file.content.length, 18);
    localHeader.writeUInt32LE(file.content.length, 22);
    localHeader.writeUInt16LE(fileName.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, fileName, file.content);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(file.content.length, 20);
    centralHeader.writeUInt32LE(file.content.length, 24);
    centralHeader.writeUInt16LE(fileName.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE((file.externalFileAttributes || 0) >>> 0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, fileName);

    offset += localHeader.length + fileName.length + file.content.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  fs.writeFileSync(targetPath, Buffer.concat([...localParts, centralDirectory, end]));
}

function crc32(buffer: Buffer): number {
  let crc = 0 ^ -1;
  for (let index = 0; index < buffer.length; index += 1) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buffer[index]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

const CRC_TABLE = (() => {
  const table = new Array<number>(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    table[index] = value >>> 0;
  }
  return table;
})();
