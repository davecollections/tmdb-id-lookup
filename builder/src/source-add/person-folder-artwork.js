import { buildTmdbProfileUrl, normalizeTmdbProfilePath } from "./tmdb-person-provider.js";
import { isPositiveSafePersonId } from "./tmdb-person-input.js";
const supportedTileShapes = Object.freeze({
	POSTER: "poster",
	LANDSCAPE: "landscape",
});
const generatedFolderTitle = /^Untitled Folder(?: (?:[2-9]|[1-9]\d+))?$/;
const assetSha256 = /^[a-f0-9]{64}$/;
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

function validManifestRecord(record, tmdbId) {
	if (record?.tmdbPersonId !== tmdbId || typeof record.canonicalName !== "string" || record.canonicalName.length === 0) return null;
	for (const key of ["poster", "landscape", "titleLogo", "hero"]) {
		if (normalizedHttpsUrl(record.assets?.[key]?.url) === null || !assetSha256.test(record.assets[key].sha256)) return null;
	}
	const focusPoster = record.assets?.focusPoster;
	const focusLandscape = record.assets?.focusLandscape;
	if (Boolean(focusPoster) !== Boolean(focusLandscape)) return null;
	if (focusPoster && [focusPoster, focusLandscape].some((asset) => normalizedHttpsUrl(asset.url) === null || !assetSha256.test(asset.sha256))) return null;
	return record;
}

export function resolvePersonFolderArtwork({
	person,
	tileShape = "POSTER",
	manifestRecord = person?.peopleManifestRecord ?? null,
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
	const record = validManifestRecord(manifestRecord, tmdbId);
	const baseAsset = orientation === null || record === null ? null : record.assets[orientation];
	if (baseAsset && normalizedHttpsUrl(baseAsset.url) !== null) {
		const focusPair = record.assets.focusPoster && record.assets.focusLandscape;
		const focusAsset = focusPair ? record.assets[`focus${orientation[0].toUpperCase()}${orientation.slice(1)}`] : null;
		const folderEditable = {
			coverImageUrl: baseAsset.url,
			heroBackdropUrl: record.assets.hero.url,
			titleLogoUrl: record.assets.titleLogo.url,
			hideTitle: true,
			...(focusAsset ? { focusGifUrl: focusAsset.url, focusGifEnabled: true } : {}),
		};
		return Object.freeze({
			personId: tmdbId,
			tileShape,
			source: "manifest",
			previewUrl: baseAsset.url,
			assetHashes: Object.freeze(Object.fromEntries(Object.entries(record.assets).map(([key, asset]) => [key, asset.sha256]))),
			folderEditable: Object.freeze(folderEditable),
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

export function buildPeopleHierarchyFolderEditable(person, artwork, {
	tileShape = "POSTER",
} = {}) {
	const personName = typeof person?.name === "string" ? person.name.trim() : "";
	if (
		!isPositiveSafePersonId(person?.id)
		|| !personName
		|| person.name !== personName
		|| artwork?.personId !== person.id
		|| artwork?.tileShape !== tileShape
		|| !["manifest", "tmdb", "emoji"].includes(artwork?.source)
		|| !artwork.folderEditable
		|| typeof artwork.folderEditable !== "object"
		|| Array.isArray(artwork.folderEditable)
	) {
		throw new TypeError("People hierarchy artwork requires one resolved person folder.");
	}
	return Object.freeze({
		title: personName,
		tileShape,
		...artwork.folderEditable,
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
		|| !["manifest", "tmdb", "emoji"].includes(artwork?.source)
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
	} else {
		const expectedKeys = artwork.source === "manifest"
			? ["coverImageUrl", "heroBackdropUrl", "titleLogoUrl", "hideTitle", ...(editable.focusGifEnabled === true ? ["focusGifUrl", "focusGifEnabled"] : [])]
			: ["coverImageUrl", "hideTitle"];
		if (
			Object.keys(editable).sort().join("\n") !== expectedKeys.sort().join("\n")
			|| normalizedHttpsUrl(editable.coverImageUrl) === null
			|| editable.hideTitle !== (artwork.source === "manifest")
			|| (artwork.source === "manifest" && (
				normalizedHttpsUrl(editable.heroBackdropUrl) === null
				|| normalizedHttpsUrl(editable.titleLogoUrl) === null
				|| (editable.focusGifEnabled === true && normalizedHttpsUrl(editable.focusGifUrl) === null)
			))
		) return null;
	}

	return Object.freeze({
		title: personName,
		tileShape,
		...editable,
	});
}

export async function requestPersonManifestArtwork(client, { tmdbId } = {}) {
	if (!client || typeof client.load !== "function" || !isPositiveSafePersonId(tmdbId)) {
		return null;
	}
	try {
		const result = await client.load();
		return result?.ok ? result.data?.byId?.[tmdbId] ?? null : null;
	} catch {
		return null;
	}
}
