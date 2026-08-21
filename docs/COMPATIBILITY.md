# Compatibility and qualification

The project has not yet qualified an operational version matrix.

Future compatibility work will test both Twenty Cloud and self-hosted Twenty. The local read-only integration harness pins Twenty v2.9.0 by tag and verified image digest, with explicitly versioned PostgreSQL and Redis images rather than `latest`. Qualification will include the package's declared Node.js floor, a current Node.js line, package installation and node loading in n8n, built-in record lifecycles, dynamic custom-object lifecycles, and authenticated webhook behavior when those features exist.

The credential accepts absolute HTTP or HTTPS root URLs, allowing HTTPS Twenty Cloud URLs and HTTP or HTTPS self-hosted installations. URL normalization, authenticated request construction, safe error normalization, bounded retry policy, and the read-only Core GraphQL credential probe are unit-tested with mocks, but no live installation has been qualified yet. Twenty error payloads and `Retry-After` behavior are treated defensively rather than as a stable vendor-specific contract.

Compatibility claims will be added only after the relevant automated and hands-on checks pass. Until then, the repository and npm metadata must not imply production support or n8n verification.

The v2.9.0 harness qualifies authenticated read-only routing to Core GraphQL and Metadata GraphQL after a user creates a local API key through Twenty's supported UI. Its opt-in discovery check also runs the compiled canonical object-metadata query and normalizer. The read-only Core REST qualification exercises the compiled generic Record list and single-record services with the verified singular/plural envelope, 200-record page cap, `starting_after` cursor, filter grammar, and ordering grammar. It prints no workspace identifiers, names, record values, payloads, or counts. It does not yet establish an operational support matrix or exercise record writes. See [Local Twenty integration harness](LOCAL_TWENTY.md).
