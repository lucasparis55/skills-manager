import fs from 'fs';
import path from 'path';
import type {
  AppSettings,
  IDEDefinition,
  Link,
  LinkMigrationResult,
  Project,
  Skill,
  SkillDistributionDestination,
  SkillDistributionRepairResult,
  SkillDistributionReport,
} from '../types/domain';
import { resolveKnownSkillLinkDestinations, resolveSkillLinkDestination } from '../utils/paths';
import type { IDEAdapterService } from './ide-adapter.service';
import type { LinkMigrationService } from './link-migration.service';
import type { LinkService } from './link.service';
import type { ProjectService } from './project.service';
import type { SettingsService } from './settings.service';
import type { SkillService } from './skill.service';
import type { SymlinkService, SymlinkStrategy } from './symlink.service';

export interface SkillHealthServiceDependencies {
  settingsService: Pick<SettingsService, 'get'>;
  skillService: Pick<SkillService, 'get'>;
  linkService: Pick<LinkService, 'list' | 'get' | 'updateDestination'>;
  symlinkService: Pick<SymlinkService, 'createExclusive' | 'remove' | 'isSymlink' | 'verify'>;
  ideService: Pick<IDEAdapterService, 'list'>;
  projectService: Pick<ProjectService, 'list'>;
  linkMigrationService?: Pick<LinkMigrationService, 'migrate'>;
}

type LinkInspection = {
  destination: SkillDistributionDestination;
  link: Link;
};

type ManagedDestinationStatus = 'healthy' | 'broken' | 'conflict' | 'unavailable';

export class SkillHealthService {
  constructor(private readonly deps: SkillHealthServiceDependencies) {}

  async checkDistribution(skillId: string): Promise<SkillDistributionReport> {
    const skill = this.requireSkill(skillId);
    const ides = this.deps.ideService.list();
    const projects = this.deps.projectService.list();
    const inspections = this.deps.linkService
      .list()
      .filter((link) => link.skillId === skill.id)
      .map((link) => this.inspectLink(link, skill, ides, projects));
    const destinations = inspections.map(({ destination }) => destination);

    return {
      checkedAt: new Date().toISOString(),
      skillId: skill.id,
      skillName: skill.name,
      sourcePath: skill.sourcePath,
      destinations,
      summary: {
        total: destinations.length,
        healthy: destinations.filter((item) => item.status === 'healthy').length,
        attention: destinations.filter((item) => item.status !== 'healthy').length,
        blocked: destinations.filter((item) => item.status !== 'healthy' && !item.repairable).length,
        repairable: destinations.filter((item) => item.repairable).length,
      },
    };
  }

  async repairDistribution(skillId: string, linkIds: string[]): Promise<SkillDistributionRepairResult[]> {
    const skill = this.requireSkill(skillId);
    const report = await this.checkDistribution(skillId);
    const requestedIds = [...new Set(linkIds)];
    const inspections = new Map(
      report.destinations.map((destination) => [destination.linkId, destination]),
    );
    const results = new Map<string, SkillDistributionRepairResult>();
    const migrationIds: string[] = [];

    for (const linkId of requestedIds) {
      const destination = inspections.get(linkId);
      if (!destination) {
        results.set(linkId, this.unknownLinkResult(skill, linkId));
        continue;
      }

      const currentLink = this.deps.linkService.get(linkId);
      if (destination.status === 'legacy' && destination.scope === 'global' && this.deps.linkMigrationService) {
        if (currentLink && this.canRepairLink(currentLink, skill, destination)) {
          migrationIds.push(linkId);
        } else {
          results.set(linkId, this.blockedResult(destination, 'Destination changed after verification; run the check again.'));
        }
        continue;
      }

      if (!destination.repairable) {
        results.set(linkId, this.blockedResult(destination));
        continue;
      }

      results.set(
        linkId,
        destination.status === 'legacy'
          ? await this.repairRelocatedDestination(destination, skill)
          : await this.repairFreeDestination(destination, skill),
      );
    }

    if (migrationIds.length > 0) {
      let migrationResults: LinkMigrationResult[];
      try {
        migrationResults = await this.deps.linkMigrationService!.migrate(migrationIds);
      } catch (error) {
        const message = `Legacy migration failed: ${this.errorMessage(error)}`;
        for (const linkId of migrationIds) {
          const destination = inspections.get(linkId)!;
          results.set(linkId, this.failedResult(destination, message));
        }
        return requestedIds.map((linkId) => results.get(linkId)!);
      }
      const migrationById = new Map(migrationResults.map((result) => [result.linkId, result]));

      for (const linkId of migrationIds) {
        const destination = inspections.get(linkId)!;
        const migrationResult = migrationById.get(linkId);
        if (!migrationResult) {
          results.set(linkId, {
            ...this.repairBase(destination),
            status: 'failed',
            message: 'Migration returned no result for this destination.',
          });
          continue;
        }

        const migrated = migrationResult.status === 'migrated';
        results.set(linkId, {
          ...this.repairBase(destination),
          destinationPath: migrated ? migrationResult.targetPath : migrationResult.currentPath || destination.destinationPath,
          expectedPath: migrationResult.targetPath || destination.expectedPath,
          previousPath: migrationResult.currentPath || destination.destinationPath,
          status: migrated ? 'repaired' : migrationResult.status === 'skipped' ? 'blocked' : 'failed',
          message: migrationResult.message,
        });
      }
    }

    return requestedIds.map((linkId) => results.get(linkId)!);
  }

