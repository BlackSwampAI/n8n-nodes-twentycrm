import type { IDataObject, ResourceMapperField, ResourceMapperValue } from 'n8n-workflow';

import type { NormalizedFieldDefinition, NormalizedObjectDefinition } from './contracts';

type MapperMode = 'create' | 'update';
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
		{ name: 'blocknote', label: 'Blocknote', type: 'string' },
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

function mapperValues(value: unknown): Record<string, unknown> {
	if (!isRecord(value) || !isRecord(value.value)) {
		throw new TwentyFieldMappingError('Twenty field mapping input is invalid or stale.');
	}
	return value.value;
}

export function reconstructRecordPayload(
	object: NormalizedObjectDefinition,
	mapperValue: ResourceMapperValue | unknown,
): IDataObject {
	const values = mapperValues(mapperValue);
	const allowed = new Map<string, { parent: string; part?: string }>();
	for (const field of writableFields(object)) {
		const compound = COMPOUND_PARTS[field.type];
		if (compound) {
			for (const part of compound) {
				allowed.set(`${field.apiName}__${part.name}`, { parent: field.apiName, part: part.name });
			}
		} else {
			allowed.set(field.apiName, { parent: field.apiName });
		}
	}
	const payload = Object.create(null) as IDataObject;
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
		const compound = (payload[target.parent] ??= Object.create(null) as IDataObject) as IDataObject;
		compound[target.part] = value as IDataObject[string];
	}
	return payload;
}
