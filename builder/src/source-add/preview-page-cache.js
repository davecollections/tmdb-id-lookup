import { cloneResponseData, createBoundedResponseCache } from "./bounded-response-cache.js";
import { accumulateTitlePreviewPages, validPreviewPage } from "./title-preview-results.js";

const aborted = () => ({ ok: false, error: { kind: "aborted", message: "The superseded Preview was cancelled.", retryable: false } });

// Preview-only cache: one TTL/LRU entry owns a coherent sequence of raw pages.
// Closures keep pages private; the existing cache stores only the chain handle.
export function createPreviewPageCache(options) {
	const cache = createBoundedResponseCache(options);
	const starting = new Map();
	function createChain(key, load) {
		const pages = [];
		let pending = null;
		const chain = {
			pages: () => cloneResponseData(pages),
			request(page, signal) {
				if (signal?.aborted) return Promise.resolve(aborted());
				if (!validPreviewPage(page) || page > pages.length + 1) return Promise.resolve({ ok: false, error: { kind: "invalid-request", message: "Preview pages must be loaded in order, up to page 5.", retryable: false } });
				if (pages[page - 1]) return Promise.resolve({ ok: true, data: cloneResponseData(pages[page - 1]), fromCache: true });
				if (!pending) {
					const flight = { controller: new AbortController(), consumers: 0, promise: null };
					pending = flight;
					flight.promise = Promise.resolve().then(() => flight.controller.signal.aborted ? aborted() : load(page, flight.controller.signal)).then((result) => {
						if (flight.controller.signal.aborted) return aborted();
						if (result?.ok) {
							pages.push(cloneResponseData(result.data));
							if (page === 1) cache.set(key, chain);
						}
						return result;
					}, () => ({ ok: false, error: { kind: "network", message: "Preview could not be loaded. Try again.", retryable: true } })).finally(() => {
						if (pending === flight) pending = null;
						if (starting.get(key) === chain) starting.delete(key);
					});
				}
				const flight = pending;
				flight.consumers += 1;
				return new Promise((resolve) => {
					let finished = false;
					const finish = (result) => {
						if (finished) return;
						finished = true;
						signal?.removeEventListener("abort", cancel);
						flight.consumers -= 1;
						resolve(cloneResponseData(result));
					};
					const cancel = () => {
						finish(aborted());
						if (flight.consumers === 0) {
							flight.controller.abort();
							if (pending === flight) pending = null;
							if (starting.get(key) === chain) starting.delete(key);
						}
					};
					signal?.addEventListener("abort", cancel, { once: true });
					flight.promise.then(finish);
				});
			},
		};
		return chain;
	}
	return {
		async open(key, load, { signal } = {}) {
			if (signal?.aborted) return aborted();
			let chain = cache.get(key) ?? starting.get(key);
			if (!chain) { chain = createChain(key, load); starting.set(key, chain); }
			const result = await chain.request(1, signal);
			return result?.ok ? { ...result, chain } : result;
		},
	};
}

// Projection is rebuilt from raw pages each time. In particular, a List sort
// never mutates another sort's cached page or re-sorts an accumulated prefix.
export function pagedTitlePreview(chain, project = (page) => page, { paging = true } = {}) {
	const pages = chain.pages().map(project);
	const applicable = paging ? pages : pages.slice(0, 1);
	const data = accumulateTitlePreviewPages(applicable, { paging });
	return {
		...data,
		...(data.canLoadMore ? { loadMore: async ({ signal } = {}) => {
			const result = await chain.request(data.nextPage, signal);
			return result?.ok ? { ...result, data: pagedTitlePreview(chain, project, { paging }) } : result;
		} } : {}),
	};
}
