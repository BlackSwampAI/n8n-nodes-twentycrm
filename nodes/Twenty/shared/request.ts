/* eslint-disable @n8n/community-nodes/require-node-api-error -- Internal validation errors are caught and converted to NodeOperationError with context. */
import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	ILoadOptionsFunctions,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import type { TwentyApiSurface } from './contracts';
import { deriveTwentyApiUrls } from './urls';

type TwentyRequestContext = IExecuteFunctions | ILoadOptionsFunctions;

export interface TwentyRequestOptions {
	method: IHttpRequestMethods;
	surface: TwentyApiSurface;
	path?: string;
	query?: IDataObject;
	body?: IDataObject | IDataObject[];
}

function normalizeRequestPath(path = ''): string {
	if (path === '') return '';
	if (!path.startsWith('/') || path.startsWith('//') || path.includes('?') || path.includes('#')) {
		throw new Error('Twenty API request path must be a root-relative path');
	}

	let decodedPath: string;
	try {
		decodedPath = decodeURIComponent(path);
	} catch {
		throw new Error('Twenty API request path must use valid URL encoding');
	}
	if (
		decodedPath.includes('\\') ||
		decodedPath.split('/').some((segment) => segment === '.' || segment === '..')
	) {
		throw new Error('Twenty API request path must not escape its selected API surface');
	}

	return path;
}

export async function twentyApiRequest<T = unknown>(
	context: TwentyRequestContext,
	options: TwentyRequestOptions,
): Promise<T> {
	try {
		const credentials = await context.getCredentials('twentyApi');
		if (typeof credentials.baseUrl !== 'string') {
			throw new Error('Twenty Base URL is missing');
		}

		const urls = deriveTwentyApiUrls(credentials.baseUrl);
		const path = normalizeRequestPath(options.path);
		return (await context.helpers.httpRequestWithAuthentication.call(context, 'twentyApi', {
			method: options.method,
			url: `${urls[options.surface]}${path}`,
			qs: options.query,
			body: options.body,
			json: true,
		})) as T;
	} catch {
		throw new NodeOperationError(context.getNode(), 'Twenty API request failed');
	}
}
