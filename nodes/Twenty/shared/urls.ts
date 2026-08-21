/* eslint-disable @n8n/community-nodes/require-node-api-error -- This pure helper has no n8n execution context. */
const PASTED_ENDPOINT_SUFFIXES = ['/rest/metadata', '/metadata', '/graphql', '/rest'];

export interface TwentyApiUrls {
	root: string;
	coreRest: string;
	coreGraphql: string;
	metadataRest: string;
	metadataGraphql: string;
}

export function normalizeTwentyRootUrl(input: string): string {
	const value = input.trim();

	if (value.includes('?') || value.includes('#')) {
		throw new Error('Twenty Base URL must not contain a query string or fragment');
	}

	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new Error('Twenty Base URL must be an absolute HTTP or HTTPS URL');
	}

	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw new Error('Twenty Base URL must use HTTP or HTTPS');
	}
	if (url.username || url.password) {
		throw new Error('Twenty Base URL must not contain user information');
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
