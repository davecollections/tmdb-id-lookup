import { createNuvioConnection } from "../../builder/src/nuvio-connection/session.js";
import { NUVIO_API_ORIGIN } from "../../builder/src/nuvio-connection/transport.js";

// Explicitly local Nuvio mechanics, never live-service acceptance. Import keeps
// writes disabled; Send opts in to a complete-blob replacement adapter.
export function createMockNuvioApi({ account, profiles, collections, allowWrites = false, timeoutMs } = {}) {
	const api = { time: Date.parse("2026-09-19T08:30:00Z"), account: structuredClone(account), profiles: structuredClone(profiles),
		collections: structuredClone(collections), blobPresent: true, updatedAt: "2026-09-19T00:00:00Z", requests: [], hook: null };
	api.auth = () => ({ access_token: "private-access-sentinel", refresh_token: "private-refresh-sentinel", token_type: "bearer", expires_in: 3600, user: { ...api.account, metadata: "private-user-sentinel" } });
	api.fetch = async (url, options) => {
		if (new URL(url).origin !== NUVIO_API_ORIGIN) throw new Error("Unexpected Nuvio origin");
		api.requests.push({ url, ...options });
		const custom = await api.hook?.(url, options);
		if (custom) return custom;
		let body;
		if (url.includes("grant_type=password")) body = api.auth();
		else if (url.endsWith("/user")) body = api.account;
		else if (url.endsWith("sync_pull_profiles")) body = api.profiles;
		else if (url.endsWith("verify_profile_pin")) body = api.pinResult ?? [{ unlocked: true, retry_after_seconds: 0 }];
		else if (url.endsWith("sync_pull_collections")) body = api.blobPresent ? [{ profile_id: JSON.parse(options.body).p_profile_id,
			collections_json: api.collections, ...(api.updatedAt === undefined ? {} : { updated_at: api.updatedAt }) }] : [];
		else if (allowWrites && url.endsWith("sync_push_collections")) {
			api.collections = JSON.parse(options.body).p_collections_json;
			api.blobPresent = true; api.updatedAt = new Date(api.time).toISOString();
			return new Response(null, { status: 204 });
		} else throw new Error(`Unexpected Nuvio endpoint: ${url}`);
		return Response.json(structuredClone(body));
	};
	api.connection = createNuvioConnection({ fetchImpl: api.fetch, now: () => api.time, timeoutMs });
	return api;
}
