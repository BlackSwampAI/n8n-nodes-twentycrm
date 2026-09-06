# Template migrations

GitHub created this repository from a template snapshot. Generated repositories do not inherit later template changes automatically.

The adopted baseline and canonical source are recorded in `.blackswamp/template.json`. Updating the marker alone is not a migration: compare the canonical template, assess each script, workflow, test, and documentation change against TwentyCRM-specific controls, run all local gates, and only then update the marker.

## 2.0.0 adopted

- Added official n8n source and built-output scanner preflight plus explicit-success postpublication scanning.
- Added tokenless Trusted Publisher npm-auth preparation, npm version verification, and npm 11.19.0 workflow consistency.
- Retained the stronger exact package allowlist, official icon hash, compiled load smoke, isolated install smoke, credential tests, and guarded Twenty fixtures.
- Added strict test TypeScript checking, machine-readable provenance, PR and batch-handoff guidance, and final API/testing/branding documentation.

Future migrations must remain bounded and must not overwrite project-specific decisions or imply authorization for external actions.
