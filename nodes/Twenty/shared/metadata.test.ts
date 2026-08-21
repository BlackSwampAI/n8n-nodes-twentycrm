import type { ILoadOptionsFunctions } from 'n8n-workflow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
	createObjectMetadataService,
	discoverTwentyObjects,
	normalizeTwentyObject,
	OBJECT_METADATA_QUERY,
} from './metadata';
import { twentyApiRequest } from './request';

vi.mock('./request', () => ({ twentyApiRequest: vi.fn() }));
const requestMock = vi.mocked(twentyApiRequest);

function relation() {
	return {
		type: 'MANY_TO_ONE',
		sourceObjectMetadata: { id: 'obj-source', nameSingular: 'vehicle', namePlural: 'vehicles' },
		targetObjectMetadata: { id: 'obj-target', nameSingular: 'garage', namePlural: 'garages' },
		sourceFieldMetadata: { id: 'field-source', name: 'garage' },
		targetFieldMetadata: { id: 'field-target', name: 'vehicles' },
	};
}

function field(overrides: Record<string, unknown> = {}) {
	return {
		id: 'field-fake',
		universalIdentifier: 'universal-field',
		type: 'TEXT',
		name: 'name',
		label: 'Name',
		description: 'Synthetic',
		icon: 'IconAbc',
		isCustom: false,
		isActive: true,
		isSystem: false,
		isUIReadOnly: false,
		isNullable: false,
		isUnique: false,
		defaultValue: null,
		options: [{ value: 'fake', label: 'Fake', color: 'blue', future: { kept: true } }],
		settings: { futureSetting: 42 },
		relation: null,
		morphRelations: [],
		...overrides,
	};
}

function object(overrides: Record<string, unknown> = {}) {
	return {
		id: 'object-fake',
		universalIdentifier: 'universal-object',
		nameSingular: 'vehicle',
		namePlural: 'vehicles',
		labelSingular: 'Vehicle',
		labelPlural: 'Vehicles',
		description: 'Synthetic',
		icon: 'IconCar',
		isCustom: true,
		isRemote: false,
		isActive: true,
		isSystem: false,
		isUIReadOnly: false,
		isSearchable: true,
		fieldsList: [
			field(),
			field({ id: 'field-address', name: 'address', label: 'Address', type: 'ADDRESS' }),
			field({
				id: 'field-status',
				name: 'status',
				label: 'Status',
				type: 'SELECT',
				options: [{ value: 'synthetic', label: 'Synthetic', color: 'green' }],
			}),
			field({
				id: 'field-tags',
				name: 'tags',
				label: 'Tags',
				type: 'MULTI_SELECT',
				options: [{ value: 'fixture', label: 'Fixture', color: 'gray' }],
			}),
			field({ id: 'field-future', name: 'future', label: 'Future', type: 'FUTURE_COMPOUND' }),
			field({
				id: 'field-relation',
				name: 'garage',
				label: 'Garage',
				type: 'RELATION',
				relation: relation(),
			}),
			field({
				id: 'field-morph',
				name: 'linkedRecords',
				label: 'Linked Records',
				type: 'MORPH_RELATION',
				morphRelations: [{ ...relation(), type: 'ONE_TO_MANY' }],
			}),
			field({
				id: 'field-inactive',
				name: 'archivedValue',
				label: 'Archived Value',
				type: 'NUMBER',
				isActive: false,
				isSystem: true,
				isUIReadOnly: true,
				isNullable: true,
			}),
		],
		...overrides,
	};
}

function page(nodes: unknown[], hasNextPage = false, endCursor: unknown = null) {
	return {
		data: {
			objects: { edges: nodes.map((node) => ({ node })), pageInfo: { hasNextPage, endCursor } },
		},
	};
}

