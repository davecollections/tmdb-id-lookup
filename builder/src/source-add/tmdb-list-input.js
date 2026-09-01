const TMDB_LIST_ID_MAX = 2_147_483_647;
const SUPPORTED_TMDB_HOSTS = new Set(["themoviedb.org", "www.themoviedb.org"]);
const CANONICAL_ID_PATTERN = /^[1-9]\d*$/;
const LIST_PATH_PATTERN = /^\/list\/([1-9]\d*)(?:-([a-z0-9]+(?:-[a-z0-9]+)*))?$/i;
const INPUT_GUIDANCE = "Enter a numeric TMDB List ID or public themoviedb.org/list URL.";

function invalid(code, message) {
	return Object.freeze({ kind: "invalid", code, message });
}

function canonicalListId(value) {
	if (typeof value !== "string" || !CANONICAL_ID_PATTERN.test(value)) return null;
	const id = Number(value);
	return Number.isSafeInteger(id) && id <= TMDB_LIST_ID_MAX && String(id) === value ? id : null;
}

function originalUrlSyntax(value) {
	const match = value.match(/^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)(\/[^?#]*)?/i);
	return match ? { authority: match[1], pathname: match[2] ?? "/" } : null;
}

export function parseTmdbListInput(input) {
	if (typeof input !== "string") {
		return invalid("TMDB_LIST_INPUT_REQUIRED", INPUT_GUIDANCE);
	}
	const value = input.trim();
	if (!value) return Object.freeze({ kind: "empty", message: INPUT_GUIDANCE });
	if (/^\d+$/.test(value)) {
		const id = canonicalListId(value);
		return id === null
			? invalid("INVALID_TMDB_LIST_ID", "TMDB list IDs must be canonical positive 32-bit integers.")
			: Object.freeze({ kind: "exact", inputType: "id", id });
	}

	let url;
	try { url = new URL(value); } catch {
		return invalid("INVALID_TMDB_LIST_INPUT", INPUT_GUIDANCE);
	}
	const original = originalUrlSyntax(value);
	if (url.protocol !== "https:") return invalid("TMDB_LIST_URL_HTTPS_REQUIRED", "TMDB list URLs must use HTTPS.");
	if (
		!SUPPORTED_TMDB_HOSTS.has(url.hostname.toLowerCase())
		|| original?.authority.toLocaleLowerCase("en") !== url.host.toLocaleLowerCase("en")
		|| url.port !== ""
		|| url.username !== ""
		|| url.password !== ""
	) return invalid("UNSUPPORTED_TMDB_LIST_HOST", "Use a public list URL from themoviedb.org.");
	if (original.pathname !== url.pathname) {
		return invalid("UNSUPPORTED_TMDB_LIST_PATH", "Use a canonical TMDB list path without path normalization.");
	}
	const match = url.pathname.match(LIST_PATH_PATTERN);
	const id = match ? canonicalListId(match[1]) : null;
	if (id === null) return invalid("UNSUPPORTED_TMDB_LIST_PATH", "Use a TMDB URL whose path is /list/<id> with an optional slug.");
	return Object.freeze({ kind: "exact", inputType: "url", id });
}

export function parseTmdbListBatch(input, { selectedIds = [] } = {}) {
	const selected = new Set([...selectedIds].filter((id) => Number.isSafeInteger(id)));
	const submitted = new Set();
	const entries = [];
	const errors = [];
	const duplicates = [];
	String(input ?? "").split(/\r?\n/).forEach((raw, index) => {
		const value = raw.trim();
		if (!value) return;
		const parsed = parseTmdbListInput(value);
		if (parsed.kind !== "exact") {
			errors.push(Object.freeze({ line: index + 1, value, code: parsed.code, message: parsed.message }));
			return;
		}
		if (submitted.has(parsed.id)) {
			duplicates.push(Object.freeze({ line: index + 1, value, id: parsed.id, kind: "submitted" }));
			return;
		}
		submitted.add(parsed.id);
		if (selected.has(parsed.id)) {
			duplicates.push(Object.freeze({ line: index + 1, value, id: parsed.id, kind: "selected" }));
			return;
		}
		entries.push(Object.freeze({ line: index + 1, value, id: parsed.id, inputType: parsed.inputType }));
	});
	return Object.freeze({ entries: Object.freeze(entries), errors: Object.freeze(errors), duplicates: Object.freeze(duplicates) });
}

export function isCanonicalTmdbListId(value) {
	return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= TMDB_LIST_ID_MAX;
}

export { TMDB_LIST_ID_MAX };
