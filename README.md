# Twenty CRM for n8n

`@blackswampai/n8n-nodes-twentycrm` is an n8n community-node package for Twenty CRM. The project is under active development: it is not published yet and this foundation release does not provide API operations.

## Installation

The package is not yet available from npm. After a future release, the intended community-node package name will be:

```text
@blackswampai/n8n-nodes-twentycrm
```

For development, use Node.js 22.22.0 or newer, clone the repository, and run `npm ci` followed by `npm run build`.

An opt-in disposable Twenty v2.9.0 environment is available for authenticated local qualification. See [Local Twenty integration harness](docs/LOCAL_TWENTY.md).

## Compatibility

No Twenty Cloud, self-hosted Twenty, or n8n runtime version has been qualified yet. The package declares Node.js `>=22.22.0` and treats `n8n-workflow` as a host-provided peer dependency.

The planned qualification strategy covers Twenty Cloud and a pinned self-hosted Twenty release. See [Compatibility and qualification](docs/COMPATIBILITY.md).

## Credentials

The `Twenty API` credential requires an API key and sends it as a Bearer authorization value when later operations make requests. Its configurable Base URL defaults to `https://api.twenty.com`; self-hosted users should enter the root URL of their Twenty installation, including any reverse-proxy path prefix. Pasted `/rest`, `/graphql`, `/metadata`, or `/rest/metadata` endpoint suffixes are normalized centrally.

Testing the credential sends a read-only Core GraphQL `__typename` query to validate the normalized API route and Bearer authentication without reading CRM records. Never include API keys in workflows, source code, or issue reports.

## Operations

The `Schema Object` resource provides read-only `Get` and `Get Many` operations backed by authenticated Metadata GraphQL discovery. `Get` saves the stable singular API name, while `Get Many` defaults to active, non-system objects and can optionally include inactive or system definitions. The same active, non-system discovery supplies the reusable object selector for standard and custom objects.

The `Record` resource provides read-only `Get` and `Get Many` for active standard and custom workspace objects. It resolves the saved singular API name through metadata and routes Core REST through the discovered plural API name. `Get Many` supports an exact bounded limit or safe cursor-based Return All, plus Twenty's documented raw REST `filter` and `order_by` expression strings using workspace field API names. Responses retain the record JSON returned by Twenty.

Discovery and record reads use one shared authenticated request path with sanitized status/network/GraphQL diagnostics and conservative retries. Metadata GraphQL POST requests are explicitly marked read-only and safe for retry, make at most three total attempts on transient failures, and never expose raw response or credential data through terminal errors. Record writes and schema mutations are not available yet. Planned capabilities are described in [Architecture](docs/ARCHITECTURE.md).

## Resources

- [Twenty documentation](https://docs.twenty.com/)
- [n8n community node documentation](https://docs.n8n.io/integrations/community-nodes/)
- [Project issues](https://github.com/BlackSwampAI/n8n-nodes-twentycrm/issues)
- [Release process](RELEASING.md)

The light and dark `20` node icons are original project artwork created for this package; they are not copied from Twenty's upstream repository. Twenty and its marks belong to their respective owner.

## License

This project is available under the [MIT License](LICENSE.md).