  private inspectLink(
    link: Link,
    skill: Skill,
    ides: IDEDefinition[],
    projects: Project[],
  ): LinkInspection {
    const ide = ides.find((candidate) => candidate.id === link.ideName);
    const project = link.scope === 'project'
      ? projects.find((candidate) => candidate.id === link.projectId)
      : undefined;
    const base = {
      linkId: link.id,
      skillId: skill.id,
      skillName: skill.name,
      ideId: ide?.id || link.ideName,
      ideName: ide?.name || link.ideName,
      scope: link.scope,
      projectId: link.projectId,
      projectName: link.scope === 'global' ? 'Global' : project?.name || link.projectId || 'Unknown project',
      sourcePath: skill.sourcePath,
      destinationPath: link.destinationPath,
      expectedPath: null,
    } satisfies Omit<SkillDistributionDestination, 'status' | 'repairable'>;

    if (!ide) {
      return this.inspection(link, { ...base, status: 'unavailable', repairable: false, message: 'IDE definition is unavailable.' });
    }

    if (link.scope === 'project' && (!project || !this.isDirectory(project.path))) {
      return this.inspection(link, {
        ...base,
        status: 'unavailable',
        repairable: false,
        message: project ? 'Project directory is unavailable.' : 'Project is no longer registered.',
      });
    }

    if (!this.samePath(link.sourcePath, skill.sourcePath)) {
      return this.inspection(link, {
        ...base,
        status: 'conflict',
        repairable: false,
        message: 'Persisted link source does not match the current skill source.',
      });
    }

    if (!this.isDirectory(skill.sourcePath)) {
      return this.inspection(link, {
        ...base,
        status: 'broken',
        repairable: false,
        message: 'Managed skill source is unavailable.',
      });
    }

    let expectedPath: string;
    try {
      expectedPath = resolveSkillLinkDestination(
        skill.name,
        project?.path || '',
        ide,
        link.scope,
        undefined,
        this.deps.settingsService.get().ideRootOverrides,
      );
    } catch (error) {
      return this.inspection(link, {
        ...base,
        status: 'unavailable',
        repairable: false,
        message: this.errorMessage(error),
      });
    }

    const withExpectedPath = { ...base, expectedPath };
    const expectedState = this.getPathState(expectedPath);
    if (expectedState === 'unavailable') {
      return this.inspection(link, {
        ...withExpectedPath,
        status: 'unavailable',
        repairable: false,
        message: 'Expected destination is unavailable.',
      });
    }

    if (this.hasOtherLinkReference(link.id, expectedPath)) {
      return this.inspection(link, {
        ...withExpectedPath,
        status: 'conflict',
        repairable: false,
        message: 'Expected destination is already claimed by another managed link.',
      });
    }

    if (this.samePath(link.destinationPath, expectedPath)) {
      return this.inspectCanonicalDestination(link, withExpectedPath, skill.sourcePath);
    }

    const currentState = this.getPathState(link.destinationPath);
    if (currentState === 'unavailable') {
      return this.inspection(link, {
        ...withExpectedPath,
        status: 'unavailable',
        repairable: false,
        message: 'Persisted destination is unavailable.',
      });
    }

    if (currentState === 'missing') {
      return this.inspection(link, {
        ...withExpectedPath,
        status: expectedState === 'present' ? 'conflict' : 'broken',
        repairable: expectedState === 'missing',
        message: expectedState === 'present'
          ? 'Expected destination is already occupied.'
          : 'Persisted destination is missing; it can be recreated at the canonical path.',
      });
    }

    const currentStatus = this.validateManagedDestination(link.destinationPath, skill.sourcePath);
    if (currentStatus.status !== 'healthy') {
      return this.inspection(link, {
        ...withExpectedPath,
        status: currentStatus.status,
        repairable: false,
        message: currentStatus.message,
      });
    }

    if (expectedState === 'present') {
      return this.inspection(link, {
        ...withExpectedPath,
        status: 'conflict',
        repairable: false,
        message: 'Expected destination is already occupied.',
      });
    }

    if (!this.isKnownLegacyDestination(link.destinationPath, skill.name, ide, project?.path || '', link.scope)) {
      return this.inspection(link, {
        ...withExpectedPath,
        status: 'conflict',
        repairable: false,
        message: 'Current destination is outside a known IDE skills root.',
      });
    }

    return this.inspection(link, {
      ...withExpectedPath,
      status: 'legacy',
      repairable: true,
      message: 'Destination is outside the current canonical skills directory.',
    });
  }

