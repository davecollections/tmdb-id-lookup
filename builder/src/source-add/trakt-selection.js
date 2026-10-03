import { isCanonicalTraktListId } from "../nuvio/trakt.js";
import { createOrderedSelectionState, addOrderedEntity, removeOrderedEntity, selectedOrderedEntities } from "./ordered-selection-state.js";
import { createAsyncRequestCoordinator } from "./async-request-state.js";
import { canonicalTraktInputId, traktFailure } from "./trakt-client.js";

export const TRAKT_MEDIA_BATCH_SIZE = 25;
export const TRAKT_MEDIA_CONCURRENCY = 2;
const modes = ["automatic", "movies", "series", "both"];
export function initialTraktMedia(available = false) {
	return Object.freeze({ status: "not-checked", publicRead: available, composition: null, override: "automatic", error: null });
}
export function chooseTraktMedia(state, override) {
	if (!modes.includes(override)) throw new TypeError("Choose Automatic, Movies, Series or Both.");
	return Object.freeze({ ...state, override });
}
export function settleTraktMedia(state, result) {
	if (result?.ok) return Object.freeze({ ...state, status: "known", publicRead: true, composition: Object.freeze({ ...result.data }), error: null });
	if (result?.error?.kind === "aborted") return Object.freeze({ ...state, status: "not-checked", error: null });
	const error = result?.error ?? traktFailure("INVALID_RESPONSE").error;
	const unavailable = error.code === "LIST_NOT_FOUND" || state.status === "unavailable";
	return Object.freeze({ ...state, status: unavailable ? "unavailable" : "failed",
		publicRead: unavailable ? false : state.publicRead, composition: null, error });
}
export function effectiveTraktMedia(state) {
	if (state?.publicRead !== true || !["not-checked", "known", "failed"].includes(state.status) || !modes.includes(state.override)) return Object.freeze([]);
	let mode = state.override;
	if (mode === "automatic") {
		const composition = state.composition;
		if (state.status !== "known" || !composition || ![composition.movieCount, composition.showCount].every(value => Number.isSafeInteger(value) && value >= 0)) return Object.freeze([]);
		const expected = composition.movieCount > 0 ? composition.showCount > 0 ? "mixed" : "movie-only" : composition.showCount > 0 ? "show-only" : "zero";
		mode = composition.composition === expected ? ({ "movie-only": "movies", "show-only": "series", mixed: "both" })[expected] : null;
	}
	return Object.freeze(mode === "movies" ? ["MOVIE"] : mode === "series" ? ["TV"] : mode === "both" ? ["MOVIE", "TV"] : []);
}

export function parseTraktListBatch(input, selectedIds = []) {
	if (typeof input !== "string") throw new TypeError("List input must be text.");
	const seen = new Set(), selected = new Set(selectedIds), entries = [], duplicates = [];
	input.split(/\r\n|\n|\r/).forEach((raw, index) => {
		const value = raw.trim();
		if (!value) return;
		const id = canonicalTraktInputId(value), key = id === null ? value : String(id);
		if (seen.has(key) || (id !== null && selected.has(id))) duplicates.push(Object.freeze({ line: index + 1, value, kind: seen.has(key) ? "submitted" : "selected" }));
		else entries.push(Object.freeze({ line: index + 1, value, id }));
		seen.add(key);
	});
	return Object.freeze({ entries: Object.freeze(entries), duplicates: Object.freeze(duplicates),
		errors: Object.freeze(input.trim() ? [] : [{ line: null, error: traktFailure("INVALID_REQUEST").error }]) });
}

