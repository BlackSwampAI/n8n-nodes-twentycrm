import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import type {
	NormalizedObjectDefinition,
	ObjectMetadataService,
	RecordService,
	TwentyRecord,
} from './contracts';
import { createObjectMetadataService } from './metadata';
import { twentyApiRequest } from './request';

const MAX_PAGE_SIZE = 200;
const MAX_PAGES = 1000;

export class TwentyRecordResponseError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'TwentyRecordResponseError';
	}
}

function record(value: unknown): Record<string, unknown> | undefined {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function safeSegment(value: string, subject: string): string {
	if (
		value.length === 0 ||
		value === '.' ||
		value === '..' ||
		value.includes('/') ||
		value.includes('\\')
	) {
		throw new TwentyRecordResponseError(`The Twenty ${subject} is invalid.`);
	}
	return encodeURIComponent(value);
}

function assertSupportedObject(object: NormalizedObjectDefinition): void {
	if (!object.isActive || object.isSystem || object.isRemote) {
		throw new TwentyRecordResponseError(
			'The selected Twenty object is not available for record operations. Refresh the object selection and choose an active workspace object.',
		);
	}
}

function assertWritableObject(object: NormalizedObjectDefinition): void {
	if (object.isReadOnly) {
		throw new TwentyRecordResponseError(
			'The selected Twenty object is read-only and cannot be changed. Choose a writable workspace object.',
		);
	}
}

function parseSingle(response: unknown, apiName: string): TwentyRecord {
	const value = record(record(response)?.data)?.[apiName];
	if (!record(value)) {
		throw new TwentyRecordResponseError('Twenty returned an invalid record response.');
	}
	return value as TwentyRecord;
}

function parseMutation(
	response: unknown,
	operation: 'create' | 'update',
	apiName: string,
): TwentyRecord {
	const responseName = `${operation}${apiName.charAt(0).toUpperCase()}${apiName.slice(1)}`;
	const value = record(record(response)?.data)?.[responseName];
	if (!record(value)) {
		throw new TwentyRecordResponseError('Twenty returned an invalid record response.');
	}
	return value as TwentyRecord;
}

function parsePage(
	response: unknown,
	apiName: string,
): {
	records: TwentyRecord[];
	hasNextPage: boolean;
	endCursor?: string;
} {
	const root = record(response);
	const values = record(root?.data)?.[apiName];
	const pageInfo = record(root?.pageInfo);
	if (!Array.isArray(values) || !pageInfo || typeof pageInfo.hasNextPage !== 'boolean') {
		throw new TwentyRecordResponseError('Twenty returned an invalid record list response.');
	}
	if (values.some((value) => !record(value))) {
		throw new TwentyRecordResponseError('Twenty returned an invalid record list response.');
	}
	return {
		records: values as TwentyRecord[],
		hasNextPage: pageInfo.hasNextPage,
		endCursor:
			typeof pageInfo.endCursor === 'string' && pageInfo.endCursor.length > 0
				? pageInfo.endCursor
				: undefined,
	};
}

function cleanQueryValue(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

function normalizeRecordInput(value: unknown): IDataObject | undefined {
	let parsed = value;
	if (typeof value === 'string') {
		try {
			parsed = JSON.parse(value) as unknown;
		} catch {
			return undefined;
		}
	}
	return record(parsed) ? (parsed as IDataObject) : undefined;
}

export function createRecordService(
	context: IExecuteFunctions,
	metadata: ObjectMetadataService = createObjectMetadataService(context),
): RecordService {
	async function objectFor(
		apiName: string,
		options: { requireWritable?: boolean } = {},
	): Promise<NormalizedObjectDefinition> {
		const object = await metadata.getObject(apiName);
		try {
			assertSupportedObject(object);
			if (options.requireWritable) assertWritableObject(object);
			return object;
		} catch (error) {
			if (error instanceof TwentyRecordResponseError) {
				throw new NodeOperationError(context.getNode(), error.message);
			}
			throw new NodeOperationError(
				context.getNode(),
				'Unable to validate the selected Twenty object.',
			);
		}
	}

	function safeResponse<T>(callback: () => T): T {
		try {
			return callback();
		} catch (error) {
			if (error instanceof TwentyRecordResponseError) {
				throw new NodeOperationError(context.getNode(), error.message);
			}
			throw new NodeOperationError(
				context.getNode(),
				'Unable to process the Twenty record response.',
			);
		}
	}

	function safeInput(value: unknown): IDataObject {
		const input = normalizeRecordInput(value);
		if (!input) {
			throw new NodeOperationError(
				context.getNode(),
				'Record JSON input must be a valid non-null JSON object.',
			);
		}
		return input;
	}

	return {
		async create(objectApiName, input) {
			const body = safeInput(input);
			const object = await objectFor(objectApiName, { requireWritable: true });
			const path = `/${safeResponse(() => safeSegment(object.apiNamePlural, 'object API name'))}`;
			const response = await twentyApiRequest(context, {
				method: 'POST',
				surface: 'coreRest',
				path,
				body,
			});
			return safeResponse(() => parseMutation(response, 'create', object.apiNameSingular));
		},
		async update(objectApiName, recordId, input) {
			const body = safeInput(input);
			const object = await objectFor(objectApiName, { requireWritable: true });
			const path = `/${safeResponse(() => safeSegment(object.apiNamePlural, 'object API name'))}/${safeResponse(() => safeSegment(recordId, 'record identifier'))}`;
			const response = await twentyApiRequest(context, {
				method: 'PATCH',
				surface: 'coreRest',
				path,
				body,
			});
			return safeResponse(() => parseMutation(response, 'update', object.apiNameSingular));
		},
		async delete(objectApiName, recordId) {
			const object = await objectFor(objectApiName, { requireWritable: true });
			const path = `/${safeResponse(() => safeSegment(object.apiNamePlural, 'object API name'))}/${safeResponse(() => safeSegment(recordId, 'record identifier'))}`;
			await twentyApiRequest(context, {
				method: 'DELETE',
				surface: 'coreRest',
				path,
			});
			return { success: true, recordId, objectApiName: object.apiNameSingular };
		},
		async get(objectApiName, recordId) {
			const object = await objectFor(objectApiName);
			const path = `/${safeResponse(() => safeSegment(object.apiNamePlural, 'object API name'))}/${safeResponse(() => safeSegment(recordId, 'record identifier'))}`;
			const response = await twentyApiRequest(context, {
				method: 'GET',
				surface: 'coreRest',
				path,
			});
			return safeResponse(() => parseSingle(response, object.apiNameSingular));
		},
		async getMany(objectApiName, options) {
			const object = await objectFor(objectApiName);
			const path = `/${safeResponse(() => safeSegment(object.apiNamePlural, 'object API name'))}`;
			const requestedLimit = options.returnAll ? Number.POSITIVE_INFINITY : (options.limit ?? 50);
			if (!options.returnAll && (!Number.isInteger(requestedLimit) || requestedLimit < 1)) {
				throw new NodeOperationError(context.getNode(), 'Record limit must be a positive integer.');
			}
			const results: TwentyRecord[] = [];
			const cursors = new Set<string>();
			let cursor: string | undefined;
			for (let pageNumber = 0; pageNumber < MAX_PAGES; pageNumber++) {
				const remaining = requestedLimit - results.length;
				const query: IDataObject = { limit: Math.min(MAX_PAGE_SIZE, remaining) };
				const filter = cleanQueryValue(options.filter);
				const orderBy = cleanQueryValue(options.orderBy);
				if (filter) query.filter = filter;
				if (orderBy) query.order_by = orderBy;
				if (cursor) query.starting_after = cursor;
				const response = await twentyApiRequest(context, {
					method: 'GET',
					surface: 'coreRest',
					path,
					query,
				});
				const page = safeResponse(() => parsePage(response, object.apiNamePlural));
				results.push(...page.records.slice(0, remaining));
				if (results.length >= requestedLimit || !page.hasNextPage) return results;
				if (!page.endCursor || cursors.has(page.endCursor)) {
					throw new NodeOperationError(
						context.getNode(),
						'Twenty record pagination did not provide a new cursor.',
					);
				}
				cursors.add(page.endCursor);
				cursor = page.endCursor;
			}
			throw new NodeOperationError(
				context.getNode(),
				'Twenty record pagination exceeded the safety limit.',
			);
		},
	};
}
