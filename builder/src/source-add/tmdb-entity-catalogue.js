const safeLogoPathPattern = /^\/[A-Za-z0-9._-]+$/;
const TMDB_IMAGE_ORIGIN = "https://image.tmdb.org";
const supportedLogoSizes = new Set(["w92", "w185", "w500"]);
const countryDisplayNames = typeof Intl !== "undefined" && Intl.DisplayNames
	? new Intl.DisplayNames(["en"], { type: "region" })
	: null;
const countrySearchAliases = Object.freeze({
	AU: Object.freeze(["australia"]),
	GB: Object.freeze(["united kingdom", "uk", "great britain", "britain", "england"]),
	JP: Object.freeze(["japan"]),
	KR: Object.freeze(["south korea", "korea"]),
	US: Object.freeze(["united states", "usa", "america"]),
});
const streetSegmentPattern = /(?:^\d|\b(?:apartment|apt|avenue|ave|boulevard|blvd|building|drive|dr|floor|highway|hwy|lane|ln|p\.?\s*o\.?\s*box|road|rd|rue|suite|street|st|unit)\b)/i;
const postalPattern = /\b(?:[A-Z]\d[A-Z][ -]?\d[A-Z]\d|[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}|[A-Z]-?\d{3,6}|\d{4,6}(?:-\d{4})?)\b/gi;

export function normalizeTmdbEntityText(value) {
	return typeof value === "string" ? value.trim() : "";
}

export function normalizeTmdbEntitySearchText(value) {
	return normalizeTmdbEntityText(value)
		.normalize("NFKD")
		.replace(/\p{Diacritic}/gu, "")
		.toLocaleLowerCase("en")
		.replace(/\s+/g, " ");
}

export function canonicalTmdbCountryCode(value) {
	const code = normalizeTmdbEntityText(value).toUpperCase();
	return /^[A-Z]{2}$/.test(code) ? code : "";
}

export function tmdbCountrySearchText(value) {
	const code = canonicalTmdbCountryCode(value);
	if (!code) return "";
	const displayName = countryDisplayNames?.of(code);
	const safeDisplayName = displayName && displayName !== code ? displayName : "";
	const parts = [code, safeDisplayName, ...(countrySearchAliases[code] ?? [])]
		.map(normalizeTmdbEntitySearchText)
		.filter(Boolean);
	return [...new Set(parts)].join(" ");
}

export function compactTmdbEntityHeadquarters(value, countryCode) {
	const countrySearch = new Set(tmdbCountrySearchText(countryCode).split(" ").filter(Boolean));
	const segments = normalizeTmdbEntityText(value)
		.split(",")
		.map((segment) => segment.replace(postalPattern, "").replace(/\s+/g, " ").trim())
		.filter((segment) => segment && !streetSegmentPattern.test(segment))
		.filter((segment) => {
			const normalized = normalizeTmdbEntitySearchText(segment);
			return normalized !== normalizeTmdbEntitySearchText(countryCode)
				&& ![...countrySearch].some((countryPart) => normalized === countryPart);
		});
	const unique = segments.filter((segment, index) => (
		segments.findIndex((candidate) => normalizeTmdbEntitySearchText(candidate) === normalizeTmdbEntitySearchText(segment)) === index
	));
	return unique.slice(-2).join(", ");
}

export function formatTmdbEntityLocation(entity) {
	const country = canonicalTmdbCountryCode(entity?.country);
	const headquarters = compactTmdbEntityHeadquarters(entity?.headquarters, country);
	return [country, headquarters].filter(Boolean).join(" · ");
}

export function normalizeTmdbLogoPath(value) {
	return typeof value === "string" && safeLogoPathPattern.test(value) ? value : null;
}

export function buildTmdbLogoUrl(logoPath, size = "w92") {
	if (normalizeTmdbLogoPath(logoPath) === null || !supportedLogoSizes.has(size)) return null;
	return new URL(`/t/p/${size}${logoPath}`, TMDB_IMAGE_ORIGIN).toString();
}
