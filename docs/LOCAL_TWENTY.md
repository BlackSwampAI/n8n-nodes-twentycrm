# Local Twenty integration harness

This opt-in harness runs a disposable Twenty v2.9.0 instance for authenticated, read-only integration qualification. It follows Twenty's official four-service topology: server, worker, PostgreSQL, and Redis.

The server and worker use the immutable image `twentycrm/twenty:v2.9.0@sha256:0afdba1494ea50bad6eb278a20ae35933317483f23501157c2ed866b74d4bc4a`. Supporting services are explicitly pinned to `postgres:16.10-alpine` and `redis:7.4.6-alpine`; the Compose file contains no `latest` reference. Only the Twenty server is published, on `127.0.0.1:3020` by default.

## Prerequisites and resources

- Docker Engine or Docker Desktop with Docker Compose v2
- Node.js 22.22.0 or newer
- Approximately 4 CPU cores, 8 GB RAM, 10 GB free disk, and free local TCP port 3020 are recommended for the initial image pull, migrations, and app startup

The first pull can be several gigabytes and startup can take a few minutes.

## Lifecycle

Install project dependencies, start the isolated stack, and wait for `/healthz`:

```sh
npm ci
npm run twenty:start
```

The start command creates `integration/twenty/.env` with random local database and application secrets if it does not exist. The file is mode `0600`, ignored by Git, and its values are not printed. Do not copy production data or credentials into this harness.

Open `http://localhost:3020`, complete Twenty's normal browser onboarding, then create a local-only API key using the supported UI:

1. Open Settings.
2. Open APIs & Webhooks.
3. Select **Create key**, configure the key, and save it.
4. Copy the key when Twenty displays it; it is shown once.
5. Add it to the ignored `integration/twenty/.env` as `TWENTY_API_KEY=...` using a text editor. Do not place the key in a shell command, commit, issue, or log.

Run the two independent read-only probes:

```sh
npm run test:integration
```

The test sends Bearer-authenticated GraphQL requests to `/graphql` and `/metadata`, then exercises the compiled generic Record read service against Core REST. Core GraphQL validates a bounded connection shape. Metadata GraphQL runs the compiled paginated discovery query and normalizer. Core REST performs one bounded filtered/ordered list read and one single-record read using only an identifier held in memory. Each request has a 15-second timeout. The test rejects HTTP, timeout/network, GraphQL, malformed-envelope, and cursor-loop errors and reports only the failing surface without printing names, identifiers, record values, counts, raw payloads, or the API key.

Other lifecycle commands:

```sh
npm run twenty:wait   # wait for the existing server to become healthy
npm run twenty:stop   # stop containers but retain disposable volumes
npm run twenty:clean  # stop containers and delete this Compose project's volumes
```

`twenty:clean` is the full reset. It targets only the fixed `n8n-twentycrm-integration` Compose project declared in this repository.

## Failure logs

If startup does not become healthy, the harness writes sanitized container output to `integration/twenty/artifacts/twenty-failure.log` with mode `0600`. Generate the same ignored log explicitly with `npm run twenty:logs`. Known local secrets, API keys, and Bearer values are replaced before the file is written. Review logs before sharing because third-party application output can change, and never share workspace data.

The default `npm test` suite validates the Compose pins and harness logic without Docker, network access, or credentials. Live Docker qualification remains explicit and is not run in ordinary CI.
