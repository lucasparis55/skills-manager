---
description: Run one approved phase through implement, review, fix, and orchestration validation
agent: orchestrator
subtask: false
---

Read @AGENTS.md.

Run exactly one approved phase.
Phase hint: $ARGUMENTS
Use the approved plan in context as the source of truth.

Execution order:
1. delegate implementation of this phase to `implement`
2. delegate review of that result to `review`
3. if review reports findings, delegate only those findings to `fix-issues`
4. re-run `review` until it reports `No pending findings.`
5. validate final alignment to the approved plan yourself without editing
6. only then mark the phase ready for the next phase

Guardrails:
- never skip review
- never skip the fix cycle when findings exist
- never advance with pending findings
- never mix phases
- never expand scope without explicit approval
- never write code, review code, or fix code yourself
