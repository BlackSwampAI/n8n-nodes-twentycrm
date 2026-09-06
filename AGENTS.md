# Orchestrator and builder workflow

## Roles

- The human user and primary Codex agent are co-orchestrators. The user controls the primary agent's model and reasoning settings and performs final pull-request review and merge.
- Use exactly one implementation sub-agent named `builder`, configured in `.codex/agents/builder.toml` for `gpt-5.6-sol` with low reasoning effort.
- The builder implements one bounded assignment at a time. The primary agent owns requirements, coordination, diff review, and user-facing reporting.

## Delegation contract

- Do not spawn a builder for questions, status inspection, or planning discussion.
- For concrete implementation work, give the builder the user's scope, constraints, acceptance criteria, and requested verification without broadening them.
- Do not add more agents or recursively delegate unless the user explicitly changes this workflow.
- Ask the user before choices that materially alter scope, dependencies, public APIs, release behavior, or external state.

## Repository safeguards

- Preserve unrelated worktree changes. Do not publish, tag, push, create releases, open pull requests, or merge unless explicitly authorized.
- At the start of implementation, verify the expected branch with `git status --short --branch`. If it differs from the assignment, stop before editing and report it.
- Treat the assignment's allowed files as an allowlist. Review `git diff --name-only` before handoff.
- Send a concise checkpoint before a command or investigation can leave the user without an update for 60 seconds. Bound unsupported browser, Docker, and external-tool attempts.
- Automated tests are TypeScript `*.test.ts` files run with Vitest. Reserve `.mjs` for genuine direct-execution operational or release tooling.
- Keep `n8n-workflow` host-provided and avoid runtime dependencies. Use package scripts for format, lint, strict production/test typecheck, tests, build, scanner, and package checks.
- Follow `RELEASING.md`; the user authorizes releases and performs final review and merge.
- Before release, require builder verification, orchestrator diff review, packed-package load/install smoke, representative real-n8n smoke, official scanner preflight, and explicit user authorization.
- This repository does not inherit later GitHub template changes. Review `docs/TEMPLATE_MIGRATIONS.md` and update `.blackswamp/template.json` only after adopting and validating applicable changes.
