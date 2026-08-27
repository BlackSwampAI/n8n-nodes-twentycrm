import type {
	ICredentialDataDecryptedObject,
	ICredentialsDecrypted,
	ICredentialTestFunctions,
	INodeCredentialTestResult,
} from 'n8n-workflow';

const WEBHOOK_CREDENTIAL_TEST_FAILURE_MESSAGE =
	'Webhook secret is required. Enter the same shared secret in Twenty and n8n.';

export async function twentyWebhookCredentialTest(
	this: ICredentialTestFunctions,
	credential: ICredentialsDecrypted<ICredentialDataDecryptedObject>,
): Promise<INodeCredentialTestResult> {
	const secret = credential.data?.webhookSecret;
	if (typeof secret !== 'string' || secret.trim().length === 0) {
		return { status: 'Error', message: WEBHOOK_CREDENTIAL_TEST_FAILURE_MESSAGE };
	}
	return {
		status: 'OK',
		message:
			'Webhook secret is configured. Verify signed delivery by sending a Twenty event to this trigger.',
	};
}
