import type {
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodeListSearchResult,
	INodeType,
	INodeTypeDescription,
	ResourceMapperFields,
	ResourceMapperValue,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { twentyApiCredentialTest } from './shared/credentialTest';
import {
	buildFixedResourceMapperFields,
	buildRecordMapperFields,
	combineRecordMapperValues,
	reconstructRecordPayload,
	TwentyFieldMappingError,
} from './shared/fieldMapping';
import { createObjectMetadataService } from './shared/metadata';
import { createRecordService } from './shared/records';

export class Twenty implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Twenty CRM',
		name: 'twenty',
		icon: { light: 'file:twenty.svg', dark: 'file:twenty.dark.svg' },
		group: ['transform'],
		version: 1,
		description: 'Work with Twenty CRM',
		usableAsTool: true,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		defaults: { name: 'Twenty CRM' },
		credentials: [{ name: 'twentyApi', required: true, testedBy: 'twentyApiCredentialTest' }],
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Company', value: 'company' },
					{ name: 'Person', value: 'person' },
					{ name: 'Record', value: 'record' },
					{ name: 'Schema Object', value: 'schemaObject' },
				],
				default: 'schemaObject',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['company', 'person'] } },
				options: [
					{ name: 'Create', value: 'create', action: 'Create a record' },
					{ name: 'Delete', value: 'delete', action: 'Delete a record' },
					{ name: 'Get', value: 'get', action: 'Get a record' },
					{ name: 'Get Many', value: 'getMany', action: 'Get many records' },
					{ name: 'Update', value: 'update', action: 'Update a record' },
				],
				default: 'getMany',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['schemaObject'] } },
				options: [
					{
						name: 'Get',
						value: 'get',
						description: 'Get a schema object',
						action: 'Get a schema object',
					},
					{
						name: 'Get Many',
						value: 'getMany',
						description: 'Get many schema objects',
						action: 'Get many schema objects',
					},
				],
				default: 'getMany',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['record'] } },
				options: [
					{
						name: 'Create',
						value: 'create',
						description: 'Create a record',
						action: 'Create a record',
					},
					{
						name: 'Delete',
						value: 'delete',
						description: 'Delete a record',
						action: 'Delete a record',
					},
					{ name: 'Get', value: 'get', description: 'Get a record', action: 'Get a record' },
					{
						name: 'Get Many',
						value: 'getMany',
						description: 'Get many records',
						action: 'Get many records',
					},
					{
						name: 'Update',
						value: 'update',
						description: 'Update a record',
						action: 'Update a record',
					},
				],
				default: 'getMany',
			},
			{
				displayName: 'Object',
				name: 'objectApiName',
				type: 'resourceLocator',
				default: { mode: 'list', value: '' },
				required: true,
				displayOptions: { show: { resource: ['schemaObject'], operation: ['get'] } },
				modes: [
					{
						displayName: 'List',
						name: 'list',
						type: 'list',
						typeOptions: { searchListMethod: 'searchSchemaObjects', searchable: true },
					},
					{ displayName: 'API Name', name: 'apiName', type: 'string', placeholder: 'person' },
				],
			},
			{
				displayName: 'Object',
				name: 'objectApiName',
				type: 'resourceLocator',
				default: { mode: 'list', value: '' },
				required: true,
				displayOptions: { show: { resource: ['record'] } },
				modes: [
					{
						displayName: 'List',
						name: 'list',
						type: 'list',
						typeOptions: { searchListMethod: 'searchSchemaObjects', searchable: true },
					},
					{ displayName: 'API Name', name: 'apiName', type: 'string', placeholder: 'person' },
				],
			},
			{
				displayName: 'Record ID',
				name: 'recordId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['record', 'company', 'person'],
						operation: ['get', 'update', 'delete'],
					},
				},
			},
			{
				displayName: 'Input Mode',
				name: 'inputMode',
				type: 'options',
				default: 'fieldMapping',
				options: [
					{ name: 'Field Mapping', value: 'fieldMapping' },
					{ name: 'JSON', value: 'json' },
				],
				displayOptions: {
					show: { resource: ['record', 'company', 'person'], operation: ['create', 'update'] },
				},
			},
			{
				displayName: 'Fields',
				name: 'createFields',
				type: 'resourceMapper',
				default: { mappingMode: 'defineBelow', value: null },
				required: true,
				noDataExpression: true,
				typeOptions: {
					loadOptionsDependsOn: ['resource', 'objectApiName.value', 'operation'],
					resourceMapper: {
						resourceMapperMethod: 'getCreateFields',
						mode: 'add',
						addAllFields: false,
						supportAutoMap: false,
						refreshIncompleteSchemaOnOpen: true,
						refreshStaleSchemaOnOpen: true,
					},
				},
				displayOptions: {
					show: {
						resource: ['record'],
						operation: ['create'],
						inputMode: ['fieldMapping'],
					},
				},
			},
			{
				displayName: 'Fields',
				name: 'updateFields',
				type: 'resourceMapper',
				default: { mappingMode: 'defineBelow', value: null },
				required: true,
				noDataExpression: true,
				typeOptions: {
					loadOptionsDependsOn: ['resource', 'objectApiName.value', 'operation'],
					resourceMapper: {
						resourceMapperMethod: 'getUpdateFields',
						mode: 'add',
						addAllFields: false,
						supportAutoMap: false,
						refreshIncompleteSchemaOnOpen: true,
						refreshStaleSchemaOnOpen: true,
					},
				},
				displayOptions: {
					show: {
						resource: ['record'],
						operation: ['update'],
						inputMode: ['fieldMapping'],
					},
				},
			},
			...(['create', 'update'] as const).flatMap((operation) => [
				{
					displayName: 'Common Fields',
					name: `${operation}CommonFields`,
					type: 'resourceMapper' as const,
					default: { mappingMode: 'defineBelow', value: null },
					required: true,
					noDataExpression: true,
					typeOptions: {
						loadOptionsDependsOn: ['resource', 'operation'],
						resourceMapper: {
							resourceMapperMethod:
								operation === 'create' ? 'getCreateCommonFields' : 'getUpdateCommonFields',
							mode: 'add' as const,
							addAllFields: true,
							supportAutoMap: false,
							refreshIncompleteSchemaOnOpen: true,
							refreshStaleSchemaOnOpen: true,
						},
					},
					displayOptions: {
						show: {
							resource: ['company', 'person'],
							operation: [operation],
							inputMode: ['fieldMapping'],
						},
					},
				},
				{
					displayName: 'Additional Fields',
					name: `${operation}AdditionalFields`,
					type: 'resourceMapper' as const,
					default: { mappingMode: 'defineBelow', value: null },
					required: true,
					noDataExpression: true,
					typeOptions: {
						loadOptionsDependsOn: ['resource', 'operation'],
						resourceMapper: {
							resourceMapperMethod:
								operation === 'create' ? 'getCreateAdditionalFields' : 'getUpdateAdditionalFields',
							mode: 'add' as const,
							addAllFields: false,
							supportAutoMap: false,
							refreshIncompleteSchemaOnOpen: true,
							refreshStaleSchemaOnOpen: true,
						},
					},
					displayOptions: {
						show: {
							resource: ['company', 'person'],
							operation: [operation],
							inputMode: ['fieldMapping'],
						},
					},
				},
			]),
			{
				displayName: 'JSON Input',
				name: 'jsonInput',
				type: 'json',
				default: '{}',
				required: true,
				description: 'Record fields as a JSON object',
				displayOptions: {
					show: {
						resource: ['record', 'company', 'person'],
						operation: ['create', 'update'],
						inputMode: ['json'],
					},
				},
			},
			{
				displayName: 'Return All',
				name: 'returnAll',
				type: 'boolean',
				default: false,
				description: 'Whether to return all results or only up to a given limit',
				displayOptions: {
					show: { resource: ['record', 'company', 'person'], operation: ['getMany'] },
				},
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				typeOptions: { minValue: 1, maxValue: 10000 },
				default: 50,
				description: 'Max number of results to return',
				displayOptions: {
					show: {
						resource: ['record', 'company', 'person'],
						operation: ['getMany'],
						returnAll: [false],
					},
				},
			},
			{
				displayName: 'Filter',
				name: 'filter',
				type: 'string',
				default: '',
				placeholder: 'status[eq]:"open"',
				description: 'Twenty REST filter expression using workspace field API names',
				displayOptions: { show: { resource: ['__legacyRecord'] } },
			},
			{
				displayName: 'Order By',
				name: 'orderBy',
				type: 'string',
				default: '',
				placeholder: 'createdAt[DescNullsLast]',
				description: 'Twenty REST ordering expression using workspace field API names',
				displayOptions: { show: { resource: ['__legacyRecord'] } },
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: {
					show: { resource: ['record', 'company', 'person'], operation: ['getMany'] },
				},
				options: [
					{
						displayName: 'Filter',
						name: 'filter',
						type: 'string',
						default: '',
						placeholder: 'status[eq]:"open"',
						description: 'Twenty REST filter expression using workspace field API names',
					},
					{
						displayName: 'Order By',
						name: 'orderBy',
						type: 'string',
						default: '',
						placeholder: 'createdAt[DescNullsLast]',
						description: 'Twenty REST ordering expression using workspace field API names',
					},
				],
			},
			{
				displayName: 'Include Inactive',
				name: 'includeInactive',
				type: 'boolean',
				default: false,
				displayOptions: { show: { resource: ['schemaObject'], operation: ['getMany'] } },
			},
			{
				displayName: 'Include System',
				name: 'includeSystem',
				type: 'boolean',
				default: false,
				displayOptions: { show: { resource: ['schemaObject'], operation: ['getMany'] } },
			},
		],
	};

	methods = {
		credentialTest: { twentyApiCredentialTest },
		listSearch: {
			async searchSchemaObjects(
				this: ILoadOptionsFunctions,
				filter = '',
			): Promise<INodeListSearchResult> {
				const objects = await createObjectMetadataService(this).getObjects();
				const normalizedFilter = filter.trim().toLocaleLowerCase('en');
				return {
					results: objects
						.filter(
							(object) =>
								object.isActive &&
								!object.isSystem &&
								!object.isRemote &&
								(normalizedFilter === '' ||
									object.labelSingular.toLocaleLowerCase('en').includes(normalizedFilter) ||
									object.apiNameSingular.toLocaleLowerCase('en').includes(normalizedFilter)),
						)
						.sort((left, right) => {
							const labelOrder = left.labelSingular.localeCompare(right.labelSingular, 'en', {
								sensitivity: 'base',
							});
							return labelOrder || left.apiNameSingular.localeCompare(right.apiNameSingular, 'en');
						})
						.map((object) => ({ name: object.labelSingular, value: object.apiNameSingular })),
				};
			},
		},
		resourceMapping: {
			async getCreateFields(this: ILoadOptionsFunctions): Promise<ResourceMapperFields> {
				const apiName = this.getNodeParameter('objectApiName', undefined, {
					extractValue: true,
				}) as string | undefined;
				if (!apiName) return { fields: [] };
				const object = await createObjectMetadataService(this).getObject(apiName);
				return { fields: buildRecordMapperFields(object, 'create') };
			},
			async getUpdateFields(this: ILoadOptionsFunctions): Promise<ResourceMapperFields> {
				const apiName = this.getNodeParameter('objectApiName', undefined, {
					extractValue: true,
				}) as string | undefined;
				if (!apiName) return { fields: [] };
				const object = await createObjectMetadataService(this).getObject(apiName);
				return { fields: buildRecordMapperFields(object, 'update') };
			},
			async getCreateCommonFields(this: ILoadOptionsFunctions): Promise<ResourceMapperFields> {
				const resource = this.getNodeParameter('resource') as 'company' | 'person';
				const object = await createObjectMetadataService(this).getObject(resource);
				return { fields: buildFixedResourceMapperFields(object, 'create', resource, 'common') };
			},
			async getCreateAdditionalFields(this: ILoadOptionsFunctions): Promise<ResourceMapperFields> {
				const resource = this.getNodeParameter('resource') as 'company' | 'person';
				const object = await createObjectMetadataService(this).getObject(resource);
				return { fields: buildFixedResourceMapperFields(object, 'create', resource, 'additional') };
			},
			async getUpdateCommonFields(this: ILoadOptionsFunctions): Promise<ResourceMapperFields> {
				const resource = this.getNodeParameter('resource') as 'company' | 'person';
				const object = await createObjectMetadataService(this).getObject(resource);
				return { fields: buildFixedResourceMapperFields(object, 'update', resource, 'common') };
			},
			async getUpdateAdditionalFields(this: ILoadOptionsFunctions): Promise<ResourceMapperFields> {
				const resource = this.getNodeParameter('resource') as 'company' | 'person';
				const object = await createObjectMetadataService(this).getObject(resource);
				return { fields: buildFixedResourceMapperFields(object, 'update', resource, 'additional') };
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const output: INodeExecutionData[] = [];
		const metadataService = createObjectMetadataService(this);
		const recordService = createRecordService(this, metadataService);
		const mappedInput = async (
			resource: string,
			objectApiName: string,
			operation: 'create' | 'update',
			itemIndex: number,
		): Promise<unknown> => {
			const inputMode = this.getNodeParameter('inputMode', itemIndex, 'json') as string;
			if (inputMode === 'json') return this.getNodeParameter('jsonInput', itemIndex);
			if (inputMode !== 'fieldMapping') {
				throw new NodeOperationError(this.getNode(), 'Unsupported Twenty CRM input mode.', {
					itemIndex,
				});
			}
			try {
				const mapper =
					resource === 'company' || resource === 'person'
						? combineRecordMapperValues(
								this.getNodeParameter(`${operation}CommonFields`, itemIndex),
								this.getNodeParameter(`${operation}AdditionalFields`, itemIndex),
							)
						: (this.getNodeParameter(
								operation === 'create' ? 'createFields' : 'updateFields',
								itemIndex,
							) as ResourceMapperValue);
				return reconstructRecordPayload(await metadataService.getObject(objectApiName), mapper);
			} catch (error) {
				if (error instanceof TwentyFieldMappingError) {
					throw new NodeOperationError(this.getNode(), error.message, { itemIndex });
				}
				throw new NodeOperationError(
					this.getNode(),
					'Unable to prepare the Twenty record field mapping.',
					{ itemIndex },
				);
			}
		};
		for (let itemIndex = 0; itemIndex < this.getInputData().length; itemIndex++) {
			const resource = this.getNodeParameter('resource', itemIndex) as string;
			if (!['schemaObject', 'record', 'company', 'person'].includes(resource)) {
				throw new NodeOperationError(this.getNode(), 'Unsupported Twenty CRM resource.', {
					itemIndex,
				});
			}
			const operation = this.getNodeParameter('operation', itemIndex) as string;
			const supportedOperation =
				resource === 'schemaObject'
					? operation === 'get' || operation === 'getMany'
					: ['create', 'delete', 'get', 'getMany', 'update'].includes(operation);
			if (!supportedOperation) {
				throw new NodeOperationError(this.getNode(), 'Unsupported Twenty CRM operation.', {
					itemIndex,
				});
			}
			if (resource === 'record' || resource === 'company' || resource === 'person') {
				const objectApiName =
					resource === 'company' || resource === 'person'
						? resource
						: (this.getNodeParameter('objectApiName', itemIndex, '', {
								extractValue: true,
							}) as string);
				if (operation === 'create') {
					const input = await mappedInput(resource, objectApiName, 'create', itemIndex);
					output.push({
						json: { ...(await recordService.create(objectApiName, input)) },
						pairedItem: itemIndex,
					});
					continue;
				}
				if (operation === 'get' || operation === 'update' || operation === 'delete') {
					const recordId = this.getNodeParameter('recordId', itemIndex) as string;
					if (operation === 'update') {
						const input = await mappedInput(resource, objectApiName, 'update', itemIndex);
						output.push({
							json: { ...(await recordService.update(objectApiName, recordId, input)) },
							pairedItem: itemIndex,
						});
						continue;
					}
					if (operation === 'delete') {
						output.push({
							json: { ...(await recordService.delete(objectApiName, recordId)) },
							pairedItem: itemIndex,
						});
						continue;
					}
					output.push({
						json: { ...(await recordService.get(objectApiName, recordId)) },
						pairedItem: itemIndex,
					});
					continue;
				}
				const returnAll = this.getNodeParameter('returnAll', itemIndex) as boolean;
				const options = this.getNodeParameter('options', itemIndex, {}) as Record<string, unknown>;
				const legacyFilter = this.getNodeParameter('filter', itemIndex, '') as string;
				const legacyOrderBy = this.getNodeParameter('orderBy', itemIndex, '') as string;
				const records = await recordService.getMany(objectApiName, {
					returnAll,
					limit: returnAll ? undefined : (this.getNodeParameter('limit', itemIndex) as number),
					filter: Object.prototype.hasOwnProperty.call(options, 'filter')
						? (options.filter as string)
						: legacyFilter,
					orderBy: Object.prototype.hasOwnProperty.call(options, 'orderBy')
						? (options.orderBy as string)
						: legacyOrderBy,
				});
				output.push(...records.map((record) => ({ json: { ...record }, pairedItem: itemIndex })));
				continue;
			}
			if (operation === 'get') {
				const objectApiName = this.getNodeParameter('objectApiName', itemIndex, '', {
					extractValue: true,
				}) as string;
				output.push({
					json: { ...(await metadataService.getObject(objectApiName)) },
					pairedItem: itemIndex,
				});
				continue;
			}
			const includeInactive = this.getNodeParameter('includeInactive', itemIndex, false) as boolean;
			const includeSystem = this.getNodeParameter('includeSystem', itemIndex, false) as boolean;
			const objects = (await metadataService.getObjects()).filter(
				(object) => (includeInactive || object.isActive) && (includeSystem || !object.isSystem),
			);
			output.push(...objects.map((object) => ({ json: { ...object }, pairedItem: itemIndex })));
		}
		return [output];
	}
}
