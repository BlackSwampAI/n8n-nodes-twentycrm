import { describe, expect, it } from 'vitest';

import {
	classifyTwentyError,
	classifyTwentyGraphqlResponse,
	createTwentyNodeApiError,
	extractTwentyStatus,
	parseRetryAfter,
	retryDelayMs,
} from './errors';

const node = {
	name: 'Twenty CRM',
	type: 'twenty',
	typeVersion: 1,
	position: [0, 0] as [number, number],
};

describe('Twenty error normalization', () => {
	it.each([
		[{ statusCode: 401 }, 401],
		[{ status: '403' }, 403],
		[{ httpCode: 404 }, 404],
		[{ response: { status: 429 } }, 429],
		[{ cause: { response: { statusCode: 503 } } }, 503],
	])('extracts status from common request error shapes', (error, expected) => {
		expect(extractTwentyStatus(error)).toBe(expected);
	});

	it('reads Retry-After from a Headers-like getter without retaining headers', () => {
		const headers = {
			get: (name: string) => (name.toLowerCase() === 'retry-after' ? '4' : undefined),
		};
		const failure = classifyTwentyError({ response: { status: 429, headers } }, 0);

		expect(failure.retryAfterMs).toBe(4_000);
		expect(failure).not.toHaveProperty('headers');
	});

	it.each([
		[400, 'invalidRequest', false],
		[422, 'invalidRequest', false],
		[401, 'authentication', false],
		[403, 'permission', false],
		[404, 'notFound', false],
		[409, 'conflict', false],
		[429, 'rateLimit', true],
		[502, 'temporary', true],
		[503, 'temporary', true],
		[504, 'temporary', true],
		[500, 'unknown', false],
	])('classifies HTTP %i as %s', (status, kind, retryable) => {
		expect(classifyTwentyError({ response: { status } })).toMatchObject({ kind, retryable });
	});

	it.each([
		['ETIMEDOUT', true],
		['ESOCKETTIMEDOUT', true],
		['ECONNRESET', true],
		['EAI_AGAIN', true],
		['ENOTFOUND', false],
		['ECONNREFUSED', false],
		['CERT_HAS_EXPIRED', false],
		['ERR_TLS_CERT_ALTNAME_INVALID', false],
	])('classifies network code %s as connectivity', (code, retryable) => {
		expect(classifyTwentyError({ cause: { code } })).toMatchObject({
			kind: 'connectivity',
			retryable,
		});
	});

	it.each([
		['UNAUTHENTICATED', 'authentication'],
		['FORBIDDEN', 'permission'],
		['BAD_USER_INPUT', 'invalidRequest'],
		['GRAPHQL_VALIDATION_FAILED', 'invalidRequest'],
		['NOT_FOUND', 'notFound'],
		['CONFLICT', 'conflict'],
		['INTERNAL_SERVER_ERROR', 'unknown'],
	])('classifies allowlisted GraphQL code %s safely', (code, kind) => {
		expect(
			classifyTwentyGraphqlResponse({
				errors: [{ message: 'private response', path: ['privateRecord'], extensions: { code } }],
			}),
		).toMatchObject({ kind, retryable: false });
	});

	it('returns no GraphQL failure for an empty errors array', () => {
		expect(classifyTwentyGraphqlResponse({ data: { people: [] }, errors: [] })).toBeUndefined();
	});

	it.each([
		{ errors: [{ extensions: { code: 'FORBIDDEN' } }] },
		{ body: { errors: [{ extensions: { code: 'FORBIDDEN' } }] } },
		{ response: { data: { errors: [{ extensions: { code: 'FORBIDDEN' } }] } } },
		{ response: { body: { errors: [{ extensions: { code: 'FORBIDDEN' } }] } } },
	])('recognizes GraphQL extensions in common request error shapes', (error) => {
		expect(classifyTwentyError(error)).toMatchObject({ kind: 'permission', retryable: false });
	});

	it('builds a NodeApiError only from safe synthetic details', () => {
		const secret = 'secret-api-key';
		const privateValue = 'private-record-value';
		const failure = classifyTwentyError({
			response: {
				status: 401,
				headers: { authorization: `Bearer ${secret}` },
				data: { message: privateValue },
			},
		});
		const error = createTwentyNodeApiError(node, failure);
		const serialized = JSON.stringify(error);

		expect(error.message).toBe('Twenty API authentication failed');
		expect(error.description).toContain('API key');
		expect(error.httpCode).toBe('401');
		expect(serialized).not.toContain(secret);
		expect(serialized).not.toContain(privateValue);
		expect(error.context).not.toHaveProperty('data');
	});
});

describe('Retry-After and fallback delays', () => {
	const now = Date.parse('2026-08-21T12:00:00Z');

	it.each([
		['3', 3_000],
		[2, 2_000],
		['0', 0],
		['999999', 60_000],
		['Fri, 21 Aug 2026 12:00:10 GMT', 10_000],
		['Fri, 21 Aug 2026 13:10:00 GMT', 60_000],
	])('parses and caps Retry-After %s', (value, expected) => {
		expect(parseRetryAfter(value, now)).toBe(expected);
	});

	it.each(['invalid', '-1', '1.5', 1.5, 'Fri, 21 Aug 2026 11:59:59 GMT', undefined])(
		'ignores invalid or past Retry-After %s',
		(value) => {
			expect(parseRetryAfter(value, now)).toBeUndefined();
		},
	);

	it('extracts Retry-After case-insensitively and uses deterministic fallback delays', () => {
		const limited = classifyTwentyError(
			{ response: { status: 429, headers: { 'ReTrY-AfTeR': '5' } } },
			now,
		);
		expect(retryDelayMs(limited, 0)).toBe(5_000);
		expect(retryDelayMs({ ...limited, retryAfterMs: undefined }, 0)).toBe(250);
		expect(retryDelayMs({ ...limited, retryAfterMs: undefined }, 1)).toBe(500);
	});
});
