import type { NormalizedFieldDefinition, NormalizedObjectDefinition } from './contracts';
import { isObjectEmpty } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';
import {
	buildFixedResourceMapperFields,
	buildRecordMapperFields,
	combineRecordMapperValues,
	reconstructRecordPayload,
	TwentyFieldMappingError,
} from './fieldMapping';

function field(overrides: Partial<NormalizedFieldDefinition> = {}): NormalizedFieldDefinition {
	return {
		id: 'fake-field',
		apiName: 'name',
		label: 'Name',
		type: 'TEXT',
		isActive: true,
		isCustom: true,
		isNullable: true,
		isUnique: false,
		isRequired: false,
		isReadOnly: false,
		isSystem: false,
		...overrides,
	};
}

function object(fields: NormalizedFieldDefinition[]): NormalizedObjectDefinition {
	return {
		id: 'fake-object',
		apiNameSingular: 'vehicle',
		apiNamePlural: 'vehicles',
		labelSingular: 'Vehicle',
		labelPlural: 'Vehicles',
		isActive: true,
		isCustom: true,
		isRemote: false,
		isSystem: false,
		isReadOnly: false,
		isSearchable: true,
		fields,
	};
}

function mapper(value: Record<string, unknown>) {
	return {
		mappingMode: 'defineBelow',
		value,
		matchingColumns: [],
		schema: [],
		attemptToConvertTypes: false,
		convertFieldsToString: false,
	};
}

function relation(
	type = 'MANY_TO_ONE',
	sourceField = 'company',
	targetObject = 'company',
	sourceObject = 'opportunity',
) {
	return {
		type,
		source: {
			objectId: 'source-object',
			objectApiNameSingular: sourceObject,
			objectApiNamePlural: 'opportunities',
			fieldId: 'source-field',
			fieldApiName: sourceField,
		},
		target: {
			objectId: 'target-object',
			objectApiNameSingular: targetObject,
			objectApiNamePlural: `${targetObject}s`,
			fieldId: 'target-field',
			fieldApiName: 'opportunities',
		},
	};
}

