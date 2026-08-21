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
				options: [{ name: 'Schema Object', value: 'schemaObject' }],
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
		const service = createObjectMetadataService(this);
		for (let itemIndex = 0; itemIndex < this.getInputData().length; itemIndex++) {
			const resource = this.getNodeParameter('resource', itemIndex) as string;
			if (resource !== 'schemaObject') {
				throw new NodeOperationError(this.getNode(), 'Unsupported Twenty CRM resource.', {
					itemIndex,
				});
			}
			const operation = this.getNodeParameter('operation', itemIndex) as string;
			if (operation !== 'get' && operation !== 'getMany') {
				throw new NodeOperationError(this.getNode(), 'Unsupported Schema Object operation.', {
					itemIndex,
				});
			}
			if (operation === 'get') {
				const objectApiName = this.getNodeParameter('objectApiName', itemIndex, '', {
					extractValue: true,
				}) as string;
				output.push({
					json: { ...(await service.getObject(objectApiName)) },
					pairedItem: itemIndex,
				});
				continue;
			}
			const includeInactive = this.getNodeParameter('includeInactive', itemIndex, false) as boolean;
			const includeSystem = this.getNodeParameter('includeSystem', itemIndex, false) as boolean;
			const objects = (await service.getObjects()).filter(
				(object) => (includeInactive || object.isActive) && (includeSystem || !object.isSystem),
			);
			output.push(...objects.map((object) => ({ json: { ...object }, pairedItem: itemIndex })));
		}
		return [output];
	}
}
