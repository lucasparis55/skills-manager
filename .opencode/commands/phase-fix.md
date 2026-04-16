---
description: Fix only the active review findings for the current phase
agent: fix-issues
subtask: true
---

Read @AGENTS.md.

Resolve only the explicit review findings currently in context.
Do not add extra refactors, cleanup, or new scope.
Update or add tests only when needed to lock the fixes.
Run relevant tests.

Return resolved findings, changed files, tests run, and any blocker that still requires review.
