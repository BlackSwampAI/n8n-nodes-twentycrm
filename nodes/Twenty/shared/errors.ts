import type { INode, JsonObject } from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

import { TwentyUrlError } from './urls';

export type TwentyFailureKind =
	| 'authentication'
	| 'conflict'
	| 'connectivity'
	| 'invalidRequest'
	| 'notFound'
	| 'permission'
	| 'rateLimit'
	| 'temporary'
	| 'unknown';

export interface TwentyFailure {
	kind: TwentyFailureKind;
	message: string;
	description: string;
	retryable: boolean;
	statusCode?: number;
	retryAfterMs?: number;
}

type UnknownRecord = Record<string, unknown>;

const MAX_RETRY_DELAY_MS = 60_000;
const TRANSIENT_NETWORK_CODES = new Set([
	'EAI_AGAIN',
	'ECONNRESET',
	'ESOCKETTIMEDOUT',
	'ETIMEDOUT',
]);
const CONNECTIVITY_NETWORK_CODES = new Set([
	'CERT_HAS_EXPIRED',
	'DEPTH_ZERO_SELF_SIGNED_CERT',
	'ECONNREFUSED',
	'ENOTFOUND',
	'ERR_TLS_CERT_ALTNAME_INVALID',
	'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
]);

const FAILURE_DETAILS: Record<TwentyFailureKind, Pick<TwentyFailure, 'message' | 'description'>> = {
	authentication: {
		message: 'Twenty API authentication failed',
		description: 'Check that the API key is valid and has not expired.',
	},
	conflict: {
		message: 'Twenty API conflict',
		description: 'Check the workspace schema and any uniqueness constraints, then try again.',
	},
	connectivity: {
		message: 'Unable to reach the Twenty API',
		description:
			'Check the Base URL, DNS, TLS certificate, and network access to the self-hosted or Twenty Cloud instance.',
	},
	invalidRequest: {
		message: 'Twenty API rejected the request',
		description: 'Check the selected object, fields, filters, and input values.',
	},
	notFound: {
		message: 'Twenty API resource was not found',
		description: 'Check the Base URL and confirm that the object or record still exists.',
	},
	permission: {
		message: 'Twenty API permission denied',
		description: 'Check that the API key role has permission for this workspace resource.',
	},
	rateLimit: {
		message: 'Twenty API rate limit reached',
		description: 'Wait before trying again or reduce the request rate.',
	},
	temporary: {
		message: 'Twenty API is temporarily unavailable',
		description: 'Try again after the service or its upstream dependency recovers.',
	},
	unknown: {
		message: 'Twenty API request failed',
		description: 'Check the Twenty API settings and try again.',
	},
};

function asRecord(value: unknown): UnknownRecord | undefined {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
		? (value as UnknownRecord)
		: undefined;
}

function nestedRecord(record: UnknownRecord | undefined, key: string): UnknownRecord | undefined {
	return asRecord(record?.[key]);
}

function numericStatus(value: unknown): number | undefined {
	if (typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599) {
		return value;
	}
	if (typeof value === 'string' && /^\d{3}$/.test(value)) {
		const parsed = Number(value);
		return parsed >= 100 && parsed <= 599 ? parsed : undefined;
	}
	return undefined;
}

export function extractTwentyStatus(error: unknown): number | undefined {
	const root = asRecord(error);
	const response = nestedRecord(root, 'response');
	const cause = nestedRecord(root, 'cause');
	const causeResponse = nestedRecord(cause, 'response');
	const candidates = [
		root?.statusCode,
		root?.status,
		root?.httpCode,
		response?.statusCode,
		response?.status,
		cause?.statusCode,
		cause?.status,
		causeResponse?.statusCode,
		causeResponse?.status,
	];

	for (const candidate of candidates) {
		const status = numericStatus(candidate);
		if (status !== undefined) return status;
	}
	return undefined;
}

function extractNetworkCode(error: unknown): string | undefined {
	const root = asRecord(error);
	const cause = nestedRecord(root, 'cause');
	for (const candidate of [root?.code, cause?.code]) {
		if (typeof candidate === 'string') return candidate.toUpperCase();
	}
	return undefined;
}

function extractHeaders(error: unknown): unknown {
	const root = asRecord(error);
	const response = nestedRecord(root, 'response');
	const cause = nestedRecord(root, 'cause');
	const causeResponse = nestedRecord(cause, 'response');
	return response?.headers ?? root?.headers ?? causeResponse?.headers ?? cause?.headers;
}

function headerValue(headers: unknown, name: string): unknown {
	const record = asRecord(headers);
	if (!record) return undefined;
	if (typeof record.get === 'function') {
		try {
			return record.get.call(headers, name.toLowerCase());
		} catch {
			return undefined;
		}
	}
	const matchingKey = Object.keys(record).find((key) => key.toLowerCase() === name.toLowerCase());
	return matchingKey === undefined ? undefined : record[matchingKey];
}

