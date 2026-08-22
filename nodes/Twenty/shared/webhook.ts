import { createHmac, timingSafeEqual } from 'node:crypto';

import type { IDataObject } from 'n8n-workflow';

export const TWENTY_WEBHOOK_TOLERANCE_MS = 5 * 60 * 1000;

export class TwentyWebhookError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'TwentyWebhookError';
	}
}

export interface TwentyWebhookEvent {
	payload: IDataObject;
	event: 'created' | 'updated' | 'deleted';
	objectApiName: string;
}

function header(value: string | string[] | undefined, name: string): string {
	if (typeof value !== 'string' || value.length === 0) {
		throw new TwentyWebhookError(`The Twenty webhook ${name} header is missing or invalid.`);
	}
	return value;
}

export function verifyTwentyWebhook(
	rawBody: Buffer | string | undefined,
	headers: Record<string, string | string[] | undefined>,
	secret: string,
	now = Date.now(),
): void {
	if (!rawBody || (typeof rawBody !== 'string' && !Buffer.isBuffer(rawBody))) {
		throw new TwentyWebhookError('The raw Twenty webhook request body is unavailable.');
	}
	if (typeof secret !== 'string' || secret.length === 0) {
		throw new TwentyWebhookError('The Twenty webhook credential is not configured.');
	}
	const timestamp = header(headers['x-twenty-webhook-timestamp'], 'timestamp');
	if (!/^\d{13}$/.test(timestamp)) {
		throw new TwentyWebhookError('The Twenty webhook timestamp is invalid.');
	}
	const timestampMs = Number(timestamp);
	if (
		!Number.isSafeInteger(timestampMs) ||
		Math.abs(now - timestampMs) > TWENTY_WEBHOOK_TOLERANCE_MS
	) {
		throw new TwentyWebhookError('The Twenty webhook timestamp is outside the allowed window.');
	}
	const signature = header(headers['x-twenty-webhook-signature'], 'signature');
	if (!/^[a-fA-F0-9]{64}$/.test(signature)) {
		throw new TwentyWebhookError('The Twenty webhook signature is invalid.');
	}
	const expected = createHmac('sha256', secret)
		.update(timestamp)
		.update(':')
		.update(rawBody)
		.digest();
	const received = Buffer.from(signature, 'hex');
	if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
		throw new TwentyWebhookError('The Twenty webhook signature is invalid.');
	}
}

export function parseTwentyWebhookEvent(value: unknown): TwentyWebhookEvent {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TwentyWebhookError('The Twenty webhook payload is invalid.');
	}
	const payload = value as IDataObject;
	const eventName = payload.eventName;
	const objectMetadata = payload.objectMetadata;
	if (
		typeof eventName !== 'string' ||
		objectMetadata === null ||
		typeof objectMetadata !== 'object' ||
		Array.isArray(objectMetadata)
	) {
		throw new TwentyWebhookError('The Twenty webhook payload is invalid.');
	}
	const objectApiName = (objectMetadata as IDataObject).nameSingular;
	if (typeof objectApiName !== 'string' || !/^[A-Za-z][A-Za-z0-9_]*$/.test(objectApiName)) {
		throw new TwentyWebhookError('The Twenty webhook payload is invalid.');
	}
	const suffix = eventName.slice(objectApiName.length + 1);
	if (
		!eventName.startsWith(`${objectApiName}.`) ||
		!(['created', 'updated', 'deleted'] as const).includes(
			suffix as 'created' | 'updated' | 'deleted',
		)
	) {
		throw new TwentyWebhookError('The Twenty webhook event is unsupported or malformed.');
	}
	return {
		payload,
		event: suffix as 'created' | 'updated' | 'deleted',
		objectApiName,
	};
}
