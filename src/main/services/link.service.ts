import fs from 'fs';
import path from 'path';
import { getAppDataDir } from '../utils/paths';
import type { Link, CreateLinkInput } from '../types/domain';
import type { SymlinkService } from './symlink.service';

/**
 * LinkService - Manages link persistence and CRUD operations
 * Persists links to ~/.skills-manager/links.json
 */
export class LinkService {
  private linksPath: string;
  private links: Map<string, Link>;

  constructor(appDataDir?: string) {
    const dir = appDataDir || getAppDataDir();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.linksPath = path.join(dir, 'links.json');
    this.links = new Map();
    this.load();
  }

  /**
   * Load links from disk
   */
  private load(): void {
    try {
      if (fs.existsSync(this.linksPath)) {
        const data = fs.readFileSync(this.linksPath, 'utf-8');
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          for (const link of parsed) {
            this.links.set(link.id, link);
          }
        }
      } else {
        // Create empty file if it doesn't exist
        this.save();
      }
    } catch {
      // Corrupt or missing file — start fresh
      this.links = new Map();
      this.save();
    }
  }

  /**
   * Save links to disk
   */
  private save(): void {
    const data = Array.from(this.links.values());
    fs.writeFileSync(this.linksPath, JSON.stringify(data, null, 2), 'utf-8');
  }

  /**
   * List all links
   */
  list(): Link[] {
    return Array.from(this.links.values());
  }

  /**
   * Get a link by id
   */
  get(id: string): Link | undefined {
    return this.links.get(id);
  }

  /**
   * Create a new link
   */
  create(input: CreateLinkInput, sourcePath: string, destinationPath: string): Link {
    const id = `${input.skillId}-${input.projectId}-${input.ideName}`;

    if (this.links.has(id)) {
      throw new Error(`Link "${id}" already exists`);
    }

    const link: Link = {
      id,
      skillId: input.skillId,
      projectId: input.projectId,
      ideName: input.ideName,
      scope: input.scope,
      sourcePath,
      destinationPath,
      status: 'linked',
      createdAt: new Date().toISOString(),
    };

    this.links.set(id, link);
    this.save();
    return link;
  }

  /**
   * Remove a link by id
   */
  remove(id: string): boolean {
    if (!this.links.has(id)) {
      return false;
    }
    this.links.delete(id);
    this.save();
    return true;
  }

  /**
   * Remove multiple links by ids
   */
  removeMultiple(ids: string[]): { id: string; success: boolean }[] {
    const results: { id: string; success: boolean }[] = [];
    let changed = false;
    for (const id of ids) {
      if (this.links.has(id)) {
        this.links.delete(id);
        results.push({ id, success: true });
        changed = true;
      } else {
        results.push({ id, success: false });
      }
    }
    if (changed) this.save();
    return results;
  }

  /**
   * Verify a single link and update its status
   */
  verify(id: string, symlinkService: SymlinkService): { valid: boolean; link: Link } {
    const link = this.links.get(id);
    if (!link) {
      throw new Error(`Link "${id}" not found`);
    }

    const result = symlinkService.verify(link.destinationPath);
    link.status = result.valid ? 'linked' : 'broken';
    this.save();

    return { valid: result.valid, link };
  }

  /**
   * Verify all links and update their statuses
   */
  verifyAll(symlinkService: SymlinkService): Link[] {
    for (const link of this.links.values()) {
      const result = symlinkService.verify(link.destinationPath);
      link.status = result.valid ? 'linked' : 'broken';
    }
    this.save();
    return this.list();
  }
}
