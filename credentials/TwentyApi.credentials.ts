/* eslint-disable @n8n/community-nodes/credential-test-required -- Connectivity testing is intentionally deferred to the authenticated transport milestone. */
import type { IAuthenticateGeneric, ICredentialType, INodeProperties } from 'n8n-workflow';

export class TwentyApi implements ICredentialType {
	name = 'twentyApi';
	displayName = 'Twenty API';
	icon = 'file:../nodes/Twenty/twenty.svg' as const;
	documentationUrl = 'https://docs.twenty.com/developers/section/authentication';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://api.twenty.com',
			required: true,
			description: 'Root URL for Twenty Cloud or a self-hosted Twenty instance',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};
}
