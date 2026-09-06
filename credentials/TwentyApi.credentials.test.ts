import type { IWorkflowDataProxyData } from 'n8n-workflow';
import { Expression } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';

import { TwentyApi } from './TwentyApi.credentials';

describe('Twenty API credentials', () => {
	it('defines masked bearer authentication and a configurable root URL', () => {
		const credential = new TwentyApi();
		const apiKey = credential.properties.find(({ name }) => name === 'apiKey');
		const baseUrl = credential.properties.find(({ name }) => name === 'baseUrl');

		expect(credential.name).toBe('twentyApi');
		expect(credential.icon).toBe('file:../nodes/Twenty/twenty.svg');
		expect(apiKey).toMatchObject({ required: true, typeOptions: { password: true } });
		expect(baseUrl).toMatchObject({ required: true, default: 'https://api.twenty.com' });
		expect(credential.authenticate).toEqual({
			type: 'generic',
			properties: {
				headers: { Authorization: '=Bearer {{$credentials.apiKey}}' },
			},
		});
		expect(credential.test).toEqual({
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
		});
	});

	it.each([
		['valid Query response', { data: { __typename: 'Query' } }, false],
		['missing typename', { data: {} }, true],
		['GraphQL error response', { errors: [{ message: 'private detail' }] }, true],
		['missing data', {}, true],
	])('applies the response failure sentinel to a %s', (_case, response, shouldFail) => {
		const rule = new TwentyApi().test.rules?.[0];
		const key = rule?.properties && 'key' in rule.properties ? rule.properties.key : '';
		const value = key
			.split('.')
			.reduce<unknown>(
				(current: unknown, segment: string) =>
					current && typeof current === 'object'
						? (current as Record<string, unknown>)[segment]
						: undefined,
				response,
			);

		expect(value === rule?.properties.value).toBe(shouldFail);
	});

	it.each([
		['https://api.twenty.com', 'https://api.twenty.com'],
		['  https://twenty.example.com///  ', 'https://twenty.example.com'],
		['https://twenty.example.com/rest/metadata/', 'https://twenty.example.com'],
		['https://twenty.example.com/metadata', 'https://twenty.example.com'],
		['https://twenty.example.com/graphql/', 'https://twenty.example.com'],
		['https://twenty.example.com/rest', 'https://twenty.example.com'],
		['https://twenty.example.com/apps/crm/rest/metadata/', 'https://twenty.example.com/apps/crm'],
	])('normalizes declarative credential-test Base URL %s', (baseUrl, expected) => {
		const expression = new TwentyApi().test.request.baseURL;
		expect(
			new Expression('UTC').resolveSimpleParameterValue(expression, {
				$credentials: { baseUrl },
			} as unknown as IWorkflowDataProxyData),
		).toBe(expected);
	});
});
