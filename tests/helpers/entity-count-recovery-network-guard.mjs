import { register } from "node:module";

const guardKey = Symbol.for("tmdb-id-lookup.entity-count-recovery-network-guard");
const loaderSource = `
export async function resolve(specifier, context, nextResolve) {
  if (String(specifier).includes("tmdb-maintenance-request.mjs")) {
    throw new Error("TMDB maintenance request client import is forbidden during recovery execution.");
  }
  return nextResolve(specifier, context);
}
`;

if (!globalThis[guardKey]) {
	register(`data:text/javascript,${encodeURIComponent(loaderSource)}`, import.meta.url);
	const state = {
		installed: true,
		fetchAttempts: [],
		tmdbHostAttempts: 0,
	};
	globalThis[guardKey] = state;
	globalThis.fetch = async (input) => {
		const raw = input instanceof Request ? input.url : String(input);
		let url;
		try {
			url = new URL(raw);
		} catch {
			throw new Error(`Unparseable network request is forbidden during recovery execution: ${raw}`);
		}
		state.fetchAttempts.push(url.href);
		if (["api.themoviedb.org", "files.tmdb.org"].includes(url.hostname)) {
			state.tmdbHostAttempts += 1;
			throw new Error(`TMDB host request is forbidden during recovery execution: ${url.hostname}`);
		}
		throw new Error(`Unmocked network request is forbidden during recovery execution: ${url.hostname}`);
	};
}

export const recoveryNetworkGuardState = globalThis[guardKey];
