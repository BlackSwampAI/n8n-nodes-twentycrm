import type { IDataObject, ResourceMapperField, ResourceMapperValue } from 'n8n-workflow';

import type { NormalizedFieldDefinition, NormalizedObjectDefinition } from './contracts';

type MapperMode = 'create' | 'update';
export type FixedResource = 'company' | 'person' | 'opportunity' | 'task' | 'note';
type CompoundPart = { name: string; label: string; type: ResourceMapperField['type'] };

const COMPOUND_PARTS: Readonly<Record<string, readonly CompoundPart[]>> = {
	FULL_NAME: [
		{ name: 'firstName', label: 'First Name', type: 'string' },
		{ name: 'lastName', label: 'Last Name', type: 'string' },
	],
	CURRENCY: [
		{ name: 'amountMicros', label: 'Amount Micros', type: 'number' },
		{ name: 'currencyCode', label: 'Currency Code', type: 'string' },
	],
	ADDRESS: [
		{ name: 'addressStreet1', label: 'Street 1', type: 'string' },
		{ name: 'addressStreet2', label: 'Street 2', type: 'string' },
		{ name: 'addressCity', label: 'City', type: 'string' },
		{ name: 'addressPostcode', label: 'Postcode', type: 'string' },
		{ name: 'addressState', label: 'State', type: 'string' },
		{ name: 'addressCountry', label: 'Country', type: 'string' },
		{ name: 'addressLat', label: 'Latitude', type: 'number' },
		{ name: 'addressLng', label: 'Longitude', type: 'number' },
	],
	EMAILS: [
		{ name: 'primaryEmail', label: 'Primary Email', type: 'string' },
		{ name: 'additionalEmails', label: 'Additional Emails (JSON)', type: 'array' },
	],
	PHONES: [
		{ name: 'primaryPhoneNumber', label: 'Primary Phone Number', type: 'string' },
		{ name: 'primaryPhoneCountryCode', label: 'Primary Phone Country Code', type: 'string' },
		{ name: 'primaryPhoneCallingCode', label: 'Primary Phone Calling Code', type: 'string' },
		{ name: 'additionalPhones', label: 'Additional Phones (JSON)', type: 'array' },
	],
	LINKS: [
		{ name: 'primaryLinkLabel', label: 'Primary Link Label', type: 'string' },
		{ name: 'primaryLinkUrl', label: 'Primary Link URL', type: 'string' },
		{ name: 'secondaryLinks', label: 'Secondary Links (JSON)', type: 'array' },
	],
	RICH_TEXT: [
		{ name: 'blocknote', label: 'BlockNote JSON', type: 'string' },
		{ name: 'markdown', label: 'Markdown', type: 'string' },
	],
};

const TYPE_MAP: Readonly<Record<string, ResourceMapperField['type']>> = {
	TEXT: 'string',
	UUID: 'string',
	RATING: 'string',
	NUMBER: 'number',
	NUMERIC: 'number',
	POSITION: 'number',
	BOOLEAN: 'boolean',
	DATE: 'dateTime',
	DATE_TIME: 'dateTime',
	SELECT: 'options',
	MULTI_SELECT: 'array',
	ARRAY: 'array',
	FILES: 'array',
	RAW_JSON: 'object',
	RELATION: 'object',
	MORPH_RELATION: 'object',
};

const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const RAW_JSON_TYPES = new Set(['RAW_JSON', 'RELATION', 'MORPH_RELATION']);

export class TwentyFieldMappingError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'TwentyFieldMappingError';
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function writableFields(object: NormalizedObjectDefinition): NormalizedFieldDefinition[] {
	return object.fields
		.filter(
			(field) =>
				field.isActive && !field.isReadOnly && !field.isSystem && field.type !== 'TS_VECTOR',
		)
		.filter((field) => !UNSAFE_KEYS.has(field.apiName) && !field.apiName.includes('__'))
		.sort((left, right) => {
			const labelOrder = left.label.localeCompare(right.label, 'en', { sensitivity: 'base' });
			return labelOrder || left.apiName.localeCompare(right.apiName, 'en');
		});
}

function optionsFor(field: NormalizedFieldDefinition): ResourceMapperField['options'] {
	if (!Array.isArray(field.options)) return [];
	return field.options.flatMap((option) => {
		if (!isRecord(option) || typeof option.label !== 'string') return [];
		if (!['string', 'number', 'boolean'].includes(typeof option.value)) return [];
		return [{ name: option.label, value: option.value as string | number | boolean }];
	});
}

function requiredOnCreate(field: NormalizedFieldDefinition, mode: MapperMode): boolean {
	return mode === 'create' && !field.isNullable && field.defaultValue == null;
}

