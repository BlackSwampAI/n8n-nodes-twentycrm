/* eslint-disable @n8n/community-nodes/require-node-api-error -- This pure helper has no n8n execution context. */
const PASTED_ENDPOINT_SUFFIXES = ['/rest/metadata', '/metadata', '/graphql', '/rest'];

export interface TwentyApiUrls {
	root: string;
	coreRest: string;
	coreGraphql: string;
	metadataRest: string;
	metadataGraphql: string;
}

export class TwentyUrlError extends Error {
	constructor() {
		super('Invalid Twenty Base URL');
		this.name = 'TwentyUrlError';
	}
}

function invalidTwentyUrl(): never {
	throw new TwentyUrlError();
}

export function normalizeTwentyRootUrl(input: string): string {
	const value = input.trim();

	if (value.includes('?') || value.includes('#')) {
		invalidTwentyUrl();
	}

	let url: URL;
	try {
		url = new URL(value);
	} catch {
		invalidTwentyUrl();
	}

	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		invalidTwentyUrl();
	}
	if (url.username || url.password) {
		invalidTwentyUrl();
	}

	let path = url.pathname.replace(/\/+$/, '');
	const pastedSuffix = PASTED_ENDPOINT_SUFFIXES.find((suffix) => path.endsWith(suffix));
	if (pastedSuffix) {
		path = path.slice(0, -pastedSuffix.length).replace(/\/+$/, '');
	}

	return `${url.origin}${path}`;
}

export function deriveTwentyApiUrls(input: string): TwentyApiUrls {
	const root = normalizeTwentyRootUrl(input);

	return {
		root,
		coreRest: `${root}/rest`,
		coreGraphql: `${root}/graphql`,
		metadataRest: `${root}/rest/metadata`,
		metadataGraphql: `${root}/metadata`,
	};
}
