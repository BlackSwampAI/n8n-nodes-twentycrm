import type {
	ILoadOptionsFunctions,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { twentyApiCredentialTest } from './shared/credentialTest';
import { createObjectMetadataService } from './shared/metadata';
import { parseTwentyWebhookEvent, TwentyWebhookError, verifyTwentyWebhook } from './shared/webhook';

const ALL_OBJECTS = '*';

// eslint-disable-next-line @n8n/community-nodes/webhook-lifecycle-complete, @n8n/community-nodes/node-usable-as-tool -- Registration is intentionally manual because Twenty v2.9 has no proven public management API; trigger nodes cannot be AI tools.
export class TwentyTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Twenty CRM Trigger',
		name: 'twentyTrigger',
		icon: { light: 'file:twenty.svg', dark: 'file:twenty.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["event"]}}',
		description: 'Starts the workflow when a Twenty CRM record changes',
		defaults: { name: 'Twenty CRM Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{ name: 'twentyApi', required: true, testedBy: 'twentyApiCredentialTest' },
			{ name: 'twentyWebhookApi', required: true },
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'twenty',
			},
		],
		properties: [
			{
				displayName:
					'Create the webhook manually in Twenty Settings → API & Webhooks. Use the n8n webhook URL shown above and save Twenty’s generated secret in the Twenty Webhook credential. Twenty sends all record events to this URL; this node filters them after signature verification.',
				name: 'manualRegistrationNotice',
				type: 'notice',
				default: '',
			},
			{
				displayName: 'Event',
				name: 'event',
				type: 'options',
				options: [
					{ name: 'Record Created', value: 'created' },
					{ name: 'Record Deleted', value: 'deleted' },
					{ name: 'Record Updated', value: 'updated' },
				],
				default: 'created',
			},
			{
				displayName: 'Object Name or ID',
				name: 'objectApiName',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getTriggerObjects' },
				default: ALL_OBJECTS,
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},
		],
	};

	methods = {
		credentialTest: { twentyApiCredentialTest },
		loadOptions: {
			async getTriggerObjects(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const objects = await createObjectMetadataService(this).getObjects();
				return [
					{ name: 'All Objects', value: ALL_OBJECTS },
					...objects
						.filter((object) => object.isActive && !object.isSystem && !object.isRemote)
						.sort(
							(left, right) =>
								left.labelSingular.localeCompare(right.labelSingular) ||
								left.apiNameSingular.localeCompare(right.apiNameSingular),
						)
						.map((object) => ({
							name: object.labelSingular,
							value: object.apiNameSingular,
						})),
				];
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		try {
			const credentials = await this.getCredentials('twentyWebhookApi');
			const request = this.getRequestObject();
			verifyTwentyWebhook(
				request.rawBody,
				this.getHeaderData(),
				credentials.webhookSecret as string,
			);
			const received = parseTwentyWebhookEvent(this.getBodyData());
			const selectedEvent = this.getNodeParameter('event') as string;
			const selectedObject = this.getNodeParameter('objectApiName') as string;
			if (
				received.event !== selectedEvent ||
				(selectedObject !== ALL_OBJECTS && received.objectApiName !== selectedObject)
			) {
				return {};
			}
			return { workflowData: [this.helpers.returnJsonArray([received.payload])] };
		} catch (error) {
			if (error instanceof TwentyWebhookError) {
				throw new NodeOperationError(this.getNode(), error.message);
			}
			throw new NodeOperationError(this.getNode(), 'Unable to process the Twenty webhook.');
		}
	}
}
