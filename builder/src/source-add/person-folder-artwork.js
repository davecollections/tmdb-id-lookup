import { buildTmdbProfileUrl, normalizeTmdbProfilePath } from "./tmdb-person-provider.js";
import { isPositiveSafePersonId } from "./tmdb-person-input.js";

const READY = "ready";
const supportedTileShapes = Object.freeze({
	POSTER: "poster",
	LANDSCAPE: "landscape",
});
const generatedFolderTitle = /^Untitled Folder(?: (?:[2-9]|[1-9]\d+))?$/;
const folderArtworkFields = Object.freeze([
	"coverEmoji",
	"coverImageUrl",
	"focusGifUrl",
	"heroBackdropUrl",
	"heroVideoUrl",
	"titleLogoUrl",
]);

function normalizedHttpsUrl(value) {
	if (typeof value !== "string" || value.trim() !== value || value.length === 0) return null;
	try {
		const url = new URL(value);
		return url.protocol === "https:" && url.username === "" && url.password === ""
			? url.toString()
			: null;
	} catch {
		return null;
	}
}

export function personArtworkOrientation(tileShape) {
	return supportedTileShapes[tileShape] ?? null;
}

export function hasCustomHttpsFolderArtwork(folder) {
	return normalizedHttpsUrl(folder?.editable?.coverImageUrl) !== null;
}

export function hasDeliberateFolderArtwork(folder) {
	const editable = folder?.editable;
	if (!editable || typeof editable !== "object" || Array.isArray(editable)) return false;
	return editable.focusGifEnabled === true || folderArtworkFields.some((key) => (
		typeof editable[key] === "string" && editable[key].trim().length > 0
	));
}

export function isPromotablePeopleFolder(folder) {
	return folder?.nodeType === "folder"
		&& !Object.hasOwn(folder, "rawImported")
		&& Array.isArray(folder.sources)
		&& folder.sources.length === 0
		&& generatedFolderTitle.test(folder.editable?.title ?? "")
		&& !hasDeliberateFolderArtwork(folder);
}

export function peoplePromotionTileShape(folder) {
	const tileShape = folder?.editable?.tileShape;
	return typeof tileShape === "string" && tileShape.trim() === tileShape && tileShape.length > 0
		? tileShape
		: "POSTER";
}

function readyRuntimeUrl(result, tmdbId, orientation) {
	if (
		result?.status !== READY
		|| result.entityType !== "person"
		|| result.tmdbId !== tmdbId
		|| result.orientation !== orientation
		|| typeof result.sha256 !== "string"
		|| !/^[a-f0-9]{64}$/.test(result.sha256)
	) return null;
	const assetUrl = normalizedHttpsUrl(result.assetUrl);
	if (assetUrl === null) return null;
	const url = new URL(assetUrl);
	if (
		url.searchParams.size !== 1
		|| url.searchParams.get("v") !== result.sha256.slice(0, 12)
		|| !url.pathname.endsWith(`/assets/collection_covers/people/${orientation}/${tmdbId}.webp`)
	) return null;
	return assetUrl;
}

export function resolvePersonFolderArtwork({
	person,
	tileShape = "POSTER",
	runtimeResult = null,
	existingFolder = null,
	replaceExisting = false,
} = {}) {
	const tmdbId = person?.id;
	if (!isPositiveSafePersonId(tmdbId)) {
		throw new TypeError("Person artwork requires a positive safe TMDB person ID.");
	}
	if (existingFolder && !replaceExisting) {
		return Object.freeze({
			personId: tmdbId,
			tileShape,
			source: "preserved",
			previewUrl: normalizedHttpsUrl(existingFolder.editable?.coverImageUrl),
			folderEditable: Object.freeze({}),
		});
	}

	const orientation = personArtworkOrientation(tileShape);
	const runtimeUrl = orientation === null ? null : readyRuntimeUrl(runtimeResult, tmdbId, orientation);
	if (runtimeUrl !== null) {
		return Object.freeze({
			personId: tmdbId,
			tileShape,
			source: "runtime",
			previewUrl: runtimeUrl,
			fallbackUsed: runtimeResult.fallbackUsed === true,
			folderEditable: Object.freeze({
				coverImageUrl: runtimeUrl,
				hideTitle: true,
			}),
		});
	}

	const profilePath = normalizeTmdbProfilePath(person.profilePath);
	const profileUrl = orientation !== null && profilePath
		? buildTmdbProfileUrl(profilePath, "w500")
		: null;
	if (profileUrl !== null) {
		return Object.freeze({
			personId: tmdbId,
			tileShape,
			source: "tmdb",
			previewUrl: profileUrl,
			folderEditable: Object.freeze({
				coverImageUrl: profileUrl,
				hideTitle: false,
			}),
		});
	}

	return Object.freeze({
		personId: tmdbId,
		tileShape,
		source: "emoji",
		previewUrl: null,
		folderEditable: Object.freeze({
			coverImageUrl: "",
			hideTitle: false,
			coverEmoji: "👤",
		}),
	});
}

export function buildPromotedPeopleFolderEditable(folder, person, artwork) {
	if (!isPromotablePeopleFolder(folder)) return null;
	const personName = typeof person?.name === "string" ? person.name.trim() : "";
	const tileShape = peoplePromotionTileShape(folder);
	if (
		!isPositiveSafePersonId(person?.id)
		|| !personName
		|| person.name !== personName
		|| artwork?.personId !== person.id
		|| artwork?.tileShape !== tileShape
		|| !["runtime", "tmdb", "emoji"].includes(artwork?.source)
	) return null;

	const editable = artwork.folderEditable;
	if (!editable || typeof editable !== "object" || Array.isArray(editable)) return null;
	if (artwork.source === "emoji") {
		if (
			Object.keys(editable).sort().join("\n") !== ["coverEmoji", "coverImageUrl", "hideTitle"].sort().join("\n")
			|| editable.coverImageUrl !== ""
			|| editable.hideTitle !== false
			|| editable.coverEmoji !== "👤"
		) return null;
	} else if (
		Object.keys(editable).sort().join("\n") !== ["coverImageUrl", "hideTitle"].sort().join("\n")
		|| normalizedHttpsUrl(editable.coverImageUrl) === null
		|| editable.hideTitle !== (artwork.source === "runtime")
	) {
		return null;
	}

	return Object.freeze({
		title: personName,
		tileShape,
		...editable,
	});
}

export async function requestPersonRuntimeArtwork(client, { tmdbId, tileShape } = {}) {
	const orientation = personArtworkOrientation(tileShape);
	if (!client || typeof client.resolve !== "function" || !isPositiveSafePersonId(tmdbId) || orientation === null) {
		return null;
	}
	try {
		return await client.resolve({ entityType: "person", tmdbId, orientation });
	} catch {
		return null;
	}
}
