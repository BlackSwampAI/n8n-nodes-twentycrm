import { describe, expect, it } from 'vitest';

import { deriveTwentyApiUrls, normalizeTwentyRootUrl } from './urls';

describe('normalizeTwentyRootUrl', () => {
	it.each([
		['Twenty Cloud', 'https://api.twenty.com', 'https://api.twenty.com'],
		['self-hosted HTTP', 'http://localhost:3000', 'http://localhost:3000'],
		[
			'whitespace and trailing slashes',
			'  https://twenty.example.com///  ',
			'https://twenty.example.com',
		],
		[
			'REST metadata suffix',
			'https://twenty.example.com/rest/metadata',
			'https://twenty.example.com',
		],
		['metadata suffix', 'https://twenty.example.com/metadata/', 'https://twenty.example.com'],
		['GraphQL suffix', 'https://twenty.example.com/graphql', 'https://twenty.example.com'],
		['REST suffix', 'https://twenty.example.com/rest/', 'https://twenty.example.com'],
		[
			'reverse-proxy prefix',
			'https://twenty.example.com/apps/crm/rest/metadata/',
			'https://twenty.example.com/apps/crm',
		],
	])('normalizes %s', (_case, input, expected) => {
		expect(normalizeTwentyRootUrl(input)).toBe(expected);
	});

	it.each([
		'',
		'/rest',
		'twenty.example.com',
		'ftp://twenty.example.com',
		'https://user:secret@twenty.example.com',
		'https://twenty.example.com?',
		'https://twenty.example.com?workspace=one',
		'https://twenty.example.com#',
		'https://twenty.example.com#settings',
	])('rejects invalid root %s', (input) => {
		expect(() => normalizeTwentyRootUrl(input)).toThrow();
	});

	it.each([
		'https://twenty.example.com/my-rest',
		'https://twenty.example.com/metadata-v2',
		'https://twenty.example.com/graphql-api',
		'https://twenty.example.com/restful',
	])('preserves false suffix match %s', (input) => {
		expect(normalizeTwentyRootUrl(input)).toBe(input);
	});
});

describe('deriveTwentyApiUrls', () => {
	it('derives every API surface from one normalized root', () => {
		expect(deriveTwentyApiUrls(' https://twenty.example.com/crm/rest/ ')).toEqual({
			root: 'https://twenty.example.com/crm',
			coreRest: 'https://twenty.example.com/crm/rest',
			coreGraphql: 'https://twenty.example.com/crm/graphql',
			metadataRest: 'https://twenty.example.com/crm/rest/metadata',
			metadataGraphql: 'https://twenty.example.com/crm/metadata',
		});
	});
});
