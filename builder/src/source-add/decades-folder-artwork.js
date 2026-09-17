// Exact URL projection of the approved Decades manifest, release
// 26e65a4f04af83ff4067e69680a86cc0783d023e. No runtime manifest request.
import artworkData from "./decades-artwork-data.json" with { type: "json" };
import { DECADE_PRESETS } from "./decades-catalogue.js";
import { inspectCanonicalDecadeSourceNode } from "./decades-classification.js";

export const DECADES_ARTWORK_KEYS = Object.freeze({
	"1950s-and-earlier": "1950s-earlier",
	"1960s": "1960s",
	"1970s": "1970s",
	"1980s": "1980s",
	"1990s": "1990s",
	"2000s": "2000s",
	"2010s": "2010s",
	"2020s": "2020s",
});

export const DECADES_ARTWORK_SHAPES = Object.freeze(["POSTER", "SQUARE", "LANDSCAPE"]);
const variants = Object.freeze(["movies", "series", "mixed"]);
const shapeRoles = Object.freeze({
	POSTER: Object.freeze(["poster", "posterFocus"]),
	SQUARE: Object.freeze(["square", "squareFocus"]),
	LANDSCAPE: Object.freeze(["landscape", "focus"]),
});

function containingDecadeId(period) {
	if (period.id === "before-1950" || period.id === "1950s-and-earlier") return "1950s-and-earlier";
	return DECADE_PRESETS.find((preset) => (
		period.startYear >= (preset.startYear ?? -Infinity) && period.endYear <= preset.endYear
	))?.id ?? null;
}

// Artwork follows the complete effective source set, independently of names,
// source-editor routing, and ephemeral hierarchy metadata.
export function resolveDecadesArtworkIdentity(sources) {
	if (!Array.isArray(sources) || sources.length === 0) return null;
	let decadeId = null;
	const media = new Set();
	for (const source of sources) {
		const inspected = inspectCanonicalDecadeSourceNode(source);
		if (inspected === null) return null;
		const candidateId = containingDecadeId(inspected.period);
		if (candidateId === null || (decadeId !== null && candidateId !== decadeId)) return null;
		decadeId = candidateId;
		media.add(inspected.mediaType);
	}
	return Object.freeze({
		decadeId,
		variant: media.size === 2 ? "mixed" : media.has("MOVIE") ? "movies" : "series",
	});
}

export function resolveDecadesArtwork(decadeId, variant, tileShape = "POSTER") {
	if (
		typeof decadeId !== "string" || !Object.hasOwn(DECADES_ARTWORK_KEYS, decadeId)
		|| !variants.includes(variant) || !DECADES_ARTWORK_SHAPES.includes(tileShape)
	) return null;
	const assets = artworkData[DECADES_ARTWORK_KEYS[decadeId]]?.[variant];
	if (!assets) return null;
	const [cover, focus] = shapeRoles[tileShape];
	return Object.freeze({
		coverImageUrl: assets[cover],
		focusGifUrl: assets[focus],
		heroBackdropUrl: assets.hero,
		titleLogoUrl: assets.titleLogo,
	});
}
