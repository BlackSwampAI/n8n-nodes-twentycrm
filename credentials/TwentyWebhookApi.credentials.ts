import type { ICredentialType, INodeProperties } from 'n8n-workflow';

// eslint-disable-next-line @n8n/community-nodes/credential-test-required -- Twenty exposes no safe public endpoint for testing a manually configured webhook secret.
export class TwentyWebhookApi implements ICredentialType {
	name = 'twentyWebhookApi';
	displayName = 'Twenty Webhook API';
	icon = 'file:../nodes/Twenty/twenty.svg' as const;
	documentationUrl = 'https://docs.twenty.com/developers/extend/webhooks';

	properties: INodeProperties[] = [
		{
			displayName: 'Webhook Secret',
			name: 'webhookSecret',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Strong shared secret entered in Twenty’s webhook form and saved here for signed delivery verification',
		},
	];
}