describe('Twenty record field mapping', () => {
	it('surfaces fixed-resource common fields first while retaining custom additional fields', () => {
		const metadata = object([
			field({ apiName: 'customValue', label: 'Custom Value' }),
			field({ apiName: 'employees', label: 'Employees', type: 'NUMBER' }),
			field({ apiName: 'address', label: 'Address', type: 'ADDRESS' }),
			field({ apiName: 'domainName', label: 'Domain Name', type: 'LINKS' }),
			field({ apiName: 'name', label: 'Name' }),
		]);
		const fixed = buildFixedResourceMapperFields(metadata, 'create', 'company');
		expect(fixed.slice(0, 8).map(({ id }) => id)).toEqual([
			'name',
			'domainName__primaryLinkUrl',
			'employees',
			'address__addressStreet1',
			'address__addressCity',
			'address__addressState',
			'address__addressPostcode',
			'address__addressCountry',
		]);
		expect(fixed).toHaveLength(8);
		expect(fixed.every(({ removed, required }) => removed === false && required === false)).toBe(
			true,
		);
		const additional = buildFixedResourceMapperFields(metadata, 'create', 'company', 'additional');
		expect(additional.find(({ id }) => id === 'customValue')).toMatchObject({ removed: true });
		expect(additional.some(({ id }) => fixed.some((common) => common.id === id))).toBe(false);
		expect(
			buildFixedResourceMapperFields(
				object([
					field({ apiName: 'optionalCustom', label: 'Optional Custom' }),
					field({
						apiName: 'requiredCustom',
						label: 'Required Custom',
						isNullable: false,
						defaultValue: null,
					}),
				]),
				'create',
				'company',
				'additional',
			).map(({ id, required, removed }) => ({ id, required, removed })),
		).toEqual([
			{ id: 'optionalCustom', required: false, removed: true },
			{ id: 'requiredCustom', required: true, removed: false },
		]);
		const generic = buildRecordMapperFields(metadata, 'create');
		expect(generic.map(({ id }) => id)).toEqual([
			'address__addressStreet1',
			'address__addressStreet2',
			'address__addressCity',
			'address__addressPostcode',
			'address__addressState',
			'address__addressCountry',
			'address__addressLat',
			'address__addressLng',
			'customValue',
			'domainName__primaryLinkLabel',
			'domainName__primaryLinkUrl',
			'domainName__secondaryLinks',
			'employees',
			'name',
		]);
		expect(generic.every(({ removed }) => removed === true)).toBe(true);
	});

	it('surfaces preferred Person compounds in order and safely skips missing metadata', () => {
		const metadata = object([
			field({ apiName: 'customValue', label: 'Custom Value' }),
			field({ apiName: 'phones', label: 'Phones', type: 'PHONES' }),
			field({ apiName: 'jobTitle', label: 'Job Title' }),
			field({ apiName: 'name', label: 'Name', type: 'FULL_NAME' }),
			field({ apiName: 'emails', label: 'Emails', type: 'EMAILS' }),
			field({ apiName: 'city', label: 'City' }),
		]);
		const fixed = buildFixedResourceMapperFields(metadata, 'update', 'person');
		expect(fixed.map(({ id }) => id)).toEqual([
			'name__firstName',
			'name__lastName',
			'emails__primaryEmail',
			'phones__primaryPhoneNumber',
			'jobTitle',
			'city',
		]);
		expect(fixed.every(({ removed, required }) => removed === false && required === false)).toBe(
			true,
		);
		const additional = buildFixedResourceMapperFields(metadata, 'update', 'person', 'additional');
		expect(additional.find(({ id }) => id === 'customValue')).toMatchObject({
			removed: true,
			required: false,
		});

		const missing = buildFixedResourceMapperFields(
			object([
				field({ apiName: 'name', label: 'Name', type: 'FULL_NAME' }),
				field({ apiName: 'city', label: 'City' }),
			]),
			'create',
			'person',
		);
		expect(missing.map(({ id }) => id)).toEqual(['name__firstName', 'name__lastName', 'city']);
		expect(missing).not.toEqual(
			expect.arrayContaining([
				expect.objectContaining({ id: 'emails__primaryEmail' }),
				expect.objectContaining({ id: 'phones__primaryPhoneNumber' }),
			]),
		);
	});

	it('combines fixed mapper sections without losing compound parts and rejects unsafe overlap', () => {
		const combined = combineRecordMapperValues(
			mapper({ address__addressCity: 'City' }),
			mapper({ address__addressStreet2: 'Street 2' }),
		);
		expect(
			reconstructRecordPayload(
				object([field({ apiName: 'address', label: 'Address', type: 'ADDRESS' })]),
				combined,
			),
		).toEqual({ address: { addressCity: 'City', addressStreet2: 'Street 2' } });
		expect(() =>
			combineRecordMapperValues(mapper({ name: 'first' }), mapper({ name: 'duplicate' })),
		).toThrow('duplicate field');
		expect(() => combineRecordMapperValues(mapper({ name: 'safe' }), { value: [] })).toThrow(
			'invalid or stale',
		);
	});

	it('maps only configured direct Opportunity relations to scalar REST IDs', () => {
		const metadata = {
			...object([
				field({ apiName: 'name', label: 'Name' }),
				field({ apiName: 'stage', label: 'Stage', type: 'SELECT' }),
				field({ apiName: 'amount', label: 'Amount', type: 'CURRENCY' }),
				field({ apiName: 'closeDate', label: 'Close Date', type: 'DATE_TIME' }),
				field({ apiName: 'company', label: 'Company', type: 'RELATION', relation: relation() }),
				field({
					apiName: 'pointOfContact',
					label: 'Point of Contact',
					type: 'RELATION',
					relation: relation('MANY_TO_ONE', 'pointOfContact', 'person'),
				}),
				field({
					apiName: 'owner',
					label: 'Owner',
					type: 'RELATION',
					relation: relation('MANY_TO_ONE', 'owner', 'workspaceMember'),
				}),
				field({
					apiName: 'attachments',
					label: 'Attachments',
					type: 'RELATION',
					relation: relation('ONE_TO_MANY', 'attachments', 'attachment'),
				}),
				field({ apiName: 'customValue', label: 'Custom Value' }),
			]),
			apiNameSingular: 'opportunity',
		};
		const common = buildFixedResourceMapperFields(metadata, 'create', 'opportunity');
		expect(common.map(({ id }) => id)).toEqual([
			'name',
			'stage',
			'amount__amountMicros',
			'amount__currencyCode',
			'closeDate',
			'companyId',
			'pointOfContactId',
			'ownerId',
		]);
		expect(common.every(({ removed }) => removed === false)).toBe(true);
		const additional = buildFixedResourceMapperFields(
			metadata,
			'create',
			'opportunity',
			'additional',
		);
		expect(additional.map(({ id }) => id)).toEqual(['customValue']);
		expect(additional.map(({ id }) => id)).not.toEqual(
			expect.arrayContaining([
				'attachments',
				'company',
				'companyId',
				'owner',
				'ownerId',
				'pointOfContact',
				'pointOfContactId',
			]),
		);

		expect(
			reconstructRecordPayload(
				metadata,
				mapper({
					name: 'Synthetic',
					amount__amountMicros: 1000,
					companyId: 'company-id',
					pointOfContactId: 'person-id',
				}),
				'opportunity',
			),
		).toEqual({
			name: 'Synthetic',
			amount: { amountMicros: 1000 },
			companyId: 'company-id',
			pointOfContactId: 'person-id',
		});
		expect(() =>
			reconstructRecordPayload(metadata, mapper({ company: {} }), 'opportunity'),
		).toThrow('unknown or stale');
		expect(
			reconstructRecordPayload(metadata, mapper({ ownerId: 'owner-id' }), 'opportunity'),
		).toEqual({ ownerId: 'owner-id' });
		expect(reconstructRecordPayload(metadata, mapper({ company: {} }))).toEqual({ company: {} });

		const unsupportedRelations = {
			...object([
				field({
					apiName: 'company',
					label: 'Company',
					type: 'RELATION',
					relation: relation(),
					isReadOnly: true,
				}),
				field({
					apiName: 'pointOfContact',
					label: 'Point of Contact',
					type: 'RELATION',
					relation: relation('ONE_TO_MANY', 'pointOfContact', 'person'),
				}),
			]),
			apiNameSingular: 'opportunity',
		};
		expect(
			buildFixedResourceMapperFields(unsupportedRelations, 'create', 'opportunity').map(
				({ id }) => id,
			),
		).toEqual([]);
		expect(() =>
			reconstructRecordPayload(
				unsupportedRelations,
				mapper({ companyId: 'company-id', pointOfContactId: 'person-id' }),
				'opportunity',
			),
		).toThrow('unknown or stale');

		for (const malformedRelation of [
			relation('MANY_TO_ONE', 'company', 'company', 'wrongSource'),
			relation('MANY_TO_ONE', 'wrongField', 'company'),
			relation('MANY_TO_ONE', 'company', 'person'),
		]) {
			const malformed = {
				...object([
					field({
						apiName: 'company',
						label: 'Company',
						type: 'RELATION',
						relation: malformedRelation,
					}),
				]),
				apiNameSingular: 'opportunity',
			};
			expect(
				buildFixedResourceMapperFields(malformed, 'create', 'opportunity').map(({ id }) => id),
			).toEqual([]);
			expect(() =>
				reconstructRecordPayload(malformed, mapper({ companyId: 'company-id' }), 'opportunity'),
			).toThrow('unknown or stale');
		}
	});

	it('configures Task and parent relation IDs while omitting fixed child relations', () => {
		const task = {
			...object([
				field({ apiName: 'title', label: 'Title' }),
				field({ apiName: 'bodyV2', label: 'Body', type: 'RICH_TEXT' }),
				field({ apiName: 'dueAt', label: 'Due Date', type: 'DATE_TIME' }),
				field({ apiName: 'status', label: 'Status', type: 'SELECT' }),
				field({
					apiName: 'assignee',
					label: 'Assignee',
					type: 'RELATION',
					relation: relation('MANY_TO_ONE', 'assignee', 'workspaceMember', 'task'),
				}),
				field({
					apiName: 'taskTargets',
					label: 'Targets',
					type: 'RELATION',
					relation: relation('ONE_TO_MANY', 'taskTargets', 'taskTarget', 'task'),
				}),
				field({ apiName: 'customMorph', label: 'Custom Morph', type: 'MORPH_RELATION' }),
			]),
			apiNameSingular: 'task',
		};
		expect(buildFixedResourceMapperFields(task, 'create', 'task').map(({ id }) => id)).toEqual([
			'title',
			'bodyV2__markdown',
			'dueAt',
			'status',
			'assigneeId',
		]);
		expect(
			buildFixedResourceMapperFields(task, 'create', 'task', 'additional').map(
				({ id, displayName }) => ({ id, displayName }),
			),
		).toEqual([{ id: 'bodyV2__blocknote', displayName: 'Body: BlockNote JSON' }]);
		expect(
			reconstructRecordPayload(
				task,
				mapper({ title: 'Synthetic', bodyV2__markdown: 'Body', assigneeId: 'member-id' }),
				'task',
			),
		).toEqual({ title: 'Synthetic', bodyV2: { markdown: 'Body' }, assigneeId: 'member-id' });
		expect(() => reconstructRecordPayload(task, mapper({ taskTargets: [] }), 'task')).toThrow(
			'unknown or stale',
		);
		expect(reconstructRecordPayload(task, mapper({ taskTargets: [] }))).toEqual({
			taskTargets: [],
		});

		const note = {
			...object([
				field({ apiName: 'title', label: 'Title' }),
				field({ apiName: 'bodyV2', label: 'Body', type: 'RICH_TEXT' }),
				field({ apiName: 'noteTargets', label: 'Targets', type: 'MORPH_RELATION' }),
			]),
			apiNameSingular: 'note',
		};
		expect(buildFixedResourceMapperFields(note, 'update', 'note').map(({ id }) => id)).toEqual([
			'title',
			'bodyV2__markdown',
		]);
		expect(
			buildFixedResourceMapperFields(note, 'update', 'note', 'additional').map(
				({ id, displayName }) => ({ id, displayName }),
			),
		).toEqual([{ id: 'bodyV2__blocknote', displayName: 'Body: BlockNote JSON' }]);
		expect(
			reconstructRecordPayload(note, mapper({ bodyV2__blocknote: 'Synthetic blocknote' }), 'note'),
		).toEqual({ bodyV2: { blocknote: 'Synthetic blocknote', markdown: null } });

		for (const [resource, objectApiName, fieldApiName, targetApiName, expectedId] of [
			['company', 'company', 'accountOwner', 'workspaceMember', 'accountOwnerId'],
			['person', 'person', 'company', 'company', 'companyId'],
		] as const) {
			const metadata = {
				...object([
					field({
						apiName: fieldApiName,
						label: 'Relation',
						type: 'RELATION',
						relation: relation('MANY_TO_ONE', fieldApiName, targetApiName, objectApiName),
					}),
				]),
				apiNameSingular: objectApiName,
			};
			expect(
				buildFixedResourceMapperFields(metadata, 'create', resource).map(({ id }) => id),
			).toEqual([expectedId]);
		}
	});
	it('maps scalar, select, array, raw, relation, and future types deterministically', () => {
		const fields = buildRecordMapperFields(
			object([
				field({ apiName: 'zeta', label: 'Zeta', type: 'BOOLEAN' }),
				field({ apiName: 'amount', label: 'Amount', type: 'NUMERIC' }),
				field({ apiName: 'when', label: 'When', type: 'DATE_TIME' }),
				field({
					apiName: 'status',
					label: 'Status',
					type: 'SELECT',
					options: [
						{ label: 'Open', value: 'OPEN' },
						{ label: 4, value: 'bad' },
						{ label: 'Missing value' },
					],
				}),
				field({ apiName: 'tags', label: 'Tags', type: 'MULTI_SELECT' }),
				field({ apiName: 'raw', label: 'Raw', type: 'RAW_JSON' }),
				field({ apiName: 'relation', label: 'Relation', type: 'RELATION' }),
				field({ apiName: 'future', label: 'Future', type: 'FUTURE_VALUE' }),
				field({ apiName: 'alphaB', label: 'Same', type: 'UUID' }),
				field({ apiName: 'alphaA', label: 'Same', type: 'RATING' }),
			]),
			'create',
		);
		expect(fields.map(({ id }) => id)).toEqual([
			'amount',
			'future',
			'raw',
			'relation',
			'alphaA',
			'alphaB',
			'status',
			'tags',
			'when',
			'zeta',
		]);
		expect(fields.map(({ id, type }) => [id, type])).toEqual(
			expect.arrayContaining([
				['amount', 'number'],
				['when', 'dateTime'],
				['zeta', 'boolean'],
				['tags', 'array'],
				['raw', 'object'],
				['relation', 'object'],
				['future', 'object'],
			]),
		);
		expect(fields.find(({ id }) => id === 'future')?.displayName).toContain('Raw JSON');
		expect(fields.find(({ id }) => id === 'raw')?.displayName).toContain('Raw JSON');
		expect(fields.find(({ id }) => id === 'relation')?.displayName).toContain('Raw JSON');
		expect(fields.find(({ id }) => id === 'status')?.options).toEqual([
			{ name: 'Open', value: 'OPEN' },
		]);
	});

	it('filters non-writable fields and applies create-only requiredness', () => {
		const metadata = object([
			field({ apiName: 'required', isNullable: false, defaultValue: null }),
			field({ apiName: 'defaulted', isNullable: false, defaultValue: 'synthetic' }),
			field({ apiName: 'inactive', isActive: false }),
			field({ apiName: 'readonly', isReadOnly: true }),
			field({ apiName: 'system', isSystem: true }),
			field({ apiName: 'searchVector', type: 'TS_VECTOR' }),
		]);
		expect(
			buildRecordMapperFields(metadata, 'create').map(({ id, required }) => [id, required]),
		).toEqual([
			['defaulted', false],
			['required', true],
		]);
		expect(buildRecordMapperFields(metadata, 'update').every(({ required }) => !required)).toBe(
			true,
		);
	});

	it('flattens known compounds and reconstructs exact nested payloads with empty values', () => {
		const metadata = object([
			field({ apiName: 'name', label: 'Name', type: 'FULL_NAME' }),
			field({ apiName: 'address', label: 'Address', type: 'ADDRESS' }),
			field({ apiName: 'emails', label: 'Emails', type: 'EMAILS' }),
			field({ apiName: 'phones', label: 'Phones', type: 'PHONES' }),
			field({ apiName: 'links', label: 'Links', type: 'LINKS' }),
			field({ apiName: 'richText', label: 'Rich Text', type: 'RICH_TEXT' }),
			field({ apiName: 'currency', label: 'Currency', type: 'CURRENCY' }),
		]);
		const schema = buildRecordMapperFields(metadata, 'create');
		expect(schema.map(({ id }) => id)).toEqual(
			expect.arrayContaining([
				'name__firstName',
				'currency__amountMicros',
				'address__addressPostcode',
				'emails__additionalEmails',
				'phones__additionalPhones',
				'links__secondaryLinks',
				'richText__blocknote',
			]),
		);
		expect(schema.find(({ id }) => id === 'richText__blocknote')).toMatchObject({
			type: 'string',
			displayName: 'Rich Text: BlockNote JSON',
		});
		const payload = reconstructRecordPayload(
			metadata,
			mapper({
				name__firstName: '',
				name__lastName: undefined,
				currency__amountMicros: 0,
				address__addressLat: null,
				emails__additionalEmails: [],
				phones__primaryPhoneNumber: false,
				links__secondaryLinks: [{ url: 'synthetic', label: 'Synthetic' }],
				richText__markdown: '',
			}),
		);
		expect(payload).toEqual({
			name: { firstName: '' },
			currency: { amountMicros: 0 },
			address: { addressLat: null },
			emails: { additionalEmails: [] },
			phones: { primaryPhoneNumber: false },
			links: { secondaryLinks: [{ url: 'synthetic', label: 'Synthetic' }] },
			richText: { markdown: '' },
		});
		expect(Object.getPrototypeOf(payload)).toBe(Object.prototype);
		expect(Object.getPrototypeOf(payload.name)).toBe(Object.prototype);
		expect(() => isObjectEmpty(payload)).not.toThrow();
		expect(() => isObjectEmpty(payload.name as object)).not.toThrow();
		expect(isObjectEmpty(payload)).toBe(false);
		expect(isObjectEmpty(payload.name as object)).toBe(false);
		expect(reconstructRecordPayload(metadata, mapper({}))).toEqual({});
		expect(reconstructRecordPayload(metadata, mapper({ name__firstName: undefined }))).toEqual({});
	});

	it.each([
		mapper({ stale: 'value' }),
		mapper(JSON.parse('{"__proto__":"value"}') as Record<string, unknown>),
		{ value: null },
		undefined,
	])('rejects malformed and stale mapper keys safely', (value) => {
		expect(() => reconstructRecordPayload(object([field()]), value)).toThrow(
			TwentyFieldMappingError,
		);
	});
});
