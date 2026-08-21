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
const { createRecordService } = require(resolve(root, 'dist/nodes/Twenty/shared/records.js'));
const { reconstructRecordPayload } = require(
	resolve(root, 'dist/nodes/Twenty/shared/fieldMapping.js'),
);
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
	let lifecycleObject;
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
			if (object.apiNameSingular === 'company') lifecycleObject = object;
		}
		if (!connection.pageInfo.hasNextPage) {
			if (!hasQualifiedObject)
				throw new Error('Metadata discovery did not return a usable standard object.');
			console.log('Compiled metadata normalization qualification passed.');
			return { recordObject, lifecycleObject };
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

const { recordObject, lifecycleObject } = await qualifyMetadataDiscovery();
if (!recordObject || !lifecycleObject)
	throw new Error('Record qualification object is unavailable.');

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
					headers: {
						Authorization: `Bearer ${apiKey}`,
						...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
					},
					...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
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
const recordService = createRecordService(liveContext, {
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

const lifecycleService = createRecordService(liveContext, {
	getObject: async () => lifecycleObject,
	getObjects: async () => [lifecycleObject],
});
const fixtureName = `n8n-pr9-${crypto.randomUUID()}`;
const updatedName = `${fixtureName}-updated`;
const fixtureAddress = `mapped-${crypto.randomUUID()}`;
const updatedAddress = `${fixtureAddress}-updated`;
const addressField = lifecycleObject.fields.find(
	(field) => field.type === 'ADDRESS' && field.isActive && !field.isReadOnly && !field.isSystem,
);
if (!addressField) throw new Error('Live mapping qualification compound field is unavailable.');
function mappedValue(value) {
	return {
		mappingMode: 'defineBelow',
		value,
		matchingColumns: [],
		schema: [],
		attemptToConvertTypes: false,
		convertFieldsToString: false,
	};
}
let createdId;

async function findOwnedLifecycleRecords(name) {
	const matches = await lifecycleService.getMany('company', {
		returnAll: false,
		limit: 200,
		filter: `name[eq]:${JSON.stringify(name)}`,
	});
	if (
		matches.some(
			(record) => typeof record.id !== 'string' || record.id.length === 0 || record.name !== name,
		)
	) {
		throw new Error('Disposable record cleanup lookup returned an unexpected shape.');
	}
	return matches;
}

async function cleanupOwnedLifecycleFixture() {
	if (createdId) {
		try {
			await lifecycleService.delete('company', createdId);
		} catch {
			// The bounded exact-name fallback below still attempts and verifies cleanup.
		}
	}
	for (const name of [fixtureName, updatedName]) {
		const matches = await findOwnedLifecycleRecords(name);
		for (const match of matches) {
			try {
				await lifecycleService.delete('company', match.id);
			} catch {
				// Absence verification determines whether cleanup ultimately succeeded.
			}
		}
	}
	for (const name of [fixtureName, updatedName]) {
		if ((await findOwnedLifecycleRecords(name)).length !== 0) {
			throw new Error('Disposable record cleanup could not verify absence.');
		}
	}
}

let lifecycleFailure;
try {
	const createPayload = reconstructRecordPayload(
		lifecycleObject,
		mappedValue({
			name: fixtureName,
			[`${addressField.apiName}__addressCity`]: fixtureAddress,
		}),
	);
	const created = await lifecycleService.create('company', createPayload);
	if (
		typeof created.id !== 'string' ||
		created.id.length === 0 ||
		created.name !== fixtureName ||
		created[addressField.apiName]?.addressCity !== fixtureAddress
	) {
		throw new Error('Record Create returned an unexpected shape.');
	}
	createdId = created.id;
	const fetched = await lifecycleService.get('company', createdId);
	if (fetched.name !== fixtureName)
		throw new Error('Record Get did not verify the created fixture.');
	const listed = await lifecycleService.getMany('company', {
		returnAll: false,
		limit: 1,
		filter: `id[eq]:${JSON.stringify(createdId)}`,
	});
	if (listed.length !== 1 || listed[0]?.id !== createdId) {
		throw new Error('Record Get Many did not verify the created fixture.');
	}
	const updatePayload = reconstructRecordPayload(
		lifecycleObject,
		mappedValue({
			name: updatedName,
			[`${addressField.apiName}__addressCity`]: updatedAddress,
		}),
	);
	const updated = await lifecycleService.update('company', createdId, updatePayload);
	if (
		updated.name !== updatedName ||
		updated[addressField.apiName]?.addressCity !== updatedAddress
	) {
		throw new Error('Record Update returned an unexpected shape.');
	}
	const verified = await lifecycleService.get('company', createdId);
	if (
		verified.name !== updatedName ||
		verified[addressField.apiName]?.addressCity !== updatedAddress
	) {
		throw new Error('Record Get did not verify the update.');
	}
	console.log('Compiled mapped Record scalar/compound Create/Get/Update qualification passed.');
} catch (error) {
	lifecycleFailure = error;
} finally {
	try {
		await cleanupOwnedLifecycleFixture();
	} catch {
		throw new Error('Disposable record cleanup failed.');
	}
}
if (lifecycleFailure) throw lifecycleFailure;
console.log('Compiled Core REST Record Delete and absence qualification passed.');

const personLifecycleService = createRecordService(liveContext, {
	getObject: async () => recordObject,
	getObjects: async () => [recordObject],
});
const personNameField = recordObject.fields.find(
	(field) => field.type === 'FULL_NAME' && field.isActive && !field.isReadOnly && !field.isSystem,
);
if (!personNameField) throw new Error('Person mapping qualification field is unavailable.');
const personFirstName = `n8n-pr10-${crypto.randomUUID()}`;
const updatedPersonFirstName = `${personFirstName}-updated`;
const personLastName = 'Fixture';
let createdPersonId;

async function findOwnedPersonRecords(firstName) {
	const matches = await personLifecycleService.getMany('person', {
		returnAll: false,
		limit: 200,
		filter: `${personNameField.apiName}.firstName[eq]:${JSON.stringify(firstName)}`,
	});
	if (
		matches.some(
			(record) =>
				typeof record.id !== 'string' ||
				record.id.length === 0 ||
				record[personNameField.apiName]?.firstName !== firstName,
		)
	) {
		throw new Error('Disposable Person cleanup lookup returned an unexpected shape.');
	}
	return matches;
}

async function cleanupOwnedPersonFixture() {
	if (createdPersonId) {
		try {
			await personLifecycleService.delete('person', createdPersonId);
		} catch {
			// The bounded exact-name fallback below still attempts and verifies cleanup.
		}
	}
	for (const firstName of [personFirstName, updatedPersonFirstName]) {
		const matches = await findOwnedPersonRecords(firstName);
		for (const match of matches) {
			try {
				await personLifecycleService.delete('person', match.id);
			} catch {
				// Absence verification determines whether cleanup ultimately succeeded.
			}
		}
	}
	for (const firstName of [personFirstName, updatedPersonFirstName]) {
		if ((await findOwnedPersonRecords(firstName)).length !== 0) {
			throw new Error('Disposable Person cleanup could not verify absence.');
		}
	}
}

let personLifecycleFailure;
try {
	const createPayload = reconstructRecordPayload(
		recordObject,
		mappedValue({
			[`${personNameField.apiName}__firstName`]: personFirstName,
			[`${personNameField.apiName}__lastName`]: personLastName,
		}),
	);
	const created = await personLifecycleService.create('person', createPayload);
	if (
		typeof created.id !== 'string' ||
		created.id.length === 0 ||
		created[personNameField.apiName]?.firstName !== personFirstName
	) {
		throw new Error('Person Create returned an unexpected shape.');
	}
	createdPersonId = created.id;
	const fetched = await personLifecycleService.get('person', createdPersonId);
	if (fetched[personNameField.apiName]?.firstName !== personFirstName) {
		throw new Error('Person Get did not verify the created fixture.');
	}
	const listed = await personLifecycleService.getMany('person', {
		returnAll: false,
		limit: 1,
		filter: `id[eq]:${JSON.stringify(createdPersonId)}`,
	});
	if (listed.length !== 1 || listed[0]?.id !== createdPersonId) {
		throw new Error('Person Get Many did not verify the created fixture.');
	}
	const updatePayload = reconstructRecordPayload(
		recordObject,
		mappedValue({
			[`${personNameField.apiName}__firstName`]: updatedPersonFirstName,
		}),
	);
	const updated = await personLifecycleService.update('person', createdPersonId, updatePayload);
	if (updated[personNameField.apiName]?.firstName !== updatedPersonFirstName) {
		throw new Error('Person Update returned an unexpected shape.');
	}
	console.log('Compiled fixed Person Create/Get/Get Many/Update qualification passed.');
} catch (error) {
	personLifecycleFailure = error;
} finally {
	try {
		await cleanupOwnedPersonFixture();
	} catch {
		throw new Error('Disposable Person cleanup failed.');
	}
}
if (personLifecycleFailure) throw personLifecycleFailure;
console.log('Compiled fixed Person Delete and absence qualification passed.');
