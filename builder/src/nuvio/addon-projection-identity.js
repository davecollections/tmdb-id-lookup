/**
 * Normalises only the evidence-backed no-genre aliases used while matching
 * addon source identities to catalogSources compatibility projections.
 * Serialized values are not changed by this helper.
 *
 * @param {unknown} genre
 * @returns {unknown}
 */
export function normalizeAddonProjectionIdentityGenre(genre) {
	return genre === undefined || genre === null || genre === "" || genre === "None"
		? ""
		: genre;
}

/**
 * @param {{addonId?: unknown, type?: unknown, catalogId?: unknown, genre?: unknown}} value
 * @returns {string}
 */
export function addonProjectionIdentityKey(value) {
	return JSON.stringify([
		value.addonId,
		value.type,
		value.catalogId,
		normalizeAddonProjectionIdentityGenre(value.genre),
	]);
}

/**
 * Applies the one confirmed legacy migration rule without generalising other
 * spellings or whitespace variants.
 *
 * @param {string | null} genre
 * @returns {string | null}
 */
export function normalizeMigratedAddonGenre(genre) {
	return genre === "None" ? null : genre;
}
