import type { IExecuteFunctions } from 'n8n-workflow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { NormalizedObjectDefinition, ObjectMetadataService } from './contracts';
import { createRecordReadService } from './records';
import { twentyApiRequest } from './request';

vi.mock('./request', () => ({ twentyApiRequest: vi.fn() }));
const requestMock = vi.mocked(twentyApiRequest);

const context = {
	getNode: () => ({ name: 'Twenty CRM', type: 'twenty', typeVersion: 1, position: [0, 0] }),
} as unknown as IExecuteFunctions;

function object(overrides: Partial<NormalizedObjectDefinition> = {}): NormalizedObjectDefinition {
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
		fields: [],
		...overrides,
	};
}

function metadata(value = object()): ObjectMetadataService {
	return { getObject: vi.fn().mockResolvedValue(value), getObjects: vi.fn() };
}

function page(records: unknown[], hasNextPage = false, endCursor: unknown = null) {
	return { data: { vehicles: records }, pageInfo: { hasNextPage, endCursor } };
}

describe('Twenty record read service', () => {
	beforeEach(() => requestMock.mockReset());

	it('resolves singular metadata to an encoded plural Get route and unwraps the record', async () => {
		requestMock.mockResolvedValue({
			data: { vehicle: { id: 'synthetic', future: { kept: true } } },
		});
		const result = await createRecordReadService(context, metadata()).get(
			'vehicle',
			'record value',
		);
		expect(result).toEqual({ id: 'synthetic', future: { kept: true } });
		expect(requestMock).toHaveBeenCalledWith(context, {
			method: 'GET',
			surface: 'coreRest',
			path: '/vehicles/record%20value',
		});
	});

	it('honors a finite limit across pages and preserves filter/sort query values', async () => {
		requestMock
			.mockResolvedValueOnce(
				page(
					Array.from({ length: 200 }, (_, index) => ({ index })),
					true,
					'next',
				),
			)
			.mockResolvedValueOnce(page(Array.from({ length: 50 }, (_, index) => ({ index }))));
		const result = await createRecordReadService(context, metadata()).getMany('vehicle', {
			returnAll: false,
			limit: 250,
			filter: '  status[eq]:"open"  ',
			orderBy: '  createdAt[DescNullsLast]  ',
		});
		expect(result).toHaveLength(250);
		expect(requestMock).toHaveBeenNthCalledWith(
			1,
			context,
			expect.objectContaining({
				path: '/vehicles',
				query: { limit: 200, filter: 'status[eq]:"open"', order_by: 'createdAt[DescNullsLast]' },
			}),
		);
		expect(requestMock).toHaveBeenNthCalledWith(
			2,
			context,
			expect.objectContaining({
				query: {
					limit: 50,
					filter: 'status[eq]:"open"',
					order_by: 'createdAt[DescNullsLast]',
					starting_after: 'next',
				},
			}),
		);
	});

	it('returns all pages and rejects repeated or missing cursors safely', async () => {
		requestMock
			.mockResolvedValueOnce(page([{ fixture: true }], true, 'next'))
			.mockResolvedValueOnce(page([{ fixture: true }]));
		await expect(
			createRecordReadService(context, metadata()).getMany('vehicle', { returnAll: true }),
		).resolves.toHaveLength(2);

		requestMock
			.mockReset()
			.mockResolvedValueOnce(page([], true, 'same'))
			.mockResolvedValueOnce(page([], true, 'same'));
		await expect(
			createRecordReadService(context, metadata()).getMany('vehicle', { returnAll: true }),
		).rejects.toThrow('did not provide a new cursor');
		requestMock.mockReset().mockResolvedValue(page([], true, null));
		await expect(
			createRecordReadService(context, metadata()).getMany('vehicle', { returnAll: true }),
		).rejects.toThrow('did not provide a new cursor');
	});

	it.each([
		{},
		{ data: { vehicles: {} }, pageInfo: { hasNextPage: false } },
		{ data: { vehicles: [null] }, pageInfo: { hasNextPage: false } },
	])('rejects malformed list envelopes without leaking payload content', async (response) => {
		requestMock.mockResolvedValue({ ...response, privateValue: 'must-not-leak' });
		const error = await createRecordReadService(context, metadata())
			.getMany('vehicle', { returnAll: true })
			.catch((caught) => caught);
		expect(String(error)).toContain('invalid record list response');
		expect(String(error)).not.toContain('must-not-leak');
	});

	it('rejects malformed single-record envelopes without leaking payload content', async () => {
		requestMock.mockResolvedValue({ data: { vehicle: null }, privateValue: 'must-not-leak' });
		const error = await createRecordReadService(context, metadata())
			.get('vehicle', 'safe-id')
			.catch((caught) => caught);
		expect(String(error)).toContain('invalid record response');
		expect(String(error)).not.toContain('must-not-leak');
	});

	it.each([{ isActive: false }, { isSystem: true }, { isRemote: true }])(
		'rejects unsupported metadata before routing',
		async (overrides) => {
			await expect(
				createRecordReadService(context, metadata(object(overrides))).getMany('vehicle', {
					returnAll: true,
				}),
			).rejects.toThrow('not available for record operations');
			expect(requestMock).not.toHaveBeenCalled();
		},
	);

	it('rejects unsafe path identifiers and invalid limits before requests', async () => {
		await expect(
			createRecordReadService(context, metadata()).get('vehicle', '../escape'),
		).rejects.toThrow('record identifier is invalid');
		await expect(
			createRecordReadService(
				context,
				metadata(object({ apiNamePlural: 'vehicles/escape' })),
			).getMany('vehicle', { returnAll: true }),
		).rejects.toThrow('object API name is invalid');
		await expect(
			createRecordReadService(context, metadata()).getMany('vehicle', {
				returnAll: false,
				limit: 0,
			}),
		).rejects.toThrow('positive integer');
		expect(requestMock).not.toHaveBeenCalled();
	});
});
