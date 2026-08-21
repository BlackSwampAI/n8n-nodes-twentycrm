import type { IDataObject, IExecuteFunctions, ILoadOptionsFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import type {
	NormalizedFieldDefinition,
	NormalizedObjectDefinition,
	NormalizedRelationDefinition,
	NormalizedRelationEndpoint,
	ObjectMetadataService,
} from './contracts';
import { twentyApiRequest } from './request';

type MetadataContext = IExecuteFunctions | ILoadOptionsFunctions;
type UnknownRecord = Record<string, unknown>;

const MAX_PAGES = 100;

export const OBJECT_METADATA_QUERY = `query TwentyObjectMetadata($after: ConnectionCursor) {
  objects(paging: { first: 1000, after: $after }) {
    edges {
      node {
        id universalIdentifier nameSingular namePlural labelSingular labelPlural
        description icon isCustom isRemote isActive isSystem isUIReadOnly isSearchable
        fieldsList {
          id universalIdentifier type name label description icon isCustom isActive isSystem
          isUIReadOnly isNullable isUnique defaultValue options settings
          relation {
            type
            sourceObjectMetadata { id nameSingular namePlural }
            targetObjectMetadata { id nameSingular namePlural }
            sourceFieldMetadata { id name }
            targetFieldMetadata { id name }
          }
          morphRelations {
            type
            sourceObjectMetadata { id nameSingular namePlural }
            targetObjectMetadata { id nameSingular namePlural }
            sourceFieldMetadata { id name }
            targetFieldMetadata { id name }
          }
        }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

export class TwentyMetadataError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'TwentyMetadataError';
	}
}

function record(value: unknown): UnknownRecord | undefined {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
		? (value as UnknownRecord)
		: undefined;
}

function requiredString(value: unknown, subject: string): string {
	if (typeof value !== 'string' || value.length === 0) {
		throw new TwentyMetadataError(`Twenty metadata returned an invalid ${subject}.`);
	}
	return value;
}

function optionalString(value: unknown): string | undefined {
	return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function boolean(value: unknown, subject: string): boolean {
	if (typeof value !== 'boolean') {
		throw new TwentyMetadataError(`Twenty metadata returned an invalid ${subject}.`);
	}
	return value;
}

function relationEndpoint(
	value: unknown,
	fieldValue: unknown,
	subject: string,
): NormalizedRelationEndpoint {
	const object = record(value);
	const field = record(fieldValue);
	if (!object || !field)
		throw new TwentyMetadataError(`Twenty metadata returned an invalid ${subject}.`);
	return {
		objectId: requiredString(object.id, `${subject} object identifier`),
		objectApiNameSingular: requiredString(object.nameSingular, `${subject} singular API name`),
		objectApiNamePlural: requiredString(object.namePlural, `${subject} plural API name`),
		fieldId: requiredString(field.id, `${subject} field identifier`),
		fieldApiName: requiredString(field.name, `${subject} field API name`),
	};
}

function normalizeRelation(value: unknown): NormalizedRelationDefinition {
	const relation = record(value);
	if (!relation) throw new TwentyMetadataError('Twenty metadata returned an invalid relation.');
	return {
		type: requiredString(relation.type, 'relation type'),
		source: relationEndpoint(
			relation.sourceObjectMetadata,
			relation.sourceFieldMetadata,
			'relation source',
		),
		target: relationEndpoint(
			relation.targetObjectMetadata,
			relation.targetFieldMetadata,
			'relation target',
		),
	};
}

export function normalizeTwentyField(value: unknown): NormalizedFieldDefinition {
	const field = record(value);
	if (!field) throw new TwentyMetadataError('Twenty metadata returned an invalid field.');
	const isNullable = boolean(field.isNullable, 'field nullable flag');
	const morphRelations = field.morphRelations;
	if (morphRelations !== undefined && morphRelations !== null && !Array.isArray(morphRelations)) {
		throw new TwentyMetadataError('Twenty metadata returned invalid morph relations.');
	}
	return {
		id: requiredString(field.id, 'field identifier'),
		universalIdentifier: optionalString(field.universalIdentifier),
		apiName: requiredString(field.name, 'field API name'),
		label: requiredString(field.label, 'field label'),
		type: requiredString(field.type, 'field type'),
		description: optionalString(field.description),
		icon: optionalString(field.icon),
		isActive: boolean(field.isActive, 'field active flag'),
		isCustom: boolean(field.isCustom, 'field custom flag'),
		isNullable,
		isUnique: boolean(field.isUnique, 'field unique flag'),
		isRequired: !isNullable,
		isReadOnly: boolean(field.isUIReadOnly, 'field read-only flag'),
		isSystem: boolean(field.isSystem, 'field system flag'),
		...(Object.prototype.hasOwnProperty.call(field, 'defaultValue')
			? { defaultValue: field.defaultValue }
			: {}),
		...(Object.prototype.hasOwnProperty.call(field, 'options') ? { options: field.options } : {}),
		...(Object.prototype.hasOwnProperty.call(field, 'settings')
			? { settings: field.settings }
			: {}),
		...(field.relation === undefined || field.relation === null
			? {}
			: { relation: normalizeRelation(field.relation) }),
		...(Array.isArray(morphRelations)
			? { morphRelations: morphRelations.map(normalizeRelation) }
			: {}),
	};
}

export function normalizeTwentyObject(value: unknown): NormalizedObjectDefinition {
	const object = record(value);
	if (!object) throw new TwentyMetadataError('Twenty metadata returned an invalid object.');
	if (!Array.isArray(object.fieldsList)) {
		throw new TwentyMetadataError('Twenty metadata returned an invalid field list.');
	}
	return {
		id: requiredString(object.id, 'object identifier'),
		universalIdentifier: optionalString(object.universalIdentifier),
		apiNameSingular: requiredString(object.nameSingular, 'object singular API name'),
		apiNamePlural: requiredString(object.namePlural, 'object plural API name'),
		labelSingular: requiredString(object.labelSingular, 'object singular label'),
		labelPlural: requiredString(object.labelPlural, 'object plural label'),
		description: optionalString(object.description),
		icon: optionalString(object.icon),
		isActive: boolean(object.isActive, 'object active flag'),
		isCustom: boolean(object.isCustom, 'object custom flag'),
		isRemote: boolean(object.isRemote, 'object remote flag'),
		isSystem: boolean(object.isSystem, 'object system flag'),
		isReadOnly: boolean(object.isUIReadOnly, 'object read-only flag'),
		isSearchable: boolean(object.isSearchable, 'object searchable flag'),
		fields: object.fieldsList.map(normalizeTwentyField),
	};
}

function parsePage(response: unknown): {
	objects: NormalizedObjectDefinition[];
	hasNextPage: boolean;
	endCursor?: string;
} {
	const data = record(record(response)?.data);
	const connection = record(data?.objects);
	if (!connection || !Array.isArray(connection.edges)) {
		throw new TwentyMetadataError('Twenty metadata returned an invalid object connection.');
	}
	const pageInfo = record(connection.pageInfo);
	if (!pageInfo || typeof pageInfo.hasNextPage !== 'boolean') {
		throw new TwentyMetadataError('Twenty metadata returned invalid paging information.');
	}
	const objects = connection.edges.map((edge) => {
		const node = record(edge)?.node;
		if (node === undefined)
			throw new TwentyMetadataError('Twenty metadata returned an invalid object node.');
		return normalizeTwentyObject(node);
	});
	return {
		objects,
		hasNextPage: pageInfo.hasNextPage,
		endCursor: optionalString(pageInfo.endCursor),
	};
}

export async function discoverTwentyObjects(
	context: MetadataContext,
): Promise<NormalizedObjectDefinition[]> {
	const objects: NormalizedObjectDefinition[] = [];
	const cursors = new Set<string>();
	let after: string | undefined;

	for (let pageNumber = 0; pageNumber < MAX_PAGES; pageNumber++) {
		const response = await twentyApiRequest(context, {
			method: 'POST',
			surface: 'metadataGraphql',
			retry: 'safe',
			body: { query: OBJECT_METADATA_QUERY, variables: { after: after ?? null } as IDataObject },
		});
		const page = parsePage(response);
		objects.push(...page.objects);
		if (!page.hasNextPage) {
			return objects.sort((left, right) =>
				left.apiNameSingular.localeCompare(right.apiNameSingular, 'en'),
			);
		}
		if (!page.endCursor || cursors.has(page.endCursor)) {
			throw new TwentyMetadataError('Twenty metadata pagination did not provide a new cursor.');
		}
		cursors.add(page.endCursor);
		after = page.endCursor;
	}

	throw new TwentyMetadataError('Twenty metadata pagination exceeded the safety limit.');
}

export function createObjectMetadataService(context: MetadataContext): ObjectMetadataService {
	async function safelyDiscover(): Promise<NormalizedObjectDefinition[]> {
		try {
			return await discoverTwentyObjects(context);
		} catch (error) {
			if (error instanceof TwentyMetadataError) {
				throw new NodeOperationError(context.getNode(), error.message);
			}
			// Transport failures are already sanitized n8n NodeApiError instances.
			// eslint-disable-next-line @n8n/community-nodes/require-node-api-error
			throw error;
		}
	}
	return {
		async getObjects() {
			return await safelyDiscover();
		},
		async getObject(apiName) {
			const object = (await safelyDiscover()).find(
				(candidate) => candidate.apiNameSingular === apiName,
			);
			if (!object) {
				throw new NodeOperationError(
					context.getNode(),
					'The selected Twenty schema object is no longer available. Refresh the object selection and try again.',
				);
			}
			return object;
		},
	};
}
