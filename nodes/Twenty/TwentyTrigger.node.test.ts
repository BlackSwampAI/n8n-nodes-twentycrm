/* eslint-disable n8n-nodes-base/node-filename-against-convention -- This file tests the conventionally named trigger node implementation. */
import { createHmac } from 'node:crypto';

import type { ILoadOptionsFunctions, IWebhookFunctions } from 'n8n-workflow';
import { describe, expect, it, vi } from 'vitest';

import { TwentyTrigger } from './TwentyTrigger.node';
import { createObjectMetadataService } from './shared/metadata';

vi.mock('./shared/metadata', () => ({ createObjectMetadataService: vi.fn() }));
const metadataMock = vi.mocked(createObjectMetadataService);

const secret = 'synthetic-secret';
const timestamp = String(Date.now());
const payload = {
	eventName: 'person.created',
	objectMetadata: { id: 'object-id', nameSingular: 'person' },
	record: { id: 'record-id' },
};
const rawBody = Buffer.from(JSON.stringify(payload));

function webhookContext(event = 'created', objectApiName = 'person') {
	const signature = createHmac('sha256', secret)
		.update(`${timestamp}:`)
		.update(rawBody)
		.digest('hex');
	return {
		getCredentials: vi.fn().mockResolvedValue({ webhookSecret: secret }),
		getRequestObject: () => ({ rawBody }),
		getHeaderData: () => ({
			'x-twenty-webhook-timestamp': timestamp,
			'x-twenty-webhook-signature': signature,
		}),
		getBodyData: () => payload,
		getNodeParameter: (name: string) => (name === 'event' ? event : objectApiName),
		getNode: () => ({ name: 'Twenty CRM Trigger', type: 'twentyTrigger', typeVersion: 1 }),
		helpers: { returnJsonArray: (items: object[]) => items.map((json) => ({ json })) },
	} as unknown as IWebhookFunctions;
}

describe('Twenty CRM Trigger node', () => {
	it('declares trigger identity, credentials, events, manual registration, and webhook', () => {
		const node = new TwentyTrigger();
		expect(node.description).toMatchObject({
			displayName: 'Twenty CRM Trigger',
			name: 'twentyTrigger',
			group: ['trigger'],
			inputs: [],
			credentials: [{ name: 'twentyApi' }, { name: 'twentyWebhookApi' }],
			webhooks: [{ httpMethod: 'POST', responseMode: 'onReceived' }],
		});
		const event = node.description.properties.find(({ name }) => name === 'event');
		expect(event?.options).toEqual([
			{ name: 'Record Created', value: 'created' },
			{ name: 'Record Deleted', value: 'deleted' },
			{ name: 'Record Updated', value: 'updated' },
		]);
		const notice = node.description.properties.find(
			({ name }) => name === 'manualRegistrationNotice',
		);
		expect(notice?.displayName).toContain('even though Twenty labels it optional');
		expect(notice?.displayName).toContain('requires signed deliveries');
	});

	it('loads active standard and custom objects with All Objects first', async () => {
		metadataMock.mockReturnValue({
			getObject: vi.fn(),
			getObjects: vi.fn().mockResolvedValue([
				{
					labelSingular: 'Vehicle',
					apiNameSingular: 'vehicle',
					isActive: true,
					isSystem: false,
					isRemote: false,
				},
				{
					labelSingular: 'Person',
					apiNameSingular: 'person',
					isActive: true,
					isSystem: false,
					isRemote: false,
				},
				{
					labelSingular: 'Hidden',
					apiNameSingular: 'hidden',
					isActive: false,
					isSystem: false,
					isRemote: false,
				},
			]),
		});
		const result = await new TwentyTrigger().methods.loadOptions.getTriggerObjects.call(
			{} as ILoadOptionsFunctions,
		);
		expect(result).toEqual([
			{ name: 'All Objects', value: '*' },
			{ name: 'Person', value: 'person' },
			{ name: 'Vehicle', value: 'vehicle' },
		]);
	});

	it.each([
		['created', 'person', true],
		['created', '*', true],
		['updated', 'person', false],
		['created', 'company', false],
	])('filters by selected event and object', async (event, object, emits) => {
		const result = await new TwentyTrigger().webhook.call(webhookContext(event, object));
		expect(result.workflowData !== undefined).toBe(emits);
		if (emits) expect(result.workflowData).toEqual([[{ json: payload }]]);
	});

	it('returns only a safe error when verification fails', async () => {
		const context = webhookContext() as unknown as {
			getHeaderData: () => object;
		};
		context.getHeaderData = () => ({
			'x-twenty-webhook-timestamp': timestamp,
			'x-twenty-webhook-signature': '0'.repeat(64),
		});
		await expect(
			new TwentyTrigger().webhook.call(context as unknown as IWebhookFunctions),
		).rejects.toThrow('The Twenty webhook signature is invalid.');
	});

	it('sanitizes unexpected webhook processing errors', async () => {
		const context = webhookContext() as unknown as {
			getCredentials: () => Promise<never>;
		};
		context.getCredentials = vi.fn().mockRejectedValue(new Error('private credential detail'));
		const execution = new TwentyTrigger().webhook.call(context as unknown as IWebhookFunctions);
		await expect(execution).rejects.toThrow('Unable to process the Twenty webhook.');
		await expect(execution).rejects.not.toThrow('private credential detail');
	});
});
