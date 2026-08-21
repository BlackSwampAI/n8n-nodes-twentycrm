/* eslint-disable @n8n/community-nodes/node-usable-as-tool -- The foundation shell has no usable operations. */
import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

export const FOUNDATION_MESSAGE =
	'The Twenty CRM node is under development and does not provide operations yet.';

export class Twenty implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Twenty CRM',
		name: 'twenty',
		icon: { light: 'file:twenty.svg', dark: 'file:twenty.dark.svg' },
		group: ['transform'],
		version: 1,
		description: 'Work with Twenty CRM',
		subtitle: 'Under development',
		defaults: {
			name: 'Twenty CRM',
		},
		credentials: [
			{
				name: 'twentyApi',
				required: true,
			},
		],
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		properties: [
			{
				displayName: FOUNDATION_MESSAGE,
				name: 'foundationNotice',
				type: 'notice',
				default: '',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		throw new NodeOperationError(this.getNode(), FOUNDATION_MESSAGE);
	}
}
