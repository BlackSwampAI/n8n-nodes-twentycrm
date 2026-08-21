import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

import { readEnv, requireLocalApiKey, validateGraphqlPayload } from './twenty-harness-lib.mjs';

const root = resolve(import.meta.dirname, '..');
const envPath = resolve(root, 'integration/twenty/.env');
if (!existsSync(envPath)) {
	throw new Error('Local Twenty setup is missing. Run npm run twenty:start first.');
}

const env = readEnv(envPath);
const apiKey = requireLocalApiKey(env);

const require = createRequire(import.meta.url);
const { deriveTwentyApiUrls } = require(resolve(root, 'dist/nodes/Twenty/shared/urls.js'));
const baseUrl = `http://127.0.0.1:${env.TWENTY_PORT || '3020'}`;
const urls = deriveTwentyApiUrls(baseUrl);
const PROBE_TIMEOUT_MS = 15_000;

async function probe(surface, url, query, dataCheck) {
	let response;
	try {
		response = await fetch(url, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ query }),
			signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
		});
	} catch {
		throw new Error(`${surface} request failed; confirm the local stack is healthy.`);
	}
	if (!response.ok) throw new Error(`${surface} returned HTTP ${response.status}.`);

	let payload;
	try {
		payload = await response.json();
	} catch {
		throw new Error(`${surface} returned invalid JSON.`);
	}
	validateGraphqlPayload(surface, payload, dataCheck);
	console.log(`${surface} read-only qualification passed.`);
}

await probe(
	'Core GraphQL',
	urls.coreGraphql,
	'query HarnessCoreProbe { currentWorkspace { id } }',
	(data) => typeof data?.currentWorkspace?.id === 'string' && data.currentWorkspace.id.length > 0,
);
await probe(
	'Metadata GraphQL',
	urls.metadataGraphql,
	'query HarnessMetadataProbe { objects(paging: { first: 1 }) { edges { node { id nameSingular } } } }',
	(data) => Array.isArray(data?.objects?.edges),
);
