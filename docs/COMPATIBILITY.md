# Compatibility and qualification

The project has not yet qualified an operational version matrix.

Future compatibility work will test both Twenty Cloud and self-hosted Twenty. The local read-only integration harness pins Twenty v2.9.0 by tag and verified image digest, with explicitly versioned PostgreSQL and Redis images rather than `latest`. Qualification will include the package's declared Node.js floor, a current Node.js line, package installation and node loading in n8n, built-in record lifecycles, dynamic custom-object lifecycles, and authenticated webhook behavior when those features exist.

The credential accepts absolute HTTP or HTTPS root URLs, allowing HTTPS Twenty Cloud URLs and HTTP or HTTPS self-hosted installations. URL normalization, authenticated request construction, safe error normalization, bounded retry policy, and the read-only Core GraphQL credential probe are unit-tested with mocks, but no live installation has been qualified yet. Twenty error payloads and `Retry-After` behavior are treated defensively rather than as a stable vendor-specific contract.

Compatibility claims will be added only after the relevant automated and hands-on checks pass. Until then, the repository and npm metadata must not imply production support or n8n verification.

The v2.9.0 harness qualifies authenticated routing to Core GraphQL and Metadata GraphQL after a user creates a local API key through Twenty's supported UI. Its opt-in discovery check runs the compiled canonical object-metadata query and normalizer. Core REST qualification exercises generic Record reads plus disposable Company, Person, Opportunity, Task, and Note lifecycles with guaranteed cleanup and absence checks.

The expanded local matrix also creates a uniquely owned custom object and writable scalar field through the public v2.9 Metadata GraphQL API, rediscovers them through compiled metadata normalization, and exercises generic Record Create/Get/Get Many/Update/Delete. Cleanup deletes the owned record, field, and object and verifies absence. The mutation path is restricted to a loopback Twenty URL and prints no workspace identifiers, object or field API names, labels, record or schema values, payloads, or counts. This does not establish a broad operational support matrix. See [Local Twenty integration harness](LOCAL_TWENTY.md).

Native webhook qualification uses a deterministic Linux Docker host-gateway alias on the pinned v2.9 worker and Twenty's supported outbound safe-mode configuration. Offline tests enforce local-only URL handling and sanitized bounded bridge checks. End-to-end native delivery still requires a user to register the container-reachable production webhook URL in Twenty, activate the n8n workflow, make one uniquely owned local record change, and inspect the resulting n8n execution; no private management API is used.
