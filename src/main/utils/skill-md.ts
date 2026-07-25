/**
 * True only for paths whose final segment is exactly SKILL.md.
 */
export function isSkillMdPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  return normalized === 'SKILL.md' || normalized.endsWith('/SKILL.md');
}

/**
 * Assign each file to the deepest skill directory whose prefix matches.
 * Root skill (`''`) sorts last and only receives files not claimed by a deeper dir.
 */
export function assignFilesToDeepestSkill<T extends { path: string }>(
  skillDirs: string[],
  allFiles: T[],
): Map<string, T[]> {
  const sorted = [...skillDirs].sort((a, b) => b.length - a.length);
  const assigned = new Map<string, T[]>();
  for (const dir of sorted) {
    assigned.set(dir, []);
  }

  for (const file of allFiles) {
    const owner = sorted.find((dir) =>
      dir === '' ? true : file.path === dir || file.path.startsWith(`${dir}/`),
    );
    if (owner !== undefined) {
      assigned.get(owner)!.push(file);
    }
  }
  return assigned;
}
