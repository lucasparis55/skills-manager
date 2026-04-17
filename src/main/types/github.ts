/**
 * Type definitions for GitHub skill import feature
 */

/** Parsed components of a GitHub repository URL */
export interface ParsedGitHubRepo {
  owner: string;
  repo: string;
  branch: string;
  subpath?: string;
}

/** Repository metadata from GitHub API */
export interface GitHubRepoInfo {
  name: string;
  fullName: string;
  description: string;
  defaultBranch: string;
  isPrivate: boolean;
  htmlUrl: string;
  starsCount: number;
}

/** Entry from GitHub git/trees API */
export interface GitHubTreeEntry {
  path: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
}

/** Detected skill structure type */
export type SkillStructure = 'folder-per-skill' | 'single-skill' | 'non-standard';

/** A skill detected within a GitHub repository */
export interface DetectedSkill {
  name: string;
  displayName: string;
  description: string;
  sourcePath: string;
  hasSkillMd: boolean;
  fileCount: number;
  files: GitHubTreeEntry[];
  structure: SkillStructure;
  repoInfo: GitHubRepoInfo;
}

/** How to resolve a name conflict during import */
export interface ConflictResolution {
  strategy: 'skip' | 'rename' | 'overwrite';
  newName?: string;
}

/** Result of importing a single skill */
export interface ImportResult {
  skillName: string;
  status: 'imported' | 'skipped' | 'renamed' | 'error';
  error?: string;
  originalName?: string;
}

/** Progress update during batch import */
export interface ImportProgress {
  current: number;
  total: number;
  currentSkillName: string;
  phase: 'fetching' | 'writing';
  percentComplete: number;
}

/** Typed error from GitHub API interactions */
export interface GitHubApiError {
  status: number;
  message: string;
  isRateLimit: boolean;
  rateLimitReset?: number;
  rateLimitRemaining?: number;
}

/** File entry for bulk skill import */
export interface ImportFileEntry {
  path: string;
  content: string;
}

/** Response from GitHub repo analysis */
export interface AnalyzeResult {
  repoInfo: GitHubRepoInfo;
  skills: DetectedSkill[];
}
