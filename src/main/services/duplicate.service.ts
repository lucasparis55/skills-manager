import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { resolveSkillsRoot } from '../utils/paths';
import type {
  AppSettings,
  DetectedSkillRoot,
  DuplicateGroup,
  DuplicateOccurrence,
  DuplicateOperationResult,
  DuplicateScanResult,
} from '../types/domain';
import { IDEAdapterService } from './ide-adapter.service';
import { SettingsService } from './settings.service';
import { getSkillMigrationLockPath, SkillService } from './skill.service';

interface DuplicateServiceDependencies {
  settingsService: Pick<SettingsService, 'get'>;
  ideService: Pick<IDEAdapterService, 'detectSkillRoots'>;
  trashItem: (targetPath: string) => Promise<void>;
}

interface Candidate {
  path: string;
  name: string;
  rootPaths: string[];
  ideIds: string[];
  ideNames: string[];
}

interface FingerprintedCandidate extends Candidate {
  contentHash: string;
}

interface FingerprintFile {
  absolutePath: string;
  relativePath: string;
}

interface ValidatedCandidate extends FingerprintedCandidate {}

interface ValidationFailure {
  path: string;
  name: string;
  status: 'already-missing' | 'blocked';
  message: string;
}

type ValidationResult =
  | { candidate: { path: string; name: string } }
  | ValidationFailure;

interface CentralCopyResult {
  ok: true;
}

interface CentralCopyFailure {
  ok: false;
  message: string;
}

interface MigrationLockMetadata {
  token: string;
  pid: number;
  stagingPath: string;
}

interface MigrationLock {
  ok: true;
  path: string;
  stagingPath: string;
  token: string;
}

const MAX_FINGERPRINT_CONCURRENCY = 4;
const SKILL_NAME_REGEX = /^[A-Za-z0-9._-]{1,64}$/;
const MIGRATION_LOCK_STALE_AFTER_MS = 15_000;

/**
 * Finds exact duplicate skills in detected global tool roots and performs
 * safe, per-occurrence operations through the operating system trash.
 */
export class DuplicateService {
  constructor(private readonly deps: DuplicateServiceDependencies) {}

  async scan(): Promise<DuplicateScanResult> {
    const settings = this.deps.settingsService.get();
    const roots = this.deps.ideService.detectSkillRoots(settings.ideRootOverrides);
    const centralRoot = resolveSkillsRoot(settings.centralSkillsRoot);
    const candidates = await this.collectCandidates(roots, centralRoot);
    const byName = this.groupCandidatesByName(candidates);
    const duplicateNameCandidates = [...byName.values()]
      .filter((items) => items.length > 1)
      .flat();
    const fingerprinted = await this.fingerprintCandidates(duplicateNameCandidates);

    return {
      scannedAt: new Date().toISOString(),
      roots,
      groups: this.buildDuplicateGroups(fingerprinted),
    };
  }

  async removeOccurrences(paths: string[]): Promise<DuplicateOperationResult[]> {
    const uniquePaths = this.uniquePaths(paths);
    const { roots, centralRoot } = this.currentContext();

    return Promise.all(
      uniquePaths.map(async (candidatePath) => {
        const validation = this.validateOccurrence(candidatePath, roots, centralRoot);
        if ('status' in validation) {
          return this.operationResult('remove', validation);
        }

        try {
          await this.deps.trashItem(validation.candidate.path);
          return {
            action: 'remove' as const,
            path: validation.candidate.path,
            name: validation.candidate.name,
            status: 'trashed' as const,
          };
        } catch (error) {
          return {
            action: 'remove' as const,
            path: validation.candidate.path,
            name: validation.candidate.name,
            status: 'failed' as const,
            message: this.errorMessage(error),
          };
        }
      }),
    );
  }

