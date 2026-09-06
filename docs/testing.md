# Testing strategy and evidence

## Automated ladder

- Strict TypeScript unit tests cover URL normalization, authenticated transport, error redaction, field mapping, metadata normalization, pagination, webhook signatures, and fixture safety.
- Metadata and execution tests cover the advertised resources and operations, mapper modes, dynamic schema loading, response shaping, and paired-item output.
- `npm run build`, `npm run scan:source`, `npm run package:check`, `npm run smoke:load`, and `npm run smoke:install` verify official scanner rules, the exact 46-file package boundary, both compiled nodes, both credentials, icons, credential tests, and an isolated tarball consumer.
- Ordinary CI never requires Docker, credentials, or a live Twenty workspace.

Tests are TypeScript `*.test.ts` files run by Vitest and are checked with the strict `tsconfig.test.json`. Direct-execution `.mjs` files are reserved for operational, integration, package, and release tooling.

## Pinned live fixture

The opt-in harness in `integration/twenty` pins Twenty v2.9.0, PostgreSQL 16.10, and Redis 7.4.6. It refuses non-loopback Twenty URLs, requires an ignored local API key, generates random local service secrets, uses exact run-owned records/schema, cleans in dependency order, and verifies absence. It does not run in ordinary CI.

`npm run test:integration` performs real mutations. Inspect `docs/LOCAL_TWENTY.md`, the target guard, ownership checks, and cleanup before running it. Never point it at Twenty Cloud or a production workspace. `npm run twenty:clean` deletes only this Compose project's volumes and must be explicitly intended.

The webhook bridge also remains opt-in. Its private-network safe-mode exception is for the disposable worker only and must never be copied to production.

## Evidence and limitations

- Pinned v2.9 Core/Metadata GraphQL and REST lifecycle evidence is documented in `docs/COMPATIBILITY.md` and `docs/LOCAL_TWENTY.md`.
- The repository contains a bounded actual-n8n editor checklist in `docs/QUALIFICATION.md`, but it is a procedure rather than a retained automated browser artifact.
- The packed-package load/install smokes prove compiled discovery, not editor rendering or live selectors.
- The public webhook page currently shows `event`/`data`/`timestamp`, but current sender source at commit `ee6a5c37…` constructs the same `eventName`/`objectMetadata`/`record` family accepted by the trigger and signs `timestamp:JSON.stringify(payloadWithoutSecret)` with a 13-digit `Date.now()` timestamp. This source-level compatibility is regression-tested; a current-version live delivery/editor run is not claimed.
- `npm run scan:source` checks source and built artifacts before publication. A separate dependent `verify-published` job runs `npm run scan:published` after publication, so **Re-run failed jobs** retries verification without republishing; never rerun a successful publish job. The scanner requires explicit success text.
- Post-publication retries are bounded to exact known metadata, analysis-404, and provenance source-repository 404 propagation states. A 403, lint/policy finding, timeout, rate limit, or arbitrary failure exits immediately.
