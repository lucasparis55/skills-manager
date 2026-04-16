---
description: Run read-only review for the current phase against plan and scope
agent: review
subtask: true
---

Read @AGENTS.md.

Review only the current phase output against the approved plan in context.
Check scope drift, requirements coverage, tests, regressions, and code quality.
Do not edit files.

Return only actionable findings with severity, reference, impact, and exact fix target.
If nothing actionable remains, say exactly: `No pending findings.`