  private inspectCanonicalDestination(
    link: Link,
    base: Omit<SkillDistributionDestination, 'status' | 'repairable'>,
    sourcePath: string,
  ): LinkInspection {
    const destinationState = this.getPathState(link.destinationPath);
    if (destinationState === 'missing') {
      return this.inspection(link, {
        ...base,
        status: 'broken',
        repairable: true,
        message: 'Canonical destination is missing; it can be recreated.',
      });
    }
    if (destinationState === 'unavailable') {
      return this.inspection(link, {
        ...base,
        status: 'unavailable',
        repairable: false,
        message: 'Canonical destination is unavailable.',
      });
    }

    const currentStatus = this.validateManagedDestination(link.destinationPath, sourcePath);
    return this.inspection(link, {
      ...base,
      status: currentStatus.status,
      repairable: false,
      message: currentStatus.status === 'healthy' ? undefined : currentStatus.message,
    });
  }

  private validateManagedDestination(destinationPath: string, sourcePath: string): {
    status: ManagedDestinationStatus;
    message?: string;
  } {
    const destinationState = this.getPathState(destinationPath);
    if (destinationState === 'missing') {
      return { status: 'broken', message: 'Managed link is missing.' };
    }
    if (destinationState === 'unavailable') {
      return { status: 'unavailable', message: 'Managed link is unavailable.' };
    }
    if (!this.deps.symlinkService.isSymlink(destinationPath)) {
      return { status: 'conflict', message: 'Destination exists but is not a managed symlink or junction.' };
    }

    const verification = this.deps.symlinkService.verify(destinationPath);
    if (!verification.valid || !verification.target) {
      return { status: 'broken', message: 'Managed link is broken or its target is unavailable.' };
    }

    const resolvedTarget = path.resolve(path.dirname(destinationPath), verification.target);
    if (!this.samePath(resolvedTarget, sourcePath)) {
      return { status: 'conflict', message: 'Link target does not match the current skill source.' };
    }

    return { status: 'healthy' };
  }

