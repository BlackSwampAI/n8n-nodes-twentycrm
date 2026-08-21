const packageSegment = 'n8n-nodes-[a-z0-9][a-z0-9._-]*';
const unscopedPattern = new RegExp(`^${packageSegment}$`);
const scopedPattern = new RegExp(`^@[a-z0-9][a-z0-9._-]*/${packageSegment}$`);

export function isValidN8nPackageName(name) {
	return unscopedPattern.test(name) || scopedPattern.test(name);
}
