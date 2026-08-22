---
name: Release 0.1.0
about: Track the first provenance-backed npm release
title: 'Release v0.1.0'
labels: release
assignees: ''
---

## Candidate preparation

- [ ] Exact package identity remains `@blackswampai/n8n-nodes-twentycrm@0.1.0`, public, MIT, and zero runtime dependencies
- [ ] README, changelog, compatibility, troubleshooting, unofficial-branding notice, and release docs are complete
- [ ] Two nodes/two credentials register and load; exact 46-file package audit and isolated packed-install smoke pass
- [ ] Pinned self-hosted API/webhook qualification and bounded n8n editor checklist pass with sanitized evidence
- [ ] Release candidate is on `main`, worktree is clean, and CI is green

## First-publication prerequisites

- [ ] Immediately recheck npm E404 for exact package name/version before tagging
- [ ] Confirm maintainer permission to create a public package in the BlackSwampAI npm organization
- [ ] Create a short-lived granular npm token with bypass 2FA and minimum create/publish access
- [ ] Store that token only as GitHub Actions secret `NPM_TOKEN`
- [ ] Obtain explicit owner authorization for an annotated `v0.1.0` tag on the approved commit

## Publication and verification

- [ ] Push the authorized immutable annotated tag and confirm `publish.yml` succeeds
- [ ] Verify npm public access, exact `0.1.0` contents, `latest` dist-tag, and provenance/attestation
- [ ] Obtain separate owner authorization before creating the matching GitHub release

## Trusted Publisher migration

- [ ] Configure npm Trusted Publisher for `BlackSwampAI/n8n-nodes-twentycrm`, workflow `publish.yml`, blank environment, allowed action `npm publish`
- [ ] Delete GitHub Actions secret `NPM_TOKEN`
- [ ] Revoke the short-lived granular npm token

## Later external steps

- [ ] Obtain separate owner authorization before any n8n Creator Portal submission
