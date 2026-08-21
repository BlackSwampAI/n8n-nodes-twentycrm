import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const modulePath = resolve(import.meta.dirname, '../dist/nodes/Twenty/Twenty.node.js');
const { Twenty } = require(modulePath);
const node = new Twenty();
const credentialPath = resolve(import.meta.dirname, '../dist/credentials/TwentyApi.credentials.js');
const { TwentyApi } = require(credentialPath);
const credential = new TwentyApi();
const requestPath = resolve(import.meta.dirname, '../dist/nodes/Twenty/shared/request.js');
const { twentyApiRequest } = require(requestPath);
const errorPath = resolve(import.meta.dirname, '../dist/nodes/Twenty/shared/errors.js');
const { classifyTwentyError, createTwentyNodeApiError } = require(errorPath);

if (node.description.displayName !== 'Twenty CRM' || node.description.name !== 'twenty') {
	throw new Error('Compiled Twenty CRM node identity did not load as expected');
}
if (credential.name !== 'twentyApi' || credential.authenticate?.type !== 'generic') {
	throw new Error('Compiled Twenty API credential did not load as expected');
}
if (
	node.description.credentials?.[0]?.testedBy !== 'twentyApiCredentialTest' ||
	typeof node.methods?.credentialTest?.twentyApiCredentialTest !== 'function' ||
	typeof twentyApiRequest !== 'function' ||
	typeof classifyTwentyError !== 'function' ||
	typeof createTwentyNodeApiError !== 'function'
) {
	throw new Error('Compiled authenticated transport foundation did not load as expected');
}

console.log(
	'Compiled Twenty CRM node, credential test, and resilient authenticated transport loaded successfully',
);
