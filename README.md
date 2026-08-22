# Twenty CRM for n8n

`@blackswampai/n8n-nodes-twentycrm` is an independent n8n community-node package for Twenty CRM. Version 0.1 is under active development and has not been published to npm.

> This is an unofficial Black Swamp AI community integration. It is not affiliated with, sponsored by, or endorsed by Twenty.com, PBC. Twenty and the Twenty logo are trademarks of Twenty.com, PBC.

## Installation

After publication, install the package through n8n's **Settings → Community Nodes** using:

```text
@blackswampai/n8n-nodes-twentycrm
```

For development, use Node.js 22.22.0 or newer, clone the repository, then run `npm ci`, `npm run build`, and `npm run smoke:install`.

## Compatibility

The package supports configurable Twenty Cloud and self-hosted root URLs. Its automated live API qualification is pinned to Twenty v2.9.0 by immutable image digest. The package declares Node.js `>=22.22.0` and `n8n-workflow` as a host-provided peer.

This is not a broad Twenty or n8n version matrix, and the package is not yet n8n-verified. See [Compatibility and qualification](docs/COMPATIBILITY.md) and the [release-candidate UI checklist](docs/QUALIFICATION.md).

## Credentials

`Twenty API` requires a Twenty API key and root Base URL. It sends Bearer authentication through n8n's credential helper. The default is `https://api.twenty.com`; self-hosted users enter their installation root, including any reverse-proxy prefix. Pasted `/rest`, `/graphql`, `/metadata`, and `/rest/metadata` suffixes are normalized centrally.

The credential test sends a minimal read-only Core GraphQL query. The API-key role needs access to every object used by a workflow. Dynamic schema discovery needs metadata access; the local custom-schema qualification additionally requires the **Data Model** settings permission.

`Twenty Webhook API` stores the shared webhook secret as a password-masked value. Enter the same strong secret in Twenty's webhook form even though Twenty labels it optional. Unsigned trigger delivery is not supported.

Never place API keys or webhook secrets in workflow fields, source code, logs, or issue reports.

## Operations

The action node provides:

- **Company, Person, Opportunity, Task, and Note:** Create, Get, Get Many, Update, and Delete.
- **Record:** the same generic CRUD surface for active standard and custom workspace objects.
- **Schema Object:** read-only Get and Get Many metadata discovery.

Create and Update default to metadata-driven Field Mapping. Fixed resources show common fields first and keep remaining writable/custom fields under Additional Fields. Generic Record retains full dynamic schema ordering. Known compound values are reconstructed for Twenty's REST API; JSON input remains available as an advanced fallback. Get Many supports bounded Limit/Return All cursor pagination and raw Twenty REST filter/order expressions.

All resources reuse shared metadata, authenticated transport, pagination, field mapping, and sanitized errors. Transient retries are conservative and idempotency-gated; record mutations are never automatically retried. Schema creation or modification is not exposed as a node operation.

The **Twenty CRM Trigger** receives Record Created, Record Updated, and Record Deleted events for one active standard/custom object or All Objects. Registration is manual:

1. Choose **Test URL** only while n8n is listening for a test event; use **Production URL** for an active workflow.
2. Create the webhook in Twenty under **Settings → APIs & Webhooks**.
3. Enter a strong shared secret in Twenty and save the same value in `Twenty Webhook API`.

The trigger verifies Twenty's HMAC-SHA256 signature over the exact raw request body and millisecond timestamp, requires delivery within a five-minute signed timestamp tolerance, and filters the all-events stream inside n8n. Automatic registration and unsigned mode are not supported.

## Troubleshooting

See [Troubleshooting](docs/TROUBLESHOOTING.md) for credential/network failures, dynamic fields, permissions, record errors, local Docker routing, and webhook signature failures.

## Resources

- [Twenty documentation](https://docs.twenty.com/)
- [n8n community node documentation](https://docs.n8n.io/integrations/community-nodes/)
- [Local Twenty harness](docs/LOCAL_TWENTY.md)
- [Project issues](https://github.com/BlackSwampAI/n8n-nodes-twentycrm/issues)
- [Release process](RELEASING.md)

The packaged light and dark icons use the unmodified official Twenty 96×96 SVG from [`twentyhq/twenty` commit `1642be86f5c17217372366b9e2a950ebf88a53db`](https://github.com/twentyhq/twenty/blob/1642be86f5c17217372366b9e2a950ebf88a53db/packages/twenty-codex-plugin/assets/twenty-logo.svg). Use of that mark does not imply affiliation, sponsorship, or endorsement.

## License

Project code is available under the [MIT License](LICENSE.md). Third-party trademarks remain the property of their respective owners.
