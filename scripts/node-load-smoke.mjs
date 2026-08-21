import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const modulePath = resolve(import.meta.dirname, '../dist/Twenty.node.js');
const { Twenty } = require(modulePath);
const node = new Twenty();

if (node.description.displayName !== 'Twenty CRM' || node.description.name !== 'twenty') {
	throw new Error('Compiled Twenty CRM node identity did not load as expected');
}

console.log('Compiled Twenty CRM node loaded successfully');