  async migrateOccurrences(paths: string[]): Promise<DuplicateOperationResult[]> {
    const uniquePaths = this.uniquePaths(paths);
    const { roots, centralRoot } = this.currentContext();
    const resultsByPath = new Map<string, DuplicateOperationResult>();
    const candidates: ValidatedCandidate[] = [];

    for (const candidatePath of uniquePaths) {
      const validation = this.validateOccurrence(candidatePath, roots, centralRoot);
      if ('status' in validation) {
        resultsByPath.set(
          candidatePath,
          this.operationResult('migrate', validation, centralRoot),
        );
        continue;
      }

      const contentHash = await this.fingerprintDirectory(validation.candidate.path);
      if (!contentHash) {
        resultsByPath.set(candidatePath, {
          action: 'migrate',
          path: candidatePath,
          name: validation.candidate.name,
          status: 'blocked',
          message: 'Skill contents changed or contain a link/non-regular entry.',
          centralPath: this.safeCentralPath(centralRoot, validation.candidate.name),
        });
        continue;
      }

      candidates.push({
        path: validation.candidate.path,
        name: validation.candidate.name,
        contentHash,
        rootPaths: [],
        ideIds: [],
        ideNames: [],
      });
    }

    const groups = this.groupSelectedCandidates(candidates);
    for (const group of groups) {
      const centralPath = this.safeCentralPath(centralRoot, group.name);
      if (!centralPath) {
        for (const item of group.items) {
          resultsByPath.set(item.path, {
            action: 'migrate',
            path: item.path,
            name: item.name,
            status: 'blocked',
            message: 'Skill name is invalid for the central repository.',
          });
        }
        continue;
      }

      await this.migrateGroup(group, centralRoot, centralPath, resultsByPath);
    }

    return uniquePaths.map((candidatePath) => resultsByPath.get(candidatePath)!);
  }

  private async migrateGroup(
    group: { name: string; contentHash: string; items: ValidatedCandidate[] },
    centralRoot: string,
    centralPath: string,
    resultsByPath: Map<string, DuplicateOperationResult>,
  ): Promise<void> {
    const centralRootStatus = this.validateCentralRoot(centralRoot);
    if (!centralRootStatus.ok) {
      this.setMigrationFailures(group, centralRootStatus.message, centralPath, resultsByPath);
      return;
    }

    let skillService: SkillService;
    try {
      skillService = new SkillService(centralRoot);
    } catch (error) {
      this.setMigrationFailures(group, this.errorMessage(error), centralPath, resultsByPath);
      return;
    }

    const lockResult = await this.acquireMigrationLock(centralRoot, group.name);
    if (!lockResult.ok) {
      this.setMigrationFailures(group, lockResult.message, centralPath, resultsByPath);
      return;
    }

    try {
      const centralResult = await this.ensureCentralCopy(
        group,
        centralPath,
        skillService,
        lockResult,
      );
      if (!centralResult.ok) {
        this.setMigrationFailures(group, centralResult.message, centralPath, resultsByPath);
        return;
      }

      for (const item of group.items) {
        resultsByPath.set(item.path, await this.trashMigratedSource(item, centralPath));
      }
    } finally {
      await this.removeOwnedPath(lockResult.stagingPath);
      await this.releaseMigrationLock(lockResult);
    }
  }

  private setMigrationFailures(
    group: { items: ValidatedCandidate[] },
    message: string,
    centralPath: string,
    resultsByPath: Map<string, DuplicateOperationResult>,
  ): void {
    for (const item of group.items) {
      resultsByPath.set(item.path, {
        action: 'migrate',
        path: item.path,
        name: item.name,
        status: 'blocked',
        message,
        centralPath,
      });
    }
  }

  private currentContext(): { settings: AppSettings; roots: DetectedSkillRoot[]; centralRoot: string } {
    const settings = this.deps.settingsService.get();
    return {
      settings,
      roots: this.deps.ideService.detectSkillRoots(settings.ideRootOverrides),
      centralRoot: resolveSkillsRoot(settings.centralSkillsRoot),
    };
  }