export function parseRetryAfter(value: unknown, nowMs = Date.now()): number | undefined {
	const normalized = Array.isArray(value) ? value[0] : value;
	if (typeof normalized === 'number' && Number.isInteger(normalized) && normalized >= 0) {
		return Math.min(normalized * 1_000, MAX_RETRY_DELAY_MS);
	}
	if (typeof normalized !== 'string') return undefined;

	const trimmed = normalized.trim();
	if (/^\d+$/.test(trimmed)) {
		return Math.min(Number(trimmed) * 1_000, MAX_RETRY_DELAY_MS);
	}

	const dateMs = Date.parse(trimmed);
	if (!Number.isFinite(dateMs) || dateMs <= nowMs) return undefined;
	return Math.min(dateMs - nowMs, MAX_RETRY_DELAY_MS);
}

function statusKind(statusCode: number): TwentyFailureKind {
	if (statusCode === 400 || statusCode === 422) return 'invalidRequest';
	if (statusCode === 401) return 'authentication';
	if (statusCode === 403) return 'permission';
	if (statusCode === 404) return 'notFound';
	if (statusCode === 409) return 'conflict';
	if (statusCode === 429) return 'rateLimit';
	if (statusCode === 502 || statusCode === 503 || statusCode === 504) return 'temporary';
	return 'unknown';
}

function failure(kind: TwentyFailureKind, details: Partial<TwentyFailure> = {}): TwentyFailure {
	return { kind, ...FAILURE_DETAILS[kind], retryable: false, ...details };
}

export function classifyTwentyError(error: unknown, nowMs = Date.now()): TwentyFailure {
	if (error instanceof TwentyUrlError) return failure('connectivity');

	const statusCode = extractTwentyStatus(error);
	if (statusCode !== undefined) {
		const kind = statusKind(statusCode);
		return failure(kind, {
			statusCode,
			retryable:
				statusCode === 429 || statusCode === 502 || statusCode === 503 || statusCode === 504,
			retryAfterMs: parseRetryAfter(headerValue(extractHeaders(error), 'retry-after'), nowMs),
		});
	}

	const root = asRecord(error);
	const response = nestedRecord(root, 'response');
	const graphqlFailure =
		classifyTwentyGraphqlResponse(error) ??
		classifyTwentyGraphqlResponse(root?.body) ??
		classifyTwentyGraphqlResponse(response?.data) ??
		classifyTwentyGraphqlResponse(response?.body);
	if (graphqlFailure) return graphqlFailure;

	const networkCode = extractNetworkCode(error);
	if (networkCode && TRANSIENT_NETWORK_CODES.has(networkCode)) {
		return failure('connectivity', { retryable: true });
	}
	if (networkCode && CONNECTIVITY_NETWORK_CODES.has(networkCode)) {
		return failure('connectivity');
	}
	return failure('unknown');
}

const GRAPHQL_CODE_KINDS: Record<string, TwentyFailureKind> = {
	BAD_USER_INPUT: 'invalidRequest',
	CONFLICT: 'conflict',
	FORBIDDEN: 'permission',
	GRAPHQL_VALIDATION_FAILED: 'invalidRequest',
	NOT_FOUND: 'notFound',
	UNAUTHENTICATED: 'authentication',
};

export function classifyTwentyGraphqlResponse(response: unknown): TwentyFailure | undefined {
	const errors = asRecord(response)?.errors;
	if (!Array.isArray(errors) || errors.length === 0) return undefined;

	for (const graphqlError of errors) {
		const extensions = nestedRecord(asRecord(graphqlError), 'extensions');
		const code = typeof extensions?.code === 'string' ? extensions.code.toUpperCase() : undefined;
		if (code && GRAPHQL_CODE_KINDS[code]) return failure(GRAPHQL_CODE_KINDS[code]);
	}
	return failure('unknown');
}

export function retryDelayMs(failureDetails: TwentyFailure, retryIndex: number): number {
	return failureDetails.retryAfterMs ?? Math.min(250 * 2 ** retryIndex, MAX_RETRY_DELAY_MS);
}

export function createTwentyNodeApiError(node: INode, failureDetails: TwentyFailure): NodeApiError {
	const syntheticResponse: JsonObject = failureDetails.statusCode
		? { statusCode: failureDetails.statusCode }
		: {};
	return new NodeApiError(node, syntheticResponse, {
		message: failureDetails.message,
		description: failureDetails.description,
		httpCode: failureDetails.statusCode?.toString(),
	});
}

export function credentialFailureMessage(failureDetails: TwentyFailure): string {
	return `${failureDetails.message}. ${failureDetails.description}`;
}
