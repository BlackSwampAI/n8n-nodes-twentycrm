# Troubleshooting

Do not paste API keys, webhook secrets, raw payloads, private record data, or full execution exports into an issue.

## Credential and network failures

- **Invalid or expired API key:** create or rotate a key in Twenty, update the n8n credential, and test it again. Confirm the credential selected on the node is the one you updated.
- **Unable to reach the Twenty API:** enter the installation root, not a browser workspace page. Confirm scheme, host, port, reverse-proxy prefix, TLS certificate, and DNS from the n8n host. The node accepts root URLs and safely strips common API endpoint suffixes.
- **Self-hosted connection refused or timeout:** confirm Twenty is healthy and reachable from the machine or container running n8n. `localhost` inside an n8n container means that container, not the Docker host.

## Dynamic objects and fields

- **Twenty GraphQL request was rejected:** the API schema may not match this node version, or the API-key role may not have metadata access. Record the sanitized node and Twenty versions; do not paste the raw GraphQL response. Fixed-resource reads and JSON-input CRUD do not require metadata, while generic Record, Schema Object, selectors, and Field Mapping do.
- Retry the object or field loader after confirming the credential and Twenty health.
- Confirm the object is active, non-system, and not remote. Fixed-resource fields also must be active and writable.
- A saved field or object API name may be stale after a schema rename or deletion. Reopen the selector and choose the current value.
- A `403` during discovery or custom-schema qualification means the API-key role lacks settings access. Grant the minimum required object permissions; metadata schema mutation tests specifically require **Data Model** permission.

## Record operations

- **Validation error (400/422):** check required fields, field API names, compound value shapes, raw JSON, filter syntax, and order syntax against the workspace schema.
- **Not found (404):** confirm Base URL, selected object, and record ID. Deleted or stale records are not returned.
- **Permission denied (403):** grant the API-key role the required read or write permission for that object. Do not broaden permissions beyond the workflow's needs.
- **Conflict (409):** review uniqueness constraints or concurrent schema changes; mutations are not automatically retried.
- **Workflow or workflowVersion write rejected:** Twenty 2.47 and newer reject generic REST Create, Update, and Delete for these objects. Use Twenty's workflow editor or a supported core workflow API outside this node. The node probes `/client-config` only when one of these generic writes executes. If the version is unavailable, malformed, or a prerelease, it preserves older-version behavior; a resulting `403` or `405` can therefore mean this restriction or ordinary permissions.
- **Wide object is missing fields:** on Twenty 2.46 and newer, set **Fields** on Get or Get Many to a comma-separated list of root field API names. The node trims and deduplicates names; Twenty always includes `id`. Compound fields such as name, emails, and address are selected as whole root fields; nested, dotted, wildcard, and GraphQL selections are rejected. Use **Depth 1** only when one-to-many root fields are required. Explicit selection is not an unlimited bypass: field permissions, relation/query complexity, and URL or proxy length limits still apply. For very wide reads, request smaller field groups and join them by `id`. Earlier servers may ignore these query parameters, so verify their output rather than assuming projection.

## Webhook trigger

- n8n's **Test URL** works only while **Listen for test event** is active. An activated workflow must be registered with its **Production URL**.
- Twenty and the `Twenty Webhook API` credential must contain exactly the same strong secret. The trigger has no unsigned mode.
- Missing or invalid signature errors usually indicate a different secret or a proxy that changed the raw body. Timestamp failures indicate more than five minutes of clock skew or delayed delivery; synchronize the Twenty and n8n hosts.
- For the repository's Linux Docker harness only, replace the displayed localhost host with `host.docker.internal` in Twenty's webhook form. Run `npm run test:webhook-bridge` first.
- The harness disables Twenty's outbound private-network safe mode only for its isolated worker. Never copy that exception into a production deployment.
- Twenty 2.46 enforces a workspace-wide webhook allowance of 60 calls per 60,000 ms by default. The allowance is shared across webhook endpoints and subscriptions. Events beyond the admitted count are not enqueued for delivery, so n8n retries and API retry settings cannot recover them. Filtering inside the trigger happens after delivery and does not conserve the allowance; narrow the webhook subscription in Twenty where possible.
- Self-hosted Twenty administrators can review `WEBHOOK_CALL_RATE_LIMITING_LIMIT` (default `60`) and `WEBHOOK_CALL_RATE_LIMITING_TTL_IN_MS` (default `60000`). Twenty also supports a workspace usage override. Capacity changes affect the whole workspace and should be sized with worker and destination capacity.
- For loss-sensitive automation, run a separate scheduled Get Many reconciliation using `updatedAt`, persist the last successful watermark, overlap windows, and make downstream upserts idempotent. Periodically perform a full identifier comparison for deletes because hard-deleted records cannot be reconstructed from `updatedAt`. This package does not create that polling workflow automatically.

Errors intentionally omit raw Twenty response bodies, request headers, credentials, and private values. If the safe guidance is insufficient, reproduce with a disposable local record and include only the sanitized error category and software versions.
