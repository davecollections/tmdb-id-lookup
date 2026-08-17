import { isPositiveSafePersonId } from "./tmdb-person-input.js";

export const PEOPLE_MANIFEST_URL = "https://raw.githubusercontent.com/davecollections/nuvio-people-assets/main/manifests/people.json";
export const PEOPLE_MANIFEST_SCHEMA_VERSION = 2;

const CORE_ASSET_KEYS = Object.freeze(["poster", "landscape", "titleLogo", "hero"]);
const FOCUS_ASSET_KEYS = Object.freeze(["focusPoster", "focusLandscape"]);
const CATEGORY_MEMBERSHIPS = new Set(["actor", "director"]);
const SHA256 = /^[a-f0-9]{64}$/;
const PEOPLE_ASSET_ORIGIN = "raw.githubusercontent.com";
const PEOPLE_ASSET_PREFIX = "/davecollections/nuvio-people-assets/main/assets/people/";

function plainObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizedAsset(asset, personId, key) {
	if (!plainObject(asset) || typeof asset.url !== "string" || typeof asset.sha256 !== "string") return null;
	if (!SHA256.test(asset.sha256)) return null;
	let url;
	try {
		url = new URL(asset.url);
	} catch {
		return null;
	}
	if (
		url.protocol !== "https:"
		|| url.hostname !== PEOPLE_ASSET_ORIGIN
		|| !url.pathname.startsWith(`${PEOPLE_ASSET_PREFIX}${personId}/`)
		|| url.search !== ""
		|| url.hash !== ""
	) return null;
	return Object.freeze({
		url: url.toString(),
		sha256: asset.sha256,
		...(typeof asset.path === "string" ? { path: asset.path } : {}),
		...(typeof asset.format === "string" ? { format: asset.format } : {}),
		key,
	});
}

function normalizedRecord(record) {
	if (!plainObject(record) || !isPositiveSafePersonId(record.tmdbPersonId)) return null;
	const canonicalName = typeof record.canonicalName === "string" ? record.canonicalName.trim() : "";
	if (!canonicalName || record.canonicalName !== canonicalName) return null;
	if (
		!Array.isArray(record.categoryMembership)
		|| record.categoryMembership.length < 1
		|| new Set(record.categoryMembership).size !== record.categoryMembership.length
		|| record.categoryMembership.some((entry) => !CATEGORY_MEMBERSHIPS.has(entry))
	) return null;
	const assets = {};
	for (const key of CORE_ASSET_KEYS) {
		const asset = normalizedAsset(record.assets?.[key], record.tmdbPersonId, key);
		if (asset === null) return null;
		assets[key] = asset;
	}
	const focusPoster = normalizedAsset(record.assets?.focusPoster, record.tmdbPersonId, "focusPoster");
	const focusLandscape = normalizedAsset(record.assets?.focusLandscape, record.tmdbPersonId, "focusLandscape");
	if ((focusPoster === null) !== (focusLandscape === null)) return null;
	if (focusPoster !== null) {
		assets.focusPoster = focusPoster;
		assets.focusLandscape = focusLandscape;
	}
	return Object.freeze({
		tmdbPersonId: record.tmdbPersonId,
		canonicalName,
		categoryMembership: Object.freeze([...record.categoryMembership]),
		assets: Object.freeze(assets),
	});
}

export function normalizePeopleManifest(value) {
	if (
		!plainObject(value)
		|| value.schemaVersion !== PEOPLE_MANIFEST_SCHEMA_VERSION
		|| !Number.isSafeInteger(value.recordCount)
		|| value.recordCount < 0
		|| !plainObject(value.assetCounts)
		|| !Array.isArray(value.people)
		|| value.people.length !== value.recordCount
	) return null;
	const people = value.people.map(normalizedRecord);
	if (people.some((record) => record === null)) return null;
	const ids = people.map((record) => record.tmdbPersonId);
	if (new Set(ids).size !== ids.length) return null;
	const expectedAssetCounts = Object.fromEntries([...CORE_ASSET_KEYS, ...FOCUS_ASSET_KEYS].map((key) => [
		key,
		people.filter((record) => Object.hasOwn(record.assets, key)).length,
	]));
	if (Object.entries(expectedAssetCounts).some(([key, count]) => value.assetCounts[key] !== count)) return null;
	return Object.freeze({
		schemaVersion: value.schemaVersion,
		recordCount: value.recordCount,
		assetCounts: Object.freeze({ ...expectedAssetCounts }),
		people: Object.freeze(people),
		byId: Object.freeze(Object.fromEntries(people.map((record) => [record.tmdbPersonId, record]))),
	});
}

export function resolvePeopleManifestRecord(manifest, personId) {
	return isPositiveSafePersonId(personId) ? manifest?.byId?.[personId] ?? null : null;
}

export function applyPeopleManifestAuthority(person, manifest) {
	if (!isPositiveSafePersonId(person?.id)) return person;
	const record = resolvePeopleManifestRecord(manifest, person.id);
	if (record === null) return person;
	return Object.freeze({
		...person,
		name: record.canonicalName,
		canonicalName: record.canonicalName,
		categoryMembership: record.categoryMembership,
		peopleManifestRecord: record,
	});
}

export function createPeopleManifestClient({ fetchImpl = globalThis.fetch, url = PEOPLE_MANIFEST_URL } = {}) {
	if (typeof fetchImpl !== "function") throw new TypeError("People manifest loading requires fetch.");
	let cached = null;
	let inFlight = null;
	async function load({ force = false } = {}) {
		if (!force && cached !== null) return Object.freeze({ ok: true, data: cached, cached: true });
		if (!force && inFlight !== null) return inFlight;
		inFlight = (async () => {
			try {
				const response = await fetchImpl(url, { headers: { Accept: "application/json" } });
				if (!response?.ok) throw new Error(`People manifest request failed with HTTP ${response?.status ?? "unknown"}.`);
				const normalized = normalizePeopleManifest(await response.json());
				if (normalized === null) throw new Error("The People manifest response did not match schema version 2.");
				cached = normalized;
				return Object.freeze({ ok: true, data: normalized, cached: false });
			} catch (error) {
				return Object.freeze({ ok: false, data: null, error });
			} finally {
				inFlight = null;
			}
		})();
		return inFlight;
	}
	return Object.freeze({ load, peek: () => cached });
}
