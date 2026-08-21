import type { ICredentialTestFunctions, ICredentialsDecrypted } from 'n8n-workflow';
import { describe, expect, it, vi } from 'vitest';

import { twentyApiCredentialTest } from './credentialTest';

function credential(baseUrl: string, apiKey = 'test-api-key'): ICredentialsDecrypted {
	return {
		id: 'credential-id',
		name: 'Twenty API',
		type: 'twentyApi',
		data: { baseUrl, apiKey },
	};
}

function context(request: ReturnType<typeof vi.fn>): ICredentialTestFunctions {
	return {
		helpers: { request },
	} as unknown as ICredentialTestFunctions;
}

describe('twentyApiCredentialTest', () => {
	it.each([
		['Twenty Cloud', 'https://api.twenty.com', 'https://api.twenty.com/graphql'],
		[
			'self-hosted suffix and prefix',
			' http://localhost:3000/twenty/rest/metadata/ ',
			'http://localhost:3000/twenty/graphql',
		],
	])('sends the read-only authenticated probe for %s', async (_case, baseUrl, expectedUrl) => {
		const request = vi.fn().mockResolvedValue({ data: { __typename: 'Query' }, errors: [] });

		await expect(
			twentyApiCredentialTest.call(context(request), credential(baseUrl)),
		).resolves.toEqual({ status: 'OK', message: 'Connection successful' });
		expect(request).toHaveBeenCalledWith({
			method: 'POST',
			uri: expectedUrl,
			headers: { Authorization: 'Bearer test-api-key' },
			body: { query: 'query CredentialTest { __typename }' },
			json: true,
		});
	});

	it('returns a safe failure for invalid authentication or request errors', async () => {
		const request = vi.fn().mockRejectedValue({
			response: {
				status: 401,
				headers: { Authorization: 'Bearer test-api-key' },
				data: { message: 'private-response' },
			},
		});

		const result = await twentyApiCredentialTest.call(
			context(request),
			credential('https://api.twenty.com'),
		);

		expect(result).toEqual({
			status: 'Error',
			message:
				'Twenty API authentication failed. Check that the API key is valid and has not expired.',
		});
		expect(result.message).not.toContain('test-api-key');
		expect(result.message).not.toContain('private-response');
	});

	it.each([['malformed response', { data: {} }]])(
		'returns a safe failure for a %s',
		async (_case, response) => {
			const request = vi.fn().mockResolvedValue(response);

			await expect(
				twentyApiCredentialTest.call(context(request), credential('https://api.twenty.com')),
			).resolves.toEqual({
				status: 'Error',
				message: 'Unable to connect with these Twenty API settings.',
			});
		},
	);

	it('returns an actionable, redacted failure for GraphQL errors', async () => {
		const request = vi.fn().mockResolvedValue({
			data: { __typename: 'Query' },
			errors: [
				{ message: 'test-api-key private-response', extensions: { code: 'UNAUTHENTICATED' } },
			],
		});

		const result = await twentyApiCredentialTest.call(
			context(request),
			credential('https://api.twenty.com'),
		);

		expect(result).toEqual({
			status: 'Error',
			message:
				'Twenty API authentication failed. Check that the API key is valid and has not expired.',
		});
		expect(JSON.stringify(result)).not.toContain('test-api-key');
		expect(JSON.stringify(result)).not.toContain('private-response');
	});

	it('returns a safe failure for an invalid Base URL without requesting', async () => {
		const request = vi.fn();

		await expect(
			twentyApiCredentialTest.call(context(request), credential('not-a-url')),
		).resolves.toEqual({
			status: 'Error',
			message:
				'Unable to reach the Twenty API. Check the Base URL, DNS, TLS certificate, and network access to the self-hosted or Twenty Cloud instance.',
		});
		expect(request).not.toHaveBeenCalled();
	});
});
