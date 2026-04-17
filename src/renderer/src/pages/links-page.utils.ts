export const buildIdeCounts = (links: Array<{ ideName: string }>): Record<string, number> => {
  const counts: Record<string, number> = {};
  links.forEach((link) => {
    counts[link.ideName] = (counts[link.ideName] || 0) + 1;
  });
  return counts;
};

export const reconcileSelectedIds = (
  selectedIds: Set<string>,
  visibleLinkIds: string[],
): Set<string> => {
  const visibleSet = new Set(visibleLinkIds);
  let changed = false;
  const next = new Set<string>();

  for (const id of selectedIds) {
    if (visibleSet.has(id)) {
      next.add(id);
    } else {
      changed = true;
    }
  }

  return changed ? next : selectedIds;
};

