import type {
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodeListSearchResult,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { twentyApiCredentialTest } from './shared/credentialTest';
import { createObjectMetadataService } from './shared/metadata';
import { createRecordReadService } from './shared/records';

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
					{ name: 'Get', value: 'get', description: 'Get a record', action: 'Get a record' },
					{
						name: 'Get Many',
						value: 'getMany',
						description: 'Get many records',
						action: 'Get many records',
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
				displayOptions: { show: { resource: ['record'], operation: ['get'] } },
			},
			{
				displayName: 'Return All',
				name: 'returnAll',
				type: 'boolean',
				default: false,
				description: 'Whether to return all results or only up to a given limit',
				displayOptions: { show: { resource: ['record'], operation: ['getMany'] } },
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				typeOptions: { minValue: 1, maxValue: 10000 },
				default: 50,
				description: 'Max number of results to return',
				displayOptions: {
					show: { resource: ['record'], operation: ['getMany'], returnAll: [false] },
				},
			},
			{
				displayName: 'Filter',
				name: 'filter',
				type: 'string',
				default: '',
				placeholder: 'status[eq]:"open"',
				description: 'Twenty REST filter expression using workspace field API names',
				displayOptions: { show: { resource: ['record'], operation: ['getMany'] } },
			},
			{
				displayName: 'Order By',
				name: 'orderBy',
				type: 'string',
				default: '',
				placeholder: 'createdAt[DescNullsLast]',
				description: 'Twenty REST ordering expression using workspace field API names',
				displayOptions: { show: { resource: ['record'], operation: ['getMany'] } },
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
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const output: INodeExecutionData[] = [];
		const metadataService = createObjectMetadataService(this);
		const recordService = createRecordReadService(this, metadataService);
		for (let itemIndex = 0; itemIndex < this.getInputData().length; itemIndex++) {
			const resource = this.getNodeParameter('resource', itemIndex) as string;
			if (resource !== 'schemaObject' && resource !== 'record') {
				throw new NodeOperationError(this.getNode(), 'Unsupported Twenty CRM resource.', {
					itemIndex,
				});
			}
			const operation = this.getNodeParameter('operation', itemIndex) as string;
			if (operation !== 'get' && operation !== 'getMany') {
				throw new NodeOperationError(this.getNode(), 'Unsupported Twenty CRM operation.', {
					itemIndex,
				});
			}
			if (resource === 'record') {
				const objectApiName = this.getNodeParameter('objectApiName', itemIndex, '', {
					extractValue: true,
				}) as string;
				if (operation === 'get') {
					const recordId = this.getNodeParameter('recordId', itemIndex) as string;
					output.push({
						json: { ...(await recordService.get(objectApiName, recordId)) },
						pairedItem: itemIndex,
					});
					continue;
				}
				const returnAll = this.getNodeParameter('returnAll', itemIndex) as boolean;
				const records = await recordService.getMany(objectApiName, {
					returnAll,
					limit: returnAll ? undefined : (this.getNodeParameter('limit', itemIndex) as number),
					filter: this.getNodeParameter('filter', itemIndex, '') as string,
					orderBy: this.getNodeParameter('orderBy', itemIndex, '') as string,
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
