import type { ICredentialTestFunctions, ICredentialsDecrypted } from 'n8n-workflow';
import { describe, expect, it, vi } from 'vitest';

import { twentyWebhookCredentialTest } from './credentialTest';

function context(request: ReturnType<typeof vi.fn>): ICredentialTestFunctions {
	return {
		helpers: { request },
	} as unknown as ICredentialTestFunctions;
}

describe('twentyWebhookCredentialTest', () => {
	it('validates only local secret presence without making a request or claiming delivery', async () => {
		const request = vi.fn();
		const result = await twentyWebhookCredentialTest.call(context(request), {
			id: 'webhook-credential-id',
			name: 'Twenty Webhook API',
			type: 'twentyWebhookApi',
			data: { webhookSecret: 'synthetic-private-secret' },
		});
		expect(result).toEqual({
			status: 'OK',
			message:
				'Webhook secret is configured. Verify signed delivery by sending a Twenty event to this trigger.',
		});
		expect(request).not.toHaveBeenCalled();
		expect(JSON.stringify(result)).not.toContain('synthetic-private-secret');
		expect(result.message).not.toMatch(/connection successful|signature verified/i);
	});

	it.each([undefined, null, 42, '', '   '])(
		'returns a safe local failure for malformed or empty secret %s',
		async (webhookSecret) => {
			const request = vi.fn();
			const result = await twentyWebhookCredentialTest.call(context(request), {
				id: 'webhook-credential-id',
				name: 'Twenty Webhook API',
				type: 'twentyWebhookApi',
				data: { webhookSecret },
			} as ICredentialsDecrypted);
			expect(result).toEqual({
				status: 'Error',
				message: 'Webhook secret is required. Enter the same shared secret in Twenty and n8n.',
			});
			expect(request).not.toHaveBeenCalled();
			if (String(webhookSecret).length > 0) {
				expect(JSON.stringify(result)).not.toContain(String(webhookSecret));
			}
		},
	);
});
