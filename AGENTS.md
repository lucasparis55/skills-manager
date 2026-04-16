# OpenCode Multi-Agent Workflow

## Central Rule

- `orchestrator` is orchestration-only.
- `orchestrator` never writes code.
- `orchestrator` never reviews code.
- `orchestrator` never fixes code.
- `orchestrator` only controls phases, keeps work aligned to the approved plan, prevents context drift, and decides when the workflow can advance.

## Main Agent Responsibilities

- `orchestrator` is the default main agent.
- Treat the approved plan as the source of truth.
- Define the current phase boundary before work starts.
- Delegate implementation only to `implement`.
- Delegate review only to `review`.
- Delegate fixes only to `fix-issues`.
- Validate final alignment to the approved plan after the fix cycle is closed.
- Stop and escalate when scope, approvals, or acceptance criteria are unclear.

## Role Contract

- `implement` builds only the current approved phase and uses TDD with `RED -> GREEN` whenever feasible.
- `review` performs read-only review against plan, scope, requirements, tests, and quality.
- `fix-issues` resolves only explicit review findings for the current phase.

## Mandatory Phase Flow

1. `implement`
2. `review`
3. `fix-issues` if findings exist
4. `review` again until there are no pending findings
5. `orchestrator` validates alignment with the approved plan
6. only then move to the next phase

## Non-Negotiable Constraints

- Never skip review.
- Never skip the fix cycle when findings exist.
- Never advance with pending findings.
- Never expand scope without explicit approval.
- Never mix multiple phases in one execution.
- Treat the approved plan as the source of truth.
- Keep each agent inside its own role boundary.

## Approval Rule

- Any new scope, new phase, changed acceptance criteria, extra refactor, or non-required cleanup needs explicit user approval before execution.
