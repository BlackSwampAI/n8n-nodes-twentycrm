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
		expect('test' in credential).toBe(false);
	});
});
