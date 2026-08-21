import type { IDataObject } from 'n8n-workflow';

export type TwentyApiSurface = 'coreRest' | 'coreGraphql' | 'metadataRest' | 'metadataGraphql';

export interface NormalizedObjectDefinition {
	id: string;
	universalIdentifier?: string;
	apiNameSingular: string;
	apiNamePlural: string;
	labelSingular: string;
	labelPlural: string;
	description?: string;
	icon?: string;
	isActive: boolean;
	isCustom: boolean;
	isRemote: boolean;
	isSystem: boolean;
	isReadOnly: boolean;
	isSearchable: boolean;
	fields: NormalizedFieldDefinition[];
}

export interface NormalizedFieldDefinition {
	id: string;
	universalIdentifier?: string;
	apiName: string;
	label: string;
	type: string;
	description?: string;
	icon?: string;
	isActive: boolean;
	isCustom: boolean;
	isNullable: boolean;
	isUnique: boolean;
	isRequired: boolean;
	isReadOnly: boolean;
	isSystem: boolean;
	defaultValue?: unknown;
	options?: unknown;
	settings?: unknown;
	relation?: NormalizedRelationDefinition;
	morphRelations?: NormalizedRelationDefinition[];
}

export interface NormalizedRelationEndpoint {
	objectId: string;
	objectApiNameSingular: string;
	objectApiNamePlural: string;
	fieldId: string;
	fieldApiName: string;
}

export interface NormalizedRelationDefinition {
	type: string;
	source: NormalizedRelationEndpoint;
	target: NormalizedRelationEndpoint;
}

export type TwentyRecord = Readonly<IDataObject>;

export interface ObjectMetadataService {
	getObject(apiName: string): Promise<NormalizedObjectDefinition>;
	getObjects(): Promise<NormalizedObjectDefinition[]>;
}

export interface FieldMetadataService {
	getFields(objectApiName: string): Promise<NormalizedFieldDefinition[]>;
}

export interface RecordService {
	create(objectApiName: string, input: TwentyRecord): Promise<TwentyRecord>;
	get(objectApiName: string, recordId: string): Promise<TwentyRecord>;
	getMany(objectApiName: string): Promise<TwentyRecord[]>;
	update(objectApiName: string, recordId: string, input: TwentyRecord): Promise<TwentyRecord>;
	delete(objectApiName: string, recordId: string): Promise<void>;
}
