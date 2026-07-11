const V1_PUBLIC_ROOT_FILES = Object.freeze(["index.html", "robots.txt", "sitemap.xml"]);
const V1_PUBLIC_DIRECTORIES = Object.freeze(["css", "data", "js"]);
const BUILDER_PUBLIC_DIRECTORY = "builder";

function isAbsolutePortablePath(value) {
	return value.startsWith("/") || /^[A-Za-z]:/.test(value);
}

export function normalizePagesPublicPath(value) {
	if (typeof value !== "string" || value.length === 0) {
		throw new TypeError("Pages public paths must be non-empty strings.");
	}

	if (value.includes("\0")) {
		throw new Error("Pages public paths must not contain null bytes.");
	}

	const portablePath = value.replaceAll("\\", "/");

	if (isAbsolutePortablePath(portablePath)) {
		throw new Error(`Pages public paths must be relative: ${value}`);
	}

	const segments = portablePath.split("/");

	if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
		throw new Error(`Pages public paths must not contain empty, current, or parent segments: ${value}`);
	}

	return segments.join("/");
}

function matchesDirectory(normalizedPath, directory) {
	return normalizedPath.startsWith(`${directory}/`);
}

function normalizeForMatch(value) {
	try {
		return normalizePagesPublicPath(value);
	} catch {
		return null;
	}
}

export function isV1PublicFilePath(value) {
	const normalizedPath = normalizeForMatch(value);

	return (
		normalizedPath !== null &&
		(V1_PUBLIC_ROOT_FILES.includes(normalizedPath) ||
			V1_PUBLIC_DIRECTORIES.some((directory) => matchesDirectory(normalizedPath, directory)))
	);
}

export function isCompiledBuilderFilePath(value) {
	const normalizedPath = normalizeForMatch(value);

	return normalizedPath !== null && matchesDirectory(normalizedPath, BUILDER_PUBLIC_DIRECTORY);
}

export function isPagesPublicFilePath(value) {
	return isV1PublicFilePath(value) || isCompiledBuilderFilePath(value);
}

export const pagesPublicPathContract = Object.freeze({
	v1RootFiles: V1_PUBLIC_ROOT_FILES,
	v1Directories: V1_PUBLIC_DIRECTORIES,
	builderDirectory: BUILDER_PUBLIC_DIRECTORY,
});
