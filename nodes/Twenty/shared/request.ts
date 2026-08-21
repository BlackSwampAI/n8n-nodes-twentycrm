/* eslint-disable @n8n/community-nodes/require-node-api-error -- Pure path and credential-shape validation failures are caught and converted to sanitized NodeApiError instances with node context. */
import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	ILoadOptionsFunctions,
} from 'n8n-workflow';
import { sleep } from 'n8n-workflow';

import type { TwentyApiSurface } from './contracts';
import {
	classifyTwentyError,
	classifyTwentyGraphqlResponse,
	createTwentyNodeApiError,
	retryDelayMs,
} from './errors';
import { deriveTwentyApiUrls } from './urls';

type TwentyRequestContext = IExecuteFunctions | ILoadOptionsFunctions;

export interface TwentyRequestOptions {
	method: IHttpRequestMethods;
	surface: TwentyApiSurface;
	path?: string;
	query?: IDataObject;
	body?: IDataObject | IDataObject[];
	retry?: 'auto' | 'safe' | 'never';
}

const MAX_ATTEMPTS = 3;

function canRetry(method: IHttpRequestMethods, mode: TwentyRequestOptions['retry']): boolean {
	if (mode === 'never') return false;
	if (mode === 'safe') return true;
	return method === 'GET' || method === 'HEAD';
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
	let requestUrl: string;
	try {
		const credentials = await context.getCredentials('twentyApi');
		if (typeof credentials.baseUrl !== 'string') {
			throw new Error('Twenty Base URL is missing');
		}

		const urls = deriveTwentyApiUrls(credentials.baseUrl);
		const path = normalizeRequestPath(options.path);
		requestUrl = `${urls[options.surface]}${path}`;
	} catch (error) {
		throw createTwentyNodeApiError(context.getNode(), classifyTwentyError(error));
	}

	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
		let response: T;
		try {
			response = (await context.helpers.httpRequestWithAuthentication.call(context, 'twentyApi', {
				method: options.method,
				url: requestUrl,
				qs: options.query,
				body: options.body,
				json: true,
			})) as T;
		} catch (error) {
			const failure = classifyTwentyError(error);
			if (
				attempt < MAX_ATTEMPTS - 1 &&
				canRetry(options.method, options.retry) &&
				failure.retryable
			) {
				await sleep(retryDelayMs(failure, attempt));
				continue;
			}
			throw createTwentyNodeApiError(context.getNode(), failure);
		}

		const graphqlFailure = options.surface.toLowerCase().includes('graphql')
			? classifyTwentyGraphqlResponse(response)
			: undefined;
		if (graphqlFailure) {
			throw createTwentyNodeApiError(context.getNode(), graphqlFailure);
		}
		return response;
	}

	throw createTwentyNodeApiError(context.getNode(), classifyTwentyError(undefined));
}
