# Compatibility and qualification

The project has not yet qualified an operational version matrix.

Future compatibility work will test both Twenty Cloud and self-hosted Twenty. Blocking self-hosted integration tests will pin a specific stable Twenty release rather than track `latest`. Qualification will include the package's declared Node.js floor, a current Node.js line, package installation and node loading in n8n, built-in record lifecycles, dynamic custom-object lifecycles, and authenticated webhook behavior when those features exist.

The credential accepts absolute HTTP or HTTPS root URLs, allowing HTTPS Twenty Cloud URLs and HTTP or HTTPS self-hosted installations. URL normalization, authenticated request construction, safe error normalization, bounded retry policy, and the read-only Core GraphQL credential probe are unit-tested with mocks, but no live installation has been qualified yet. Twenty error payloads and `Retry-After` behavior are treated defensively rather than as a stable vendor-specific contract.

Compatibility claims will be added only after the relevant automated and hands-on checks pass. Until then, the repository and npm metadata must not imply production support or n8n verification.
