# Architecture

Twenty is treated as a dynamic workspace-schema platform rather than a fixed set of CRM resources.

The planned integration separates four API surfaces: core REST, core GraphQL, metadata REST, and metadata GraphQL. Ordinary record operations will use REST by default. GraphQL will be selected only where it provides a materially more reliable or capable interface, with metadata discovery expected to begin from Metadata GraphQL.

Shared service boundaries are defined for object metadata, field metadata, and records. Fixed resources and the generic Record resource will use those services instead of building separate API clients. Normalized object and field definitions will preserve stable API names so saved workflows are not bound only to display labels.

This foundation milestone contains type-only contracts. It deliberately contains no URL handling, transport, metadata parsing, caching, field conversion, pagination, CRUD implementation, credentials, or trigger behavior.
