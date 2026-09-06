## Scope

- [ ] This PR implements one bounded outcome and does not include unrelated cleanup.
- [ ] Dependencies, public API changes, and release-strategy changes were explicitly approved.
- [ ] `git diff --name-only` matches the assignment's allowed-file list.

## Evidence

- [ ] Required operation controls and blank/default-state behavior are covered.
- [ ] Resource locators are tested with manual strings and list-mode objects where applicable.
- [ ] Twenty claims distinguish public contract, human documentation, and observed behavior.
- [ ] Live fixtures, if any, are target-guarded, exact-owned, and assert cleanup.

## Validation

- [ ] Format, lint, strict production/test typecheck, and Vitest pass.
- [ ] Build and official source/built scanner preflight pass.
- [ ] Package boundary and compiled-registration load/install smokes pass.
- [ ] User-visible behavior was inspected in disposable n8n where practical; limitations are stated.

## Safety

- [ ] No secrets, production data, publication, tag, release, or unrelated external mutation occurred.
- [ ] Destructive behavior is exact-targeted and does not retry implicitly.
