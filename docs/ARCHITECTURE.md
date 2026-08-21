# Architecture

Twenty is treated as a dynamic workspace-schema platform rather than a fixed set of CRM resources.

The integration separates four API surfaces derived from one normalized root URL: core REST (`/rest`), core GraphQL (`/graphql`), metadata REST (`/rest/metadata`), and metadata GraphQL (`/metadata`). Root normalization supports Twenty Cloud and self-hosted reverse-proxy path prefixes without scattering endpoint construction. Ordinary record operations will use REST by default. GraphQL will be selected only where it provides a materially more reliable or capable interface, with metadata discovery expected to begin from Metadata GraphQL.

Shared service boundaries are defined for object metadata, field metadata, and records. Fixed resources and the generic Record resource will use those services instead of building separate API clients. Normalized object and field definitions will preserve stable API names so saved workflows are not bound only to display labels.

The shared layer contains type-only service contracts, a pure dependency-free URL helper, and one authenticated request helper for execution and load-option contexts. The helper retrieves the `twentyApi` credential, derives the selected API surface, and delegates Bearer authentication to n8n's `httpRequestWithAuthentication`. It normalizes variable HTTP, network, and GraphQL failures into actionable n8n-native errors built only from safe synthetic details; response bodies, headers, GraphQL messages and paths, credentials, and private values are not retained.

Transport retries are conservative and deterministic: automatic retries apply only to GET and HEAD, callers must explicitly mark another request as safe/idempotent, and callers can disable retries. Only rate limits, temporary gateway/service failures, timeouts, connection resets, and temporary DNS failures are retried, for at most three total attempts. `Retry-After` delay-seconds and HTTP-dates are honored up to 60 seconds; otherwise the two retries wait 250 ms and 500 ms. GraphQL errors and permanent request, authentication, permission, conflict, URL, DNS, connection, and TLS failures are not retried.

Credential validation is a node-level custom test that sends only `query CredentialTest { __typename }` to Core GraphQL. It validates routing and authentication without reading or mutating workspace records, reusing safe error classification without retrying. Metadata parsing, caching, field conversion, pagination, CRUD implementation, and triggers remain deferred.

The opt-in local integration harness mirrors Twenty v2.9.0's server, worker, PostgreSQL, and Redis Compose topology with immutable or explicit image versions. Its live qualification independently probes Core GraphQL and Metadata GraphQL using a local-only API key created through Twenty's public UI. Default tests inspect the harness offline; Docker startup and authenticated probes are never implicit CI steps.
