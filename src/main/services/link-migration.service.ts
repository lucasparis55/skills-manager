import fs from 'fs';
import path from 'path';
import type {
  AppSettings,
  Link,
  LinkMigrationCandidate,
  LinkMigrationPreview,
  LinkMigrationResult,
} from '../types/domain';
import { resolveSkillLinkDestination } from '../utils/paths';
import { IDEAdapterService } from './ide-adapter.service';
import { LinkService } from './link.service';
import { SkillService } from './skill.service';
import { SymlinkService, type SymlinkStrategy } from './symlink.service';
import { SettingsService } from './settings.service';

interface LinkMigrationDependencies {
  settingsService: Pick<SettingsService, 'get'>;
  skillService: Pick<SkillService, 'get'>;
  linkService: Pick<LinkService, 'list' | 'get' | 'updateDestination'>;
  symlinkService: Pick<SymlinkService, 'createExclusive' | 'remove' | 'isSymlink' | 'verify'>;
  ideService: Pick<IDEAdapterService, 'list'>;
}

interface CandidateContext {
  link: Link;
  candidate: LinkMigrationCandidate;
}

/**
 * Finds managed global links that are outside their IDE's canonical skills
 * directory and moves them without replacing any existing filesystem entry.
 */
export class LinkMigrationService {
  constructor(private readonly deps: LinkMigrationDependencies) {}

  async preview(): Promise<LinkMigrationPreview> {
    const candidates: LinkMigrationCandidate[] = [];
    for (const link of this.deps.linkService.list()) {
      if (link.scope !== 'global') {
        continue;
      }

      const context = this.buildCandidateContext(link);
      if (context) {
        candidates.push(context.candidate);
      }
    }

    return {
      scannedAt: new Date().toISOString(),
      candidates,
    };
  }

  async migrate(linkIds: string[]): Promise<LinkMigrationResult[]> {
    const results: LinkMigrationResult[] = [];
    const uniqueIds = [...new Set(linkIds)];

    for (const linkId of uniqueIds) {
      const link = this.deps.linkService.get(linkId);
      if (!link || link.scope !== 'global') {
        results.push(this.missingLinkResult(linkId));
        continue;
      }

      const context = this.buildCandidateContext(link);
      if (!context) {
        results.push(this.alreadyCanonicalResult(link));
        continue;
      }

      if (context.candidate.status !== 'ready') {
        results.push(this.skippedResult(context.candidate));
        continue;
      }

      results.push(await this.migrateCandidate(context));
    }

    return results;
  }

  private buildCandidateContext(link: Link): CandidateContext | null {
    const ide = this.deps.ideService.list().find((candidate) => candidate.id === link.ideName);
    const skill = this.deps.skillService.get(link.skillId);
    const skillName = skill?.name || path.basename(link.destinationPath);
    const ideName = ide?.name || link.ideName;
    const targetPath = ide
      ? resolveSkillLinkDestination(
          skillName,
          '',
          ide,
          'global',
          undefined,
          this.deps.settingsService.get().ideRootOverrides,
        )
      : '';
    const candidateBase = {
      linkId: link.id,
      skillId: link.skillId,
      skillName,
      ideId: ide?.id || link.ideName,
      ideName,
      sourcePath: link.sourcePath,
      currentPath: link.destinationPath,
      targetPath,
    };

    if (!ide) {
      return { link, candidate: { ...candidateBase, status: 'blocked', message: 'IDE definition not found.' } };
    }

    if (!skill) {
      return { link, candidate: { ...candidateBase, status: 'blocked', message: 'Skill definition not found.' } };
    }

    if (!this.isSafeSkillName(skillName)) {
      return { link, candidate: { ...candidateBase, status: 'blocked', message: 'Skill name is not safe to migrate.' } };
    }

    if (!this.samePath(link.sourcePath, skill.sourcePath)) {
      return {
        link,
        candidate: {
          ...candidateBase,
          status: 'blocked',
          message: 'Persisted link source does not match the current skill source.',
        },
      };
    }

    if (this.samePath(link.destinationPath, targetPath)) {
      return null;
    }

    const linkValidation = this.validateManagedLink(link);
    if (!linkValidation.ok) {
      return { link, candidate: { ...candidateBase, status: 'blocked', message: linkValidation.message } };
    }

    if (this.hasExistingPath(targetPath) || this.isTargetReferencedByAnotherLink(link.id, targetPath)) {
      return {
        link,
        candidate: {
          ...candidateBase,
          status: 'conflict',
          message: `Canonical destination already exists: ${targetPath}`,
        },
      };
    }

    return { link, candidate: { ...candidateBase, status: 'ready' } };
  }

  private validateManagedLink(link: Link): { ok: true } | { ok: false; message: string } {
    return this.validateManagedDestination(link.destinationPath, link.sourcePath);
  }

