# Troubleshooting

Do not paste API keys, webhook secrets, raw payloads, private record data, or full execution exports into an issue.

## Credential and network failures

- **Invalid or expired API key:** create or rotate a key in Twenty, update the n8n credential, and test it again. Confirm the credential selected on the node is the one you updated.
- **Unable to reach the Twenty API:** enter the installation root, not a browser workspace page. Confirm scheme, host, port, reverse-proxy prefix, TLS certificate, and DNS from the n8n host. The node accepts root URLs and safely strips common API endpoint suffixes.
- **Self-hosted connection refused or timeout:** confirm Twenty is healthy and reachable from the machine or container running n8n. `localhost` inside an n8n container means that container, not the Docker host.

## Dynamic objects and fields

- Retry the object or field loader after confirming the credential and Twenty health.
- Confirm the object is active, non-system, and not remote. Fixed-resource fields also must be active and writable.
- A saved field or object API name may be stale after a schema rename or deletion. Reopen the selector and choose the current value.
- A `403` during discovery or custom-schema qualification means the API-key role lacks settings access. Grant the minimum required object permissions; metadata schema mutation tests specifically require **Data Model** permission.

## Record operations

- **Validation error (400/422):** check required fields, field API names, compound value shapes, raw JSON, filter syntax, and order syntax against the workspace schema.
- **Not found (404):** confirm Base URL, selected object, and record ID. Deleted or stale records are not returned.
- **Permission denied (403):** grant the API-key role the required read or write permission for that object. Do not broaden permissions beyond the workflow's needs.
- **Conflict (409):** review uniqueness constraints or concurrent schema changes; mutations are not automatically retried.

## Webhook trigger

- n8n's **Test URL** works only while **Listen for test event** is active. An activated workflow must be registered with its **Production URL**.
- Twenty and the `Twenty Webhook API` credential must contain exactly the same strong secret. The trigger has no unsigned mode.
- Missing or invalid signature errors usually indicate a different secret or a proxy that changed the raw body. Timestamp failures indicate more than five minutes of clock skew or delayed delivery; synchronize the Twenty and n8n hosts.
- For the repository's Linux Docker harness only, replace the displayed localhost host with `host.docker.internal` in Twenty's webhook form. Run `npm run test:webhook-bridge` first.
- The harness disables Twenty's outbound private-network safe mode only for its isolated worker. Never copy that exception into a production deployment.

Errors intentionally omit raw Twenty response bodies, request headers, credentials, and private values. If the safe guidance is insufficient, reproduce with a disposable local record and include only the sanitized error category and software versions.