describe('Twenty metadata discovery', () => {
	beforeEach(() => requestMock.mockReset());

	it('uses the v2.9 ConnectionCursor scalar for metadata pagination', () => {
		expect(OBJECT_METADATA_QUERY).toContain('$after: ConnectionCursor');
		expect(OBJECT_METADATA_QUERY).not.toContain('$after: String');
	});

	it('queries Metadata GraphQL safely and paginates all objects deterministically', async () => {
		requestMock
			.mockResolvedValueOnce(
				page([object({ nameSingular: 'zebra', namePlural: 'zebras' })], true, 'cursor-1'),
			)
			.mockResolvedValueOnce(
				page([object({ id: 'second', nameSingular: 'alpha', namePlural: 'alphas' })]),
			);
		const results = await discoverTwentyObjects({} as ILoadOptionsFunctions);
		expect(results.map(({ apiNameSingular }) => apiNameSingular)).toEqual(['alpha', 'zebra']);
		expect(requestMock).toHaveBeenNthCalledWith(
			1,
			expect.anything(),
			expect.objectContaining({
				method: 'POST',
				surface: 'metadataGraphql',
				retry: 'safe',
				body: { query: OBJECT_METADATA_QUERY, variables: { after: null } },
			}),
		);
		expect(requestMock).toHaveBeenNthCalledWith(
			2,
			expect.anything(),
			expect.objectContaining({
				body: expect.objectContaining({ variables: { after: 'cursor-1' } }),
			}),
		);
	});

	it('normalizes flags, unknown types/raw settings, and relation endpoints', () => {
		const normalized = normalizeTwentyObject(object());
		expect(normalized).toMatchObject({
			apiNameSingular: 'vehicle',
			apiNamePlural: 'vehicles',
			isCustom: true,
			isActive: true,
			isSystem: false,
			isReadOnly: false,
			isSearchable: true,
		});
		expect(normalized.fields[0]).toMatchObject({
			type: 'TEXT',
			isRequired: true,
			options: [{ future: { kept: true } }],
			settings: { futureSetting: 42 },
		});
		expect(normalized.fields.map(({ type }) => type)).toEqual(
			expect.arrayContaining([
				'ADDRESS',
				'SELECT',
				'MULTI_SELECT',
				'RELATION',
				'MORPH_RELATION',
				'FUTURE_COMPOUND',
			]),
		);
		expect(normalized.fields.find(({ type }) => type === 'SELECT')?.options).toEqual([
			{ value: 'synthetic', label: 'Synthetic', color: 'green' },
		]);
		expect(normalized.fields.find(({ type }) => type === 'MULTI_SELECT')?.options).toEqual([
			{ value: 'fixture', label: 'Fixture', color: 'gray' },
		]);
		expect(normalized.fields.find(({ type }) => type === 'FUTURE_COMPOUND')).toMatchObject({
			type: 'FUTURE_COMPOUND',
			settings: { futureSetting: 42 },
		});
		expect(normalized.fields.find(({ type }) => type === 'RELATION')?.relation).toEqual({
			type: 'MANY_TO_ONE',
			source: {
				objectId: 'obj-source',
				objectApiNameSingular: 'vehicle',
				objectApiNamePlural: 'vehicles',
				fieldId: 'field-source',
				fieldApiName: 'garage',
			},
			target: {
				objectId: 'obj-target',
				objectApiNameSingular: 'garage',
				objectApiNamePlural: 'garages',
				fieldId: 'field-target',
				fieldApiName: 'vehicles',
			},
		});
		expect(normalized.fields.find(({ type }) => type === 'MORPH_RELATION')?.morphRelations).toEqual(
			[expect.objectContaining({ type: 'ONE_TO_MANY' })],
		);
		expect(normalized.fields.find(({ apiName }) => apiName === 'archivedValue')).toMatchObject({
			isActive: false,
			isSystem: true,
			isReadOnly: true,
			isNullable: true,
			isRequired: false,
		});
	});

	it.each([
		undefined,
		{},
		{ data: { objects: { edges: [], pageInfo: {} } } },
		page([null]),
		page([{ ...object(), fieldsList: null }]),
		page([{ ...object(), fieldsList: [field({ name: null })] }]),
	])('rejects malformed metadata without leaking payload values', async (payload) => {
		requestMock.mockResolvedValue(payload);
		await expect(discoverTwentyObjects({} as ILoadOptionsFunctions)).rejects.toThrow(
			/^Twenty metadata returned/,
		);
		try {
			await discoverTwentyObjects({} as ILoadOptionsFunctions);
		} catch (error) {
			expect(String(error)).not.toContain('object-fake');
		}
	});

	it('rejects missing and repeated paging cursors', async () => {
		requestMock.mockResolvedValueOnce(page([], true, null));
		await expect(discoverTwentyObjects({} as ILoadOptionsFunctions)).rejects.toThrow(
			'did not provide a new cursor',
		);
		requestMock
			.mockReset()
			.mockResolvedValueOnce(page([], true, 'same'))
			.mockResolvedValueOnce(page([], true, 'same'));
		await expect(discoverTwentyObjects({} as ILoadOptionsFunctions)).rejects.toThrow(
			'did not provide a new cursor',
		);
	});

	it('bounds traversal and wraps malformed schema errors without payload leakage', async () => {
		for (let index = 0; index < 100; index++) {
			requestMock.mockResolvedValueOnce(page([], true, `cursor-${index}`));
		}
		await expect(discoverTwentyObjects({} as ILoadOptionsFunctions)).rejects.toThrow(
			'exceeded the safety limit',
		);

		requestMock.mockReset().mockResolvedValue({ privateSchemaValue: 'must-not-leak' });
		const context = {
			getNode: () => ({ name: 'Twenty CRM', type: 'twenty', typeVersion: 1, position: [0, 0] }),
		} as unknown as ILoadOptionsFunctions;
		const error = await createObjectMetadataService(context)
			.getObjects()
			.catch((caught) => caught);
		expect(String(error)).toContain('invalid object connection');
		expect(String(error)).not.toContain('must-not-leak');
	});
});