  private async repairFreeDestination(
    destination: SkillDistributionDestination,
    skill: Skill,
  ): Promise<SkillDistributionRepairResult> {
    const link = this.deps.linkService.get(destination.linkId);
    if (!link || !destination.expectedPath) {
      return this.failedResult(destination, 'Managed link no longer exists or has no canonical destination.');
    }

    if (!this.canRepairLink(link, skill, destination)) {
      return this.blockedResult(destination, 'Destination changed after verification; run the check again.');
    }

    const previousPath = link.destinationPath;
    const strategy = this.resolveStrategy(this.deps.settingsService.get());
    const created = this.deps.symlinkService.createExclusive(skill.sourcePath, destination.expectedPath, strategy);
    if (!created.success) {
      return this.failedResult(destination, created.error || 'Failed to create the managed link.');
    }

    let persisted: Link | undefined;
    try {
      persisted = this.deps.linkService.updateDestination(link.id, destination.expectedPath);
    } catch (error) {
      const cleaned = this.deps.symlinkService.remove(destination.expectedPath);
      return this.failedResult(
        destination,
        `${this.errorMessage(error)}${cleaned ? '' : ' The new link could not be cleaned up safely.'}`,
        previousPath,
      );
    }
    if (!persisted) {
      const cleaned = this.deps.symlinkService.remove(destination.expectedPath);
      return this.failedResult(
        destination,
        cleaned ? 'Managed link record no longer exists.' : 'Managed link record no longer exists and the new link could not be cleaned up safely.',
      );
    }

    const verification = this.deps.symlinkService.verify(destination.expectedPath);
    if (!verification.valid || !verification.target || !this.samePath(
      path.resolve(path.dirname(destination.expectedPath), verification.target),
      skill.sourcePath,
    )) {
      let rollbackMessage = '';
      try {
        this.deps.linkService.updateDestination(link.id, previousPath);
      } catch (error) {
        rollbackMessage = ` Persisted destination rollback failed: ${this.errorMessage(error)}`;
      }
      if (!this.deps.symlinkService.remove(destination.expectedPath)) {
        rollbackMessage += ' New link could not be cleaned up safely.';
      }
      return this.failedResult(destination, `Created link failed post-repair verification.${rollbackMessage}`, previousPath);
    }

    return {
      ...this.repairBase(destination),
      destinationPath: destination.expectedPath,
      status: 'repaired',
      previousPath,
      message: undefined,
    };
  }

  private async repairRelocatedDestination(
    destination: SkillDistributionDestination,
    skill: Skill,
  ): Promise<SkillDistributionRepairResult> {
    const link = this.deps.linkService.get(destination.linkId);
    if (!link || !destination.expectedPath || !this.canRepairLink(link, skill, destination)) {
      return this.blockedResult(destination, 'Destination changed after verification; run the check again.');
    }

    const currentStatus = this.validateManagedDestination(link.destinationPath, skill.sourcePath);
    if (currentStatus.status !== 'healthy') {
      return this.blockedResult(destination, currentStatus.message || 'Current link is no longer safe to move.');
    }

    const previousPath = link.destinationPath;
    const strategy = this.resolveStrategy(this.deps.settingsService.get());
    const created = this.deps.symlinkService.createExclusive(skill.sourcePath, destination.expectedPath, strategy);
    if (!created.success) {
      return this.failedResult(destination, created.error || 'Failed to create the canonical link.');
    }

    const createdValidation = this.validateManagedDestination(destination.expectedPath, skill.sourcePath);
    if (createdValidation.status !== 'healthy') {
      const cleaned = this.deps.symlinkService.remove(destination.expectedPath);
      return this.failedResult(
        destination,
        cleaned
          ? `New canonical link failed verification: ${createdValidation.message}`
          : `New canonical link failed verification and could not be cleaned up safely: ${createdValidation.message}`,
      );
    }

    let persisted: Link | undefined;
    try {
      persisted = this.deps.linkService.updateDestination(link.id, destination.expectedPath);
    } catch (error) {
      const cleaned = this.deps.symlinkService.remove(destination.expectedPath);
      return this.failedResult(
        destination,
        `${this.errorMessage(error)}${cleaned ? '' : ' The new link could not be cleaned up safely.'}`,
      );
    }
    if (!persisted) {
      this.deps.symlinkService.remove(destination.expectedPath);
      return this.failedResult(destination, 'Managed link record no longer exists.');
    }

    const currentTargetValidation = this.validateManagedDestination(destination.expectedPath, skill.sourcePath);
    if (currentTargetValidation.status !== 'healthy') {
      let rollbackMessage = '';
      try {
        this.deps.linkService.updateDestination(link.id, previousPath);
      } catch (error) {
        rollbackMessage = ` Persisted destination rollback failed: ${this.errorMessage(error)}`;
      }
      if (!this.deps.symlinkService.remove(destination.expectedPath)) {
        rollbackMessage += ' New link could not be cleaned up safely.';
      }
      return this.failedResult(
        destination,
        `New canonical link changed before the original link could be removed: ${currentTargetValidation.message || 'verification failed'}.${rollbackMessage}`,
        previousPath,
      );
    }

    const removed = this.deps.symlinkService.remove(previousPath);
    if (!removed && this.getPathState(previousPath) !== 'missing') {
      let rollbackMessage = '';
      try {
        this.deps.linkService.updateDestination(link.id, previousPath);
      } catch (error) {
        rollbackMessage = ` Persisted destination rollback failed: ${this.errorMessage(error)}`;
      }
      if (!this.deps.symlinkService.remove(destination.expectedPath)) {
        rollbackMessage += ' New link could not be cleaned up safely.';
      }
      return this.failedResult(destination, `Original link could not be removed; the repair was rolled back.${rollbackMessage}`);
    }

    return {
      ...this.repairBase(destination),
      destinationPath: destination.expectedPath,
      status: 'repaired',
      previousPath,
      message: removed ? undefined : 'Original link was already missing.',
    };
  }

