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
	let opportunityObject;
	let taskObject;
	let noteObject;
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
			if (object.apiNameSingular === 'opportunity') opportunityObject = object;
			if (object.apiNameSingular === 'task') taskObject = object;
			if (object.apiNameSingular === 'note') noteObject = object;
		}
		if (!connection.pageInfo.hasNextPage) {
			if (!hasQualifiedObject)
				throw new Error('Metadata discovery did not return a usable standard object.');
			console.log('Compiled metadata normalization qualification passed.');
			return { recordObject, lifecycleObject, opportunityObject, taskObject, noteObject };
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

const { recordObject, lifecycleObject, opportunityObject, taskObject, noteObject } =
	await qualifyMetadataDiscovery();
if (!recordObject || !lifecycleObject || !opportunityObject || !taskObject || !noteObject)
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

const opportunityService = createRecordService(liveContext, {
	getObject: async () => opportunityObject,
	getObjects: async () => [opportunityObject],
});

function isQualifiedDirectRelation(field, objectApiName, fieldApiName, targetApiName) {
	return (
		field?.apiName === fieldApiName &&
		field.type === 'RELATION' &&
		field.relation?.type === 'MANY_TO_ONE' &&
		field.relation.source.objectApiNameSingular === objectApiName &&
		field.relation.source.fieldApiName === fieldApiName &&
		field.relation.target.objectApiNameSingular === targetApiName &&
		field.isActive &&
		!field.isReadOnly &&
		!field.isSystem
	);
}
const opportunityCompanyField = opportunityObject.fields.find((field) =>
	isQualifiedDirectRelation(field, 'opportunity', 'company', 'company'),
);
const opportunityContactField = opportunityObject.fields.find((field) =>
	isQualifiedDirectRelation(field, 'opportunity', 'pointOfContact', 'person'),
);
const opportunityOwnerField = opportunityObject.fields.find((field) =>
	isQualifiedDirectRelation(field, 'opportunity', 'owner', 'workspaceMember'),
);
if (!opportunityCompanyField || !opportunityContactField || !opportunityOwnerField) {
	throw new Error('Opportunity direct-relation metadata qualification is unavailable.');
}

const opportunityCompanyName = `n8n-pr11-company-${crypto.randomUUID()}`;
const opportunityPersonName = `n8n-pr11-person-${crypto.randomUUID()}`;
const opportunityName = `n8n-pr11-opportunity-${crypto.randomUUID()}`;
const updatedOpportunityName = `${opportunityName}-updated`;
let opportunityCompanyId;
let opportunityPersonId;
let opportunityId;

function hasOwnedRecordId(record) {
	return typeof record.id === 'string' && record.id.length > 0;
}

const workspaceMemberPayload = await liveContext.helpers.httpRequestWithAuthentication(
	'twentyApi',
	{
		method: 'GET',
		url: `${urls.coreRest}/workspaceMembers`,
		qs: { limit: 1 },
	},
);
const workspaceMember = workspaceMemberPayload?.data?.workspaceMembers?.[0];
if (!workspaceMember || !hasOwnedRecordId(workspaceMember)) {
	throw new Error('Workspace member read qualification is unavailable.');
}
const workspaceMemberId = workspaceMember.id;

async function findOwnedOpportunityParents() {
	const companies = await lifecycleService.getMany('company', {
		returnAll: false,
		limit: 200,
		filter: `name[eq]:${JSON.stringify(opportunityCompanyName)}`,
	});
	if (
		companies.some((record) => !hasOwnedRecordId(record) || record.name !== opportunityCompanyName)
	) {
		throw new Error('Opportunity parent cleanup lookup returned an unexpected shape.');
	}
	const people = await personLifecycleService.getMany('person', {
		returnAll: false,
		limit: 200,
		filter: `${personNameField.apiName}.firstName[eq]:${JSON.stringify(opportunityPersonName)}`,
	});
	if (
		people.some(
			(record) =>
				!hasOwnedRecordId(record) ||
				record[personNameField.apiName]?.firstName !== opportunityPersonName,
		)
	) {
		throw new Error('Opportunity parent cleanup lookup returned an unexpected shape.');
	}
	return { companies, people };
}

async function findOwnedOpportunities(name) {
	const matches = await opportunityService.getMany('opportunity', {
		returnAll: false,
		limit: 200,
		filter: `name[eq]:${JSON.stringify(name)}`,
	});
	if (matches.some((record) => !hasOwnedRecordId(record) || record.name !== name)) {
		throw new Error('Opportunity cleanup lookup returned an unexpected shape.');
	}
	return matches;
}

async function cleanupOpportunityLifecycle() {
	if (opportunityId) {
		try {
			await opportunityService.delete('opportunity', opportunityId);
		} catch {
			// Exact-owned fallback and absence verification below determine cleanup success.
		}
	}
	for (const name of [opportunityName, updatedOpportunityName]) {
		for (const record of await findOwnedOpportunities(name)) {
			try {
				await opportunityService.delete('opportunity', record.id);
			} catch {
				// Absence verification below determines cleanup success.
			}
		}
	}
	for (const [service, apiName, id] of [
		[lifecycleService, 'company', opportunityCompanyId],
		[personLifecycleService, 'person', opportunityPersonId],
	]) {
		if (!id) continue;
		try {
			await service.delete(apiName, id);
		} catch {
			// Exact-owned fallback and absence verification below determine cleanup success.
		}
	}
	const parents = await findOwnedOpportunityParents();
	for (const record of parents.people) {
		try {
			await personLifecycleService.delete('person', record.id);
		} catch {
			// Absence verification below determines cleanup success.
		}
	}
	for (const record of parents.companies) {
		try {
			await lifecycleService.delete('company', record.id);
		} catch {
			// Absence verification below determines cleanup success.
		}
	}
	for (const name of [opportunityName, updatedOpportunityName]) {
		if ((await findOwnedOpportunities(name)).length !== 0) {
			throw new Error('Opportunity cleanup could not verify absence.');
		}
	}
	const remainingParents = await findOwnedOpportunityParents();
	if (remainingParents.companies.length !== 0 || remainingParents.people.length !== 0) {
		throw new Error('Opportunity parent cleanup could not verify absence.');
	}
}

let opportunityLifecycleFailure;
try {
	const company = await lifecycleService.create(
		'company',
		reconstructRecordPayload(
			lifecycleObject,
			mappedValue({ name: opportunityCompanyName, accountOwnerId: workspaceMemberId }),
			'company',
		),
	);
	if (
		typeof company.id !== 'string' ||
		company.name !== opportunityCompanyName ||
		company.accountOwnerId !== workspaceMemberId
	) {
		throw new Error('Opportunity Company parent returned an unexpected shape.');
	}
	opportunityCompanyId = company.id;
	const person = await personLifecycleService.create(
		'person',
		reconstructRecordPayload(
			recordObject,
			mappedValue({
				[`${personNameField.apiName}__firstName`]: opportunityPersonName,
				[`${personNameField.apiName}__lastName`]: personLastName,
				companyId: opportunityCompanyId,
			}),
			'person',
		),
	);
	if (
		typeof person.id !== 'string' ||
		person[personNameField.apiName]?.firstName !== opportunityPersonName ||
		person.companyId !== opportunityCompanyId
	) {
		throw new Error('Opportunity Person parent returned an unexpected shape.');
	}
	opportunityPersonId = person.id;
	const created = await opportunityService.create(
		'opportunity',
		reconstructRecordPayload(
			opportunityObject,
			mappedValue({
				name: opportunityName,
				companyId: opportunityCompanyId,
				pointOfContactId: opportunityPersonId,
				ownerId: workspaceMemberId,
			}),
			'opportunity',
		),
	);
	if (
		typeof created.id !== 'string' ||
		created.name !== opportunityName ||
		created.companyId !== opportunityCompanyId ||
		created.pointOfContactId !== opportunityPersonId ||
		created.ownerId !== workspaceMemberId
	) {
		throw new Error('Opportunity Create returned an unexpected relation shape.');
	}
	opportunityId = created.id;
	const fetched = await opportunityService.get('opportunity', opportunityId);
	if (
		fetched.name !== opportunityName ||
		fetched.companyId !== opportunityCompanyId ||
		fetched.pointOfContactId !== opportunityPersonId ||
		fetched.ownerId !== workspaceMemberId
	) {
		throw new Error('Opportunity Get did not verify direct relations.');
	}
	const listed = await opportunityService.getMany('opportunity', {
		returnAll: false,
		limit: 1,
		filter: `id[eq]:${JSON.stringify(opportunityId)}`,
	});
	if (listed.length !== 1 || listed[0]?.id !== opportunityId) {
		throw new Error('Opportunity Get Many did not verify the fixture.');
	}
	const updated = await opportunityService.update(
		'opportunity',
		opportunityId,
		reconstructRecordPayload(
			opportunityObject,
			mappedValue({
				name: updatedOpportunityName,
				companyId: opportunityCompanyId,
				pointOfContactId: opportunityPersonId,
				ownerId: workspaceMemberId,
			}),
			'opportunity',
		),
	);
	if (
		updated.name !== updatedOpportunityName ||
		updated.companyId !== opportunityCompanyId ||
		updated.pointOfContactId !== opportunityPersonId ||
		updated.ownerId !== workspaceMemberId
	) {
		throw new Error('Opportunity Update did not verify direct relations.');
	}
	console.log('Compiled fixed Opportunity relation-ID lifecycle qualification passed.');
} catch (error) {
	opportunityLifecycleFailure = error;
} finally {
	try {
		await cleanupOpportunityLifecycle();
	} catch {
		throw new Error('Disposable Opportunity lifecycle cleanup failed.');
	}
}
if (opportunityLifecycleFailure) throw opportunityLifecycleFailure;
console.log('Compiled fixed Opportunity Delete and absence qualification passed.');

async function runOwnedTitleLifecycle({
	apiName,
	object,
	title,
	updatedTitle,
	createValues,
	updateValues,
	verify,
}) {
	const service = createRecordService(liveContext, {
		getObject: async () => object,
		getObjects: async () => [object],
	});
	let id;
	let lifecycleError;
	async function findOwned(name) {
		const matches = await service.getMany(apiName, {
			returnAll: false,
			limit: 200,
			filter: `title[eq]:${JSON.stringify(name)}`,
		});
		if (matches.some((record) => !hasOwnedRecordId(record) || record.title !== name)) {
			throw new Error('Fixed-resource cleanup lookup returned an unexpected shape.');
		}
		return matches;
	}
	async function cleanup() {
		if (id) {
			try {
				await service.delete(apiName, id);
			} catch {
				// Exact-title fallback and absence verification below determine cleanup success.
			}
		}
		for (const name of [title, updatedTitle]) {
			for (const record of await findOwned(name)) {
				try {
					await service.delete(apiName, record.id);
				} catch {
					// Absence verification below determines cleanup success.
				}
			}
		}
		for (const name of [title, updatedTitle]) {
			if ((await findOwned(name)).length !== 0) {
				throw new Error('Fixed-resource cleanup could not verify absence.');
			}
		}
	}
	try {
		const created = await service.create(
			apiName,
			reconstructRecordPayload(object, mappedValue(createValues), apiName),
		);
		if (!hasOwnedRecordId(created))
			throw new Error('Fixed-resource Create returned an invalid identifier shape.');
		if (created.title !== title)
			throw new Error('Fixed-resource Create did not preserve its owned title.');
		if (!verify(created, createValues))
			throw new Error('Fixed-resource Create did not preserve its qualified field shape.');
		id = created.id;
		const fetched = await service.get(apiName, id);
		if (fetched.title !== title || !verify(fetched, createValues)) {
			throw new Error('Fixed-resource Get did not verify the fixture.');
		}
		const listed = await service.getMany(apiName, {
			returnAll: false,
			limit: 1,
			filter: `id[eq]:${JSON.stringify(id)}`,
		});
		if (listed.length !== 1 || listed[0]?.id !== id) {
			throw new Error('Fixed-resource Get Many did not verify the fixture.');
		}
		const updated = await service.update(
			apiName,
			id,
			reconstructRecordPayload(object, mappedValue(updateValues), apiName),
		);
		if (updated.title !== updatedTitle || !verify(updated, updateValues)) {
			throw new Error('Fixed-resource Update returned an unexpected shape.');
		}
	} catch (error) {
		lifecycleError = error;
	} finally {
		try {
			await cleanup();
		} catch {
			throw new Error('Disposable fixed-resource lifecycle cleanup failed.');
		}
	}
	if (lifecycleError) throw lifecycleError;
}

const taskStatusField = taskObject.fields.find(
	(field) =>
		field.apiName === 'status' &&
		field.type === 'SELECT' &&
		field.isActive &&
		!field.isReadOnly &&
		!field.isSystem,
);
const taskStatus = Array.isArray(taskStatusField?.options)
	? taskStatusField.options.find((option) => typeof option?.value === 'string')?.value
	: undefined;
const taskBodyField = taskObject.fields.find(
	(field) =>
		field.apiName === 'bodyV2' &&
		field.type === 'RICH_TEXT' &&
		field.isActive &&
		!field.isReadOnly &&
		!field.isSystem,
);
const taskAssigneeField = taskObject.fields.find((field) =>
	isQualifiedDirectRelation(field, 'task', 'assignee', 'workspaceMember'),
);
if (!taskStatus || !taskBodyField || !taskAssigneeField) {
	throw new Error('Task metadata qualification is unavailable.');
}
const taskTitle = `n8n-pr11-task-${crypto.randomUUID()}`;
const updatedTaskTitle = `${taskTitle}-updated`;
const taskMarkdown = `Task body ${crypto.randomUUID()}`;
const updatedTaskMarkdown = `${taskMarkdown} updated`;
const taskDueAt = new Date(Date.now() + 86_400_000).toISOString();
await runOwnedTitleLifecycle({
	apiName: 'task',
	object: taskObject,
	title: taskTitle,
	updatedTitle: updatedTaskTitle,
	createValues: {
		title: taskTitle,
		bodyV2__markdown: taskMarkdown,
		dueAt: taskDueAt,
		status: taskStatus,
		assigneeId: workspaceMemberId,
	},
	updateValues: {
		title: updatedTaskTitle,
		bodyV2__markdown: updatedTaskMarkdown,
		dueAt: taskDueAt,
		status: taskStatus,
		assigneeId: workspaceMemberId,
	},
	verify: (record, values) =>
		record.bodyV2?.markdown === values.bodyV2__markdown &&
		record.dueAt === values.dueAt &&
		record.status === values.status &&
		record.assigneeId === values.assigneeId,
});
console.log('Compiled fixed Task rich-text/relation lifecycle qualification passed.');

const noteBodyField = noteObject.fields.find(
	(field) =>
		field.apiName === 'bodyV2' &&
		field.type === 'RICH_TEXT' &&
		field.isActive &&
		!field.isReadOnly &&
		!field.isSystem,
);
if (!noteBodyField) throw new Error('Note rich-text metadata qualification is unavailable.');
const noteTitle = `n8n-pr11-note-${crypto.randomUUID()}`;
const updatedNoteTitle = `${noteTitle}-updated`;
const noteMarkdown = `Note body ${crypto.randomUUID()}`;
const updatedNoteMarkdown = `Note body ${crypto.randomUUID()}`;
await runOwnedTitleLifecycle({
	apiName: 'note',
	object: noteObject,
	title: noteTitle,
	updatedTitle: updatedNoteTitle,
	createValues: { title: noteTitle, bodyV2__markdown: noteMarkdown },
	updateValues: { title: updatedNoteTitle, bodyV2__markdown: updatedNoteMarkdown },
	verify: (record, values) => record.bodyV2?.markdown === values.bodyV2__markdown,
});
console.log('Compiled fixed Note rich-text lifecycle qualification passed.');
