import type { IExecuteFunctions, ILoadOptionsFunctions } from 'n8n-workflow';
import { describe, expect, it, vi } from 'vitest';

import { Twenty } from './Twenty.node';
import type { NormalizedObjectDefinition } from './shared/contracts';
import { createObjectMetadataService } from './shared/metadata';
import { createRecordService } from './shared/records';

vi.mock('./shared/metadata', () => ({ createObjectMetadataService: vi.fn() }));
vi.mock('./shared/records', () => ({ createRecordService: vi.fn() }));
const serviceMock = vi.mocked(createObjectMetadataService);
const recordServiceMock = vi.mocked(createRecordService);

function schemaObject(
	overrides: Partial<NormalizedObjectDefinition> = {},
): NormalizedObjectDefinition {
	return {
		id: 'fake-id',
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

function executeContext(
	parameters: Record<string, unknown>[],
	items = parameters.map(() => ({ json: {} })),
) {
	return {
		getInputData: () => items,
		getNodeParameter: (name: string, index: number, defaultValue?: unknown) => {
			if (name === 'resource' && parameters[index][name] === undefined) return 'schemaObject';
			return parameters[index][name] === undefined ? defaultValue : parameters[index][name];
		},
		getNode: () => ({ name: 'Twenty CRM', type: 'twenty', typeVersion: 1, position: [0, 0] }),
	} as unknown as IExecuteFunctions;
}

describe('Twenty CRM Schema Object node', () => {
	it('exposes Schema Object reads and Record CRUD with stable resource locators', () => {
		const node = new Twenty();
		expect(node.description.displayName).toBe('Twenty CRM');
		expect(node.description.usableAsTool).toBe(true);
		const resource = node.description.properties.find(({ name }) => name === 'resource');
		expect(resource?.options).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ value: 'record' }),
				expect.objectContaining({ value: 'schemaObject' }),
			]),
		);
		const operations = node.description.properties.filter(({ name }) => name === 'operation');
		expect(operations).toHaveLength(2);
		for (const resourceName of ['record', 'schemaObject']) {
			const operation = operations.find(
				(property) => property.displayOptions?.show?.resource?.[0] === resourceName,
			);
			expect(operation?.options).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ value: 'get' }),
					expect.objectContaining({ value: 'getMany' }),
				]),
			);
		}
		const recordOperation = operations.find(
			(property) => property.displayOptions?.show?.resource?.[0] === 'record',
		);
		expect(recordOperation?.options).toEqual(
			expect.arrayContaining(
				['create', 'delete', 'update'].map((value) => expect.objectContaining({ value })),
			),
		);
		const locators = node.description.properties.filter(({ name }) => name === 'objectApiName');
		const recordLocator = locators.find(
			(property) => property.displayOptions?.show?.resource?.[0] === 'record',
		);
		expect(recordLocator).toMatchObject({
			type: 'resourceLocator',
			displayOptions: { show: { resource: ['record'] } },
			modes: expect.arrayContaining([
				expect.objectContaining({
					name: 'list',
					typeOptions: { searchListMethod: 'searchSchemaObjects', searchable: true },
				}),
				expect.objectContaining({ name: 'apiName', type: 'string' }),
			]),
		});
		expect(locators).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					displayOptions: { show: { resource: ['schemaObject'], operation: ['get'] } },
				}),
			]),
		);
		const recordId = node.description.properties.find(({ name }) => name === 'recordId');
		expect(recordId).toMatchObject({
			type: 'string',
			required: true,
			displayOptions: { show: { resource: ['record'], operation: ['get', 'update', 'delete'] } },
		});
		const jsonInput = node.description.properties.find(({ name }) => name === 'jsonInput');
		expect(jsonInput).toMatchObject({
			type: 'json',
			required: true,
			displayOptions: {
				show: { resource: ['record'], operation: ['create', 'update'], inputMode: ['json'] },
			},
		});
		const inputMode = node.description.properties.find(({ name }) => name === 'inputMode');
		expect(inputMode).toMatchObject({ type: 'options', default: 'fieldMapping' });
		const createFields = node.description.properties.find(({ name }) => name === 'createFields');
		expect(createFields).toMatchObject({
			type: 'resourceMapper',
			typeOptions: {
				resourceMapper: {
					mode: 'add',
					resourceMapperMethod: 'getCreateFields',
					supportAutoMap: false,
				},
			},
		});
		const updateFields = node.description.properties.find(({ name }) => name === 'updateFields');
		expect(updateFields).toMatchObject({
			type: 'resourceMapper',
			typeOptions: {
				resourceMapper: {
					mode: 'add',
					resourceMapperMethod: 'getUpdateFields',
					supportAutoMap: false,
				},
			},
		});
	});

	it('filters and deterministically sorts active non-system selector entries', async () => {
		serviceMock.mockReturnValue({
			getObject: vi.fn(),
			getObjects: vi
				.fn()
				.mockResolvedValue([
					schemaObject({ apiNameSingular: 'zeta', labelSingular: 'Zeta', isCustom: false }),
					schemaObject({ apiNameSingular: 'alpha', labelSingular: 'Alpha' }),
					schemaObject({ apiNameSingular: 'alphaBeta', labelSingular: 'Same' }),
					schemaObject({ apiNameSingular: 'alphaAlpha', labelSingular: 'Same' }),
					schemaObject({ apiNameSingular: 'inactive', labelSingular: 'Inactive', isActive: false }),
					schemaObject({ apiNameSingular: 'system', labelSingular: 'System', isSystem: true }),
					schemaObject({ apiNameSingular: 'remote', labelSingular: 'Remote', isRemote: true }),
				]),
		});
		const result = await new Twenty().methods.listSearch.searchSchemaObjects.call(
			{} as ILoadOptionsFunctions,
		);
		expect(result.results).toEqual([
			{ name: 'Alpha', value: 'alpha' },
			{ name: 'Same', value: 'alphaAlpha' },
			{ name: 'Same', value: 'alphaBeta' },
			{ name: 'Zeta', value: 'zeta' },
		]);
		const byLabel = await new Twenty().methods.listSearch.searchSchemaObjects.call(
			{} as ILoadOptionsFunctions,
			'SAME',
		);
		expect(byLabel.results.map(({ value }) => value)).toEqual(['alphaAlpha', 'alphaBeta']);
		const byApiName = await new Twenty().methods.listSearch.searchSchemaObjects.call(
			{} as ILoadOptionsFunctions,
			'zEtA',
		);
		expect(byApiName.results).toEqual([{ name: 'Zeta', value: 'zeta' }]);
		const emptyFilter = await new Twenty().methods.listSearch.searchSchemaObjects.call(
			{} as ILoadOptionsFunctions,
			'',
		);
		expect(emptyFilter.results).toHaveLength(4);
	});

	it('loads create and update mapper schemas from the selected stable object API name', async () => {
		const getObject = vi.fn().mockResolvedValue(
			schemaObject({
				fields: [
					{
						id: 'field-name',
						apiName: 'name',
						label: 'Name',
						type: 'TEXT',
						isActive: true,
						isCustom: true,
						isNullable: false,
						isUnique: false,
						isRequired: true,
						isReadOnly: false,
						isSystem: false,
						defaultValue: null,
					},
				],
			}),
		);
		serviceMock.mockReturnValue({ getObject, getObjects: vi.fn() });
		const getNodeParameter = vi.fn().mockReturnValue('vehicle');
		const context = {
			getNodeParameter,
		} as unknown as ILoadOptionsFunctions;
		const create = await new Twenty().methods.resourceMapping.getCreateFields.call(context);
		const update = await new Twenty().methods.resourceMapping.getUpdateFields.call(context);
		expect(getObject).toHaveBeenCalledWith('vehicle');
		expect(getNodeParameter).toHaveBeenCalledWith('objectApiName', undefined, {
			extractValue: true,
		});
		expect(create.fields[0]).toMatchObject({ id: 'name', required: true });
		expect(update.fields[0]).toMatchObject({ id: 'name', required: false });
		getObject.mockClear();
		getNodeParameter.mockReturnValue('');
		await expect(
			new Twenty().methods.resourceMapping.getCreateFields.call(context),
		).resolves.toEqual({
			fields: [],
		});
		expect(getObject).not.toHaveBeenCalled();
	});

	it.each([
		[{ resource: 'unknown', operation: 'getMany' }, 'Unsupported Twenty CRM resource'],
		[{ resource: 'schemaObject', operation: 'delete' }, 'Unsupported Twenty CRM operation'],
	] as const)(
		'rejects stale dispatch values before metadata is requested',
		async (parameters, message) => {
			const getObject = vi.fn();
			const getObjects = vi.fn();
			serviceMock.mockReturnValue({ getObject, getObjects });
			await expect(Twenty.prototype.execute.call(executeContext([parameters]))).rejects.toThrow(
				message,
			);
			expect(getObject).not.toHaveBeenCalled();
			expect(getObjects).not.toHaveBeenCalled();
		},
	);

	it('executes Get for every input using the stable singular API name', async () => {
		const getObject = vi
			.fn()
			.mockImplementation(async (name: string) => schemaObject({ apiNameSingular: name }));
		serviceMock.mockReturnValue({ getObject, getObjects: vi.fn() });
		const result = await Twenty.prototype.execute.call(
			executeContext([
				{ operation: 'get', objectApiName: 'vehicle' },
				{ operation: 'get', objectApiName: 'widget' },
			]),
		);
		expect(getObject).toHaveBeenCalledWith('vehicle');
		expect(getObject).toHaveBeenCalledWith('widget');
		expect(result[0].map((item) => item.pairedItem)).toEqual([0, 1]);
	});

	it('executes Record reads and legacy JSON writes without inputMode with paired provenance', async () => {
		serviceMock.mockReturnValue({ getObject: vi.fn(), getObjects: vi.fn() });
		const get = vi.fn().mockResolvedValue({ id: 'synthetic-get' });
		const getMany = vi.fn().mockResolvedValue([{ id: 'synthetic-list' }]);
		const create = vi.fn().mockResolvedValue({ id: 'synthetic-create' });
		const update = vi.fn().mockResolvedValue({ id: 'synthetic-update' });
		const remove = vi
			.fn()
			.mockResolvedValue({ success: true, recordId: 'delete-id', objectApiName: 'vehicle' });
		recordServiceMock.mockReturnValue({ get, getMany, create, update, delete: remove });
		const result = await Twenty.prototype.execute.call(
			executeContext([
				{ resource: 'record', operation: 'get', objectApiName: 'vehicle', recordId: 'record-id' },
				{
					resource: 'record',
					operation: 'getMany',
					objectApiName: 'widget',
					returnAll: false,
					limit: 25,
					filter: 'status[eq]:"open"',
					orderBy: 'createdAt[DescNullsLast]',
				},
				{
					resource: 'record',
					operation: 'create',
					objectApiName: 'vehicle',
					jsonInput: '{}',
				},
				{
					resource: 'record',
					operation: 'update',
					objectApiName: 'vehicle',
					recordId: 'update-id',
					jsonInput: { name: 'kept' },
				},
				{
					resource: 'record',
					operation: 'delete',
					objectApiName: 'vehicle',
					recordId: 'delete-id',
				},
			]),
		);
		expect(get).toHaveBeenCalledWith('vehicle', 'record-id');
		expect(getMany).toHaveBeenCalledWith('widget', {
			returnAll: false,
			limit: 25,
			filter: 'status[eq]:"open"',
			orderBy: 'createdAt[DescNullsLast]',
		});
		expect(create).toHaveBeenCalledWith('vehicle', '{}');
		expect(update).toHaveBeenCalledWith('vehicle', 'update-id', { name: 'kept' });
		expect(remove).toHaveBeenCalledWith('vehicle', 'delete-id');
		expect(result[0].map((item) => item.pairedItem)).toEqual([0, 1, 2, 3, 4]);
	});

	it('reconstructs field-mapped Create and rejects stale mapped keys before mutation', async () => {
		const metadataObject = schemaObject({
			fields: [
				{
					id: 'field-name',
					apiName: 'name',
					label: 'Name',
					type: 'FULL_NAME',
					isActive: true,
					isCustom: false,
					isNullable: true,
					isUnique: false,
					isRequired: false,
					isReadOnly: false,
					isSystem: false,
				},
			],
		});
		serviceMock.mockReturnValue({
			getObject: vi.fn().mockResolvedValue(metadataObject),
			getObjects: vi.fn(),
		});
		const create = vi.fn().mockResolvedValue({ id: 'created' });
		recordServiceMock.mockReturnValue({
			create,
			get: vi.fn(),
			getMany: vi.fn(),
			update: vi.fn(),
			delete: vi.fn(),
		});
		const validMapper = {
			mappingMode: 'defineBelow',
			value: { name__firstName: 'Synthetic' },
			matchingColumns: [],
			schema: [],
			attemptToConvertTypes: false,
			convertFieldsToString: false,
		};
		await Twenty.prototype.execute.call(
			executeContext([
				{
					resource: 'record',
					operation: 'create',
					objectApiName: 'vehicle',
					inputMode: 'fieldMapping',
					createFields: validMapper,
				},
			]),
		);
		expect(create).toHaveBeenCalledWith('vehicle', { name: { firstName: 'Synthetic' } });
		await expect(
			Twenty.prototype.execute.call(
				executeContext([
					{
						resource: 'record',
						operation: 'create',
						objectApiName: 'vehicle',
						inputMode: 'fieldMapping',
						createFields: { ...validMapper, value: { stale: 'value' } },
					},
				]),
			),
		).rejects.toThrow('unknown or stale field');
		expect(create).toHaveBeenCalledTimes(1);
	});

	it('filters Get Many defaults and honors include toggles', async () => {
		const objects = [
			schemaObject(),
			schemaObject({ id: 'inactive', isActive: false }),
			schemaObject({ id: 'system', isSystem: true }),
		];
		serviceMock.mockReturnValue({
			getObject: vi.fn(),
			getObjects: vi.fn().mockResolvedValue(objects),
		});
		const result = await Twenty.prototype.execute.call(
			executeContext([
				{ operation: 'getMany', includeInactive: false, includeSystem: false },
				{ operation: 'getMany', includeInactive: true, includeSystem: true },
			]),
		);
		expect(result[0]).toHaveLength(4);
		expect(result[0].map((item) => item.pairedItem)).toEqual([0, 1, 1, 1]);
	});

	it('propagates a sanitized stale-object error and stops later items', async () => {
		serviceMock.mockReturnValue({
			getObjects: vi.fn(),
			getObject: vi
				.fn()
				.mockRejectedValue(new Error('The selected Twenty schema object is no longer available.')),
		});
		await expect(
			Twenty.prototype.execute.call(executeContext([{ operation: 'get', objectApiName: 'gone' }])),
		).rejects.toThrow('no longer available');
	});
});
