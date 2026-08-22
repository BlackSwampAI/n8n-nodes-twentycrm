import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const packageRoot = process.argv[2] ? resolve(process.argv[2]) : resolve(import.meta.dirname, '..');
const modulePath = resolve(packageRoot, 'dist/nodes/Twenty/Twenty.node.js');
const { Twenty } = require(modulePath);
const node = new Twenty();
const triggerPath = resolve(packageRoot, 'dist/nodes/Twenty/TwentyTrigger.node.js');
const { TwentyTrigger } = require(triggerPath);
const trigger = new TwentyTrigger();
const credentialPath = resolve(packageRoot, 'dist/credentials/TwentyApi.credentials.js');
const { TwentyApi } = require(credentialPath);
const credential = new TwentyApi();
const webhookCredentialPath = resolve(
	packageRoot,
	'dist/credentials/TwentyWebhookApi.credentials.js',
);
const { TwentyWebhookApi } = require(webhookCredentialPath);
const webhookCredential = new TwentyWebhookApi();
const requestPath = resolve(packageRoot, 'dist/nodes/Twenty/shared/request.js');
const { twentyApiRequest } = require(requestPath);
const errorPath = resolve(packageRoot, 'dist/nodes/Twenty/shared/errors.js');
const { classifyTwentyError, createTwentyNodeApiError } = require(errorPath);
const metadataPath = resolve(packageRoot, 'dist/nodes/Twenty/shared/metadata.js');
const { createObjectMetadataService, normalizeTwentyObject, OBJECT_METADATA_QUERY } = require(
	metadataPath,
);
const recordsPath = resolve(packageRoot, 'dist/nodes/Twenty/shared/records.js');
const { createRecordService } = require(recordsPath);

if (node.description.displayName !== 'Twenty CRM' || node.description.name !== 'twenty') {
	throw new Error('Compiled Twenty CRM node identity did not load as expected');
}
if (credential.name !== 'twentyApi' || credential.authenticate?.type !== 'generic') {
	throw new Error('Compiled Twenty API credential did not load as expected');
}
if (
	trigger.description.displayName !== 'Twenty CRM Trigger' ||
	trigger.description.name !== 'twentyTrigger' ||
	typeof trigger.webhook !== 'function' ||
	webhookCredential.name !== 'twentyWebhookApi'
) {
	throw new Error('Compiled Twenty CRM Trigger or webhook credential did not load as expected');
}
for (const description of [node.description, trigger.description]) {
	for (const icon of [description.icon?.light, description.icon?.dark]) {
		if (typeof icon !== 'string' || !icon.startsWith('file:')) {
			throw new Error('Compiled node icon reference did not load as expected');
		}
		if (!existsSync(resolve(packageRoot, 'dist/nodes/Twenty', icon.slice('file:'.length)))) {
			throw new Error('Compiled node icon asset is missing from the package');
		}
	}
}
if (
	node.description.credentials?.[0]?.testedBy !== 'twentyApiCredentialTest' ||
	typeof node.methods?.credentialTest?.twentyApiCredentialTest !== 'function' ||
	trigger.description.credentials?.[0]?.testedBy !== 'twentyApiCredentialTest' ||
	trigger.description.credentials?.[1]?.testedBy !== 'twentyWebhookCredentialTest' ||
	typeof trigger.methods?.credentialTest?.twentyApiCredentialTest !== 'function' ||
	typeof trigger.methods?.credentialTest?.twentyWebhookCredentialTest !== 'function' ||
	typeof twentyApiRequest !== 'function' ||
	typeof classifyTwentyError !== 'function' ||
	typeof createTwentyNodeApiError !== 'function' ||
	typeof createObjectMetadataService !== 'function' ||
	typeof normalizeTwentyObject !== 'function' ||
	typeof createRecordService !== 'function' ||
	!OBJECT_METADATA_QUERY.includes('objects(paging: { first: 1000')
) {
	throw new Error('Compiled authenticated transport foundation did not load as expected');
}

console.log(
	'Compiled Twenty CRM action, trigger, credentials, and resilient authenticated transport loaded successfully',
);