  private async collectCandidates(roots: DetectedSkillRoot[], centralRoot: string): Promise<Candidate[]> {
    const byPath = new Map<string, Candidate>();

    for (const root of roots) {
      if (!(await this.isRealDirectoryAsync(root.root))) {
        continue;
      }

      let entries: fs.Dirent[];
      try {
        entries = await fs.promises.readdir(root.root, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        const candidatePath = path.resolve(root.root, entry.name);
        if (this.isWithinOrEqual(candidatePath, centralRoot) || !(await this.isSkillDirectory(candidatePath))) {
          continue;
        }

        const key = this.pathKey(candidatePath);
        const current = byPath.get(key);
        if (current) {
          this.addRootMetadata(current, root);
          continue;
        }

        byPath.set(key, {
          path: candidatePath,
          name: entry.name,
          rootPaths: [root.root],
          ideIds: [...root.ideIds],
          ideNames: [...root.ideNames],
        });
      }
    }

    return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
  }

  private groupCandidatesByName(candidates: Candidate[]): Map<string, Candidate[]> {
    const groups = new Map<string, Candidate[]>();
    for (const candidate of candidates) {
      const key = this.nameKey(candidate.name);
      const current = groups.get(key) || [];
      current.push(candidate);
      groups.set(key, current);
    }
    return groups;
  }

  private async fingerprintCandidates(candidates: Candidate[]): Promise<FingerprintedCandidate[]> {
    if (candidates.length === 0) {
      return [];
    }

    const fingerprinted: FingerprintedCandidate[] = [];
    let nextIndex = 0;
    const worker = async (): Promise<void> => {
      while (nextIndex < candidates.length) {
        const index = nextIndex;
        nextIndex += 1;
        const candidate = candidates[index];
        const contentHash = await this.fingerprintDirectory(candidate.path);
        if (contentHash) {
          fingerprinted.push({ ...candidate, contentHash });
        }
      }
    };

    const workerCount = Math.min(MAX_FINGERPRINT_CONCURRENCY, candidates.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    return fingerprinted;
  }

  private async fingerprintDirectory(directory: string): Promise<string | null> {
    const files = await this.collectRegularFiles(directory);
    if (!files) {
      return null;
    }

    try {
      const hash = crypto.createHash('sha256');
      for (const file of files) {
        const stat = await fs.promises.lstat(file.absolutePath);
        if (await this.isLinkEntryAsync(file.absolutePath, stat) || !stat.isFile()) {
          return null;
        }

        hash.update(`${file.relativePath}\0${stat.size}\0`);
        const stream = fs.createReadStream(file.absolutePath);
        for await (const chunk of stream) {
          hash.update(chunk as Buffer);
        }
      }
      return hash.digest('hex');
    } catch {
      return null;
    }
  }

  private async collectRegularFiles(directory: string): Promise<FingerprintFile[] | null> {
    const files: FingerprintFile[] = [];
    const visit = async (currentDirectory: string, relativeDirectory: string): Promise<boolean> => {
      let entries: fs.Dirent[];
      try {
        entries = await fs.promises.readdir(currentDirectory, { withFileTypes: true });
      } catch {
        return false;
      }

      entries.sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        const absolutePath = path.join(currentDirectory, entry.name);
        const relativePath = path.posix.join(relativeDirectory, entry.name);
        let stat: fs.Stats;
        try {
          stat = await fs.promises.lstat(absolutePath);
        } catch {
          return false;
        }

        if (await this.isLinkEntryAsync(absolutePath, stat)) {
          return false;
        }
        if (stat.isDirectory()) {
          if (!(await visit(absolutePath, relativePath))) {
            return false;
          }
        } else if (stat.isFile()) {
          files.push({ absolutePath, relativePath });
        } else {
          return false;
        }
      }
      return true;
    };

    return (await visit(directory, ''))
      ? files.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
      : null;
  }

  private buildDuplicateGroups(candidates: FingerprintedCandidate[]): DuplicateGroup[] {
    const groups = new Map<string, FingerprintedCandidate[]>();
    for (const candidate of candidates) {
      const key = `${this.nameKey(candidate.name)}\0${candidate.contentHash}`;
      const current = groups.get(key) || [];
      current.push(candidate);
      groups.set(key, current);
    }

    return [...groups.entries()]
      .filter(([, items]) => items.length >= 2)
      .map(([key, items]) => {
        const sortedItems = [...items].sort((a, b) => a.path.localeCompare(b.path));
        return {
          id: key,
          name: sortedItems[0].name,
          contentHash: sortedItems[0].contentHash,
          occurrences: sortedItems.map((item) => this.toOccurrence(item)),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name) || a.contentHash.localeCompare(b.contentHash));
  }

  private groupSelectedCandidates(candidates: ValidatedCandidate[]): Array<{
    name: string;
    contentHash: string;
    items: ValidatedCandidate[];
  }> {
    const groups = new Map<string, { name: string; contentHash: string; items: ValidatedCandidate[] }>();
    for (const candidate of candidates) {
      const key = `${this.nameKey(candidate.name)}\0${candidate.contentHash}`;
      const current = groups.get(key);
      if (current) {
        current.items.push(candidate);
      } else {
        groups.set(key, {
          name: candidate.name,
          contentHash: candidate.contentHash,
          items: [candidate],
        });
      }
    }
    return [...groups.values()];
  }

  private async ensureCentralCopy(
    group: { name: string; contentHash: string; items: ValidatedCandidate[] },
    centralPath: string,
    skillService: SkillService,
    lockResult: MigrationLock,
  ): Promise<CentralCopyResult | CentralCopyFailure> {
    try {
      const existing = this.readEntry(centralPath);
      if (existing.kind === 'error') {
        return { ok: false, message: existing.message };
      }
      if (existing.kind === 'exists') {
        return this.validateExistingCentral(group, centralPath, skillService);
      }

      await fs.promises.cp(group.items[0].path, lockResult.stagingPath, {
        recursive: true,
        dereference: false,
        errorOnExist: true,
        force: false,
      });

      const stagingHash = await this.fingerprintDirectory(lockResult.stagingPath);
      if (stagingHash !== group.contentHash) {
        return { ok: false, message: 'Central copy failed exact-content validation.' };
      }

      const stagingFrontmatterError = await this.validateStagedSkill(lockResult.stagingPath);
      if (stagingFrontmatterError) {
        return { ok: false, message: stagingFrontmatterError };
      }

      const racedCentral = this.readEntry(centralPath);
      if (racedCentral.kind === 'error') {
        return { ok: false, message: racedCentral.message };
      }
      if (racedCentral.kind === 'exists') {
        return this.validateExistingCentral(group, centralPath, skillService);
      }

      try {
        await fs.promises.rename(lockResult.stagingPath, centralPath);
      } catch (error) {
        if (!this.isAlreadyExistsError(error)) {
          throw error;
        }

        const centralAfterRace = this.readEntry(centralPath);
        if (centralAfterRace.kind === 'error') {
          return { ok: false, message: centralAfterRace.message };
        }
        if (centralAfterRace.kind === 'missing') {
          return { ok: false, message: 'Central skill path changed during migration. Retry the migration.' };
        }
        return this.validateExistingCentral(group, centralPath, skillService);
      }

      const centralValidation = await this.validateExistingCentral(group, centralPath, skillService);
      if (!centralValidation.ok) {
        const centralHash = await this.fingerprintDirectory(centralPath);
        if (centralHash === group.contentHash) {
          await this.removeOwnedPath(centralPath);
        }
      }
      return centralValidation;
    } catch (error) {
      return { ok: false, message: this.errorMessage(error) };
    }
  }

  private async acquireMigrationLock(
    centralRoot: string,
    name: string,
    retryAfterRecovery = true,
  ): Promise<MigrationLock | CentralCopyFailure> {
    const token = crypto.randomUUID();
    const lockPath = getSkillMigrationLockPath(centralRoot, name);
    const stagingPath = path.join(centralRoot, `.${name}.staging-${token}`);
    const metadata: MigrationLockMetadata = {
      token,
      pid: process.pid,
      stagingPath,
    };

    if (await this.hasMigrationReclaim(centralRoot, name)) {
      return { ok: false, message: 'Another central migration is recovering. Retry the migration.' };
    }

    try {
      await fs.promises.writeFile(lockPath, JSON.stringify(metadata), {
        encoding: 'utf8',
        flag: 'wx',
      });
      return { ok: true, path: lockPath, stagingPath, token };
    } catch (error) {
      if (!this.isAlreadyExistsError(error)) {
        return { ok: false, message: this.errorMessage(error) };
      }
      if (!retryAfterRecovery) {
        return { ok: false, message: 'Another central migration is in progress. Retry the migration.' };
      }

      const existing = await this.readMigrationLock(lockPath);
      if (existing && this.isProcessAlive(existing.pid)) {
        return { ok: false, message: 'Another central migration is in progress. Retry the migration.' };
      }
      if (!existing && !(await this.isStaleMigrationLock(lockPath))) {
        return { ok: false, message: 'Another central migration is initializing. Retry the migration.' };
      }

      const claimPath = await this.claimStaleMigrationLock(lockPath, centralRoot, name, existing);
      if (claimPath) {
        try {
          await fs.promises.writeFile(lockPath, JSON.stringify(metadata), {
            encoding: 'utf8',
            flag: 'wx',
          });
          return { ok: true, path: lockPath, stagingPath, token };
        } catch (handoffError) {
          if (!this.isAlreadyExistsError(handoffError)) {
            return { ok: false, message: this.errorMessage(handoffError) };
          }
        } finally {
          await this.removeOwnedPath(claimPath);
        }
      }
      return this.acquireMigrationLock(centralRoot, name, false);
    }
  }

  private async readMigrationLock(lockPath: string): Promise<MigrationLockMetadata | null> {
    try {
      const raw = await fs.promises.readFile(lockPath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        return null;
      }
      const metadata = parsed as Partial<MigrationLockMetadata>;
      if (
        typeof metadata.token !== 'string' ||
        typeof metadata.pid !== 'number' ||
        typeof metadata.stagingPath !== 'string'
      ) {
        return null;
      }
      return {
        token: metadata.token,
        pid: metadata.pid,
        stagingPath: metadata.stagingPath,
      };
    } catch {
      return null;
    }
  }

  private async isStaleMigrationLock(lockPath: string): Promise<boolean> {
    try {
      const stat = await fs.promises.lstat(lockPath);
      return Date.now() - stat.mtimeMs >= MIGRATION_LOCK_STALE_AFTER_MS;
    } catch (error) {
      return this.isMissingError(error);
    }
  }

  private async claimStaleMigrationLock(
    lockPath: string,
    centralRoot: string,
    name: string,
    expected: MigrationLockMetadata | null,
  ): Promise<string | null> {
    const claimPath = path.join(
      centralRoot,
      `.${name}.migration.reclaim-${crypto.randomUUID()}`,
    );

    try {
      await fs.promises.rename(lockPath, claimPath);
    } catch (error) {
      if (this.isMissingError(error)) {
        return null;
      }
      return null;
    }

    let keepClaim = false;
    try {
      const claimed = await this.readMigrationLock(claimPath);
      const replacedSinceObservation = Boolean(
        expected && (!claimed || claimed.token !== expected.token),
      );
      const claimedByLiveProcess = Boolean(claimed && this.isProcessAlive(claimed.pid));

      if (replacedSinceObservation || claimedByLiveProcess) {
        keepClaim = !(await this.restoreClaimedLock(claimPath, lockPath));
        return null;
      }

      if (claimed && this.isOwnedStagingPath(claimed.stagingPath, centralRoot, name)) {
        await this.removeOwnedPath(claimed.stagingPath);
      }
      keepClaim = true;
      return claimPath;
    } finally {
      if (!keepClaim) {
        await this.removeOwnedPath(claimPath);
      }
    }
  }

  private async hasMigrationReclaim(centralRoot: string, name: string): Promise<boolean> {
    const prefix = `.${name}.migration.reclaim-`;
    try {
      const entries = await fs.promises.readdir(centralRoot, { withFileTypes: true });
      return entries.some((entry) => entry.name.startsWith(prefix));
    } catch (error) {
      return !this.isMissingError(error);
    }
  }

  private async restoreClaimedLock(claimPath: string, lockPath: string): Promise<boolean> {
    try {
      await fs.promises.link(claimPath, lockPath);
      return true;
    } catch (error) {
      if (this.isAlreadyExistsError(error)) {
        return true;
      }

      const current = this.readEntry(lockPath);
      if (current.kind !== 'missing') {
        return false;
      }

      try {
        await fs.promises.rename(claimPath, lockPath);
        return true;
      } catch {
        return false;
      }
    }
  }

  private isProcessAlive(pid: number): boolean {
    if (!Number.isInteger(pid) || pid <= 0) {
      return false;
    }
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return this.errorCode(error) === 'EPERM';
    }
  }

  private isOwnedStagingPath(stagingPath: string, centralRoot: string, name: string): boolean {
    const resolvedStagingPath = path.resolve(stagingPath);
    return (
      this.pathKey(path.dirname(resolvedStagingPath)) === this.pathKey(centralRoot) &&
      path.basename(resolvedStagingPath).startsWith(`.${name}.staging-`)
    );
  }

  private async releaseMigrationLock(lock: MigrationLock): Promise<void> {
    const metadata = await this.readMigrationLock(lock.path);
    if (metadata?.token !== lock.token) {
      return;
    }
    await this.removeOwnedPath(lock.path);
  }

  private async validateStagedSkill(stagingPath: string): Promise<string | null> {
    const skillMdPath = path.join(stagingPath, 'SKILL.md');
    try {
      const stat = await fs.promises.lstat(skillMdPath);
      if (await this.isLinkEntryAsync(skillMdPath, stat) || !stat.isFile()) {
        return 'Central copy has invalid or missing SKILL.md frontmatter.';
      }

      const content = await fs.promises.readFile(skillMdPath, 'utf8');
      const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      if (!/^---\n[\s\S]*?\n---/.test(normalizedContent)) {
        return 'Central copy has invalid or missing SKILL.md frontmatter.';
      }
      return null;
    } catch (error) {
      return this.errorMessage(error);
    }
  }

  private async validateExistingCentral(
    group: { name: string; contentHash: string },
    centralPath: string,
    skillService: SkillService,
  ): Promise<CentralCopyResult | CentralCopyFailure> {
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(centralPath);
    } catch (error) {
      return { ok: false, message: this.errorMessage(error) };
    }
    if (this.isLinkEntry(centralPath, stat) || !stat.isDirectory()) {
      return { ok: false, message: 'Central skill path is not a real directory.' };
    }

    const centralHash = await this.fingerprintDirectory(centralPath);
    if (!centralHash || centralHash !== group.contentHash) {
      return { ok: false, message: 'Central skill has different or unreadable content.' };
    }

    try {
      if (!skillService.get(group.name)) {
        return { ok: false, message: 'Central skill has invalid or missing SKILL.md frontmatter.' };
      }
    } catch (error) {
      return { ok: false, message: this.errorMessage(error) };
    }

    return { ok: true };
  }

