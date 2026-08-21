/* eslint-disable @n8n/community-nodes/no-deprecated-workflow-functions -- The current credential-test context exposes only helpers.request. */
import type {
	ICredentialDataDecryptedObject,
	ICredentialsDecrypted,
	ICredentialTestFunctions,
	INodeCredentialTestResult,
} from 'n8n-workflow';

import {
	classifyTwentyError,
	classifyTwentyGraphqlResponse,
	credentialFailureMessage,
} from './errors';
import { deriveTwentyApiUrls } from './urls';

const CREDENTIAL_TEST_QUERY = 'query CredentialTest { __typename }';
const CREDENTIAL_TEST_FAILURE_MESSAGE = 'Unable to connect with these Twenty API settings.';

interface CredentialTestResponse {
	data?: {
		__typename?: unknown;
	};
	errors?: unknown;
}

function isSuccessfulCredentialResponse(response: unknown): boolean {
	if (!response || typeof response !== 'object') return false;

	const { data, errors } = response as CredentialTestResponse;
	const hasErrors = Array.isArray(errors) ? errors.length > 0 : errors !== undefined;
	return (
		!hasErrors &&
		data !== undefined &&
		typeof data.__typename === 'string' &&
		data.__typename.length > 0
	);
}

export async function twentyApiCredentialTest(
	this: ICredentialTestFunctions,
	credential: ICredentialsDecrypted<ICredentialDataDecryptedObject>,
): Promise<INodeCredentialTestResult> {
	try {
		const baseUrl = credential.data?.baseUrl;
		const apiKey = credential.data?.apiKey;
		if (typeof baseUrl !== 'string' || typeof apiKey !== 'string' || apiKey.length === 0) {
			throw new Error('Invalid credential shape');
		}

		const { coreGraphql } = deriveTwentyApiUrls(baseUrl);
		const response = await this.helpers.request({
			method: 'POST',
			uri: coreGraphql,
			headers: {
				Authorization: `Bearer ${apiKey}`,
			},
			body: {
				query: CREDENTIAL_TEST_QUERY,
			},
			json: true,
		});

		const graphqlFailure = classifyTwentyGraphqlResponse(response);
		if (graphqlFailure) {
			return { status: 'Error', message: credentialFailureMessage(graphqlFailure) };
		}
		if (!isSuccessfulCredentialResponse(response)) {
			return { status: 'Error', message: CREDENTIAL_TEST_FAILURE_MESSAGE };
		}

		return { status: 'OK', message: 'Connection successful' };
	} catch (error) {
		const failure = classifyTwentyError(error);
		return {
			status: 'Error',
			message:
				failure.kind === 'unknown'
					? CREDENTIAL_TEST_FAILURE_MESSAGE
					: credentialFailureMessage(failure),
		};
	}
}
