import { NodeApiError, type IExecuteFunctions, type ILoadOptionsFunctions } from 'n8n-workflow';
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

function opportunityRelation(apiName: string) {
	return {
		type: 'MANY_TO_ONE',
		source: {
			objectId: 'opportunity-object',
			objectApiNameSingular: 'opportunity',
			objectApiNamePlural: 'opportunities',
			fieldId: `${apiName}-field`,
			fieldApiName: apiName,
		},
		target: {
			objectId: 'target-object',
			objectApiNameSingular: apiName === 'company' ? 'company' : 'person',
			objectApiNamePlural: apiName === 'company' ? 'companies' : 'people',
			fieldId: 'target-field',
			fieldApiName: 'opportunities',
		},
	};
}

describe('Twenty CRM Schema Object node', () => {
	it('exposes Schema Object reads and Record CRUD with stable resource locators', () => {
		const node = new Twenty();
		expect(node.description.displayName).toBe('Twenty CRM');
		expect(node.description.usableAsTool).toBe(true);
		const resource = node.description.properties.find(({ name }) => name === 'resource');
		expect(resource?.options?.map((option) => option.value)).toEqual([
			'company',
			'note',
			'opportunity',
			'person',
			'record',
			'schemaObject',
			'task',
		]);
		expect(resource?.options).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ value: 'company' }),
				expect.objectContaining({ value: 'opportunity' }),
				expect.objectContaining({ value: 'task' }),
				expect.objectContaining({ value: 'note' }),
				expect.objectContaining({ value: 'person' }),
				expect.objectContaining({ value: 'record' }),
				expect.objectContaining({ value: 'schemaObject' }),
			]),
		);
		const operations = node.description.properties.filter(({ name }) => name === 'operation');
		expect(operations).toHaveLength(3);
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
		const fixedOperation = operations.find((property) =>
			property.displayOptions?.show?.resource?.includes('company'),
		);
		expect(fixedOperation).toMatchObject({
			displayOptions: {
				show: { resource: ['company', 'person', 'opportunity', 'task', 'note'] },
			},
			options: expect.arrayContaining(
				['create', 'delete', 'get', 'getMany', 'update'].map((value) =>
					expect.objectContaining({ value }),
				),
			),
		});
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
			displayOptions: {
				show: {
					resource: ['record', 'company', 'person', 'opportunity', 'task', 'note'],
					operation: ['get', 'update', 'delete'],
				},
			},
		});
		const jsonInput = node.description.properties.find(({ name }) => name === 'jsonInput');
		expect(jsonInput).toMatchObject({
			type: 'json',
			required: true,
			displayOptions: {
				show: {
					resource: ['record', 'company', 'person', 'opportunity', 'task', 'note'],
					operation: ['create', 'update'],
					inputMode: ['json'],
				},
			},
		});
		const inputMode = node.description.properties.find(({ name }) => name === 'inputMode');
		expect(inputMode).toMatchObject({ type: 'options', default: 'fieldMapping' });
		const createFields = node.description.properties.find(({ name }) => name === 'createFields');
		expect(createFields).toMatchObject({
			type: 'resourceMapper',
			displayOptions: { show: { resource: ['record'] } },
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
			displayOptions: { show: { resource: ['record'] } },
			typeOptions: {
				resourceMapper: {
					mode: 'add',
					resourceMapperMethod: 'getUpdateFields',
					supportAutoMap: false,
				},
			},
		});
		for (const operation of ['create', 'update']) {
			const common = node.description.properties.find(
				({ name }) => name === `${operation}CommonFields`,
			);
			const additional = node.description.properties.find(
				({ name }) => name === `${operation}AdditionalFields`,
			);
			expect(common).toMatchObject({
				displayName: 'Common Fields',
				typeOptions: { resourceMapper: { addAllFields: true } },
				displayOptions: {
					show: { resource: ['company', 'person', 'opportunity', 'task', 'note'] },
				},
			});
			expect(additional).toMatchObject({
				displayName: 'Additional Fields',
				typeOptions: { resourceMapper: { addAllFields: false } },
				displayOptions: {
					show: { resource: ['company', 'person', 'opportunity', 'task', 'note'] },
				},
			});
		}
		const filter = node.description.properties.find(({ name }) => name === 'filter');
		const orderBy = node.description.properties.find(({ name }) => name === 'orderBy');
		expect(filter?.displayOptions).toEqual({ show: { resource: ['__legacyRecord'] } });
		expect(orderBy?.displayOptions).toEqual({ show: { resource: ['__legacyRecord'] } });
		const options = node.description.properties.find(({ name }) => name === 'options');
		expect(options).toMatchObject({
			type: 'collection',
			displayOptions: {
				show: {
					resource: ['record', 'company', 'person', 'opportunity', 'task', 'note'],
					operation: ['getMany'],
				},
			},
			options: expect.arrayContaining([
				expect.objectContaining({ name: 'filter' }),
				expect.objectContaining({ name: 'orderBy' }),
			]),
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

	it('loads generic and fixed mapper schemas from stable object API names', async () => {
		const field = {
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
		};
		const getObject = vi.fn().mockImplementation(async (apiName: string) =>
			schemaObject({
				apiNameSingular: apiName,
				fields: [
					apiName === 'person'
						? { ...field, type: 'FULL_NAME' }
						: apiName === 'company'
							? { ...field, isNullable: true, isRequired: false }
							: field,
				],
			}),
		);
		serviceMock.mockReturnValue({ getObject, getObjects: vi.fn() });
		const genericParameter = vi.fn((name: string) =>
			name === 'resource' ? 'record' : name === 'objectApiName' ? 'vehicle' : undefined,
		);
		const genericContext = {
			getNodeParameter: genericParameter,
		} as unknown as ILoadOptionsFunctions;
		const create = await new Twenty().methods.resourceMapping.getCreateFields.call(genericContext);
		const update = await new Twenty().methods.resourceMapping.getUpdateFields.call(genericContext);
		expect(getObject).toHaveBeenCalledWith('vehicle');
		expect(genericParameter).toHaveBeenCalledWith('objectApiName', undefined, {
			extractValue: true,
		});
		expect(create.fields[0]).toMatchObject({ id: 'name', required: true, removed: false });
		expect(update.fields[0]).toMatchObject({ id: 'name', required: false });

		for (const [resource, method, id, required, removed] of [
			['company', 'getCreateCommonFields', 'name', false, false],
			['person', 'getUpdateCommonFields', 'name__firstName', false, false],
			['opportunity', 'getCreateCommonFields', 'name', true, false],
		] as const) {
			const fixedParameter = vi.fn((name: string) => (name === 'resource' ? resource : undefined));
			const result = await new Twenty().methods.resourceMapping[method].call({
				getNodeParameter: fixedParameter,
			} as unknown as ILoadOptionsFunctions);
			expect(getObject).toHaveBeenCalledWith(resource);
			expect(fixedParameter).not.toHaveBeenCalledWith(
				'objectApiName',
				expect.anything(),
				expect.anything(),
			);
			expect(result.fields[0]).toMatchObject({ id, required, removed });
		}
		const companyAdditional =
			await new Twenty().methods.resourceMapping.getCreateAdditionalFields.call({
				getNodeParameter: vi.fn((name: string) => (name === 'resource' ? 'company' : undefined)),
			} as unknown as ILoadOptionsFunctions);
		expect(companyAdditional.fields).toEqual([]);

		getObject.mockClear();
		genericParameter.mockImplementation((name: string) =>
			name === 'resource' ? 'record' : name === 'objectApiName' ? '' : undefined,
		);
		await expect(
			new Twenty().methods.resourceMapping.getCreateFields.call(genericContext),
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
				{
					resource: 'record',
					operation: 'getMany',
					objectApiName: 'vehicle',
					returnAll: false,
					limit: 5,
					filter: 'legacy-filter',
					orderBy: 'legacy-order',
					options: { filter: 'options-filter' },
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
		expect(getMany).toHaveBeenCalledWith('vehicle', {
			returnAll: false,
			limit: 5,
			filter: 'options-filter',
			orderBy: 'legacy-order',
		});
		expect(result[0].map((item) => item.pairedItem)).toEqual([0, 1, 2, 3, 4, 5]);
	});

	it('routes fixed Company and Person CRUD through the shared record service', async () => {
		serviceMock.mockReturnValue({
			getObject: vi.fn().mockResolvedValue(
				schemaObject({
					apiNameSingular: 'company',
					fields: [
						{
							id: 'field-address',
							apiName: 'address',
							label: 'Address',
							type: 'ADDRESS',
							isActive: true,
							isCustom: false,
							isNullable: true,
							isUnique: false,
							isRequired: false,
							isReadOnly: false,
							isSystem: false,
						},
					],
				}),
			),
			getObjects: vi.fn(),
		});
		const service = {
			create: vi.fn().mockResolvedValue({ id: 'created' }),
			get: vi.fn().mockResolvedValue({ id: 'got' }),
			getMany: vi.fn().mockResolvedValue([{ id: 'listed' }]),
			update: vi.fn().mockResolvedValue({ id: 'updated' }),
			delete: vi.fn().mockResolvedValue({ success: true }),
		};
		recordServiceMock.mockReturnValue(service);
		await Twenty.prototype.execute.call(
			executeContext([
				{ resource: 'company', operation: 'create', jsonInput: '{}' },
				{ resource: 'person', operation: 'get', recordId: 'person-id' },
				{
					resource: 'company',
					operation: 'getMany',
					returnAll: false,
					limit: 2,
					options: { filter: 'name[eq]:"fixed"', orderBy: 'createdAt[AscNullsFirst]' },
				},
				{ resource: 'person', operation: 'getMany', returnAll: false, limit: 3 },
				{ resource: 'person', operation: 'update', recordId: 'person-id', jsonInput: '{}' },
				{ resource: 'company', operation: 'delete', recordId: 'company-id' },
				{ resource: 'opportunity', operation: 'create', jsonInput: '{"name":"Synthetic"}' },
				{ resource: 'opportunity', operation: 'get', recordId: 'opportunity-id' },
				{ resource: 'opportunity', operation: 'getMany', returnAll: false, limit: 4 },
				{
					resource: 'opportunity',
					operation: 'update',
					recordId: 'opportunity-id',
					jsonInput: '{"name":"Updated"}',
				},
				{ resource: 'opportunity', operation: 'delete', recordId: 'opportunity-id' },
				{ resource: 'task', operation: 'create', jsonInput: '{"title":"Task"}' },
				{ resource: 'task', operation: 'get', recordId: 'task-id' },
				{ resource: 'task', operation: 'getMany', returnAll: false, limit: 6 },
				{
					resource: 'task',
					operation: 'update',
					recordId: 'task-id',
					jsonInput: '{"title":"Updated Task"}',
				},
				{ resource: 'task', operation: 'delete', recordId: 'task-id' },
				{ resource: 'note', operation: 'create', jsonInput: '{"title":"Note"}' },
				{ resource: 'note', operation: 'get', recordId: 'note-id' },
				{ resource: 'note', operation: 'getMany', returnAll: false, limit: 7 },
				{
					resource: 'note',
					operation: 'update',
					recordId: 'note-id',
					jsonInput: '{"title":"Updated Note"}',
				},
				{ resource: 'note', operation: 'delete', recordId: 'note-id' },
				{
					resource: 'company',
					operation: 'create',
					inputMode: 'fieldMapping',
					createCommonFields: {
						mappingMode: 'defineBelow',
						value: { address__addressCity: 'Synthetic City' },
						matchingColumns: [],
						schema: [],
						attemptToConvertTypes: false,
						convertFieldsToString: false,
					},
					createAdditionalFields: {
						mappingMode: 'defineBelow',
						value: { address__addressStreet2: 'Synthetic Street 2' },
						matchingColumns: [],
						schema: [],
						attemptToConvertTypes: false,
						convertFieldsToString: false,
					},
				},
				{
					resource: 'company',
					operation: 'update',
					recordId: 'mapped-company-id',
					inputMode: 'fieldMapping',
					updateCommonFields: {
						mappingMode: 'defineBelow',
						value: { address__addressCity: 'Updated City' },
						matchingColumns: [],
						schema: [],
						attemptToConvertTypes: false,
						convertFieldsToString: false,
					},
					updateAdditionalFields: {
						mappingMode: 'defineBelow',
						value: { address__addressStreet2: 'Updated Street 2' },
						matchingColumns: [],
						schema: [],
						attemptToConvertTypes: false,
						convertFieldsToString: false,
					},
				},
			]),
		);
		expect(service.create).toHaveBeenCalledWith('company', '{}');
		expect(service.create).toHaveBeenCalledWith('opportunity', '{"name":"Synthetic"}');
		expect(service.create).toHaveBeenCalledWith('task', '{"title":"Task"}');
		expect(service.create).toHaveBeenCalledWith('note', '{"title":"Note"}');
		expect(service.create).toHaveBeenCalledWith('company', {
			address: { addressCity: 'Synthetic City', addressStreet2: 'Synthetic Street 2' },
		});
		expect(service.get).toHaveBeenCalledWith('person', 'person-id');
		expect(service.get).toHaveBeenCalledWith('opportunity', 'opportunity-id');
		expect(service.get).toHaveBeenCalledWith('task', 'task-id');
		expect(service.get).toHaveBeenCalledWith('note', 'note-id');
		expect(service.getMany).toHaveBeenCalledWith('company', {
			returnAll: false,
			limit: 2,
			filter: 'name[eq]:"fixed"',
			orderBy: 'createdAt[AscNullsFirst]',
		});
		expect(service.getMany).toHaveBeenCalledWith('person', {
			returnAll: false,
			limit: 3,
			filter: '',
			orderBy: '',
		});
		expect(service.getMany).toHaveBeenCalledWith('opportunity', {
			returnAll: false,
			limit: 4,
			filter: '',
			orderBy: '',
		});
		expect(service.getMany).toHaveBeenCalledWith('task', {
			returnAll: false,
			limit: 6,
			filter: '',
			orderBy: '',
		});
		expect(service.getMany).toHaveBeenCalledWith('note', {
			returnAll: false,
			limit: 7,
			filter: '',
			orderBy: '',
		});
		expect(service.update).toHaveBeenCalledWith('person', 'person-id', '{}');
		expect(service.update).toHaveBeenCalledWith(
			'opportunity',
			'opportunity-id',
			'{"name":"Updated"}',
		);
		expect(service.update).toHaveBeenCalledWith('task', 'task-id', '{"title":"Updated Task"}');
		expect(service.update).toHaveBeenCalledWith('note', 'note-id', '{"title":"Updated Note"}');
		expect(service.update).toHaveBeenCalledWith('company', 'mapped-company-id', {
			address: { addressCity: 'Updated City', addressStreet2: 'Updated Street 2' },
		});
		expect(service.delete).toHaveBeenCalledWith('company', 'company-id');
		expect(service.delete).toHaveBeenCalledWith('opportunity', 'opportunity-id');
		expect(service.delete).toHaveBeenCalledWith('task', 'task-id');
		expect(service.delete).toHaveBeenCalledWith('note', 'note-id');

		const duplicateMapper = {
			mappingMode: 'defineBelow',
			value: { address__addressCity: 'Duplicate' },
			matchingColumns: [],
			schema: [],
			attemptToConvertTypes: false,
			convertFieldsToString: false,
		};
		await expect(
			Twenty.prototype.execute.call(
				executeContext([
					{
						resource: 'company',
						operation: 'create',
						inputMode: 'fieldMapping',
						createCommonFields: duplicateMapper,
						createAdditionalFields: duplicateMapper,
					},
				]),
			),
		).rejects.toThrow('duplicate field');
		await expect(
			Twenty.prototype.execute.call(
				executeContext([
					{
						resource: 'company',
						operation: 'create',
						inputMode: 'fieldMapping',
						createCommonFields: { ...duplicateMapper, value: [] },
						createAdditionalFields: { ...duplicateMapper, value: null },
					},
				]),
			),
		).rejects.toThrow('invalid or stale');
		expect(service.create).toHaveBeenCalledTimes(5);
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

	it.each([
		{
			label: 'fixed resource',
			parameters: {
				resource: 'company',
				operation: 'create',
				inputMode: 'fieldMapping',
				createCommonFields: { value: {} },
				createAdditionalFields: { value: {} },
			},
		},
		{
			label: 'generic Record',
			parameters: {
				resource: 'record',
				operation: 'create',
				objectApiName: 'vehicle',
				inputMode: 'fieldMapping',
				createFields: { value: {} },
			},
		},
	])('preserves sanitized connectivity errors for $label field mapping', async ({ parameters }) => {
		const connectivityError = new NodeApiError(
			executeContext([]).getNode(),
			{},
			{
				message: 'Unable to reach the Twenty API',
				description:
					'Check the Base URL, DNS, TLS certificate, and network access to the self-hosted or Twenty Cloud instance.',
			},
		);
		serviceMock.mockReturnValue({
			getObject: vi.fn().mockRejectedValue(connectivityError),
			getObjects: vi.fn(),
		});
		recordServiceMock.mockReturnValue({
			create: vi.fn(),
			get: vi.fn(),
			getMany: vi.fn(),
			update: vi.fn(),
			delete: vi.fn(),
		});

		const thrown = await Twenty.prototype.execute
			.call(executeContext([parameters]))
			.catch((error: unknown) => error);

		expect(thrown).toBe(connectivityError);
		expect((thrown as NodeApiError).message).toBe('Unable to reach the Twenty API');
		expect((thrown as NodeApiError).description).toBe(
			'Check the Base URL, DNS, TLS certificate, and network access to the self-hosted or Twenty Cloud instance.',
		);
	});

	it('sanitizes unexpected field-mapping preparation errors', async () => {
		serviceMock.mockReturnValue({
			getObject: vi.fn().mockRejectedValue(new Error('private upstream detail')),
			getObjects: vi.fn(),
		});
		recordServiceMock.mockReturnValue({
			create: vi.fn(),
			get: vi.fn(),
			getMany: vi.fn(),
			update: vi.fn(),
			delete: vi.fn(),
		});

		const execution = Twenty.prototype.execute.call(
			executeContext([
				{
					resource: 'record',
					operation: 'create',
					objectApiName: 'vehicle',
					inputMode: 'fieldMapping',
					createFields: { value: {} },
				},
			]),
		);

		await expect(execution).rejects.toThrow('Unable to prepare the Twenty record field mapping.');
		await expect(execution).rejects.not.toThrow('private upstream detail');
	});

	it('routes mapped Opportunity relation IDs through the shared service', async () => {
		const metadataObject = schemaObject({
			apiNameSingular: 'opportunity',
			apiNamePlural: 'opportunities',
			fields: ['company', 'pointOfContact'].map((apiName) => ({
				id: `${apiName}-field`,
				apiName,
				label: apiName === 'company' ? 'Company' : 'Point of Contact',
				type: 'RELATION',
				isActive: true,
				isCustom: false,
				isNullable: true,
				isUnique: false,
				isRequired: false,
				isReadOnly: false,
				isSystem: false,
				relation: opportunityRelation(apiName),
			})),
		});
		serviceMock.mockReturnValue({
			getObject: vi.fn().mockResolvedValue(metadataObject),
			getObjects: vi.fn(),
		});
		const create = vi.fn().mockResolvedValue({ id: 'opportunity-id' });
		recordServiceMock.mockReturnValue({
			create,
			get: vi.fn(),
			getMany: vi.fn(),
			update: vi.fn(),
			delete: vi.fn(),
		});
		const mapper = (value: Record<string, unknown>) => ({
			mappingMode: 'defineBelow',
			value,
			matchingColumns: [],
			schema: [],
			attemptToConvertTypes: false,
			convertFieldsToString: false,
		});
		await Twenty.prototype.execute.call(
			executeContext([
				{
					resource: 'opportunity',
					operation: 'create',
					inputMode: 'fieldMapping',
					createCommonFields: mapper({ companyId: 'company-id' }),
					createAdditionalFields: mapper({ pointOfContactId: 'person-id' }),
				},
			]),
		);
		expect(create).toHaveBeenCalledWith('opportunity', {
			companyId: 'company-id',
			pointOfContactId: 'person-id',
		});
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