  private async trashMigratedSource(
    item: ValidatedCandidate,
    centralPath: string,
  ): Promise<DuplicateOperationResult> {
    try {
      await this.deps.trashItem(item.path);
      return {
        action: 'migrate',
        path: item.path,
        name: item.name,
        status: 'migrated',
        centralPath,
      };
    } catch (error) {
      return {
        action: 'migrate',
        path: item.path,
        name: item.name,
        status: 'failed',
        message: this.errorMessage(error),
        centralPath,
      };
    }
  }

  private validateOccurrence(
    candidatePath: string,
    roots: DetectedSkillRoot[],
    centralRoot: string,
  ): ValidationResult {
    const absolutePath = path.resolve(path.normalize(candidatePath));
    const name = path.basename(absolutePath);
    const matchingRoot = roots.find(
      (root) => this.pathKey(path.dirname(absolutePath)) === this.pathKey(root.root),
    );

    if (!matchingRoot || !this.isRealDirectory(matchingRoot.root)) {
      return {
        path: absolutePath,
        name,
        status: 'blocked',
        message: 'Path is not a direct child of a currently detected skill root.',
      };
    }
    if (this.isWithinOrEqual(absolutePath, centralRoot)) {
      return {
        path: absolutePath,
        name,
        status: 'blocked',
        message: 'Central Skills Manager paths cannot be operated on here.',
      };
    }

    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(absolutePath);
    } catch (error) {
      if (this.isMissingError(error)) {
        return {
          path: absolutePath,
          name,
          status: 'already-missing',
          message: 'Skill occurrence no longer exists.',
        };
      }
      return {
        path: absolutePath,
        name,
        status: 'blocked',
        message: this.errorMessage(error),
      };
    }

