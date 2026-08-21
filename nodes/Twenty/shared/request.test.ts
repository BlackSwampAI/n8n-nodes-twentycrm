import type { IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
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

		expect(error).toBeInstanceOf(NodeOperationError);
		expect((error as Error).message).toContain('Twenty API request failed');
		expect((error as Error).message).not.toContain('secret-api-key');
		expect((error as Error).message).not.toContain('private-response');
	});

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

		expect(error).toBeInstanceOf(NodeOperationError);
		expect((error as Error).message).toBe('Twenty API request failed');
		expect(mocked.httpRequestWithAuthentication).not.toHaveBeenCalled();
	});
});
