# Twenty CRM for n8n

`@blackswampai/n8n-nodes-twentycrm` is an n8n community-node package for Twenty CRM. The project is under active development: it is not published yet and this foundation release does not provide API operations.

## Installation

The package is not yet available from npm. After a future release, the intended community-node package name will be:

```text
@blackswampai/n8n-nodes-twentycrm
```

For development, use Node.js 22.22.0 or newer, clone the repository, and run `npm ci` followed by `npm run build`.

## Compatibility

No Twenty Cloud, self-hosted Twenty, or n8n runtime version has been qualified yet. The package declares Node.js `>=22.22.0` and treats `n8n-workflow` as a host-provided peer dependency.

The planned qualification strategy covers Twenty Cloud and a pinned self-hosted Twenty release. See [Compatibility and qualification](docs/COMPATIBILITY.md).

## Credentials

Credentials are not included in this foundation milestone. A later milestone will add bearer API-key authentication, a configurable root URL, and a connectivity test for Twenty Cloud and self-hosted installations.

## Operations

No operations are available yet. The current `Twenty CRM` node is a non-networking shell that fails with a clear development-stage message if executed. Planned capabilities are described in [Architecture](docs/ARCHITECTURE.md).

## Resources

- [Twenty documentation](https://docs.twenty.com/)
- [n8n community node documentation](https://docs.n8n.io/integrations/community-nodes/)
- [Project issues](https://github.com/BlackSwampAI/n8n-nodes-twentycrm/issues)
- [Release process](RELEASING.md)

The light and dark `20` node icons are original project artwork created for this package; they are not copied from Twenty's upstream repository. Twenty and its marks belong to their respective owner.

## License

This project is available under the [MIT License](LICENSE.md).
