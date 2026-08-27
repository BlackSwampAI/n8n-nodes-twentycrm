# Changelog

## Unreleased

## 0.1.3

- Add a Portal-compatible credential-class GraphQL connectivity probe with normalized Twenty root URLs and response validation.
- Align credential requests, manual webhook lifecycle ownership, node errors, and test naming with the current n8n community-package scanner.
- Update the n8n node development CLI to 0.45.4.

## 0.1.2

- Restore Metadata GraphQL discovery on Twenty v2.35 while retaining compatibility with the pinned v2.9 schema.
- Keep fixed Company, Person, Opportunity, Task, and Note reads and JSON-input CRUD independent of Metadata GraphQL availability.
- Replace misleading generic API-settings failures with safe GraphQL compatibility guidance.

## 0.1.1

- Refresh the npm README with package badges, navigation, current installation guidance, provenance details, and Black Swamp AI product-page links.
- Set the package homepage to the Black Swamp AI Twenty CRM integration page.

## 0.1.0

- Add Twenty API credentials with Twenty Cloud and self-hosted root URL support, authenticated transport, safe diagnostics, and conservative retries.
- Add metadata-driven Schema Object discovery and generic Record Create, Get, Get Many, Update, and Delete for active standard and custom objects.
- Add friendly Company, Person, Opportunity, Task, and Note CRUD resources with schema-aware field mapping, compound-field adapters, JSON fallback, and verified direct relation IDs.
- Add the manually registered Twenty CRM Trigger for signed record-created, record-updated, and record-deleted events with object/event filtering and bounded timestamp validation.
- Add pinned Twenty v2.9.0 self-hosted qualification covering built-in resources, disposable custom schema/record lifecycles, and native signed webhook delivery.
- Add exact package artifact, compiled load, and isolated packed-install checks across the release and CI gates.
- Use pinned official Twenty icon artwork with clear independent, unofficial, non-affiliation, and trademark notices.
