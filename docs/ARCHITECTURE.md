# Architecture

Twenty is treated as a dynamic workspace-schema platform rather than a fixed set of CRM resources.

The integration separates four API surfaces derived from one normalized root URL: core REST (`/rest`), core GraphQL (`/graphql`), metadata REST (`/rest/metadata`), and metadata GraphQL (`/metadata`). Root normalization supports Twenty Cloud and self-hosted reverse-proxy path prefixes without scattering endpoint construction. Ordinary record operations will use REST by default. GraphQL will be selected only where it provides a materially more reliable or capable interface, with metadata discovery expected to begin from Metadata GraphQL.

Shared service boundaries are defined for object metadata, field metadata, and records. Fixed resources and the generic Record resource will use those services instead of building separate API clients. Normalized object and field definitions will preserve stable API names so saved workflows are not bound only to display labels.

The shared layer contains type-only service contracts, a pure dependency-free URL helper, and one authenticated request helper for execution and load-option contexts. The helper retrieves the `twentyApi` credential, derives the selected API surface, and delegates Bearer authentication to n8n's `httpRequestWithAuthentication`. It applies no retries and wraps baseline failures without exposing response or credential data.

Credential validation is a node-level custom test that sends only `query CredentialTest { __typename }` to Core GraphQL. It validates routing and authentication without reading or mutating workspace records. Rich error diagnostics, retries, metadata parsing, caching, field conversion, pagination, CRUD implementation, and triggers remain deferred.
