import { describe, expect, it } from 'vitest';
import type { ImportComponent } from '../../../../main/types/import';
import {
  getBulkSelectableComponents,
  getDefaultSelection,
  getInventoryGroups,
  getInventoryKindLabel,
  isTechnicalComponent,
} from './github-import-inventory.utils';

const makeComponent = (kind: ImportComponent['kind'], id: string): ImportComponent => ({
  id,
  kind,
  name: id,
  displayName: id,
  description: '',
  sourcePath: id,
  files: [{ path: id, sha: id, type: 'blob' }],
  dependencies: [],
  risk: kind === 'hook' || kind === 'script' ? 'high' : 'low',
  hasExecutableFiles: kind === 'hook' || kind === 'script',
  requiresActivation: kind === 'hook',
  events: kind === 'hook' ? ['SessionStart'] : [],
  nativeTargets: ['claude-code'],
  metadata: {},
});

describe('github import inventory helpers', () => {
  it('groups install choices separately from technical support files', () => {
    const components = [
      makeComponent('skill', 'skill:impeccable'),
      makeComponent('command', 'command:polish'),
      makeComponent('command', 'command:audit'),
      makeComponent('agent', 'agent:producer'),
      makeComponent('hook', 'hook:design'),
      makeComponent('reference', 'reference:readme'),
      makeComponent('script', 'script:hook'),
      makeComponent('config', 'config:settings'),
      makeComponent('asset', 'asset:logo'),
      makeComponent('bundle', 'bundle:plugin'),
    ];

    expect(getInventoryGroups(components).map((group) => [group.id, group.components.length])).toEqual([
      ['skills', 1],
      ['commands', 2],
      ['agents', 1],
      ['hooks', 1],
      ['bundles', 1],
      ['technical', 4],
    ]);
    expect(isTechnicalComponent(makeComponent('reference', 'reference:readme'))).toBe(true);
    expect(isTechnicalComponent(makeComponent('command', 'command:polish'))).toBe(false);
  });

  it('selects only skills as the safe default', () => {
    expect(getDefaultSelection(makeComponent('skill', 'skill:impeccable'))).toBe(true);
    expect(getDefaultSelection(makeComponent('command', 'command:polish'))).toBe(false);
    expect(getDefaultSelection(makeComponent('hook', 'hook:design'))).toBe(false);
    expect(getDefaultSelection(makeComponent('bundle', 'bundle:plugin'))).toBe(false);
    expect(getDefaultSelection(makeComponent('script', 'script:hook'))).toBe(false);
  });

  it('selects all primary choices without selecting technical files or bundles', () => {
    const components = [
      makeComponent('skill', 'skill:impeccable'),
      makeComponent('command', 'command:polish'),
      makeComponent('hook', 'hook:design'),
      makeComponent('manual-step', 'manual:install'),
      makeComponent('reference', 'reference:readme'),
      makeComponent('script', 'script:hook'),
      makeComponent('bundle', 'bundle:plugin'),
    ];

    expect(getBulkSelectableComponents(components).map((component) => component.id)).toEqual([
      'skill:impeccable',
      'command:polish',
      'hook:design',
      'manual:install',
    ]);
  });

  it('uses plain-language explanations for technical kind labels', () => {
    expect(getInventoryKindLabel('skill')).toBe('Skill');
    expect(getInventoryKindLabel('hook')).toBe('Hook');
    expect(getInventoryKindLabel('reference')).toBe('Support file');
  });
});
