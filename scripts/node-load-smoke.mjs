import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const modulePath = resolve(import.meta.dirname, '../dist/nodes/Twenty/Twenty.node.js');
const { Twenty } = require(modulePath);
const node = new Twenty();
const credentialPath = resolve(import.meta.dirname, '../dist/credentials/TwentyApi.credentials.js');
const { TwentyApi } = require(credentialPath);
const credential = new TwentyApi();

if (node.description.displayName !== 'Twenty CRM' || node.description.name !== 'twenty') {
	throw new Error('Compiled Twenty CRM node identity did not load as expected');
}
if (credential.name !== 'twentyApi' || credential.authenticate?.type !== 'generic') {
	throw new Error('Compiled Twenty API credential did not load as expected');
}

console.log('Compiled Twenty CRM node and Twenty API credential loaded successfully');
