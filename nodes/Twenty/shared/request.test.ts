import type { IExecuteFunctions } from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';
import { describe, expect, it, vi } from 'vitest';

import type { TwentyApiSurface } from './contracts';
import { twentyApiRequest } from './request';

function createContext(baseUrl = 'https://api.twenty.com') {
	const binding: { context?: unknown } = {};
	const httpRequestWithAuthentication = vi.fn(function (this: unknown) {
		expect(this).toBe(binding.context);
		return Promise.resolve({ ok: true });
	});
	const value = {
		getCredentials: vi.fn().mockResolvedValue({ baseUrl, apiKey: 'secret-api-key' }),
		getNode: vi.fn().mockReturnValue({
			name: 'Twenty CRM',
			type: 'twenty',
			typeVersion: 1,
			position: [0, 0],
		}),
		helpers: { httpRequestWithAuthentication },
	};
	binding.context = value;

	return {
		context: value as unknown as IExecuteFunctions,
		httpRequestWithAuthentication,
		getCredentials: value.getCredentials,
	};
}

describe('twentyApiRequest', () => {
	it.each<[TwentyApiSurface, string]>([
		['coreRest', 'https://twenty.example.com/crm/rest/people'],
		['coreGraphql', 'https://twenty.example.com/crm/graphql/people'],
		['metadataRest', 'https://twenty.example.com/crm/rest/metadata/people'],
		['metadataGraphql', 'https://twenty.example.com/crm/metadata/people'],
	])('selects the %s surface and applies bounded request options', async (surface, expectedUrl) => {
		const mocked = createContext(' https://twenty.example.com/crm/rest/ ');

		await expect(
			twentyApiRequest(mocked.context, {
				method: 'POST',
				surface,
				path: '/people',
				query: { limit: 10 },
				body: { name: 'Example' },
			}),
		).resolves.toEqual({ ok: true });
		expect(mocked.getCredentials).toHaveBeenCalledWith('twentyApi');
		expect(mocked.httpRequestWithAuthentication).toHaveBeenCalledWith('twentyApi', {
			method: 'POST',
			url: expectedUrl,
			qs: { limit: 10 },
			body: { name: 'Example' },
			json: true,
		});
	});

	it('wraps request failures without leaking credentials or response data', async () => {
		const mocked = createContext();
		mocked.httpRequestWithAuthentication.mockRejectedValueOnce(
			new Error('401 secret-api-key private-response'),
		);

		const error = await twentyApiRequest(mocked.context, {
			method: 'GET',
			surface: 'coreRest',
		}).catch((failure: unknown) => failure);

		expect(error).toBeInstanceOf(NodeApiError);
		expect((error as Error).message).toBe('Twenty API request failed');
		expect((error as Error).message).not.toContain('secret-api-key');
		expect((error as Error).message).not.toContain('private-response');
	});

	it.each(['not-a-url', 'ftp://twenty.example.com'])(
		'rejects invalid Base URL %s with safe connectivity guidance before requesting',
		async (baseUrl) => {
			const mocked = createContext(baseUrl);

			const error = await twentyApiRequest(mocked.context, {
				method: 'GET',
				surface: 'coreRest',
			}).catch((failure: unknown) => failure);

			expect(error).toBeInstanceOf(NodeApiError);
			expect((error as Error).message).toBe('Unable to reach the Twenty API');
			expect((error as NodeApiError).description).toContain('Base URL');
			expect(mocked.httpRequestWithAuthentication).not.toHaveBeenCalled();
		},
	);

	it.each([
		'https://attacker.example',
		'//attacker.example',
		'/../graphql',
		'/%2e%2e/graphql',
		'/people?limit=1',
		'/people#details',
		'/people\\details',
		'/people%5Cdetails',
		'/%ZZ',
		'people',
	])('rejects unsafe path %s before requesting', async (path) => {
		const mocked = createContext();

		const error = await twentyApiRequest(mocked.context, {
			method: 'GET',
			surface: 'coreRest',
			path,
		}).catch((failure: unknown) => failure);

		expect(error).toBeInstanceOf(NodeApiError);
		expect((error as Error).message).toBe('Twenty API request failed');
		expect(mocked.httpRequestWithAuthentication).not.toHaveBeenCalled();
	});

	it('retries a safe GET at deterministic bounded delays and succeeds', async () => {
		const mocked = createContext();
		mocked.httpRequestWithAuthentication.mockImplementation(() => {
			if (mocked.httpRequestWithAuthentication.mock.calls.length < 3) {
				return Promise.reject({ response: { status: 503, headers: { 'Retry-After': '0' } } });
			}
			return Promise.resolve({ ok: true });
		});

		await expect(
			twentyApiRequest(mocked.context, { method: 'GET', surface: 'coreRest' }),
		).resolves.toEqual({ ok: true });
		expect(mocked.httpRequestWithAuthentication).toHaveBeenCalledTimes(3);
	});

	it('retries an allowed transient network failure for a default-safe GET', async () => {
		const mocked = createContext();
		mocked.httpRequestWithAuthentication
			.mockRejectedValueOnce({ code: 'ETIMEDOUT' })
			.mockResolvedValueOnce({ ok: true });

		await expect(
			twentyApiRequest(mocked.context, { method: 'GET', surface: 'coreRest' }),
		).resolves.toEqual({ ok: true });
		expect(mocked.httpRequestWithAuthentication).toHaveBeenCalledTimes(2);
	});

	it('honors Retry-After and stops after three attempts', async () => {
		const mocked = createContext();
		mocked.httpRequestWithAuthentication.mockRejectedValue({
			response: { status: 429, headers: { 'Retry-After': '0' } },
		});

		const error = await twentyApiRequest(mocked.context, {
			method: 'HEAD',
			surface: 'coreRest',
		}).catch((failure: unknown) => failure);

		expect(error).toBeInstanceOf(NodeApiError);
		expect((error as Error).message).toBe('Twenty API rate limit reached');
		expect(mocked.httpRequestWithAuthentication).toHaveBeenCalledTimes(3);
	});

	it.each([
		['POST', undefined, 1],
		['PATCH', 'auto', 1],
		['PUT', 'never', 1],
		['DELETE', undefined, 1],
		['POST', 'safe', 3],
		['GET', 'never', 1],
	] as const)('applies the retry policy for %s in %s mode', async (method, retry, attempts) => {
		const mocked = createContext();
		mocked.httpRequestWithAuthentication.mockRejectedValue({
			response: { status: 503, headers: { 'Retry-After': '0' } },
		});

		const request = twentyApiRequest(mocked.context, {
			method,
			surface: 'coreRest',
			retry,
		});
		await expect(request).rejects.toBeInstanceOf(NodeApiError);
		expect(mocked.httpRequestWithAuthentication).toHaveBeenCalledTimes(attempts);
	});

	it.each([400, 401, 403, 404, 409, 422])(
		'does not retry permanent HTTP %i failures',
		async (status) => {
			const mocked = createContext();
			mocked.httpRequestWithAuthentication.mockRejectedValue({ response: { status } });

			await expect(
				twentyApiRequest(mocked.context, { method: 'GET', surface: 'coreRest' }),
			).rejects.toBeInstanceOf(NodeApiError);
			expect(mocked.httpRequestWithAuthentication).toHaveBeenCalledOnce();
		},
	);

	it.each(['ENOTFOUND', 'ECONNREFUSED', 'CERT_HAS_EXPIRED'])(
		'does not retry permanent network failure %s',
		async (code) => {
			const mocked = createContext();
			mocked.httpRequestWithAuthentication.mockRejectedValue({ code });

			await expect(
				twentyApiRequest(mocked.context, { method: 'GET', surface: 'coreRest' }),
			).rejects.toBeInstanceOf(NodeApiError);
			expect(mocked.httpRequestWithAuthentication).toHaveBeenCalledOnce();
		},
	);

	it('fails safely without retrying GraphQL HTTP-200 errors', async () => {
		const mocked = createContext();
		mocked.httpRequestWithAuthentication.mockResolvedValue({
			errors: [
				{
					message: 'secret-api-key private-record-value',
					path: ['people', 'private'],
					extensions: { code: 'FORBIDDEN' },
				},
			],
		});

		const error = await twentyApiRequest(mocked.context, {
			method: 'POST',
			surface: 'coreGraphql',
			retry: 'safe',
		}).catch((failure: unknown) => failure);
		const serialized = JSON.stringify(error);

		expect(error).toBeInstanceOf(NodeApiError);
		expect((error as Error).message).toBe('Twenty API permission denied');
		expect(mocked.httpRequestWithAuthentication).toHaveBeenCalledOnce();
		expect(serialized).not.toContain('secret-api-key');
		expect(serialized).not.toContain('private-record-value');
		expect(serialized).not.toContain('Authorization');
	});
});
