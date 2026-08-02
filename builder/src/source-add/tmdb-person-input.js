const supportedHosts = new Set([
	"themoviedb.org",
	"www.themoviedb.org",
]);
const personPathPattern = /^\/person\/([1-9]\d*)$/;
const decimalIdPattern = /^\d+$/;
const numericLikePattern = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

function invalid(code, message) {
	return { kind: "invalid", code, message };
}

function positiveSafeInteger(value) {
	if (!decimalIdPattern.test(value)) return null;
	const number = Number(value);
	return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function looksLikeUrl(value) {
	return (
		value.includes("://")
		|| /^www\./i.test(value)
		|| /^themoviedb\.org(?:\/|$)/i.test(value)
		|| /\bthemoviedb\.org(?:\/|$)/i.test(value)
	);
}

function originalUrlSyntax(value) {
	const match = value.match(/^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)(\/[^?#]*)?/i);
	if (!match) return null;
	return {
		authority: match[1],
		pathname: match[2] ?? "/",
	};
}

function parsePersonUrl(value) {
	let url;
	try {
		url = new URL(value);
	} catch {
		return invalid(
			"INVALID_TMDB_PERSON_URL",
			"Enter a complete supported TMDB person URL.",
		);
	}
	const originalSyntax = originalUrlSyntax(value);

	if (url.protocol !== "https:") {
		return invalid(
			"TMDB_PERSON_URL_HTTPS_REQUIRED",
			"TMDB person URLs must use HTTPS.",
		);
	}
	if (
		!supportedHosts.has(url.hostname.toLowerCase())
		|| originalSyntax?.authority.toLocaleLowerCase("en") !== url.host.toLocaleLowerCase("en")
		|| url.port !== ""
		|| url.username !== ""
		|| url.password !== ""
	) {
		return invalid(
			"UNSUPPORTED_TMDB_PERSON_HOST",
			"Use a person URL from themoviedb.org.",
		);
	}
	if (originalSyntax?.pathname !== url.pathname) {
		return invalid(
			"UNSUPPORTED_TMDB_PERSON_PATH",
			"Use a canonical TMDB person path without path normalization.",
		);
	}

	const match = url.pathname.match(personPathPattern);
	if (!match) {
		return invalid(
			"UNSUPPORTED_TMDB_PERSON_PATH",
			"Use a TMDB URL whose path is /person/ followed by a person ID.",
		);
	}
	const id = positiveSafeInteger(match[1]);
	return id === null
		? invalid(
			"INVALID_TMDB_PERSON_ID",
			"TMDB person IDs must be positive safe integers.",
		)
		: { kind: "exact", inputType: "url", id };
}

export function parseTmdbPersonInput(input) {
	if (typeof input !== "string") {
		return invalid(
			"TMDB_PERSON_INPUT_REQUIRED",
			"Enter a person name, TMDB person ID, or person URL.",
		);
	}

	const value = input.trim();
	if (value.length === 0) {
		return {
			kind: "empty",
			message: "Enter a person name, TMDB person ID, or person URL.",
		};
	}
	if (decimalIdPattern.test(value)) {
		const id = positiveSafeInteger(value);
		return id === null
			? invalid(
				"INVALID_TMDB_PERSON_ID",
				"TMDB person IDs must be positive safe integers.",
			)
			: { kind: "exact", inputType: "id", id };
	}
	if (looksLikeUrl(value)) return parsePersonUrl(value);
	if (numericLikePattern.test(value)) {
		return invalid(
			"INVALID_TMDB_PERSON_ID",
			"TMDB person IDs must be positive whole numbers.",
		);
	}
	return {
		kind: "search",
		query: value,
		eligible: value.length >= 2,
		message: value.length >= 2 ? null : "Enter at least two characters to search.",
	};
}

export function isPositiveSafePersonId(value) {
	return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
