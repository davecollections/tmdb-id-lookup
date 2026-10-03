import { createTmdbJsonRequester, tmdbRequestFailure } from "./tmdb-json-requester.js";
import { normalizeTmdbPosterPath } from "./tmdb-image.js";

const configuredOrigin = typeof __TMDB_PROXY_BASE_URL__ === "string" ? __TMDB_PROXY_BASE_URL__ : null;
const validIdentity = identity => ["movie", "tv"].includes(identity?.mediaType)
	&& Number.isSafeInteger(identity.id) && identity.id > 0;
const result = (identity, status, posterPath = null, error = null) => Object.freeze({ identity, status, posterPath, error });
const aborted = () => tmdbRequestFailure("aborted", "The poster request was cancelled.", { retryable: false });
const stopped = () => tmdbRequestFailure("rate-limit", "Artwork requests stopped because TMDB is busy.", { status: 429 });

// Optional artwork only. No Trakt fetch, text replacement, selection or project ownership.
export function createTmdbTitlePosterProvider({ fetchImpl, baseUrl = configuredOrigin,
	timeoutMs = 12_000, cacheMaxEntries = 40, now = Date.now } = {}) {
	const request = createTmdbJsonRequester({ fetchImpl, baseUrl, timeoutMs, cacheTtlMs: 300_000, cacheMaxEntries, now });
	const queue = [];
	let active = 0;
	function pump() {
		while (active < 3 && queue.length) {
			const job = queue.shift();
			job.signal?.removeEventListener("abort", job.cancel);
			if (job.signal?.aborted || job.shouldStop()) {
				job.resolve(job.signal?.aborted ? aborted() : stopped());
				continue;
			}
			active++;
			Promise.resolve().then(job.task).catch(() => tmdbRequestFailure("provider", "Artwork could not be loaded."))
				.then(job.resolve).finally(() => { active--; pump(); });
		}
	}
	function schedule(task, signal, shouldStop) {
		return new Promise(resolve => {
			const job = { task, signal, shouldStop, resolve };
			job.cancel = () => {
				const index = queue.indexOf(job);
				if (index >= 0) { queue.splice(index, 1); resolve(aborted()); }
			};
			signal?.addEventListener("abort", job.cancel, { once: true });
			queue.push(job);
			pump();
		});
	}
	async function getPosters(identities, { signal } = {}) {
		if (!Array.isArray(identities)) throw new TypeError("Poster identities must be an array.");
		const unique = new Map();
		for (const identity of identities) {
			if (validIdentity(identity)) {
				const key = identity.mediaType + ":" + identity.id;
				if (!unique.has(key)) unique.set(key, Object.freeze({ mediaType: identity.mediaType, id: identity.id, key }));
			}
		}
		let rateLimited = false;
		const resolved = new Map();
		await Promise.all([...unique].map(async ([key, identity]) => {
			const response = await schedule(async () => {
				if (signal?.aborted) return aborted();
				const response = await request("/3/" + identity.mediaType + "/" + identity.id, {}, {
					signal, cacheKey: key,
					normalize: value => value && !Array.isArray(value) && value.id === identity.id
						? { posterPath: normalizeTmdbPosterPath(value.poster_path) } : null,
					notFoundMessage: "Artwork is unavailable for this title.",
				});
				if (response.error?.status === 429) rateLimited = true;
				return response;
			}, signal, () => rateLimited);
			resolved.set(key, signal?.aborted ? result(identity, "aborted", null, aborted().error)
				: response.ok ? result(identity, response.data.posterPath === null ? "missing" : "ready", response.data.posterPath)
					: result(identity, response.error.kind === "aborted" ? "aborted" : "error", null, response.error));
		}));
		// Keep one outcome per input row, including missing identities and repeated titles.
		return Object.freeze(identities.map(identity => validIdentity(identity)
			? resolved.get(identity.mediaType + ":" + identity.id) : result(null, "missing")));
	}
	return Object.freeze({ getPosters });
}
