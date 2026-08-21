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
const { normalizeTwentyObject, OBJECT_METADATA_QUERY } = require(
	resolve(root, 'dist/nodes/Twenty/shared/metadata.js'),
);
const { createRecordReadService } = require(resolve(root, 'dist/nodes/Twenty/shared/records.js'));
const baseUrl = `http://127.0.0.1:${env.TWENTY_PORT || '3020'}`;
const urls = deriveTwentyApiUrls(baseUrl);
const PROBE_TIMEOUT_MS = 15_000;

async function probe(surface, url, query, dataCheck, variables) {
	let response;
	try {
		response = await fetch(url, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ query, variables }),
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
	return payload.data;
}

await probe(
	'Core GraphQL',
	urls.coreGraphql,
	'query HarnessCoreProbe { people(first: 1) { edges { node { id } } } }',
	(data) => Array.isArray(data?.people?.edges) && data.people.edges.length <= 1,
);
await probe(
	'Metadata GraphQL',
	urls.metadataGraphql,
	'query HarnessMetadataProbe { objects(paging: { first: 1 }) { edges { node { id nameSingular } } } }',
	(data) => Array.isArray(data?.objects?.edges),
);

async function qualifyMetadataDiscovery() {
	const cursors = new Set();
	let after = null;
	let hasQualifiedObject = false;
	let recordObject;
	for (let pageNumber = 0; pageNumber < 100; pageNumber++) {
		const data = await probe(
			'Metadata discovery',
			urls.metadataGraphql,
			OBJECT_METADATA_QUERY,
			(value) =>
				Array.isArray(value?.objects?.edges) &&
				typeof value?.objects?.pageInfo?.hasNextPage === 'boolean',
			{ after },
		);
		const connection = data.objects;
		for (const edge of connection.edges) {
			const object = normalizeTwentyObject(edge?.node);
			if (!object.isCustom && object.isActive && object.fields.length > 0)
				hasQualifiedObject = true;
			if (object.apiNameSingular === 'person') recordObject = object;
		}
		if (!connection.pageInfo.hasNextPage) {
			if (!hasQualifiedObject)
				throw new Error('Metadata discovery did not return a usable standard object.');
			console.log('Compiled metadata normalization qualification passed.');
			return recordObject;
		}
		const nextCursor = connection.pageInfo.endCursor;
		if (typeof nextCursor !== 'string' || nextCursor.length === 0 || cursors.has(nextCursor)) {
			throw new Error('Metadata discovery pagination did not provide a new cursor.');
		}
		cursors.add(nextCursor);
		after = nextCursor;
	}
	throw new Error('Metadata discovery pagination exceeded the safety limit.');
}

const recordObject = await qualifyMetadataDiscovery();
if (!recordObject) throw new Error('Record qualification object is unavailable.');

const liveContext = {
	getCredentials: async () => ({ baseUrl }),
	getNode: () => ({ name: 'Twenty CRM', type: 'twenty', typeVersion: 1, position: [0, 0] }),
	helpers: {
		async httpRequestWithAuthentication(_credentialName, options) {
			const url = new URL(options.url);
			for (const [name, value] of Object.entries(options.qs ?? {})) {
				if (value !== undefined) url.searchParams.set(name, String(value));
			}
			let response;
			try {
				response = await fetch(url, {
					method: options.method,
					headers: { Authorization: `Bearer ${apiKey}` },
					signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
				});
			} catch {
				throw { code: 'ETIMEDOUT' };
			}
			if (!response.ok) throw { statusCode: response.status };
			return await response.json();
		},
	},
};
const recordService = createRecordReadService(liveContext, {
	getObject: async () => recordObject,
	getObjects: async () => [recordObject],
});
const records = await recordService.getMany('person', {
	returnAll: false,
	limit: 1,
	filter: 'deletedAt[is]:NULL',
	orderBy: 'createdAt[AscNullsFirst]',
});
if (records.length !== 1 || typeof records[0]?.id !== 'string') {
	throw new Error('Core REST record list qualification did not return the expected shape.');
}
await recordService.get('person', records[0].id);
console.log('Compiled Core REST Record Get/Get Many qualification passed.');
