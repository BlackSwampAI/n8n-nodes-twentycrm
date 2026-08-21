import type { NormalizedFieldDefinition, NormalizedObjectDefinition } from './contracts';
import { isObjectEmpty } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';
import {
	buildRecordMapperFields,
	buildFixedResourceMapperFields,
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
		expect(fixed.slice(0, 8).every(({ removed }) => removed === false)).toBe(true);
		expect(fixed.find(({ id }) => id === 'customValue')).toMatchObject({ removed: true });
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
		expect(fixed.slice(0, 7).map(({ id }) => id)).toEqual([
			'name__firstName',
			'name__lastName',
			'emails__primaryEmail',
			'phones__primaryPhoneNumber',
			'jobTitle',
			'city',
			'customValue',
		]);
		expect(fixed.slice(0, 6).every(({ removed }) => removed === false)).toBe(true);
		expect(fixed.find(({ id }) => id === 'customValue')).toMatchObject({
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
			displayName: 'Rich Text: Blocknote',
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
