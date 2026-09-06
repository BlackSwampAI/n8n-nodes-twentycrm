# Builder batch handoff

Copy this checklist into a bounded builder assignment and replace every bracketed prompt before use.

## Scope

- Goal: `[one independently reviewable outcome]`
- Allowed files: `[explicit allowlist]`
- Non-goals: `[operations, dependencies, architecture, and external actions excluded]`
- Escalate before: dependencies, public API changes, architecture changes, release actions, or scope expansion.

## Evidence and tests

- Compare current Twenty documentation, workspace-generated contracts, and pinned live behavior for affected surfaces.
- Test actual n8n parameter shapes, including expressions and list/manual resource-locator values.
- Ensure required controls are visible and marked required for every affected operation.
- Prove invalid blank/default state fails locally before transport when it cannot form a valid request.
- Use exact, run-owned live fixtures with fail-closed target guards and cleanup assertions. Never sweep by prefix.

## Handoff

- Summary and files changed
- Contract/runtime discrepancies
- Commands and exact results
- Package or UI smoke evidence, clearly distinguished from metadata inference
- Cleanup status, limitations, risks, and decisions still needed
- `git diff --check` and allowed-file review result
