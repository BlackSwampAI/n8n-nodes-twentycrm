# Releasing `@blackswampai/n8n-nodes-twentycrm`

This repository publishes only from `.github/workflows/publish.yml` on a `v*.*.*` tag. Never run `npm publish` locally for a version intended for n8n verification.

## Release gate

Before creating a tag, run:

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

`smoke:install` packs the exact release candidate, installs that tarball into an isolated temporary consumer without installing the host-provided `n8n-workflow` peer, and loads both nodes and credentials from the installed package. Feature milestones may also require the pinned Twenty integration harness and the bounded n8n UI qualification checklist; those live checks remain explicit rather than ordinary CI steps.

## First publication

npm requires a package to exist before it can have a Trusted Publisher. Bootstrap the first `0.1.0` publication from GitHub Actions without giving up provenance:

1. Create a temporary granular npm token scoped to `@blackswampai/n8n-nodes-twentycrm`, with publish access and the CI/2FA settings npm requires.
2. Store it as the repository Actions secret `NPM_TOKEN`.
3. Confirm CI and the complete release gate are green on the exact release commit.
4. With explicit owner authorization, create and push the annotated `v0.1.0` tag.
5. Verify the Publish workflow and npm provenance attestation.
6. Create the matching GitHub release only with separate owner authorization.

No milestone authorization alone permits publication, tagging, or release creation.

## Trusted Publisher

Immediately after the package exists, configure npm Trusted Publishing with:

- Provider: GitHub Actions
- Repository owner: `BlackSwampAI`
- Repository name: `n8n-nodes-twentycrm`
- Workflow filename: `publish.yml`
- Environment: blank unless the workflow later declares one

Then remove the `NPM_TOKEN` GitHub secret and revoke the temporary token. Later tag-triggered releases use OIDC. Published npm versions and tags are immutable and must never be reused or moved.
