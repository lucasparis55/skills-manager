import { describe, it, expect } from 'vitest';
import { buildIdeCounts, reconcileSelectedIds } from './links-page.utils';

describe('links-page utils', () => {
  it('should build IDE counts keyed by ide id', () => {
    const counts = buildIdeCounts([
      { ideName: 'codex-cli' },
      { ideName: 'cursor' },
      { ideName: 'codex-cli' },
    ]);

    expect(counts).toEqual({
      'codex-cli': 2,
      'cursor': 1,
    });
  });

  it('should reconcile selected ids to currently visible link ids', () => {
    const selected = new Set(['a', 'b', 'c']);
    const reconciled = reconcileSelectedIds(selected, ['b', 'c', 'd']);

    expect(Array.from(reconciled).sort()).toEqual(['b', 'c']);
  });

  it('should return the same selection set when nothing changed', () => {
    const selected = new Set(['a', 'b']);
    const reconciled = reconcileSelectedIds(selected, ['a', 'b', 'c']);

    expect(reconciled).toBe(selected);
  });
});