    if (this.isLinkEntry(absolutePath, stat) || !stat.isDirectory()) {
      return {
        path: absolutePath,
        name,
        status: 'blocked',
        message: 'Only real skill directories can be operated on.',
      };
    }

    const skillMdPath = this.findExactSkillMdPath(absolutePath);
    if (!skillMdPath) {
      return {
        path: absolutePath,
        name,
        status: 'blocked',
        message: 'Skill directory does not contain an exact SKILL.md file.',
      };
    }

    let skillMdStat: fs.Stats;
    try {
      skillMdStat = fs.lstatSync(skillMdPath);
    } catch (error) {
      return {
        path: absolutePath,
        name,
        status: 'blocked',
        message: this.isMissingError(error)
          ? 'Skill directory does not contain an exact SKILL.md file.'
          : this.errorMessage(error),
      };
    }
    if (this.isLinkEntry(skillMdPath, skillMdStat) || !skillMdStat.isFile()) {
      return {
        path: absolutePath,
        name,
        status: 'blocked',
        message: 'Skill directory does not contain a real SKILL.md file.',
      };
    }

    return { candidate: { path: absolutePath, name } };
  }

  private operationResult(
    action: 'remove' | 'migrate',
    failure: ValidationFailure,
    centralRoot?: string,
  ): DuplicateOperationResult {
    return {
      action,
      path: failure.path,
      name: failure.name,
      status: failure.status,
      message: failure.message,
      ...(centralRoot ? { centralPath: this.safeCentralPath(centralRoot, failure.name) } : {}),
    };
  }

  private toOccurrence(candidate: FingerprintedCandidate): DuplicateOccurrence {
    return {
      path: candidate.path,
      name: candidate.name,
      contentHash: candidate.contentHash,
      rootPaths: [...candidate.rootPaths].sort((a, b) => a.localeCompare(b)),
      ideIds: [...candidate.ideIds].sort(),
      ideNames: [...candidate.ideNames].sort((a, b) => a.localeCompare(b)),
    };
  }

  private addRootMetadata(candidate: Candidate, root: DetectedSkillRoot): void {
    if (!candidate.rootPaths.some((rootPath) => this.pathKey(rootPath) === this.pathKey(root.root))) {
      candidate.rootPaths.push(root.root);
    }
    for (const ideId of root.ideIds) {
      if (!candidate.ideIds.includes(ideId)) candidate.ideIds.push(ideId);
    }
    for (const ideName of root.ideNames) {
      if (!candidate.ideNames.includes(ideName)) candidate.ideNames.push(ideName);
    }
  }

  private async isSkillDirectory(candidatePath: string): Promise<boolean> {
    let stat: fs.Stats;
    try {
      stat = await fs.promises.lstat(candidatePath);
    } catch {
      return false;
    }
    if (await this.isLinkEntryAsync(candidatePath, stat) || !stat.isDirectory()) {
      return false;
    }

    const skillMdPath = await this.findExactSkillMdPathAsync(candidatePath);
    if (!skillMdPath) return false;

    try {
      const skillMdStat = await fs.promises.lstat(skillMdPath);
      return !(await this.isLinkEntryAsync(skillMdPath, skillMdStat)) && skillMdStat.isFile();
    } catch {
      return false;
    }
  }

  private findExactSkillMdPath(directory: string): string | null {
    try {
      const entries = fs.readdirSync(directory, { withFileTypes: true });
      const skillMdEntry = entries.find((entry) => entry.name === 'SKILL.md');
      return skillMdEntry ? path.join(directory, skillMdEntry.name) : null;
    } catch {
      return null;
    }
  }

  private async findExactSkillMdPathAsync(directory: string): Promise<string | null> {
    try {
      const entries = await fs.promises.readdir(directory, { withFileTypes: true });
      const skillMdEntry = entries.find((entry) => entry.name === 'SKILL.md');
      return skillMdEntry ? path.join(directory, skillMdEntry.name) : null;
    } catch {
      return null;
    }
  }

  private isRealDirectory(directory: string): boolean {
    try {
      const stat = fs.lstatSync(directory);
      return !this.isLinkEntry(directory, stat) && stat.isDirectory();
    } catch {
      return false;
    }
  }

  private async isRealDirectoryAsync(directory: string): Promise<boolean> {
    try {
      const stat = await fs.promises.lstat(directory);
      return !(await this.isLinkEntryAsync(directory, stat)) && stat.isDirectory();
    } catch {
      return false;
    }
  }

  private validateCentralRoot(centralRoot: string): CentralCopyResult | CentralCopyFailure {
    try {
      const stat = fs.lstatSync(centralRoot);
      if (this.isLinkEntry(centralRoot, stat) || !stat.isDirectory()) {
        return { ok: false, message: 'Central skills root must be a real directory.' };
      }
    } catch (error) {
      if (!this.isMissingError(error)) {
        return { ok: false, message: this.errorMessage(error) };
      }
    }
    return { ok: true };
  }

  private readEntry(targetPath: string):
    | { kind: 'missing' }
    | { kind: 'exists' }
    | { kind: 'error'; message: string } {
    try {
      fs.lstatSync(targetPath);
      return { kind: 'exists' };
    } catch (error) {
      return this.isMissingError(error)
        ? { kind: 'missing' }
        : { kind: 'error', message: this.errorMessage(error) };
    }
  }

  private async removeOwnedPath(targetPath: string): Promise<void> {
    try {
      await fs.promises.rm(targetPath, { recursive: true, force: true });
    } catch {
      // Cleanup failure must not turn a safe blocked result into source deletion.
    }
  }

  private safeCentralPath(centralRoot: string, name: string): string | undefined {
    if (!this.isValidSkillName(name)) {
      return undefined;
    }
    return path.join(centralRoot, name);
  }

  private isValidSkillName(name: string): boolean {
    return (
      name === name.trim() &&
      SKILL_NAME_REGEX.test(name) &&
      name !== '.' &&
      name !== '..' &&
      !name.includes('/') &&
      !name.includes('\\')
    );
  }

  private uniquePaths(paths: string[]): string[] {
    const unique: string[] = [];
    const keys = new Set<string>();
    for (const candidatePath of paths) {
      if (typeof candidatePath !== 'string') continue;
      const absolutePath = path.resolve(path.normalize(candidatePath));
      const key = this.pathKey(absolutePath);
      if (keys.has(key)) continue;
      keys.add(key);
      unique.push(absolutePath);
    }
    return unique;
  }

  private isWithinOrEqual(child: string, parent: string): boolean {
    const relative = path.relative(this.pathKey(parent), this.pathKey(child));
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  }

  private pathKey(value: string): string {
    const normalized = path.resolve(path.normalize(value));
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
  }

  private nameKey(name: string): string {
    return process.platform === 'win32' ? name.toLowerCase() : name;
  }

  private isLinkEntry(targetPath: string, stat?: fs.Stats): boolean {
    try {
      const entryStat = stat || fs.lstatSync(targetPath);
      if (entryStat.isSymbolicLink()) {
        return true;
      }
      if (process.platform === 'win32' && entryStat.isDirectory()) {
        try {
          fs.readlinkSync(targetPath);
          return true;
        } catch {
          return false;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  private async isLinkEntryAsync(targetPath: string, stat?: fs.Stats): Promise<boolean> {
    try {
      const entryStat = stat || await fs.promises.lstat(targetPath);
      if (entryStat.isSymbolicLink()) {
        return true;
      }
      if (process.platform === 'win32' && entryStat.isDirectory()) {
        try {
          await fs.promises.readlink(targetPath);
          return true;
        } catch {
          return false;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  private isMissingError(error: unknown): boolean {
    const code = this.errorCode(error);
    return code === 'ENOENT' || code === 'ENOTDIR';
  }

  private isAlreadyExistsError(error: unknown): boolean {
    return this.errorCode(error) === 'EEXIST';
  }

  private errorCode(error: unknown): string | undefined {
    return error && typeof error === 'object' && 'code' in error
      ? (error as { code?: string }).code
      : undefined;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}

export type { DuplicateServiceDependencies };
