import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getAppDataDir } from '../utils/paths';
import type { ImportProvenanceRecord } from '../types/import';

/** Persists source identity and destination history for reproducible imports. */
export class ImportProvenanceService {
  private readonly filePath: string;
  private readonly now: () => Date;
  private records: ImportProvenanceRecord[];

  constructor(appDataDir: string = getAppDataDir(), now: () => Date = () => new Date()) {
    fs.mkdirSync(appDataDir, { recursive: true });
    this.filePath = path.join(appDataDir, 'imports.json');
    this.now = now;
    this.records = this.load();
    if (!fs.existsSync(this.filePath)) this.save();
  }

  list(): ImportProvenanceRecord[] {
    return this.records.map((record) => ({
      ...record,
      source: { ...record.source },
      target: { ...record.target },
      fileHashes: { ...record.fileHashes },
    }));
  }

  get(id: string): ImportProvenanceRecord | undefined {
    return this.list().find((record) => record.id === id);
  }

  find(componentId: string, targetId: string): ImportProvenanceRecord | undefined {
    return this.list().find((record) => record.componentId === componentId && record.target.targetId === targetId);
  }

  upsert(record: ImportProvenanceRecord): ImportProvenanceRecord {
    const existingIndex = this.records.findIndex((candidate) =>
      candidate.componentId === record.componentId && candidate.target.targetId === record.target.targetId,
    );
    const timestamp = this.now().toISOString();
    const next: ImportProvenanceRecord = {
      ...record,
      id: existingIndex >= 0 ? this.records[existingIndex].id : record.id || `import-${this.now().getTime()}`,
      installedAt: existingIndex >= 0 ? this.records[existingIndex].installedAt : record.installedAt || timestamp,
      updatedAt: timestamp,
      source: { ...record.source },
      target: { ...record.target },
      fileHashes: { ...record.fileHashes },
    };

    if (existingIndex >= 0) this.records[existingIndex] = next;
    else this.records.push(next);
    this.save();
    return { ...next, source: { ...next.source }, target: { ...next.target }, fileHashes: { ...next.fileHashes } };
  }

  markRemoved(id: string): ImportProvenanceRecord | undefined {
    const index = this.records.findIndex((record) => record.id === id);
    if (index < 0) return undefined;
    this.records[index] = { ...this.records[index], status: 'removed', updatedAt: this.now().toISOString() };
    this.save();
    return this.get(id);
  }

  static hash(content: Buffer | string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  private load(): ImportProvenanceRecord[] {
    try {
      if (!fs.existsSync(this.filePath)) return [];
      const parsed: unknown = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      return Array.isArray(parsed) ? parsed.filter((record): record is ImportProvenanceRecord => this.isRecord(record)) : [];
    } catch {
      return [];
    }
  }

  private isRecord(value: unknown): value is ImportProvenanceRecord {
    if (!value || typeof value !== 'object') return false;
    const record = value as Partial<ImportProvenanceRecord>;
    return typeof record.id === 'string'
      && typeof record.componentId === 'string'
      && typeof record.componentKind === 'string'
      && typeof record.componentName === 'string'
      && !!record.source
      && !!record.target
      && typeof record.updatedAt === 'string';
  }

  private save(): void {
    const temporary = `${this.filePath}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(this.records, null, 2), 'utf8');
    fs.renameSync(temporary, this.filePath);
  }
}
