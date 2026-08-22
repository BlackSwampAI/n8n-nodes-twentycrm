import { describe, expect, it } from 'vitest';

import { TwentyWebhookApi } from './TwentyWebhookApi.credentials';

describe('Twenty Webhook API credential', () => {
	it('keeps its stable identity and password-masked required secret', () => {
		const credential = new TwentyWebhookApi();
		expect(credential).toMatchObject({
			name: 'twentyWebhookApi',
			displayName: 'Twenty Webhook API',
			documentationUrl: 'https://docs.twenty.com/developers/extend/webhooks',
		});
		expect(credential.properties).toContainEqual(
			expect.objectContaining({
				name: 'webhookSecret',
				type: 'string',
				typeOptions: { password: true },
				required: true,
			}),
		);
	});
});
