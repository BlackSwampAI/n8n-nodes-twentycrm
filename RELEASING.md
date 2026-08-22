# Releasing `@blackswampai/n8n-nodes-twentycrm`

This repository publishes only from `.github/workflows/publish.yml` after an explicitly authorized `v*.*.*` tag push. Do not run `npm publish` locally. For the already-versioned first release, do not run the interactive local `npm run release`; GitHub Actions runs it once as the publish action.

PR 14 prepares and audits release infrastructure only. It does not authorize a tag, npm publication, GitHub release, Trusted Publisher change, token/secret creation, or Creator Portal submission.

## Release candidate gate

Run on the exact candidate commit:

```sh
npm ci
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run release:check
npm run package:check
npm run smoke:load
npm run smoke:install
git diff --check
```

`smoke:install` packs the candidate, installs that tarball into an isolated temporary consumer without installing the host-provided `n8n-workflow` peer, and loads both nodes and credentials from the installed package. Complete the pinned live qualification and bounded n8n UI checklist separately when the release checklist requires them.

## First-publication prerequisites

Immediately before requesting tag authorization:

1. Confirm the release commit is on `main`, CI is green, the worktree is clean, and package version is exactly `0.1.0`.
2. Recheck that npm still returns E404 for the exact name `@blackswampai/n8n-nodes-twentycrm`; an unpublished name is not reserved.
3. Confirm the maintainer can create a public package in the BlackSwampAI npm organization.
4. Create a short-lived granular npm token with bypass 2FA and only the access required to create/publish this public package. Do not place it in a shell command, local npm configuration, repository file, issue, or log.
5. Store the token only as the GitHub Actions secret `NPM_TOKEN`.

npm cannot configure a Trusted Publisher until the package exists. The bootstrap token is temporary; provenance still comes from the GitHub-hosted publish workflow.

## Authorized tag and Actions publication

Only after explicit owner authorization, create and push an annotated `v0.1.0` tag pointing to the approved release commit. Tags are immutable release coordinates and must never be moved or reused.

The tag starts `publish.yml`, which uses GitHub-hosted Ubuntu, Node 24, npm 11.5.1 or newer, frozen `npm ci`, the complete offline release gate, and least-privilege `contents: read` plus `id-token: write`. Its single irreversible publish action is `npm run release`; `@n8n/node-cli` performs its CI release and npm provenance publication. The temporary secret is mapped directly to `NODE_AUTH_TOKEN` and is never written by workflow shell commands.

After Actions succeeds, verify the exact registry version, `latest` dist-tag, public access, package contents, and npm provenance/attestation. Do not infer success from a green workflow alone.

## GitHub release

Creating the matching GitHub release is a separate external mutation and requires separate owner authorization after registry/provenance verification.

## Migrate to Trusted Publisher

After `0.1.0` exists on npm, configure npm Trusted Publishing with:

- Provider: GitHub Actions
- Repository owner: `BlackSwampAI`
- Repository name: `n8n-nodes-twentycrm`
- Workflow filename: `publish.yml`
- Environment: blank
- Allowed action: `npm publish`

Then delete the GitHub Actions secret `NPM_TOKEN` and revoke the temporary granular token. Later tag-triggered releases use OIDC with the same workflow and no npm secret.

## Creator Portal

n8n Creator Portal submission is not part of publication. Prepare and submit it only with separate owner authorization after npm publication and release verification.
