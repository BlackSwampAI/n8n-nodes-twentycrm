# Releasing `@blackswampai/n8n-nodes-twentycrm`

This is an established npm package. Never publish locally: an authorized release must come from the tag-only `.github/workflows/publish.yml` through npm Trusted Publishing and GitHub provenance.

## Release gate

Run on the exact release commit:

```sh
npm ci
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run scan:source
npm run package:check
npm run smoke:load
npm run smoke:install
npm run release:check
git diff --check
```

Complete the guarded pinned Twenty qualification and bounded actual-n8n UI checklist separately when the release scope requires them. Inspect the dry-run tarball, confirm CI is green, confirm the intended npm version and tag do not exist, and obtain explicit owner authorization before tagging.

## Trusted Publisher release

npm Trusted Publishing is the normal authentication path for GitHub owner `BlackSwampAI`, repository `n8n-nodes-twentycrm`, and workflow `publish.yml`. No long-lived npm token belongs in repository secrets. The historical first-publication token bootstrap is not part of current releases and must not be recreated for routine publishing.

The workflows install npm 11.19.0 before `npm ci`. `scripts/verify-npm-version.mjs` confirms Trusted Publishing support, and `scripts/prepare-npm-auth.mjs` removes only setup-node's empty token placeholder before the OIDC exchange.

Only after explicit authorization, create and push an immutable annotated `v<package-version>` tag pointing to the approved `main` commit. The workflow verifies the exact tag/version, runs the complete gate, and performs the single irreversible `npm run release` action. Never move or reuse a published version or tag.

## Verification

Before packaging, `npm run scan:source` applies official scanner 0.34.0 rules to source and separately to built JavaScript plus `package.json`. After publication, `npm run scan:published` checks registry metadata, provenance, attested public source, and the downloaded package. Its bounded retries allow only the observed exact-version metadata absence, analysis 404, and provenance source-repository 404 propagation states. A 403, policy/lint finding, timeout, rate limit, or unrelated failure exits immediately. Explicit success text is required; scanner exit status alone is insufficient.

After the workflow completes, verify the exact npm version, `latest` dist-tag, public package contents, provenance attestation, immutable tag, GitHub release, and scanner result. Creator Portal submission is a separate external action requiring owner authorization.