function mapperField(
	id: string,
	displayName: string,
	type: ResourceMapperField['type'],
	required: boolean,
	options?: ResourceMapperField['options'],
): ResourceMapperField {
	return {
		id,
		displayName,
		defaultMatch: false,
		canBeUsedToMatch: false,
		required,
		display: true,
		type,
		removed: !required,
		...(options?.length ? { options } : {}),
	};
}

export function buildRecordMapperFields(
	object: NormalizedObjectDefinition,
	mode: MapperMode,
): ResourceMapperField[] {
	return writableFields(object).flatMap((field) => {
		const compound = COMPOUND_PARTS[field.type];
		if (compound) {
			return compound.map((part) =>
				mapperField(
					`${field.apiName}__${part.name}`,
					`${field.label}: ${part.label}`,
					part.type,
					false,
				),
			);
		}
		const type = TYPE_MAP[field.type] ?? 'object';
		const rawSuffix = !TYPE_MAP[field.type] || RAW_JSON_TYPES.has(field.type) ? ' (Raw JSON)' : '';
		return [
			mapperField(
				field.apiName,
				`${field.label}${rawSuffix}`,
				type,
				requiredOnCreate(field, mode),
				field.type === 'SELECT' ? optionsFor(field) : undefined,
			),
		];
	});
}

export const FIXED_RESOURCES: readonly FixedResource[] = [
	'company',
	'person',
	'opportunity',
	'task',
	'note',
];

export function isFixedResource(value: string): value is FixedResource {
	return FIXED_RESOURCES.includes(value as FixedResource);
}

const FIXED_PREFERRED_IDS: Readonly<Record<FixedResource, readonly string[]>> = {
	company: [
		'name',
		'accountOwnerId',
		'domainName__primaryLinkUrl',
		'employees',
		'address__addressStreet1',
		'address__addressCity',
		'address__addressState',
		'address__addressPostcode',
		'address__addressCountry',
	],
	person: [
		'name__firstName',
		'name__lastName',
		'emails__primaryEmail',
		'phones__primaryPhoneNumber',
		'jobTitle',
		'city',
		'companyId',
	],
	opportunity: [
		'name',
		'stage',
		'amount__amountMicros',
		'amount__currencyCode',
		'closeDate',
		'companyId',
		'pointOfContactId',
		'ownerId',
	],
	task: ['title', 'bodyV2__markdown', 'dueAt', 'status', 'assigneeId'],
	note: ['title', 'bodyV2__markdown'],
};

type FixedDirectRelation = { fieldApiName: string; targetObjectApiName: string };

const FIXED_DIRECT_RELATIONS: Readonly<
	Partial<Record<FixedResource, readonly FixedDirectRelation[]>>
> = {
	company: [{ fieldApiName: 'accountOwner', targetObjectApiName: 'workspaceMember' }],
	person: [{ fieldApiName: 'company', targetObjectApiName: 'company' }],
	opportunity: [
		{ fieldApiName: 'company', targetObjectApiName: 'company' },
		{ fieldApiName: 'pointOfContact', targetObjectApiName: 'person' },
		{ fieldApiName: 'owner', targetObjectApiName: 'workspaceMember' },
	],
	task: [{ fieldApiName: 'assignee', targetObjectApiName: 'workspaceMember' }],
};

function directRelationFields(
	object: NormalizedObjectDefinition,
	resource: FixedResource,
): NormalizedFieldDefinition[] {
	const configured = new Map(
		(FIXED_DIRECT_RELATIONS[resource] ?? []).map((relation) => [relation.fieldApiName, relation]),
	);
	return writableFields(object).filter((field) => {
		const expected = configured.get(field.apiName);
		return (
			expected !== undefined &&
			field.type === 'RELATION' &&
			field.relation?.type === 'MANY_TO_ONE' &&
			field.relation.source.objectApiNameSingular === object.apiNameSingular &&
			field.relation.source.fieldApiName === field.apiName &&
			field.relation.target.objectApiNameSingular === expected.targetObjectApiName
		);
	});
}

function fixedMapperFields(
	object: NormalizedObjectDefinition,
	mode: MapperMode,
	resource: FixedResource,
): ResourceMapperField[] {
	const directRelations = directRelationFields(object, resource);
	const relationNames = new Set(directRelations.map(({ apiName }) => apiName));
	const fixedRelationNames = new Set(
		writableFields(object)
			.filter((field) => field.type === 'RELATION' || field.type === 'MORPH_RELATION')
			.map(({ apiName }) => apiName),
	);
	return [
		...buildRecordMapperFields(object, mode).filter(
			(field) => !relationNames.has(field.id) && !fixedRelationNames.has(field.id),
		),
		...directRelations.map((field) =>
			mapperField(
				`${field.apiName}Id`,
				`${field.label} ID`,
				'string',
				requiredOnCreate(field, mode),
			),
		),
	];
}

