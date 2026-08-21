import type { IExecuteFunctions } from 'n8n-workflow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { NormalizedObjectDefinition, ObjectMetadataService } from './contracts';
import { createRecordService } from './records';
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
		const result = await createRecordService(context, metadata()).get('vehicle', 'record value');
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
		const result = await createRecordService(context, metadata()).getMany('vehicle', {
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
			createRecordService(context, metadata()).getMany('vehicle', { returnAll: true }),
		).resolves.toHaveLength(2);

		requestMock
			.mockReset()
			.mockResolvedValueOnce(page([], true, 'same'))
			.mockResolvedValueOnce(page([], true, 'same'));
		await expect(
			createRecordService(context, metadata()).getMany('vehicle', { returnAll: true }),
		).rejects.toThrow('did not provide a new cursor');
		requestMock.mockReset().mockResolvedValue(page([], true, null));
		await expect(
			createRecordService(context, metadata()).getMany('vehicle', { returnAll: true }),
		).rejects.toThrow('did not provide a new cursor');
	});

	it.each([
		{},
		{ data: { vehicles: {} }, pageInfo: { hasNextPage: false } },
		{ data: { vehicles: [null] }, pageInfo: { hasNextPage: false } },
	])('rejects malformed list envelopes without leaking payload content', async (response) => {
		requestMock.mockResolvedValue({ ...response, privateValue: 'must-not-leak' });
		const error = await createRecordService(context, metadata())
			.getMany('vehicle', { returnAll: true })
			.catch((caught) => caught);
		expect(String(error)).toContain('invalid record list response');
		expect(String(error)).not.toContain('must-not-leak');
	});

	it('rejects malformed single-record envelopes without leaking payload content', async () => {
		requestMock.mockResolvedValue({ data: { vehicle: null }, privateValue: 'must-not-leak' });
		const error = await createRecordService(context, metadata())
			.get('vehicle', 'safe-id')
			.catch((caught) => caught);
		expect(String(error)).toContain('invalid record response');
		expect(String(error)).not.toContain('must-not-leak');
	});

	it.each([{ isActive: false }, { isSystem: true }, { isRemote: true }])(
		'rejects unsupported metadata before routing',
		async (overrides) => {
			await expect(
				createRecordService(context, metadata(object(overrides))).getMany('vehicle', {
					returnAll: true,
				}),
			).rejects.toThrow('not available for record operations');
			expect(requestMock).not.toHaveBeenCalled();
		},
	);

	it('allows reads but rejects every mutation for read-only objects before requests', async () => {
		const readOnlyMetadata = metadata(object({ isReadOnly: true }));
		requestMock
			.mockResolvedValueOnce({ data: { vehicle: { id: 'readable' } } })
			.mockResolvedValueOnce(page([]));
		const service = createRecordService(context, readOnlyMetadata);
		await expect(service.get('vehicle', 'safe-id')).resolves.toEqual({ id: 'readable' });
		await expect(service.getMany('vehicle', { returnAll: false, limit: 1 })).resolves.toEqual([]);
		expect(requestMock).toHaveBeenCalledTimes(2);
		requestMock.mockClear();
		await expect(service.create('vehicle', { name: 'fixture' })).rejects.toThrow('read-only');
		await expect(service.update('vehicle', 'safe-id', { name: 'fixture' })).rejects.toThrow(
			'read-only',
		);
		await expect(service.delete('vehicle', 'safe-id')).rejects.toThrow('read-only');
		expect(requestMock).not.toHaveBeenCalled();
	});

	it('rejects unsafe path identifiers and invalid limits before requests', async () => {
		await expect(
			createRecordService(context, metadata()).get('vehicle', '../escape'),
		).rejects.toThrow('record identifier is invalid');
		await expect(
			createRecordService(context, metadata(object({ apiNamePlural: 'vehicles/escape' }))).getMany(
				'vehicle',
				{ returnAll: true },
			),
		).rejects.toThrow('object API name is invalid');
		await expect(
			createRecordService(context, metadata()).getMany('vehicle', {
				returnAll: false,
				limit: 0,
			}),
		).rejects.toThrow('positive integer');
		expect(requestMock).not.toHaveBeenCalled();
	});

	it('normalizes object and string JSON inputs without losing nested values', async () => {
		const nested = { compound: { primary: 'kept' }, values: [1, true, null] };
		requestMock.mockResolvedValue({ data: { createVehicle: { id: 'created' } } });
		const service = createRecordService(context, metadata());
		await service.create('vehicle', nested);
		await service.create('vehicle', JSON.stringify(nested));
		expect(requestMock.mock.calls.map(([, options]) => options.body)).toEqual([nested, nested]);
	});

	it.each([null, [], 'null', '[]', '"scalar"', '{invalid'])(
		'rejects invalid JSON input before metadata or record requests',
		async (input) => {
			const metadataService = metadata();
			const service = createRecordService(context, metadataService);
			await expect(service.create('vehicle', input)).rejects.toThrow('JSON object');
			expect(metadataService.getObject).not.toHaveBeenCalled();
			expect(requestMock).not.toHaveBeenCalled();
		},
	);

	it('creates, updates, and deletes through metadata-derived routes without retry opt-in', async () => {
		const nested = { name: 'fixture', compound: { primary: 'retained' } };
		requestMock
			.mockResolvedValueOnce({ data: { createVehicle: { id: 'created', ...nested } } })
			.mockResolvedValueOnce({ data: { updateVehicle: { id: 'created', name: 'updated' } } })
			.mockResolvedValueOnce({ data: { vehicle: { id: 'created' } } });
		const service = createRecordService(context, metadata());
		await expect(service.create('vehicle', nested)).resolves.toMatchObject(nested);
		await expect(service.update('vehicle', 'record value', { name: 'updated' })).resolves.toEqual({
			id: 'created',
			name: 'updated',
		});
		await expect(service.delete('vehicle', 'record value')).resolves.toEqual({
			success: true,
			recordId: 'record value',
			objectApiName: 'vehicle',
		});
		expect(requestMock.mock.calls.map(([, options]) => options)).toEqual([
			{ method: 'POST', surface: 'coreRest', path: '/vehicles', body: nested },
			{
				method: 'PATCH',
				surface: 'coreRest',
				path: '/vehicles/record%20value',
				body: { name: 'updated' },
			},
			{ method: 'DELETE', surface: 'coreRest', path: '/vehicles/record%20value' },
		]);
		expect(requestMock.mock.calls.every(([, options]) => !('retry' in options))).toBe(true);
	});

	it.each(['create', 'update'] as const)(
		'rejects malformed %s envelopes without leaking private content',
		async (operation) => {
			requestMock.mockResolvedValue({
				data: { createVehicle: null, updateVehicle: null },
				privateValue: 'must-not-leak',
			});
			const service = createRecordService(context, metadata());
			const promise =
				operation === 'create'
					? service.create('vehicle', { name: 'fixture' })
					: service.update('vehicle', 'safe-id', { name: 'fixture' });
			const error = await promise.catch((caught) => caught);
			expect(String(error)).toContain('invalid record response');
			expect(String(error)).not.toContain('must-not-leak');
		},
	);
});
