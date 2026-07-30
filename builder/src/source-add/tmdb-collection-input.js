const supportedHosts = new Set([
	"themoviedb.org",
	"www.themoviedb.org",
]);
const collectionPathPattern = /^\/collection\/([1-9]\d*)(?:-([a-z0-9]+(?:-[a-z0-9]+)*))?$/i;
const decimalIdPattern = /^\d+$/;
const numericLikePattern = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

function invalid(code, message) {
	return {
		kind: "invalid",
		code,
		message,
	};
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
	const match = value.match(
		/^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)(\/[^?#]*)?/i,
	);
	if (!match) return null;
	return {
		authority: match[1],
		pathname: match[2] ?? "/",
	};
}

function parseCollectionUrl(value) {
	let url;
	try {
		url = new URL(value);
	} catch {
		return invalid(
			"INVALID_TMDB_COLLECTION_URL",
			"Enter a complete supported TMDB collection URL.",
		);
	}
	const originalSyntax = originalUrlSyntax(value);

	if (url.protocol !== "https:") {
		return invalid(
			"TMDB_COLLECTION_URL_HTTPS_REQUIRED",
			"TMDB collection URLs must use HTTPS.",
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
			"UNSUPPORTED_TMDB_COLLECTION_HOST",
			"Use a collection URL from themoviedb.org.",
		);
	}

	if (originalSyntax.pathname !== url.pathname) {
		return invalid(
			"UNSUPPORTED_TMDB_COLLECTION_PATH",
			"Use a canonical TMDB collection path without dot segments or path normalization.",
		);
	}

	const match = url.pathname.match(collectionPathPattern);
	if (!match) {
		return invalid(
			"UNSUPPORTED_TMDB_COLLECTION_PATH",
			"Use a TMDB URL whose path starts with /collection/ followed by a collection ID.",
		);
	}

	const id = positiveSafeInteger(match[1]);
	if (id === null) {
		return invalid(
			"INVALID_TMDB_COLLECTION_ID",
			"TMDB collection IDs must be positive safe integers.",
		);
	}

	return {
		kind: "exact",
		inputType: "url",
		id,
	};
}

/**
 * Classifies user input without making a provider request.
 */
export function parseTmdbCollectionInput(input) {
	if (typeof input !== "string") {
		return invalid(
			"TMDB_COLLECTION_INPUT_REQUIRED",
			"Enter a movie franchise title, TMDB collection ID, or collection URL.",
		);
	}

	const value = input.trim();
	if (value.length === 0) {
		return {
			kind: "empty",
			message: "Enter a movie franchise title, TMDB collection ID, or collection URL.",
		};
	}

	if (decimalIdPattern.test(value)) {
		const id = positiveSafeInteger(value);
		return id === null
			? invalid(
				"INVALID_TMDB_COLLECTION_ID",
				"TMDB collection IDs must be positive safe integers.",
			)
			: {
				kind: "exact",
				inputType: "id",
				id,
			};
	}

	if (looksLikeUrl(value)) {
		return parseCollectionUrl(value);
	}

	if (numericLikePattern.test(value)) {
		return invalid(
			"INVALID_TMDB_COLLECTION_ID",
			"TMDB collection IDs must be positive whole numbers.",
		);
	}

	return {
		kind: "search",
		query: value,
		eligible: value.length >= 2,
		message: value.length >= 2
			? null
			: "Enter at least two characters to search.",
	};
}

export function isPositiveSafeTmdbId(value) {
	return (
		typeof value === "number"
		&& Number.isSafeInteger(value)
		&& value > 0
	);
}
