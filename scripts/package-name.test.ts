import { describe, expect, it } from 'vitest';

import { isValidN8nPackageName } from './package-name.mjs';

describe('n8n package name validation', () => {
	it.each([
		'n8n-nodes-twentycrm',
		'@blackswampai/n8n-nodes-twentycrm',
		'@black-swamp.ai/n8n-nodes-twenty_crm',
	])('accepts %s', (name) => {
		expect(isValidN8nPackageName(name)).toBe(true);
	});

	it.each([
		'@BlackSwampAI/n8n-nodes-twentycrm',
		'@blackswampai/twentycrm',
		'@blackswampai/n8n-nodes-',
		'blackswampai/n8n-nodes-twentycrm',
		'n8n-nodes-TwentyCRM',
	])('rejects %s', (name) => {
		expect(isValidN8nPackageName(name)).toBe(false);
	});
});
