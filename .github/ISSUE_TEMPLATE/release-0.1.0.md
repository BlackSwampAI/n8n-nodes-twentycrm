---
name: Release 0.1.0
about: Track the first provenance-backed npm release
title: 'Release v0.1.0'
labels: release
assignees: ''
---

- [ ] Repository is `BlackSwampAI/n8n-nodes-twentycrm` and package is `@blackswampai/n8n-nodes-twentycrm`
- [ ] All template placeholders and unused examples removed
- [ ] README installation, compatibility, credentials, operations, and license sections complete
- [ ] Package registers and loads exactly two nodes and two credentials
- [ ] Exact package artifact audit, isolated packed-install smoke, and icon asset checks pass
- [ ] Fixed resources, generic/custom Record CRUD, Schema Object reads, and signed trigger qualification are complete
- [ ] Bounded n8n editor checklist in `docs/QUALIFICATION.md` passes and records versions only
- [ ] Official Twenty icon provenance and independent/unofficial trademark notice are present
- [ ] Complete release gate in `RELEASING.md` passes
- [ ] Temporary granular npm token stored only as GitHub Actions secret `NPM_TOKEN`
- [ ] Release commit is on `main` and CI is green
- [ ] Annotated `v0.1.0` tag points to the release commit
- [ ] Publish workflow succeeds
- [ ] npm `latest` is `0.1.0` and SLSA provenance is present
- [ ] GitHub release exists
- [ ] npm Trusted Publisher configured for `publish.yml`
- [ ] `NPM_TOKEN` secret deleted and temporary npm token revoked
