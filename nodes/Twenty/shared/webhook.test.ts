import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
	parseTwentyWebhookEvent,
	TWENTY_WEBHOOK_TOLERANCE_MS,
	verifyTwentyWebhook,
} from './webhook';

const secret = 'synthetic-webhook-secret';
const now = 1_800_000_000_000;
const body = Buffer.from('{"eventName":"person.created","spacing":"preserved"}');

function headers(rawBody = body, timestamp = String(now)) {
	return {
		'x-twenty-webhook-timestamp': timestamp,
		'x-twenty-webhook-signature': createHmac('sha256', secret)
			.update(`${timestamp}:`)
			.update(rawBody)
			.digest('hex'),
	};
}

describe('Twenty webhook security', () => {
	it('verifies the exact raw body and both timestamp boundaries', () => {
		expect(() => verifyTwentyWebhook(body, headers(), secret, now)).not.toThrow();
		expect(() =>
			verifyTwentyWebhook(
				body,
				headers(body, String(now - TWENTY_WEBHOOK_TOLERANCE_MS)),
				secret,
				now,
			),
		).not.toThrow();
		expect(() =>
			verifyTwentyWebhook(
				body,
				headers(body, String(now + TWENTY_WEBHOOK_TOLERANCE_MS)),
				secret,
				now,
			),
		).not.toThrow();
	});

	it('rejects altered and reserialized bodies', () => {
		const signed = headers();
		expect(() => verifyTwentyWebhook(Buffer.from('{}'), signed, secret, now)).toThrow(
			'The Twenty webhook signature is invalid.',
		);
		expect(() =>
			verifyTwentyWebhook(
				Buffer.from('{"eventName":"person.created", "spacing":"preserved"}'),
				signed,
				secret,
				now,
			),
		).toThrow('The Twenty webhook signature is invalid.');
	});

	it.each([
		[undefined, headers(), 'raw Twenty webhook request body'],
		[body, {}, 'timestamp header'],
		[body, { ...headers(), 'x-twenty-webhook-signature': 'not-hex' }, 'signature is invalid'],
		[body, headers(body, '1700000000'), 'timestamp is invalid'],
		[body, headers(body, String(now - TWENTY_WEBHOOK_TOLERANCE_MS - 1)), 'timestamp is outside'],
		[body, headers(body, String(now + TWENTY_WEBHOOK_TOLERANCE_MS + 1)), 'timestamp is outside'],
	])('rejects missing, malformed, or stale delivery data', (rawBody, requestHeaders, message) => {
		expect(() => verifyTwentyWebhook(rawBody, requestHeaders, secret, now)).toThrow(message);
	});

	it('rejects an empty secret and duplicate headers safely', () => {
		expect(() => verifyTwentyWebhook(body, headers(), '', now)).toThrow(
			'The Twenty webhook credential is not configured.',
		);
		expect(() =>
			verifyTwentyWebhook(
				body,
				{ ...headers(), 'x-twenty-webhook-timestamp': [String(now), String(now)] },
				secret,
				now,
			),
		).toThrow('The Twenty webhook timestamp header is missing or invalid.');
		expect(() =>
			verifyTwentyWebhook(
				body,
				{
					...headers(),
					'x-twenty-webhook-signature': [headers()['x-twenty-webhook-signature'], '0'.repeat(64)],
				},
				secret,
				now,
			),
		).toThrow('The Twenty webhook signature header is missing or invalid.');
	});

	it('parses the pinned v2.9 event envelope without exposing or transforming it', () => {
		const payload = {
			eventName: 'customThing.updated',
			objectMetadata: { id: 'synthetic-object', nameSingular: 'customThing' },
			record: { id: 'synthetic-record' },
		};
		expect(parseTwentyWebhookEvent(payload)).toEqual({
			payload,
			event: 'updated',
			objectApiName: 'customThing',
		});
	});

	it.each([
		[null],
		[{}],
		[{ eventName: 'person.created', objectMetadata: {} }],
		[{ eventName: 'company.created', objectMetadata: { nameSingular: 'person' } }],
		[{ eventName: 'person.restored', objectMetadata: { nameSingular: 'person' } }],
	])('rejects malformed or unsupported event envelopes safely', (payload) => {
		expect(() => parseTwentyWebhookEvent(payload)).toThrow('Twenty webhook');
	});
});