export function buildFixedResourceMapperFields(
	object: NormalizedObjectDefinition,
	mode: MapperMode,
	resource: FixedResource,
	section: 'common' | 'additional' = 'common',
): ResourceMapperField[] {
	const preferred = FIXED_PREFERRED_IDS[resource];
	const rank = new Map(preferred.map((id, index) => [id, index]));
	return fixedMapperFields(object, mode, resource)
		.filter((field) => (section === 'common' ? rank.has(field.id) : !rank.has(field.id)))
		.map((field) => (section === 'common' ? { ...field, removed: false } : field))
		.sort((left, right) => {
			const leftRank = rank.get(left.id);
			const rightRank = rank.get(right.id);
			if (leftRank !== undefined || rightRank !== undefined) {
				return (leftRank ?? Number.POSITIVE_INFINITY) - (rightRank ?? Number.POSITIVE_INFINITY);
			}
			return 0;
		});
}

export function combineRecordMapperValues(
	commonValue: ResourceMapperValue | unknown,
	additionalValue: ResourceMapperValue | unknown,
): ResourceMapperValue {
	const combined: Record<string, unknown> = {};
	for (const mapperValue of [commonValue, additionalValue]) {
		if (!isRecord(mapperValue) || (mapperValue.value !== null && !isRecord(mapperValue.value))) {
			throw new TwentyFieldMappingError('Twenty field mapping input is invalid or stale.');
		}
		if (mapperValue.value === null) continue;
		for (const key of Object.getOwnPropertyNames(mapperValue.value)) {
			if (UNSAFE_KEYS.has(key) || key.split('__').some((part) => UNSAFE_KEYS.has(part))) {
				throw new TwentyFieldMappingError('Twenty field mapping contains an unsafe field.');
			}
			if (Object.prototype.hasOwnProperty.call(combined, key)) {
				throw new TwentyFieldMappingError('Twenty field mapping contains a duplicate field.');
			}
			combined[key] = mapperValue.value[key];
		}
	}
	return {
		mappingMode: 'defineBelow',
		value: combined as ResourceMapperValue['value'],
		matchingColumns: [],
		schema: [],
		attemptToConvertTypes: false,
		convertFieldsToString: false,
	};
}

function mapperValues(value: unknown): Record<string, unknown> {
	if (!isRecord(value) || !isRecord(value.value)) {
		throw new TwentyFieldMappingError('Twenty field mapping input is invalid or stale.');
	}
	return value.value;
}

export function reconstructRecordPayload(
	object: NormalizedObjectDefinition,
	mapperValue: ResourceMapperValue | unknown,
	resource?: FixedResource,
): IDataObject {
	const values = mapperValues(mapperValue);
	const allowed = new Map<string, { parent: string; part?: string }>();
	const directRelations = resource ? directRelationFields(object, resource) : [];
	const relationNames = new Set(directRelations.map(({ apiName }) => apiName));
	for (const field of writableFields(object)) {
		if (resource && (field.type === 'RELATION' || field.type === 'MORPH_RELATION')) continue;
		if (relationNames.has(field.apiName)) continue;
		const compound = COMPOUND_PARTS[field.type];
		if (compound) {
			for (const part of compound) {
				allowed.set(`${field.apiName}__${part.name}`, { parent: field.apiName, part: part.name });
			}
		} else {
			allowed.set(field.apiName, { parent: field.apiName });
		}
	}
	for (const field of directRelations) {
		allowed.set(`${field.apiName}Id`, { parent: `${field.apiName}Id` });
	}
	const payload: IDataObject = {};
	for (const [key, value] of Object.entries(values)) {
		if (value === undefined) continue;
		const target = allowed.get(key);
		if (
			!target ||
			UNSAFE_KEYS.has(target.parent) ||
			(target.part && UNSAFE_KEYS.has(target.part))
		) {
			throw new TwentyFieldMappingError(
				'Twenty field mapping contains an unknown or stale field. Refresh the field mapping.',
			);
		}
		if (!target.part) {
			payload[target.parent] = value as IDataObject[string];
			continue;
		}
		const compound = (payload[target.parent] ??= {}) as IDataObject;
		compound[target.part] = value as IDataObject[string];
	}
	for (const field of writableFields(object)) {
		if (field.type !== 'RICH_TEXT') continue;
		const richText = payload[field.apiName];
		if (
			richText !== null &&
			typeof richText === 'object' &&
			!Array.isArray(richText) &&
			Object.prototype.hasOwnProperty.call(richText, 'blocknote') &&
			!Object.prototype.hasOwnProperty.call(richText, 'markdown')
		) {
			(richText as IDataObject).markdown = null;
		}
	}
	return payload;
}
