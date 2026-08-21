export type TwentyApiSurface = 'coreRest' | 'coreGraphql' | 'metadataRest' | 'metadataGraphql';

export interface NormalizedObjectDefinition {
	apiNameSingular: string;
	apiNamePlural: string;
	labelSingular: string;
	labelPlural: string;
	isActive: boolean;
	isCustom: boolean;
	fields: NormalizedFieldDefinition[];
}

export interface NormalizedFieldDefinition {
	apiName: string;
	label: string;
	type: string;
	isRequired: boolean;
	isReadOnly: boolean;
	isSystem: boolean;
	defaultValue?: unknown;
}

export type TwentyRecord = Readonly<Record<string, unknown>>;

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
