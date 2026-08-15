function isStrictJsonValue(value, ancestors = new WeakSet()) {
	if (value === null || typeof value === "string" || typeof value === "boolean") return true;
	if (typeof value === "number") return Number.isFinite(value);
	if (typeof value !== "object" || ancestors.has(value)) return false;

	ancestors.add(value);
	let valid = true;
	if (Array.isArray(value)) {
		const keys = Reflect.ownKeys(value);
		valid = keys.length === value.length + 1
			&& keys.at(-1) === "length"
			&& value.every((entry, index) => Object.hasOwn(value, index) && isStrictJsonValue(entry, ancestors));
	} else {
		const prototype = Object.getPrototypeOf(value);
		const keys = Object.keys(value);
		valid = (prototype === Object.prototype || prototype === null)
			&& Reflect.ownKeys(value).length === keys.length
			&& keys.every((key) => isStrictJsonValue(value[key], ancestors));
	}
	ancestors.delete(value);
	return valid;
}

function equalJsonValues(left, right) {
	if (Object.is(left, right)) return true;
	if (left === null || right === null || typeof left !== "object" || typeof right !== "object") return false;
	if (Array.isArray(left) || Array.isArray(right)) {
		if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
		return left.every((entry, index) => equalJsonValues(entry, right[index]));
	}
	const leftKeys = Object.keys(left);
	const rightKeys = Object.keys(right);
	return leftKeys.length === rightKeys.length
		&& leftKeys.every((key) => Object.hasOwn(right, key) && equalJsonValues(left[key], right[key]));
}

export function isDecadesStructure(value) {
	return isStrictJsonValue(value);
}

export function equalDecadesStructures(left, right) {
	return isDecadesStructure(left)
		&& isDecadesStructure(right)
		&& equalJsonValues(left, right);
}
