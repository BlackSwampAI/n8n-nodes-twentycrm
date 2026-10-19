import type { IExecuteFunctions } from 'n8n-workflow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { NormalizedObjectDefinition, ObjectMetadataService } from './contracts';
import { createFixedRecordService, createRecordService } from './records';
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

	it('serializes validated field selection and depth for Get without changing defaults', async () => {
		requestMock
			.mockResolvedValueOnce({ data: { vehicle: { id: 'default' } } })
			.mockResolvedValueOnce({ data: { vehicle: { id: 'selected' } } });
		const service = createRecordService(context, metadata());
		await service.get('vehicle', 'default');
		await service.get('vehicle', 'selected', {
			fields: ' name, id, name,custom_field ',
			depth: 1,
		});
		expect(requestMock.mock.calls.map(([, options]) => options)).toEqual([
			{ method: 'GET', surface: 'coreRest', path: '/vehicles/default' },
			{
				method: 'GET',
				surface: 'coreRest',
				path: '/vehicles/selected',
				query: { fields: 'name,id,custom_field', depth: 1 },
			},
		]);
	});

	it('routes every fixed Get Many resource without metadata discovery', async () => {
		for (const [resource, plural] of [
			['company', 'companies'],
			['person', 'people'],
			['opportunity', 'opportunities'],
			['task', 'tasks'],
			['note', 'notes'],
		] as const) {
			requestMock.mockResolvedValueOnce({
				data: { [plural]: [] },
				pageInfo: { hasNextPage: false, endCursor: null },
			});
			await expect(
				createFixedRecordService(context, resource).getMany(resource, {
					returnAll: false,
					limit: 1,
				}),
			).resolves.toEqual([]);
			expect(requestMock).toHaveBeenLastCalledWith(
				context,
				expect.objectContaining({ path: `/${plural}` }),
			);
		}
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

	it('keeps fields and depth on every Get Many page, including more than 200 requested fields', async () => {
		const fields = Array.from({ length: 201 }, (_, index) => `field${index}`).join(',');
		requestMock
			.mockResolvedValueOnce(page([{ id: 'one' }], true, 'next'))
			.mockResolvedValueOnce(page([{ id: 'two' }]));
		await createRecordService(context, metadata()).getMany('vehicle', {
			returnAll: true,
			fields,
			depth: 0,
		});
		expect(requestMock).toHaveBeenCalledTimes(2);
		for (const [, options] of requestMock.mock.calls) {
			expect(options.query).toMatchObject({ fields, depth: 0 });
		}
	});

	it.each([
		{ fields: ['id'] },
		{ fields: 'id,,name' },
		{ fields: 'company.name' },
		{ fields: '*' },
		{ fields: 'id,' },
		{ depth: '1' },
		{ depth: 2 },
	])('rejects invalid read selection %# before requests', async (options) => {
		await expect(
			createRecordService(context, metadata()).get('vehicle', 'safe-id', options),
		).rejects.toThrow(/Fields|Depth/);
		expect(requestMock).not.toHaveBeenCalled();
	});

	it.each([undefined, '', '   '])('omits empty Fields value %#', async (fields) => {
		requestMock.mockResolvedValue({ data: { vehicle: { id: 'safe-id' } } });
		await createRecordService(context, metadata()).get('vehicle', 'safe-id', { fields });
		expect(requestMock).toHaveBeenCalledWith(context, {
			method: 'GET',
			surface: 'coreRest',
			path: '/vehicles/safe-id',
		});
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

	it.each([
		['workflow', 'v2.47.0'],
		['workflowVersion', '2.49.0'],
		['workflow', '3.0.0'],
	] as const)(
		'blocks all generic %s writes on Twenty %s with one cached version probe',
		async (apiNameSingular, appVersion) => {
			const workflow = object({
				apiNameSingular,
				apiNamePlural: `${apiNameSingular}s`,
			});
			requestMock.mockResolvedValue({ appVersion });
			const service = createRecordService(context, metadata(workflow));
			await expect(service.create(apiNameSingular, {})).rejects.toThrow('workflow editor');
			await expect(service.update(apiNameSingular, 'id', {})).rejects.toThrow('workflow editor');
			await expect(service.delete(apiNameSingular, 'id')).rejects.toThrow('workflow editor');
			expect(requestMock).toHaveBeenCalledTimes(1);
			expect(requestMock).toHaveBeenCalledWith(context, {
				method: 'GET',
				surface: 'root',
				path: '/client-config',
				retry: 'never',
			});
		},
	);

	it.each([
		['older 2.46 stable', { appVersion: '2.46.9' }],
		['older 2.35 stable', { appVersion: '2.35.0' }],
		['older 2.9 stable', { appVersion: '2.9.0' }],
		['missing', {}],
		['malformed', { appVersion: 'current' }],
		['prerelease', { appVersion: '2.47.0-beta.1' }],
		['leading zero', { appVersion: '02.47.0' }],
		['unsafe integer', { appVersion: '9007199254740992.0.0' }],
		['non-string', { appVersion: 2.47 }],
	])('preserves workflow writes for %s version responses', async (_label, versionResponse) => {
		requestMock
			.mockResolvedValueOnce(versionResponse)
			.mockResolvedValueOnce({ data: { createWorkflow: { id: 'created' } } })
			.mockResolvedValueOnce({ data: { updateWorkflow: { id: 'updated' } } })
			.mockResolvedValueOnce({ data: { workflow: { id: 'deleted' } } });
		const service = createRecordService(
			context,
			metadata(object({ apiNameSingular: 'workflow', apiNamePlural: 'workflows' })),
		);
		await expect(service.create('workflow', {})).resolves.toEqual({ id: 'created' });
		await expect(service.update('workflow', 'id', {})).resolves.toEqual({ id: 'updated' });
		await expect(service.delete('workflow', 'id')).resolves.toEqual({
			success: true,
			recordId: 'id',
			objectApiName: 'workflow',
		});
		expect(requestMock).toHaveBeenCalledTimes(4);
	});

	it.each(['workflow', 'workflowVersion'])(
		'never probes generic %s reads',
		async (apiNameSingular) => {
			const definition = object({
				apiNameSingular,
				apiNamePlural: `${apiNameSingular}s`,
			});
			requestMock
				.mockResolvedValueOnce({ data: { [apiNameSingular]: { id: 'read' } } })
				.mockResolvedValueOnce({
					data: { [`${apiNameSingular}s`]: [] },
					pageInfo: { hasNextPage: false, endCursor: null },
				});
			const service = createRecordService(context, metadata(definition));
			await service.get(apiNameSingular, 'read');
			await service.getMany(apiNameSingular, { returnAll: true });
			expect(requestMock.mock.calls.every(([, options]) => options.surface === 'coreRest')).toBe(
				true,
			);
		},
	);

	it('preserves workflowVersion metadata write restrictions before probing', async () => {
		const service = createRecordService(
			context,
			metadata(
				object({
					apiNameSingular: 'workflowVersion',
					apiNamePlural: 'workflowVersions',
					isCreatable: false,
				}),
			),
		);
		await expect(service.create('workflowVersion', {})).rejects.toThrow('does not allow');
		expect(requestMock).not.toHaveBeenCalled();
	});

	it('adds cautious guidance for 405 and preserves unrelated mutation failures', async () => {
		const definition = object({ apiNameSingular: 'workflow', apiNamePlural: 'workflows' });
		requestMock.mockResolvedValueOnce({}).mockRejectedValueOnce({ response: { status: 405 } });
		await expect(
			createRecordService(context, metadata(definition)).create('workflow', {}),
		).rejects.toThrow('permissions or by the Twenty 2.47');
		requestMock.mockReset().mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('private'));
		await expect(
			createRecordService(context, metadata(definition)).create('workflow', {}),
		).rejects.toThrow('workflow write failed');
	});

	it('preserves workflow writes when version detection fails and adds cautious 403 guidance', async () => {
		requestMock
			.mockRejectedValueOnce(new Error('version unavailable'))
			.mockRejectedValueOnce({ statusCode: 403 });
		await expect(
			createRecordService(
				context,
				metadata(object({ apiNameSingular: 'workflow', apiNamePlural: 'workflows' })),
			).delete('workflow', 'id'),
		).rejects.toThrow('permissions or by the Twenty 2.47');
		expect(requestMock).toHaveBeenCalledTimes(2);
	});

	it('never probes reads or unrelated and fixed-resource writes', async () => {
		requestMock
			.mockResolvedValueOnce({ data: { vehicle: { id: 'read' } } })
			.mockResolvedValueOnce({ data: { createVehicle: { id: 'created' } } })
			.mockResolvedValueOnce({ data: { createCompany: { id: 'company' } } });
		await createRecordService(context, metadata()).get('vehicle', 'read');
		await createRecordService(context, metadata()).create('vehicle', {});
		await createFixedRecordService(context, 'company').create('company', {});
		expect(requestMock.mock.calls.every(([, options]) => options.surface === 'coreRest')).toBe(
			true,
		);
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