  private canRepairLink(link: Link, skill: Skill, destination: SkillDistributionDestination): boolean {
    return link.skillId === skill.id
      && link.ideName === destination.ideId
      && link.scope === destination.scope
      && link.projectId === destination.projectId
      && this.samePath(link.sourcePath, skill.sourcePath)
      && this.samePath(link.destinationPath, destination.destinationPath)
      && this.isDirectory(skill.sourcePath)
      && this.getPathState(destination.expectedPath || '') === 'missing'
      && !this.hasOtherLinkReference(link.id, destination.expectedPath || '');
  }

  private inspection(
    link: Link,
    destination: SkillDistributionDestination,
  ): LinkInspection {
    return { link, destination };
  }

  private blockedResult(
    destination: SkillDistributionDestination,
    message = destination.message || 'This destination requires manual intervention.',
  ): SkillDistributionRepairResult {
    return { ...this.repairBase(destination), status: 'blocked', message };
  }

  private failedResult(
    destination: SkillDistributionDestination,
    message: string,
    previousPath?: string,
  ): SkillDistributionRepairResult {
    return { ...this.repairBase(destination), status: 'failed', message, ...(previousPath ? { previousPath } : {}) };
  }

  private repairBase(destination: SkillDistributionDestination): Omit<SkillDistributionDestination, 'status' | 'repairable'> {
    const { repairable, status, ...base } = destination;
    void repairable;
    void status;
    return base;
  }

  private unknownLinkResult(skill: Skill, linkId: string): SkillDistributionRepairResult {
    return {
      linkId,
      skillId: skill.id,
      skillName: skill.name,
      ideId: '',
      ideName: 'Unknown IDE',
      scope: 'global',
      projectId: null,
      projectName: 'Unknown project',
      sourcePath: skill.sourcePath,
      destinationPath: '',
      expectedPath: null,
      status: 'blocked',
      message: 'Link is not part of this skill distribution.',
    };
  }

  private requireSkill(skillId: string): Skill {
    const skill = this.deps.skillService.get(skillId);
    if (!skill) {
      throw new Error(`Skill "${skillId}" not found`);
    }
    return skill;
  }

  private getPathState(candidatePath: string): 'present' | 'missing' | 'unavailable' {
    if (!candidatePath) return 'missing';
    try {
      fs.lstatSync(candidatePath);
      return 'present';
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'unavailable';
    }
  }

  private hasOtherLinkReference(linkId: string, destinationPath: string): boolean {
    return Boolean(destinationPath) && this.deps.linkService.list().some(
      (link) => link.id !== linkId && this.samePath(link.destinationPath, destinationPath),
    );
  }

  private isKnownLegacyDestination(
    destinationPath: string,
    skillName: string,
    ide: IDEDefinition,
    projectPath: string,
    scope: 'global' | 'project',
  ): boolean {
    const settings = this.deps.settingsService.get();
    return resolveKnownSkillLinkDestinations(
      skillName,
      projectPath,
      ide,
      scope,
      undefined,
      settings.ideRootOverrides,
    ).some((knownPath) => this.samePath(knownPath, destinationPath));
  }

  private isDirectory(candidatePath: string): boolean {
    try {
      return fs.statSync(candidatePath).isDirectory();
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

  private resolveStrategy(settings: AppSettings): SymlinkStrategy {
    return settings.symlinkStrategy === 'junction' || settings.symlinkStrategy === 'symlink'
      ? settings.symlinkStrategy
      : 'auto';
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
