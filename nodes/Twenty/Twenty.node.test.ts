import type { IExecuteFunctions } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';

import { FOUNDATION_MESSAGE, Twenty } from './Twenty.node';

describe('Twenty CRM foundation node', () => {
	it('exposes the approved identity without credentials or operations', () => {
		const node = new Twenty();

		expect(node.description.displayName).toBe('Twenty CRM');
		expect(node.description.name).toBe('twenty');
		expect(node.description.credentials).toBeUndefined();
		expect(node.description.requestDefaults).toBeUndefined();
		expect(node.description.properties).toHaveLength(1);
	});

	it('fails clearly when executed during the foundation milestone', async () => {
		const context = {
			getNode: () => ({ name: 'Twenty CRM', type: 'twenty', typeVersion: 1, position: [0, 0] }),
		};

		await expect(
			Twenty.prototype.execute.call(context as unknown as IExecuteFunctions),
		).rejects.toThrow(FOUNDATION_MESSAGE);
	});
});
