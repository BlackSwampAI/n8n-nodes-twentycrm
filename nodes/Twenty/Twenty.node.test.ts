import type { IExecuteFunctions, ILoadOptionsFunctions } from 'n8n-workflow';
import { describe, expect, it, vi } from 'vitest';

import { Twenty } from './Twenty.node';
import type { NormalizedObjectDefinition } from './shared/contracts';
import { createObjectMetadataService } from './shared/metadata';

vi.mock('./shared/metadata', () => ({ createObjectMetadataService: vi.fn() }));
const serviceMock = vi.mocked(createObjectMetadataService);

function schemaObject(
	overrides: Partial<NormalizedObjectDefinition> = {},
): NormalizedObjectDefinition {
	return {
		id: 'fake-id',
		apiNameSingular: 'vehicle',
		apiNamePlural: 'vehicles',
		labelSingular: 'Vehicle',
		labelPlural: 'Vehicles',
		isActive: true,
		isCustom: true,
		isRemote: false,
		isSystem: false,
		isReadOnly: false,
		isSearchable: true,
		fields: [],
		...overrides,
	};
}

function executeContext(
	parameters: Record<string, unknown>[],
	items = parameters.map(() => ({ json: {} })),
) {
	return {
		getInputData: () => items,
		getNodeParameter: (name: string, index: number) =>
			name === 'resource' && parameters[index][name] === undefined
				? 'schemaObject'
				: parameters[index][name],
		getNode: () => ({ name: 'Twenty CRM', type: 'twenty', typeVersion: 1, position: [0, 0] }),
	} as unknown as IExecuteFunctions;
}

describe('Twenty CRM Schema Object node', () => {
	it('exposes only Schema Object Get/Get Many and a stable resource locator', () => {
		const node = new Twenty();
		expect(node.description.displayName).toBe('Twenty CRM');
		expect(node.description.usableAsTool).toBe(true);
		const operation = node.description.properties.find(({ name }) => name === 'operation');
		expect(operation?.options).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ value: 'get' }),
				expect.objectContaining({ value: 'getMany' }),
			]),
		);
		expect(node.description.properties.find(({ name }) => name === 'objectApiName')).toMatchObject({
			type: 'resourceLocator',
		});
	});

	it('filters and deterministically sorts active non-system selector entries', async () => {
		serviceMock.mockReturnValue({
			getObject: vi.fn(),
			getObjects: vi
				.fn()
				.mockResolvedValue([
					schemaObject({ apiNameSingular: 'zeta', labelSingular: 'Zeta', isCustom: false }),
					schemaObject({ apiNameSingular: 'alpha', labelSingular: 'Alpha' }),
					schemaObject({ apiNameSingular: 'alphaBeta', labelSingular: 'Same' }),
					schemaObject({ apiNameSingular: 'alphaAlpha', labelSingular: 'Same' }),
					schemaObject({ apiNameSingular: 'inactive', labelSingular: 'Inactive', isActive: false }),
					schemaObject({ apiNameSingular: 'system', labelSingular: 'System', isSystem: true }),
				]),
		});
		const result = await new Twenty().methods.listSearch.searchSchemaObjects.call(
			{} as ILoadOptionsFunctions,
		);
		expect(result.results).toEqual([
			{ name: 'Alpha', value: 'alpha' },
			{ name: 'Same', value: 'alphaAlpha' },
			{ name: 'Same', value: 'alphaBeta' },
			{ name: 'Zeta', value: 'zeta' },
		]);
		const byLabel = await new Twenty().methods.listSearch.searchSchemaObjects.call(
			{} as ILoadOptionsFunctions,
			'SAME',
		);
		expect(byLabel.results.map(({ value }) => value)).toEqual(['alphaAlpha', 'alphaBeta']);
		const byApiName = await new Twenty().methods.listSearch.searchSchemaObjects.call(
			{} as ILoadOptionsFunctions,
			'zEtA',
		);
		expect(byApiName.results).toEqual([{ name: 'Zeta', value: 'zeta' }]);
		const emptyFilter = await new Twenty().methods.listSearch.searchSchemaObjects.call(
			{} as ILoadOptionsFunctions,
			'',
		);
		expect(emptyFilter.results).toHaveLength(4);
	});

	it.each([
		[{ resource: 'record', operation: 'getMany' }, 'Unsupported Twenty CRM resource'],
		[{ resource: 'schemaObject', operation: 'delete' }, 'Unsupported Schema Object operation'],
	] as const)(
		'rejects stale dispatch values before metadata is requested',
		async (parameters, message) => {
			const getObject = vi.fn();
			const getObjects = vi.fn();
			serviceMock.mockReturnValue({ getObject, getObjects });
			await expect(Twenty.prototype.execute.call(executeContext([parameters]))).rejects.toThrow(
				message,
			);
			expect(getObject).not.toHaveBeenCalled();
			expect(getObjects).not.toHaveBeenCalled();
		},
	);

	it('executes Get for every input using the stable singular API name', async () => {
		const getObject = vi
			.fn()
			.mockImplementation(async (name: string) => schemaObject({ apiNameSingular: name }));
		serviceMock.mockReturnValue({ getObject, getObjects: vi.fn() });
		const result = await Twenty.prototype.execute.call(
			executeContext([
				{ operation: 'get', objectApiName: 'vehicle' },
				{ operation: 'get', objectApiName: 'widget' },
			]),
		);
		expect(getObject).toHaveBeenCalledWith('vehicle');
		expect(getObject).toHaveBeenCalledWith('widget');
		expect(result[0].map((item) => item.pairedItem)).toEqual([0, 1]);
	});

	it('filters Get Many defaults and honors include toggles', async () => {
		const objects = [
			schemaObject(),
			schemaObject({ id: 'inactive', isActive: false }),
			schemaObject({ id: 'system', isSystem: true }),
		];
		serviceMock.mockReturnValue({
			getObject: vi.fn(),
			getObjects: vi.fn().mockResolvedValue(objects),
		});
		const result = await Twenty.prototype.execute.call(
			executeContext([
				{ operation: 'getMany', includeInactive: false, includeSystem: false },
				{ operation: 'getMany', includeInactive: true, includeSystem: true },
			]),
		);
		expect(result[0]).toHaveLength(4);
		expect(result[0].map((item) => item.pairedItem)).toEqual([0, 1, 1, 1]);
	});

	it('propagates a sanitized stale-object error and stops later items', async () => {
		serviceMock.mockReturnValue({
			getObjects: vi.fn(),
			getObject: vi
				.fn()
				.mockRejectedValue(new Error('The selected Twenty schema object is no longer available.')),
		});
		await expect(
			Twenty.prototype.execute.call(executeContext([{ operation: 'get', objectApiName: 'gone' }])),
		).rejects.toThrow('no longer available');
	});
});