  private validateManagedDestination(
    destinationPath: string,
    sourcePath: string,
  ): { ok: true } | { ok: false; message: string } {
    if (!this.deps.symlinkService.isSymlink(destinationPath)) {
      return { ok: false, message: 'Current destination is not a managed symlink or junction.' };
    }

    const verification = this.deps.symlinkService.verify(destinationPath);
    if (!verification.valid || !verification.target) {
      return { ok: false, message: 'Current link is broken or its target is unavailable.' };
    }

    const resolvedTarget = path.resolve(path.dirname(destinationPath), verification.target);
    if (!this.samePath(resolvedTarget, sourcePath)) {
      return { ok: false, message: 'Current link target does not match the persisted skill source.' };
    }

    return { ok: true };
  }

  private async migrateCandidate(context: CandidateContext): Promise<LinkMigrationResult> {
    const { link, candidate } = context;
    const settings = this.deps.settingsService.get();
    const strategy = this.resolveStrategy(settings);
    const created = this.deps.symlinkService.createExclusive(link.sourcePath, candidate.targetPath, strategy);

    if (!created.success) {
      return this.failedResult(candidate, created.error || 'Failed to create canonical link.');
    }

    let persisted = false;
    try {
      if (!this.deps.linkService.updateDestination(link.id, candidate.targetPath)) {
        const cleaned = this.removeCreatedTarget(candidate.targetPath, link.sourcePath);
        return this.failedResult(
          candidate,
          cleaned
            ? 'Managed link record no longer exists.'
            : 'Managed link record no longer exists and the new link could not be cleaned up safely.',
        );
      }
      persisted = true;

      if (this.hasExistingPath(candidate.currentPath)) {
        const currentValidation = this.validateManagedDestination(candidate.currentPath, link.sourcePath);
        if (!currentValidation.ok) {
          throw new Error(`Original link changed and was not removed: ${currentValidation.message}`);
        }
      }

      const removed = this.deps.symlinkService.remove(candidate.currentPath);
      if (!removed && this.hasExistingPath(candidate.currentPath)) {
        throw new Error('Original link could not be removed; migration was rolled back.');
      }

      return {
        ...candidate,
        status: 'migrated',
        message: removed ? undefined : 'Original link was already missing.',
      };
    } catch (error) {
      const rollbackMessages: string[] = [];
      if (persisted) {
        try {
          this.deps.linkService.updateDestination(link.id, candidate.currentPath);
        } catch (rollbackError) {
          rollbackMessages.push(`Persisted link rollback failed: ${this.errorMessage(rollbackError)}`);
        }
      }
      if (!this.removeCreatedTarget(candidate.targetPath, link.sourcePath)) {
        rollbackMessages.push('New canonical link could not be cleaned up safely.');
      }
      const message = [this.errorMessage(error), ...rollbackMessages].join(' ');
      return this.failedResult(candidate, message);
    }
  }

  private removeCreatedTarget(destinationPath: string, sourcePath: string): boolean {
    if (!this.hasExistingPath(destinationPath)) {
      return true;
    }

    const validation = this.validateManagedDestination(destinationPath, sourcePath);
    if (!validation.ok) {
      return false;
    }

    try {
      return this.deps.symlinkService.remove(destinationPath);
    } catch {
      return false;
    }
  }

  private skippedResult(candidate: LinkMigrationCandidate): LinkMigrationResult {
    return { ...candidate, status: 'skipped' };
  }

  private failedResult(candidate: LinkMigrationCandidate, message: string): LinkMigrationResult {
    return { ...candidate, status: 'failed', message };
  }

  private alreadyCanonicalResult(link: Link): LinkMigrationResult {
    return {
      linkId: link.id,
      skillId: link.skillId,
      skillName: path.basename(link.destinationPath),
      ideId: link.ideName,
      ideName: link.ideName,
      sourcePath: link.sourcePath,
      currentPath: link.destinationPath,
      targetPath: link.destinationPath,
      status: 'skipped',
      message: 'Link already uses the canonical skills directory.',
    };
  }

  private missingLinkResult(linkId: string): LinkMigrationResult {
    return {
      linkId,
      skillId: '',
      skillName: linkId,
      ideId: '',
      ideName: '',
      sourcePath: '',
      currentPath: '',
      targetPath: '',
      status: 'failed',
      message: 'Managed link no longer exists.',
    };
  }

  private isTargetReferencedByAnotherLink(linkId: string, targetPath: string): boolean {
    return this.deps.linkService.list().some(
      (link) => link.id !== linkId && this.samePath(link.destinationPath, targetPath),
    );
  }

  private hasExistingPath(candidatePath: string): boolean {
    try {
      fs.lstatSync(candidatePath);
      return true;
    } catch {
      return false;
    }
  }

  private samePath(left: string, right: string): boolean {
    const leftKey = path.resolve(path.normalize(left));
    const rightKey = path.resolve(path.normalize(right));
    return process.platform === 'win32'
      ? leftKey.toLowerCase() === rightKey.toLowerCase()
      : leftKey === rightKey;
  }

  private isSafeSkillName(name: string): boolean {
    return /^[A-Za-z0-9._-]{1,64}$/.test(name);
  }

  private resolveStrategy(settings: AppSettings): SymlinkStrategy {
    return settings.symlinkStrategy === 'junction' || settings.symlinkStrategy === 'symlink'
      ? settings.symlinkStrategy
      : 'auto';
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