// One dialog's state and two bounded workers, not a reusable job-queue framework.
// Construction/navigation is inert. Only explicit resolve/check/verify calls use the client.
export function createTraktSelectionSession({ client, now = Date.now, onChange = () => {} } = {}) {
	if (!client || !["resolve", "getMedia"].every(key => typeof client[key] === "function") || typeof onChange !== "function" || typeof now !== "function") throw new TypeError("A Trakt client and state observer are required.");
	let selection = createOrderedSelectionState(), input = "", lines = [], notBefore = 0, batch = null, resolving = null;
	const coordinators = new Map(), resolver = createAsyncRequestCoordinator();
	const snapshot = () => Object.freeze({ selection, input, lines: Object.freeze([...lines]), notBefore,
		checking: batch !== null, resolving: resolving !== null, pending: selectedOrderedEntities(selection).filter(row => ["not-checked", "failed"].includes(row.media.status)).length });
	const publish = () => { const state = snapshot(); onChange(state); return state; };
	function replace(id, patch) {
		if (!selection.byId[id]) return;
		selection = Object.freeze({ order: selection.order, byId: Object.freeze({ ...selection.byId, [id]: Object.freeze({ ...selection.byId[id], ...patch }) }) });
		publish();
	}
	function select(list, { verified = false } = {}) {
		if (!isCanonicalTraktListId(list?.id) || !["available", "unverified", "unavailable"].includes(list.availability)) throw new TypeError("A normalized Trakt list is required.");
		const existing = selection.byId[list.id];
		if (list.availability === "unavailable") {
			if (existing) replace(list.id, { media: settleTraktMedia(existing.media, traktFailure("LIST_NOT_FOUND")) });
			return false;
		}
		const metadata = Object.freeze({ ...list, creator: list.creator ? Object.freeze({ ...list.creator }) : null });
		if (existing) {
			// Discovery refresh cannot erase choices or downgrade positive public access.
			replace(list.id, { list: metadata, media: list.availability === "available"
				&& (existing.media.status !== "unavailable" || verified)
				? Object.freeze({ ...existing.media, publicRead: true, error: null, status: existing.media.status === "unavailable" ? "not-checked" : existing.media.status }) : existing.media });
			return false;
		}
		selection = addOrderedEntity(selection, { id: list.id, list: metadata, media: initialTraktMedia(list.availability === "available") }, Object.freeze).state;
		publish(); return true;
	}
	function coordinator(id) {
		if (!coordinators.has(id)) coordinators.set(id, createAsyncRequestCoordinator());
		return coordinators.get(id);
	}
	function cancelMedia() {
		if (batch) batch.canceled = true;
		batch = null;
		for (const lane of coordinators.values()) lane.cancel({ notify: false });
		for (const row of selectedOrderedEntities(selection)) if (row.media.status === "checking") replace(row.id, { media: Object.freeze({ ...(row.beforeCheck ?? initialTraktMedia()), publicRead: row.media.publicRead, override: row.media.override }), beforeCheck: null });
		publish();
	}
	function stopFor(error, run) {
		notBefore = Math.max(notBefore, error?.notBefore ?? 0);
		if (error?.stopQueue || notBefore > now()) run.stopped = true;
	}
	async function checkMediaBatch() {
		if (batch || notBefore > now()) return snapshot();
		const ids = selectedOrderedEntities(selection).filter(row => ["not-checked", "failed"].includes(row.media.status) && !effectiveTraktMedia(row.media).length).slice(0, TRAKT_MEDIA_BATCH_SIZE).map(row => row.id);
		const run = { canceled: false, stopped: false }; batch = run; publish();
		let next = 0;
		async function worker() {
			while (!run.canceled && !run.stopped && next < ids.length) {
				const id = ids[next++], row = selection.byId[id];
				if (!row || row.media.status === "known") continue;
				replace(id, { beforeCheck: row.media, media: Object.freeze({ ...row.media, status: "checking", error: null }) });
				const outcome = await coordinator(id).run(({ signal }) => client.getMedia(id, { signal }), id);
				if (run.canceled || !outcome.accepted || !selection.byId[id]) continue;
				const result = outcome.result?.ok && outcome.result.data?.id !== id ? traktFailure("INVALID_RESPONSE") : outcome.result;
				replace(id, { media: settleTraktMedia(selection.byId[id].media, result), beforeCheck: null });
				stopFor(result?.error, run);
			}
		}
		try { await Promise.all(Array.from({ length: TRAKT_MEDIA_CONCURRENCY }, worker)); }
		finally { if (batch === run) { batch = null; publish(); } }
		return snapshot();
	}
	async function verifyPublic(id) {
		const row = selection.byId[id];
		if (!row || notBefore > now() || row.media.status === "checking") return traktFailure("INVALID_REQUEST");
		const outcome = await coordinator(id).run(({ signal }) => client.resolve(String(id), { signal, refresh: true }), id);
		if (!outcome.accepted || !selection.byId[id]) return traktFailure("ABORTED");
		const result = outcome.result?.ok && outcome.result.data?.id !== id ? traktFailure("INVALID_RESPONSE") : outcome.result;
		if (result?.ok) select(result.data, { verified: true });
		else { stopFor(result?.error, {}); replace(id, { media: settleTraktMedia(selection.byId[id].media, result) }); }
		return result;
	}

	async function resolveInput() {
		if (resolving || notBefore > now()) return snapshot();
		const parsed = parseTraktListBatch(input, selection.order);
		lines = parsed.entries.map(entry => Object.freeze({ ...entry, status: "pending", error: null }));
		lines.push(...parsed.duplicates.map(entry => Object.freeze({ ...entry, status: "duplicate", error: null })), ...parsed.errors.map(entry => Object.freeze({ ...entry, status: "failed" })));
		lines.sort((a, b) => (a.line ?? 0) - (b.line ?? 0)); publish();
		return resumeResolve();
	}
	async function resumeResolve() {
		if (resolving || notBefore > now()) return snapshot();
		const pending = lines.filter(line => line.value && (line.status === "pending" || (line.status === "failed" && line.error?.retryable === true))).slice(0, 25);
		const run = {}; resolving = run; publish();
		try { await resolver.run(async ({ signal }) => {
			for (const entry of pending) {
				let result;
				try { result = await client.resolve(entry.value, { signal }); }
				catch { result = traktFailure("NETWORK"); }
				if (signal.aborted) return traktFailure("ABORTED");
				if (result.ok) select(result.data, { verified: true });
				lines = lines.map(line => line === entry ? Object.freeze({ ...line, status: result.ok ? "resolved" : "failed", id: result.ok ? result.data.id : line.id, error: result.error ?? null }) : line);
				notBefore = Math.max(notBefore, result.error?.notBefore ?? 0); publish();
				if (result.error?.stopQueue || notBefore > now()) break;
			}
			return { ok: true, data: null };
		}); } finally { if (resolving === run) { resolving = null; publish(); } }
		return snapshot();
	}
	function cancelResolve() { resolver.cancel({ notify: false }); resolving = null; }
	return Object.freeze({ getState: snapshot, select, checkMediaBatch, verifyPublic, resolveInput, resumeResolve,
		setInput(value) { if (typeof value !== "string") throw new TypeError("List input must be text."); cancelResolve(); input = value; lines = []; return publish(); },
		clearInput() { cancelResolve(); input = ""; lines = []; return publish(); },
		remove(id) { coordinators.get(id)?.cancel({ notify: false }); coordinators.delete(id); selection = removeOrderedEntity(selection, id, isCanonicalTraktListId); return publish(); },
		clearSelection() { cancelMedia(); cancelResolve(); coordinators.clear(); selection = createOrderedSelectionState(); return publish(); },
		chooseMedia(id, override) { const row = selection.byId[id]; if (row) replace(id, { media: chooseTraktMedia(row.media, override) }); return snapshot(); },
		setNames(id, { folderTitle, sourceTitles = {} } = {}) {
			if ((folderTitle !== undefined && typeof folderTitle !== "string") || !sourceTitles || typeof sourceTitles !== "object" || Array.isArray(sourceTitles)
				|| Object.entries(sourceTitles).some(([key, value]) => !["MOVIE", "TV"].includes(key) || typeof value !== "string")) throw new TypeError("Names must be text for this list's Folder and physical sources.");
			replace(id, { folderTitle: folderTitle ?? null, sourceTitles: Object.freeze({ ...sourceTitles }) }); return snapshot();
		},
		cancel() { cancelMedia(); cancelResolve(); return publish(); },
	});
}
