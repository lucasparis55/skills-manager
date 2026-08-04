# ADR-001: Keep integration links inside canonical skills roots

## Status

Accepted

## Date

2026-08-04

## Context

Some integrations expose a broad global configuration directory while skills
belong in a product-specific `skills` subdirectory. Creating links directly in
the broad directory mixes skills with unrelated configuration and can leave
the integration in an ambiguous state. Existing links may already use those
legacy locations.

The application must preserve the real skill content, avoid overwriting user
files or directories, and give the user explicit control over any migration.

## Decision

Global skill links use the first `skillRootTemplates` entry for each
integration. A custom global-root override is treated as a parent root unless
it already ends in `skills`; the effective destination is always inside its
`skills` subdirectory. Project-relative destinations continue to use the
integration's project-specific convention.

Existing persisted global links can be reviewed and migrated from Settings.
Migration is opt-in and follows this sequence:

1. Preview only links persisted by the application.
2. Require the current destination to be a symlink or junction pointing to the
   persisted skill source.
3. Report conflicts and unsafe entries without changing them.
4. Create the canonical destination exclusively, persist the new destination,
   and remove the old managed link only after creation succeeds.
5. Roll back the persisted destination and newly created link when a later
   step fails.

## Alternatives Considered

### Scan and migrate every symlink under integration roots

Rejected because a filesystem symlink alone does not establish ownership by
the application. This could remove user-managed links or expose unrelated
artifacts to migration.

### Replace existing canonical destinations during migration

Rejected because it could overwrite real directories, files, or links created
outside the application. Conflicts are reported and skipped instead.

### Move or copy the real skill directories

Rejected because the central skill content is the source of truth. Migration
only changes link entries and the persisted link metadata.

## Consequences

- New global installs for Codex CLI, Codex Desktop, Cursor, and other
  integrations stay inside their configured `skills` roots.
- Settings provides a preview and confirmation step for legacy global links.
- Conflicts and links that no longer match their persisted source remain for
  manual resolution.
- A small amount of empty parent-directory cleanup may be left to the user;
  migration never removes real directories automatically.
