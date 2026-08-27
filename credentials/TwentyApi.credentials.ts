import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

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

	test: ICredentialTestRequest = {
		request: {
			baseURL:
				"={{$credentials.baseUrl.trim().replace(/\\/+$/, '').replace(/\\/rest\\/metadata$/, '').replace(/\\/metadata$/, '').replace(/\\/graphql$/, '').replace(/\\/rest$/, '')}}",
			url: '/graphql',
			method: 'POST',
			body: { query: 'query CredentialTest { __typename }' },
		},
		rules: [
			{
				type: 'responseSuccessBody',
				properties: {
					key: 'data.__typename',
					value: undefined,
					message: 'Twenty did not return a valid GraphQL response.',
				},
			},
		],
	};
}
