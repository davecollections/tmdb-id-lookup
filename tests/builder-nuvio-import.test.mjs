import assert from "node:assert/strict";
import test from "node:test";
import { createBuilderController } from "../builder/src/application/controller.js";
import { createNuvioConnection, parseNuvioSession } from "../builder/src/nuvio-connection/session.js";
import { createNuvioTransport, NuvioConnectionError, NUVIO_API_ORIGIN } from "../builder/src/nuvio-connection/transport.js";
import { parseNuvioProfiles } from "../builder/src/nuvio-connection/profiles.js";
import { captureNuvioCollections } from "../builder/src/nuvio-connection/collections.js";
import { importNuvioSnapshot } from "../builder/src/ui/nuvio-import-actions.js";
import { repairProjectNuvioIds } from "../builder/src/nuvio/nuvio-ids.js";
import { groupedImportNotes, countLimitedImportedSources } from "../builder/src/import/import-notices.js";
import { createMockNuvioApi } from "./helpers/nuvio-api.mjs";

for (const interruption of ["cancel", "timeout"]) test(`a stalled response body releases the read after ${interruption}`, async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	let finishBody; let calls = 0;
	const body = new Promise((resolve) => { finishBody = resolve; });
	const abort = new AbortController();
	const request = createNuvioTransport({ timeoutMs: 100, fetchImpl: async () => {
		calls++; return { ok: true, json: () => body };
	} });
	const pending = request("account", { signal: abort.signal });
	const rejected = assert.rejects(pending, { code: interruption === "cancel" ? "CANCELLED" : "TIMEOUT" });
	await new Promise((resolve) => setImmediate(resolve));
	if (interruption === "cancel") abort.abort(); else t.mock.timers.tick(100);
	await rejected;
	finishBody({ private: "late-response" });
	await new Promise((resolve) => setImmediate(resolve));
	assert.equal(calls, 1, "An interrupted read never starts a retry");
});

test("PIN auto-entry cannot duplicate or supersede an in-flight verification", async (t) => {
	const api = mockApi(); t.after(() => api.connection.dispose()); api.profiles[0].pin_enabled = true;
	await api.connection.connect(account.email, "test");
	const started = deferred(), held = deferred();
	api.hook = async (url) => { if (url.endsWith("verify_profile_pin")) { started.resolve(); await held.promise; } };
	const first = api.connection.verifyProfilePin(profile.id, "4826"); await started.promise;
	assert.equal(await api.connection.verifyProfilePin(profile.id, "4826"), false);
	assert.equal(await api.connection.verifyProfilePin(profile.id, "0000"), false);
	assert.equal(api.requests.filter(call => call.url.endsWith("verify_profile_pin")).length, 1);
	held.resolve(); assert.equal(await first, true); assert.equal(api.connection.getProfileAccess(profile.id).unlocked, true);
});

for (const unlocked of [true, false]) test(`abandoned PIN ${unlocked ? "success" : "failure"} cannot affect a later target`, async (t) => {
	const api = mockApi(); t.after(() => api.connection.dispose()); api.profiles[0].pin_enabled = true;
	const other = { ...api.profiles[0], id: "33333333-3333-4333-8333-333333333333", profile_index: 3 };
	api.profiles.push(other); await api.connection.connect(account.email, "test");
	const abort = new AbortController(), started = deferred(), held = deferred();
	api.hook = async (url, options) => {
		if (url.endsWith("verify_profile_pin") && JSON.parse(options.body).p_profile_id === 2) { started.resolve(); await held.promise; return Response.json([{ unlocked, retry_after_seconds: 0 }]); }
	};
	const old = api.connection.verifyProfilePin(profile.id, "4826", { signal: abort.signal }); await started.promise;
	abort.abort(); assert.equal(await old, false); assert.equal(api.connection.getState().busy, null);
	assert.equal(await api.connection.verifyProfilePin(other.id, "1357"), true);
	const newer = api.connection.getState(); held.resolve(); await new Promise(resolve => setImmediate(resolve));
	assert.equal(api.connection.getState(), newer); assert.equal(api.connection.getProfileAccess(profile.id).unlocked, false);
	assert.equal(api.connection.getProfileAccess(other.id).unlocked, true);
});

test("an already aborted PIN entry sends no request", async (t) => {
	const api = mockApi(); t.after(() => api.connection.dispose()); api.profiles[0].pin_enabled = true;
	await api.connection.connect(account.email, "test"); const count = api.requests.length;
	const abort = new AbortController(); abort.abort();
	assert.equal(await api.connection.verifyProfilePin(profile.id, "4826", { signal: abort.signal }), false);
	assert.equal(api.requests.length, count);
});

test("synchronous PIN abandonment during post-verification identity publication cannot grant access", async (t) => {
	const api = mockApi(); t.after(() => api.connection.dispose()); api.profiles[0].pin_enabled = true;
	await api.connection.connect(account.email, "test"); const abort = new AbortController(); let returned = false;
	api.hook = (url) => { if (url.endsWith("verify_profile_pin")) returned = true; };
	const stop = api.connection.subscribe(() => { if (returned && api.connection.getState().busy === "pin") abort.abort(); });
	assert.equal(await api.connection.verifyProfilePin(profile.id, "4826", { signal: abort.signal }), false); stop();
	assert.equal(api.connection.getProfileAccess(profile.id).unlocked, false);
});

test("PIN verification uses the authenticated numeric-profile RPC and keeps secrets out of public state", async (t) => {
	const api = mockApi(); t.after(() => api.connection.dispose());
	api.profiles[0].pin_enabled = true;
	await api.connection.connect(account.email, "test");
	assert.equal(api.connection.getProfileAccess(profile.id).unlocked, false);
	assert.equal(await api.connection.verifyProfilePin(profile.id, "4826"), true);
	assert.equal(api.connection.getProfileAccess(profile.id).unlocked, true);
	const call = api.requests.find((entry) => entry.url.endsWith("verify_profile_pin"));
	assert.deepEqual(JSON.parse(call.body), { p_profile_id: 2, p_pin: "4826" });
	assert.equal(call.headers.Authorization, "Bearer private-access-sentinel");
	assert.doesNotMatch(call.url, /4826/);
	assert.doesNotMatch(JSON.stringify(api.connection.getState()), /4826|p_pin|access-sentinel/);
	assert.equal(await api.connection.pullProfile(profile.id), true);
	assert.doesNotMatch(JSON.stringify(api.connection.getState().snapshot.collections), /4826|p_pin|access-sentinel/);
});

test("wrong PIN, retry-after and remote lockout cannot authorize a Collection pull", async (t) => {
	const api = mockApi(); t.after(() => api.connection.dispose());
	api.profiles[0].pin_enabled = true;
	await api.connection.connect(account.email, "test");
	api.pinResult = [{ unlocked: false, retry_after_seconds: 0 }];
	await api.connection.verifyProfilePin(profile.id, "0000");
	assert.equal(api.connection.getState().pinFeedback.kind, "incorrect");
	assert.equal(await api.connection.pullProfile(profile.id), false);
	api.pinResult = [{ unlocked: false, retry_after_seconds: 300 }];
	await api.connection.verifyProfilePin(profile.id, "0000");
	assert.deepEqual(api.connection.getProfileAccess(profile.id), { unlocked: false, retryAfterSeconds: 300 });
	const count = api.requests.filter((entry) => entry.url.endsWith("verify_profile_pin")).length;
	await api.connection.verifyProfilePin(profile.id, "4826");
	assert.equal(api.requests.filter((entry) => entry.url.endsWith("verify_profile_pin")).length, count);
	assert.equal(api.connection.getState().pinFeedback.kind, "locked");
	api.time += 300001;
	api.pinResult = [{ unlocked: true, retry_after_seconds: 0 }];
	await api.connection.verifyProfilePin(profile.id, "4826");
	assert.equal(api.connection.getProfileAccess(profile.id).unlocked, true);
	assert.equal(api.requests.some((entry) => entry.url.endsWith("sync_pull_collections")), false);
});

test("profile-reported lockout blocks verification until its server time has elapsed", async (t) => {
	const api = mockApi(); t.after(() => api.connection.dispose());
	Object.assign(api.profiles[0], { pin_enabled: true, pin_locked_until: new Date(api.time + 60000).toISOString() });
	await api.connection.connect(account.email, "test");
	await api.connection.verifyProfilePin(profile.id, "4826");
	assert.equal(api.connection.getProfileAccess(profile.id).retryAfterSeconds, 60);
	assert.equal(api.requests.some((entry) => entry.url.endsWith("verify_profile_pin")), false);
	api.time += 60001;
	api.hook = (url) => { if (url.endsWith("verify_profile_pin")) api.profiles[0].pin_locked_until = null; };
	await api.connection.verifyProfilePin(profile.id, "4826");
	assert.equal(api.connection.getProfileAccess(profile.id).unlocked, true);
});

test("malformed PIN responses, invalid PIN input and transport errors fail closed", async (t) => {
	const api = mockApi(); t.after(() => api.connection.dispose());
	api.profiles[0].pin_enabled = true;
	await api.connection.connect(account.email, "test");
	for (const pin of ["123", "12345", "abcd", 1234]) assert.equal(await api.connection.verifyProfilePin(profile.id, pin), false);
	assert.equal(api.requests.some((entry) => entry.url.endsWith("verify_profile_pin")), false);
	for (const value of [{ unlocked: true }, [], [{ unlocked: "true", retry_after_seconds: 0 }], [{ unlocked: true, retry_after_seconds: 1 }], [{ unlocked: false, retry_after_seconds: -1 }], [{ unlocked: true }]]) {
		api.pinResult = value;
		assert.equal(await api.connection.verifyProfilePin(profile.id, "4826"), false);
		assert.equal(api.connection.getProfileAccess(profile.id).unlocked, false);
	}
	api.hook = (url) => url.endsWith("verify_profile_pin") ? new Response("4826 private-server-error", { status: 500 }) : null;
	assert.equal(await api.connection.verifyProfilePin(profile.id, "4826"), false);
	assert.doesNotMatch(JSON.stringify(api.connection.getState()), /4826|private-server/);
});

test("PIN verification is private to the exact account, row and slot and resets with the connection", async (t) => {
	for (const change of ["disconnect", "relogin", "account", "row", "slot", "removed", "protection", "version"]) {
		const api = mockApi(); t.after(() => api.connection.dispose());
		api.profiles[0].pin_enabled = true;
		api.profiles.push({ ...api.profiles[0], id: account.id, profile_index: 3 });
		await api.connection.connect(account.email, "test");
		await api.connection.verifyProfilePin(profile.id, "4826");
		assert.equal(api.connection.getProfileAccess(account.id).unlocked, false);
		if (change === "disconnect") api.connection.disconnect();
		else if (change === "relogin") await api.connection.connect(account.email, "test");
		else {
			if (change === "account") api.account.id = "44444444-4444-4444-8444-444444444444";
			if (change === "row") api.profiles[0].id = "55555555-5555-4555-8555-555555555555";
			if (change === "slot") api.profiles[0].profile_index = 4;
			if (change === "removed") api.profiles.shift();
			if (change === "protection") api.profiles[0].pin_locked_until = new Date(api.time + 60000).toISOString();
			if (change === "version") api.profiles[0].updated_at = "2026-09-19T08:31:00Z";
			await api.connection.refreshProfiles();
		}
		assert.equal(api.connection.getProfileAccess(profile.id).unlocked, false, change);
	}
});

test("identity and protection changes during PIN verification or protected pulls reject late authorization", async (t) => {
	for (const endpoint of ["verify_profile_pin", "sync_pull_collections"]) {
		for (const change of ["account", "row", "slot", "removed", "protection", "locked"]) {
			const api = mockApi(); t.after(() => api.connection.dispose()); api.profiles[0].pin_enabled = true;
			await api.connection.connect(account.email, "test");
			if (endpoint === "sync_pull_collections") await api.connection.verifyProfilePin(profile.id, "4826");
			api.hook = (url) => {
				if (!url.endsWith(endpoint)) return;
				if (change === "account") api.account.id = profile.id;
				if (change === "row") api.profiles[0].id = account.id;
				if (change === "slot") api.profiles[0].profile_index = 3;
				if (change === "removed") api.profiles = [];
				if (change === "protection") api.profiles[0].pin_enabled = false;
				if (change === "locked") api.profiles[0].pin_locked_until = new Date(api.time + 60000).toISOString();
			};
			const result = endpoint === "verify_profile_pin" ? await api.connection.verifyProfilePin(profile.id, "4826") : await api.connection.pullProfile(profile.id);
			assert.equal(result, false, endpoint + change); assert.equal(api.connection.getState().snapshot, null);
		}
	}
});

test("a late PIN response cannot restore authorization after disconnect or relogin", async (t) => {
	for (const relogin of [false, true]) {
		const api = mockApi(); t.after(() => api.connection.dispose()); api.profiles[0].pin_enabled = true;
		await api.connection.connect(account.email, "test");
		const gate = deferred(); const started = deferred();
		api.hook = async (url) => { if (url.endsWith("verify_profile_pin")) { started.resolve(); await gate.promise; } };
		const verification = api.connection.verifyProfilePin(profile.id, "4826"); await started.promise;
		if (relogin) await api.connection.connect(account.email, "new"); else api.connection.disconnect();
		gate.resolve(); assert.equal(await verification, false);
		assert.equal(api.connection.getProfileAccess(profile.id).unlocked, false);
	}
});

test("protected reviewed snapshots support all local modes after access and PIN verification expire", async (t) => {
	for (const mode of ["add", "merge", "replace"]) {
		const api = mockApi(); t.after(() => api.connection.dispose()); api.profiles[0].pin_enabled = true;
		await api.connection.connect(account.email, "test"); await api.connection.verifyProfilePin(profile.id, "4826");
		await api.connection.pullProfile(profile.id);
		const snapshot = api.connection.getState().snapshot; const requestCount = api.requests.length;
		api.time += 3600001; api.connection.checkExpiry();
		assert.equal(api.connection.getProfileAccess(profile.id).unlocked, false);
		const app = controller();
		assert.equal(importNuvioSnapshot({ connection: api.connection, controller: app, snapshot, project: app.getState().project, mode }).ok, true);
		assert.equal(api.requests.length, requestCount); assert.equal(api.connection.getState().snapshot, snapshot);
	}
});

test("avatar metadata uses only safe supplied images and valid profile colors", () => {
	const parse = (patch) => parseNuvioProfiles([{ ...profile, ...patch }], account.id)[0];
	assert.equal(parse({ avatar_url: "https://api.nuvio.tv/storage/v1/object/public/avatars/example.png" }).avatarUrl, "https://api.nuvio.tv/storage/v1/object/public/avatars/example.png");
	for (const avatar_url of ["javascript:alert(1)", "data:image/png;base64,x", "/relative", "https://u:password@example.invalid/image.png", "http://example.invalid/image.png", "https://example.invalid/a b"]) assert.equal(parse({ avatar_url }).avatarUrl, null);
	assert.equal(parse({ avatar_color_hex: "#123abc" }).avatarColor, "#123abc");
	assert.equal(parse({ avatar_color_hex: "url(secret)" }).avatarColor, null);
});

test("import notes aggregate actual outcomes without raw warning paths or repeated diagnostics", () => {
 const warnings = ["UNSUPPORTED_TMDB_SOURCE_PRESERVED", "AMBIGUOUS_SOURCE_PRESERVED_OPAQUE", "MISSING_FOLDERS", "MISSING_SOURCES", "INVALID_FILTERS_PRESERVED", "INVALID_FILTERS_PRESERVED", "FUTURE_REPAIR"].map((code) => ({ code, path: "$[private]", message: "raw diagnostic" }));
 assert.deepEqual(groupedImportNotes(warnings, 2, 3), ["2 Sources kept with limited editing", "3 IDs will be repaired during import", "2 imported settings preserved but not editable", "2 missing child lists imported as empty", "1 additional import notice recorded"]);
 const app = controller(); app.importValue(collections);
 assert.equal(countLimitedImportedSources(app.getState().project.collections), 1);
 assert.equal(captured().limitedSourceCount, 1);
});


const account = { id: "11111111-1111-4111-8111-111111111111", email: "owner@example.invalid" };
const profile = { id: "22222222-2222-4222-8222-222222222222", user_id: account.id, profile_index: 2, name: "Family / Movies", pin_enabled: false, pin_locked_until: null };
const collections = [{ id: "c", title: "Saved collection", unknown: { keep: [false, null, 7] }, folders: [
	{ id: "f", title: "Saved folder", custom: { untouched: true }, sources: [{ provider: "community", title: "Opaque source", future: { value: "retain" } }] },
] }];
const parsedProfile = () => parseNuvioProfiles([profile], account.id)[0];
const captured = (value = collections) => captureNuvioCollections([{ profile_id: 2, collections_json: value, updated_at: "2026-09-19T00:00:00Z" }], parsedProfile(), "2026-09-19T08:30:00.000Z");
const clone = (value) => structuredClone(value);
const counter = (prefix = "id") => { let count = 0; return () => `${prefix}-${++count}`; };
const controller = (options) => createBuilderController({ idFactory: counter("internal"), nuvioIdFactory: counter("nuvio"), ...options });
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

function mockApi() {
	return createMockNuvioApi({ account, profiles: [profile], collections });
}

test("login goes directly to Nuvio and retains only a private access session", async (t) => {
	const api = mockApi(); t.after(() => api.connection.dispose());
	const storageDescriptors = ["localStorage", "sessionStorage"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
	for (const [key] of storageDescriptors) Object.defineProperty(globalThis, key, { configurable: true, get() { assert.fail("Credential storage accessed"); } });
	t.after(() => { for (const [key, descriptor] of storageDescriptors) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
	assert.equal(await api.connection.connect(" owner@example.invalid ", "private-password-sentinel"), true);
	const state = api.connection.getState();
	assert.equal(state.status, "connected"); assert.deepEqual(state.account, account);
	assert.deepEqual(state.profiles, [parsedProfile()]);
	assert.doesNotMatch(JSON.stringify(state), /private-(?:access|refresh|password|user)-sentinel/);
	const login = api.requests[0];
	assert.equal(login.url, `${NUVIO_API_ORIGIN}/auth/v1/token?grant_type=password`);
	assert.deepEqual(JSON.parse(login.body), { email: account.email, password: "private-password-sentinel" });
	for (const request of api.requests) {
		assert.equal(request.credentials, "omit"); assert.equal(request.cache, "no-store"); assert.equal(request.redirect, "error");
		assert.doesNotMatch(request.url, /sentinel/); assert.ok(request.headers.apikey.startsWith("sb_publishable_"));
	}
	assert.equal(api.requests[1].headers.Authorization, "Bearer private-access-sentinel");
	assert.equal(api.requests.find((request) => request.url.endsWith("sync_pull_profiles")).body, undefined);
	const freshPage = createNuvioConnection({ fetchImpl: api.fetch });
	assert.equal(freshPage.getState().status, "disconnected"); freshPage.dispose();
});

test("session parsing rejects malformed auth and discards refresh/user metadata", () => {
	const auth = mockApi().auth();
	const value = parseNuvioSession(auth, 1000);
	assert.deepEqual(Object.keys(value).sort(), ["account", "expiresAt", "token"]);
	assert.equal(value.expiresAt, 3601000);
	for (const patch of [{ access_token: null }, { access_token: " invalid " }, { token_type: "other" }, { token_type: { toLowerCase: "invalid" } }, { expires_in: "3600" }, { expires_in: 0 }, { expires_in: Infinity }, { user: {} }]) {
		assert.throws(() => parseNuvioSession({ ...auth, ...patch }, 1000), NuvioConnectionError);
	}
	assert.throws(() => parseNuvioSession({ ...auth, expires_at: 1 }, 1000), /expired/);
});

test("transport sanitizes login, service, network, malformed JSON and timeout errors", async (t) => {
	for (const [status, code] of [[400, "LOGIN"], [401, "LOGIN"], [403, "LOGIN"], [422, "LOGIN"], [429, "RATE_LIMIT"], [500, "SERVICE"]]) {
		const request = createNuvioTransport({ fetchImpl: async () => new Response("password-token-private", { status }) });
		await assert.rejects(request("login"), (error) => error.code === code && !error.message.includes("password-token-private"));
	}
	await assert.rejects(createNuvioTransport({ fetchImpl: async () => { throw new Error("password-token-private"); } })("profiles"), { code: "NETWORK" });
	await assert.rejects(createNuvioTransport({ fetchImpl: async () => new Response("invalid") })("profiles"), { code: "PAYLOAD" });
	await assert.rejects(createNuvioTransport({ fetchImpl: async () => new Response("denied", { status: 401 }) })("profiles"), { code: "AUTH" });
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const timedOut = assert.rejects(createNuvioTransport({ fetchImpl: (_, { signal }) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))) })("profiles"), { code: "TIMEOUT" });
	t.mock.timers.tick(20000);
	await timedOut;
	let called = false;
	await assert.rejects(createNuvioTransport({ fetchImpl: () => { called = true; } })("sync_push_collections"));
	assert.equal(called, false);
});

test("profiles bind account, UUID and numeric slot; unknown protection is unavailable", () => {
	assert.equal(parseNuvioProfiles([{ ...profile, pin_enabled: true }], account.id)[0].protection, "pin");
	for (const patch of [{ pin_enabled: undefined }, { pin_enabled: "false" }, { pin_locked_until: "2026-01-01T00:00:00Z" }, { pin_locked_until: undefined }]) {
		assert.equal(parseNuvioProfiles([{ ...profile, ...patch }], account.id)[0].protection, "unknown");
	}
	for (const value of [null, {}, [{ ...profile, id: "name" }], [{ ...profile, profile_index: "2" }], [{ ...profile, profile_index: 7 }], [{ ...profile, user_id: profile.id }], [profile, profile]]) {
		assert.throws(() => parseNuvioProfiles(value, account.id), NuvioConnectionError);
	}
	const sameName = { ...profile, id: "33333333-3333-4333-8333-333333333333", profile_index: 3 };
	assert.equal(parseNuvioProfiles([profile, sameName], account.id).length, 2, "Names are not identity");
});

test("pull validates identities around retrieval and captures exact immutable data", async (t) => {
	const api = mockApi(); t.after(() => api.connection.dispose());
	await api.connection.connect(account.email, "local-test-password");
	assert.equal(await api.connection.pullProfile(profile.id), true);
	const snapshot = api.connection.getState().snapshot;
	assert.deepEqual(snapshot.collections, collections);
	assert.deepEqual(snapshot.counts, { collections: 1, folders: 1, sources: 1 });
	assert.equal(snapshot.profile.id, profile.id); assert.ok(Object.isFrozen(snapshot.collections[0].unknown.keep));
	assert.throws(() => { snapshot.collections[0].title = "changed"; }, TypeError);
	const calls = api.requests.slice(3);
	assert.deepEqual(calls.map((call) => new URL(call.url).pathname), ["/auth/v1/user", "/rest/v1/rpc/sync_pull_profiles", "/rest/v1/rpc/sync_pull_collections", "/auth/v1/user", "/rest/v1/rpc/sync_pull_profiles"]);
	assert.deepEqual(JSON.parse(calls[2].body), { p_profile_id: 2 });
	api.collections[0].title = "Changed remotely";
	assert.equal(snapshot.collections[0].title, collections[0].title);
});

test("Collection envelope distinguishes no blob/empty and rejects malformed data", () => {
	assert.equal(captureNuvioCollections([], parsedProfile(), "now").kind, "missing");
	const empty = captured([]); assert.equal(empty.kind, "empty"); assert.deepEqual(empty.collections, []);
	for (const value of [null, {}, [null], [{ profile_id: 1, collections_json: [] }], [{ profile_id: 2, collections_json: null }], [{ profile_id: 2 }], [{ profile_id: 2, collections_json: [] }, { profile_id: 2, collections_json: [] }], [{ profile_id: 2, collections_json: [{ folders: false }] }]]) {
		assert.throws(() => captureNuvioCollections(value, parsedProfile(), "now"), { code: "PAYLOAD" });
	}
	const legacy = captured([{ title: "Legacy", folders: [{ catalogSources: [{ future: true }] }] }]);
	assert.equal(legacy.counts.sources, 0); assert.ok(legacy.warnings.length); assert.deepEqual(legacy.collections[0].folders[0], { catalogSources: [{ future: true }] });
});

for (const change of ["account", "removed", "replaced", "slot", "protected"]) {
	test(`identity/protection change during pull fails closed: ${change}`, async (t) => {
		const api = mockApi(); t.after(() => api.connection.dispose());
		await api.connection.connect(account.email, "test");
		api.hook = async (url) => {
			if (!url.endsWith("sync_pull_collections")) return;
			if (change === "account") api.account.id = profile.id;
			if (change === "removed") api.profiles = [];
			if (change === "replaced") api.profiles[0].id = account.id;
			if (change === "slot") api.profiles[0].profile_index = 3;
			if (change === "protected") api.profiles[0].pin_enabled = true;
		};
		assert.equal(await api.connection.pullProfile(profile.id), false);
		assert.equal(api.connection.getState().snapshot, null);
		assert.ok(["IDENTITY", "PROTECTED"].includes(api.connection.getState().error.code));
	});
}

test("protected profile is rejected before any Collection request", async (t) => {
	const api = mockApi(); t.after(() => api.connection.dispose()); api.profiles[0].pin_enabled = true;
	await api.connection.connect(account.email, "test");
	assert.equal(await api.connection.pullProfile(profile.id), false);
	assert.equal(api.requests.some((request) => request.url.endsWith("sync_pull_collections")), false);
});

test("late responses cannot revive a cancelled/disconnected connection", async (t) => {
	const api = mockApi(); t.after(() => api.connection.dispose());
	await api.connection.connect(account.email, "test");
	const gate = deferred(); const started = deferred();
	api.hook = async (url) => { if (url.endsWith("sync_pull_collections")) { started.resolve(); await gate.promise; } };
	const pull = api.connection.pullProfile(profile.id); await started.promise;
	api.connection.disconnect(); const disconnected = api.connection.getState(); gate.resolve();
	assert.equal(await pull, false); assert.equal(api.connection.getState(), disconnected);
});

test("expiry during an unfinished pull invalidates it", async (t) => {
	const api = mockApi(); t.after(() => api.connection.dispose());
	await api.connection.connect(account.email, "test");
	api.hook = async (url) => { if (url.endsWith("sync_pull_collections")) api.time += 3600001; };
	assert.equal(await api.connection.pullProfile(profile.id), false);
	assert.equal(api.connection.getState().status, "expired"); assert.equal(api.connection.getState().snapshot, null);
});

test("an older login cannot replace a newer account or revive its discarded review", async (t) => {
	const api = mockApi(); t.after(() => api.connection.dispose());
	const delayed = deferred(); const started = deferred(); let first = true;
	api.hook = async (url) => { if (url.includes("grant_type=password") && first) { first = false; started.resolve(); await delayed.promise; } };
	const older = api.connection.connect(account.email, "older"); await started.promise;
	api.account = { id: "44444444-4444-4444-8444-444444444444", email: "second@example.invalid" };
	api.profiles = [{ ...profile, user_id: api.account.id }];
	assert.equal(await api.connection.connect(api.account.email, "newer"), true);
	const newer = api.connection.getState(); delayed.resolve();
	assert.equal(await older, false); assert.equal(api.connection.getState(), newer);
	assert.equal(newer.account.id, api.account.id);
});

test("auth/profile read failures never expose service response text", async (t) => {
	const api = mockApi(); t.after(() => api.connection.dispose());
	api.hook = async (url) => url.endsWith("sync_pull_profiles") ? new Response("private-test-server-details", { status: 500 }) : null;
	assert.equal(await api.connection.connect(account.email, "password"), false);
	assert.equal(api.connection.getState().status, "connected", "A successful login can retry failed profile retrieval");
	assert.equal(api.connection.getState().error.code, "SERVICE");
	assert.doesNotMatch(JSON.stringify(api.connection.getState()), /private-test-server-details|password/);
	api.hook = null; assert.equal(await api.connection.refreshProfiles(), true);
});

test("reviewed snapshot survives expiry and all import modes make zero network requests", async (t) => {
	for (const mode of ["add", "merge", "replace"]) {
		const api = mockApi(); t.after(() => api.connection.dispose());
		const app = controller(); const original = app.getState().project;
		await api.connection.connect(account.email, "test"); await api.connection.pullProfile(profile.id);
		assert.equal(app.getState().project, original);
		const snapshot = api.connection.getState().snapshot;
		api.time += 3600001; api.connection.checkExpiry();
		assert.equal(api.connection.getState().status, "expired"); assert.equal(api.connection.getState().snapshot, snapshot);
		const requests = api.requests.length;
		assert.equal(await api.connection.refreshProfiles(), false); assert.equal(api.requests.length, requests);
		assert.equal(api.connection.getState().snapshot, snapshot);
		const result = importNuvioSnapshot({ connection: api.connection, controller: app, snapshot, project: original, mode });
		assert.equal(result.ok, true); assert.equal(api.requests.length, requests);
		assert.deepEqual(app.getState().project.collections[0].rawImported, collections[0]);
		const imported = app.getState().project;
		api.connection.disconnect(); assert.equal(app.getState().project, imported); assert.equal(api.connection.getState().snapshot, null);
		assert.equal(api.requests.length, requests, "Disconnect never sends global logout");
	}
});

test("append imports raw subtrees atomically while reserving every existing and incoming Nuvio ID", () => {
	const app = controller(); assert.equal(app.importValue(collections).ok, true);
	const original = app.getState().project;
	app.selectNode(original.collections[0].folders[0].sources[0].internalId);
	const selection = app.getState().selection; const revision = app.getState().revision;
	let notifications = 0; app.subscribe(() => notifications++);
	assert.equal(app.appendImportedCollections([...collections, { id: "f", title: "Also conflicts" }]).ok, true);
	const state = app.getState();
	assert.equal(state.project.internalId, original.internalId); assert.deepEqual(state.project.editable, original.editable);
	assert.equal(state.project.collections[0], original.collections[0]); assert.equal(state.selection, selection);
	assert.equal(state.revision, revision + 1); assert.equal(notifications, 1); assert.equal(state.dirty, true);
	assert.equal(state.project.collections.length, 3);
	assert.notEqual(state.project.collections[1].editable.id, "c"); assert.notEqual(state.project.collections[1].folders[0].editable.id, "f");
	assert.deepEqual(state.project.collections[1].rawImported, collections[0]);
	assert.deepEqual(state.project.collections[1].folders[0].sources[0].rawImported, collections[0].folders[0].sources[0]);
	assert.ok(state.diagnostics.import.warnings.some((warning) => warning.path.startsWith("$[2]")));
	assert.deepEqual(collections, captured().collections);
});

test("append allows unfinished existing work and preserves legacy/opaque data without serialization", () => {
	const app = controller(); app.createCollection({ editable: { title: "" } });
	const original = app.getState().project.collections[0];
	const legacy = [{ custom: true, folders: [{ catalogSources: [{ addonId: "legacy", type: "movie", catalogId: "saved" }] }] }];
	assert.equal(app.appendImportedCollections(legacy).ok, true);
	assert.equal(app.getState().project.collections[0], original);
	assert.deepEqual(app.getState().project.collections[1].rawImported, legacy[0]);
});

test("append failure never commits a partial Collection or alters current IDs", () => {
	for (const kind of ["malformed", "internal", "nuvio"]) {
		let collide = false;
		const next = counter();
		const app = controller({ idFactory: () => collide && kind === "internal" ? "existing-root" : next(), nuvioIdFactory: () => "c" });
		assert.equal(app.importValue([{ id: "c", folders: [] }]).ok, true);
		const before = app.getState(); collide = true;
		// Repeated internal IDs fail within the existing importer before append.
		const result = app.appendImportedCollections(kind === "malformed" ? [{ folders: false }] : collections);
		assert.equal(result.ok, false); assert.equal(app.getState().project, before.project); assert.equal(app.getState().dirty, before.dirty);
	}
});

test("default ID repair stays compatible and reserved IDs only alter incoming editable IDs", () => {
	const app = controller(); app.importValue(collections); const project = app.getState().project;
	assert.deepEqual(repairProjectNuvioIds(project, counter()), project);
	const repaired = repairProjectNuvioIds(project, counter("repaired"), new Set(["c", "f"]));
	assert.equal(repaired.collections[0].editable.id, "repaired-1");
	assert.equal(repaired.collections[0].folders[0].editable.id, "repaired-2");
	assert.deepEqual(repaired.collections[0].rawImported, project.collections[0].rawImported);
});

function localAction({ existing = true } = {}) {
	const app = controller(); if (existing) app.importValue(collections);
	const snapshot = captured(); const connection = { getState: () => ({ snapshot }) };
	return { controller: app, connection, snapshot, project: app.getState().project, mode: "add" };
}

test("explicit Add, Merge and Replace retain their distinct local operations", () => {
 for (const [mode, count] of [["add", 2], ["merge", 1], ["replace", 1]]) {
  const args = localAction();
  const result = importNuvioSnapshot({ ...args, mode, replaceConfirmed: mode === "replace" });
  assert.equal(result.ok, true);
  assert.equal(args.controller.getState().project.collections.length, count);
  assert.deepEqual(args.controller.getState().project.collections[0].rawImported, collections[0]);
 }
});

test("missing confirmation, changed project or discarded snapshot prevents every local import", () => {
 for (const reason of ["replace", "stale", "disconnected", "mode"]) {
  const args = localAction();
  if (reason === "replace") args.mode = "replace";
  if (reason === "mode") args.mode = "";
  if (reason === "stale") args.controller.createCollection({ editable: { title: "New work" } });
  if (reason === "disconnected") args.connection = { getState: () => ({ snapshot: null }) };
  const before = args.controller.getState().project;
  const result = importNuvioSnapshot(args);
  assert.equal(result.ok, false); assert.equal(args.controller.getState().project, before);
 }
});

test("replacement uses existing dirty guard only after explicit confirmation", () => {
	const args = localAction(); args.mode = "replace";
	args.controller.updateNode(args.project.collections[0].internalId, { title: "Edited" });
	args.project = args.controller.getState().project;
	assert.equal(args.controller.getState().dirty, true);
	assert.equal(importNuvioSnapshot(args).ok, false);
	assert.equal(importNuvioSnapshot({ ...args, replaceConfirmed: true }).ok, true);
	assert.equal(args.controller.getState().dirty, false);
	assert.equal(args.controller.getState().project.collections.length, 1);
});

test("empty/missing snapshots cannot clear current work", () => {
	for (const snapshot of [captured([]), captureNuvioCollections([], parsedProfile(), "now")]) {
		const args = localAction(); args.snapshot = snapshot; args.connection = { getState: () => ({ snapshot }) };
		assert.equal(importNuvioSnapshot(args).ok, false); assert.equal(args.controller.getState().project, args.project);
	}
});

const settleNuvioTimers = () => new Promise((resolve) => setImmediate(resolve));
async function advanceNuvioTimers(t, milliseconds) {
	t.mock.timers.tick(milliseconds);
	await settleNuvioTimers();
}

for (const operation of ["account", "profiles", "collections"]) {
	for (const status of [429, 503]) {
		test(`safe Nuvio read ${operation} retries HTTP ${status} once with a fresh attempt`, async (t) => {
			t.mock.timers.enable({ apis: ["setTimeout"] });
			const signals = [];
			const request = createNuvioTransport({ fetchImpl: async (_, options) => {
				signals.push(options.signal);
				return signals.length === 1 ? new Response(null, { status }) : Response.json([]);
			} });
			const pending = request(operation);
			await settleNuvioTimers();
			assert.equal(signals.length, 1);
			assert.equal(signals[0].aborted, true, "Discard the unsuccessful response before waiting");
			await advanceNuvioTimers(t, 1999);
			assert.equal(signals.length, 1);
			await advanceNuvioTimers(t, 1);
			assert.deepEqual(await pending, []);
			assert.equal(signals.length, 2);
			assert.notEqual(signals[0], signals[1]);
			assert.equal(signals[1].aborted, false);
			await advanceNuvioTimers(t, 60000);
			assert.equal(signals[1].aborted, false, "Completed attempt removed its timeout");
		});
	}
}

for (const [header, delay] of [
	["3", 3000], [" 4 ", 4000], ["30", 30000],
	["Sat, 19 Sep 2026 08:30:05 GMT", 5000],
	["Saturday, 19-Sep-26 08:30:05 GMT", 5000],
	["Sat Sep 19 08:30:05 2026", 5000],
	[null, 2000], ["", 2000], ["invalid", 2000], ["0", 2000], ["-1", 2000],
	["1.5", 2000], ["1e3", 2000], ["2026-09-19", 2000],
	["Fri, 18 Sep 2026 08:30:00 GMT", 2000],
	["Foo, 19 Sep 2026 08:30:05 GMT", 2000], ["Thu, 31 Sep 2026 08:30:05 GMT", 2000],
]) {
	test(`Nuvio Retry-After ${JSON.stringify(header)} waits ${delay}ms`, async (t) => {
		t.mock.timers.enable({ apis: ["setTimeout"] });
		let calls = 0;
		const request = createNuvioTransport({
			now: () => Date.parse("2026-09-19T08:30:00Z"),
			fetchImpl: async () => ++calls === 1
				? new Response(null, { status: 429, headers: header === null ? {} : { "Retry-After": header } })
				: Response.json([]),
		});
		const pending = request("profiles");
		await settleNuvioTimers();
		await advanceNuvioTimers(t, delay - 1);
		assert.equal(calls, 1);
		await advanceNuvioTimers(t, 1);
		assert.deepEqual(await pending, []);
		assert.equal(calls, 2);
	});
}

test("Nuvio leaves excessive valid Retry-After cooldowns to manual retry without retrying early", async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	for (const status of [429, 503]) {
		for (const header of ["31", "999999999999999999999999999999999999", "9".repeat(400), "Sat, 19 Sep 2026 08:30:31 GMT"]) {
			let calls = 0;
			const request = createNuvioTransport({
				now: () => Date.parse("2026-09-19T08:30:00Z"),
				fetchImpl: async () => { calls++; return new Response(null, { status, headers: { "Retry-After": header } }); },
			});
			await assert.rejects(request("profiles"), { code: status === 429 ? "RATE_LIMIT" : "UNAVAILABLE" });
			await advanceNuvioTimers(t, 60000);
			assert.equal(calls, 1);
		}
	}
});

test("Nuvio safe-read exhaustion preserves rate-limit or temporary-unavailable errors", async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	for (const status of [429, 503]) {
		let calls = 0;
		const request = createNuvioTransport({ fetchImpl: async () => { calls++; return new Response("private-detail", { status }); } });
		const result = assert.rejects(request("profiles"), (error) => error.code === (status === 429 ? "RATE_LIMIT" : "UNAVAILABLE")
			&& !error.message.includes("private-detail"));
		await settleNuvioTimers();
		await advanceNuvioTimers(t, 2000);
		await result;
		await advanceNuvioTimers(t, 60000);
		assert.equal(calls, 2);
	}
});

test("Nuvio never retries login, PIN verification, other status codes or fetch failures", async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	for (const operation of ["login", "pin"]) {
		for (const status of [429, 503]) {
			let calls = 0;
			const request = createNuvioTransport({ fetchImpl: async () => { calls++; return new Response(null, { status }); } });
			await assert.rejects(request(operation), { code: status === 429 ? "RATE_LIMIT" : "UNAVAILABLE" });
			await advanceNuvioTimers(t, 60000);
			assert.equal(calls, 1, `${operation}/${status}`);
		}
	}
	for (const [status, code] of [[400, "SERVICE"], [401, "AUTH"], [403, "FORBIDDEN"], [500, "SERVICE"], [502, "SERVICE"], [504, "SERVICE"]]) {
		let calls = 0;
		const request = createNuvioTransport({ fetchImpl: async () => { calls++; return new Response(null, { status }); } });
		await assert.rejects(request("profiles"), { code });
		await advanceNuvioTimers(t, 60000);
		assert.equal(calls, 1);
	}
	let calls = 0;
	await assert.rejects(createNuvioTransport({ fetchImpl: async () => { calls++; throw new TypeError("private-connection-detail"); } })("profiles"), { code: "NETWORK" });
	await advanceNuvioTimers(t, 60000);
	assert.equal(calls, 1);
});

test("Nuvio distinguishes body-stream failure from invalid JSON without exposing details", async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	for (const [response, code] of [
		[new Response(new ReadableStream({ start(controller) { controller.error(new TypeError("private-body-detail")); } })), "NETWORK"],
		[new Response("{invalid private JSON"), "PAYLOAD"],
	]) {
		let calls = 0;
		await assert.rejects(createNuvioTransport({ fetchImpl: async () => { calls++; return response; } })("profiles"),
			(error) => error.code === code && !error.message.includes("private"));
		await advanceNuvioTimers(t, 60000);
		assert.equal(calls, 1);
	}
});

test("each Nuvio retry attempt retains its own full 20000ms timeout", async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	let calls = 0, finished = false;
	const request = createNuvioTransport({ fetchImpl: (_, { signal }) => {
		calls++;
		if (calls === 1) return new Promise((resolve) => setTimeout(() => resolve(new Response(null, { status: 503 })), 19000));
		return new Promise((_, reject) => signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true }));
	} });
	const result = assert.rejects(request("collections"), { code: "TIMEOUT" }).then(() => { finished = true; });
	await advanceNuvioTimers(t, 19000);
	assert.equal(calls, 1);
	await advanceNuvioTimers(t, 2000);
	assert.equal(calls, 2);
	await advanceNuvioTimers(t, 19999);
	assert.equal(finished, false);
	await advanceNuvioTimers(t, 1);
	await result;
	assert.equal(calls, 2);
});

test("Nuvio body reads retain timeout and cancellation precedence", async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	for (const cancel of [false, true]) {
		const parent = new AbortController();
		const request = createNuvioTransport({ fetchImpl: async (_, { signal }) => new Response(new ReadableStream({
			start(controller) { signal.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError")), { once: true }); },
		})) });
		const result = assert.rejects(request("collections", { signal: parent.signal }), { code: cancel ? "CANCELLED" : "TIMEOUT" });
		await settleNuvioTimers();
		if (cancel) parent.abort(); else await advanceNuvioTimers(t, 20000);
		await result;
	}
});

for (const action of ["disconnect", "cancelReview", "dispose", "expiry"]) {
	test(`Nuvio ${action} cancels an active retry delay without another request`, async (t) => {
		t.mock.timers.enable({ apis: ["setTimeout"] });
		const api = mockApi(); t.after(() => api.connection.dispose());
		await api.connection.connect(account.email, "test");
		api.requests.length = 0;
		api.hook = (url) => url.endsWith("sync_pull_profiles") ? new Response(null, { status: 503 }) : null;
		const pending = api.connection.refreshProfiles();
		await settleNuvioTimers();
		assert.equal(api.connection.getState().busy, "profiles");
		if (action === "expiry") { api.time += 3600001; api.connection.checkExpiry(); }
		else api.connection[action]();
		const cancelled = api.connection.getState();
		assert.equal(await pending, false);
		assert.equal(cancelled.busy, null);
		await advanceNuvioTimers(t, 60000);
		assert.equal(api.connection.getState(), cancelled);
		assert.equal(api.requests.filter((entry) => entry.url.endsWith("sync_pull_profiles")).length, 1);
	});
}

test("a superseding Nuvio operation cancels the older retry delay", async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const api = mockApi(); t.after(() => api.connection.dispose());
	await api.connection.connect(account.email, "test");
	api.requests.length = 0;
	api.hook = (url) => url.endsWith("sync_pull_profiles") ? new Response(null, { status: 429 }) : null;
	const older = api.connection.refreshProfiles();
	await settleNuvioTimers();
	api.hook = null;
	api.profiles[0].name = "Current profile";
	assert.equal(await api.connection.refreshProfiles(), true);
	const current = api.connection.getState();
	assert.equal(await older, false);
	await advanceNuvioTimers(t, 60000);
	assert.equal(api.connection.getState(), current);
	assert.equal(current.profiles[0].name, "Current profile");
	assert.equal(api.requests.filter((entry) => entry.url.endsWith("sync_pull_profiles")).length, 2);
});

test("a stale retry response cannot overwrite a newer Nuvio operation", async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const api = mockApi(); t.after(() => api.connection.dispose());
	await api.connection.connect(account.email, "test");
	let reads = 0;
	const gate = deferred(), started = deferred();
	const oldRows = clone(api.profiles);
	api.hook = async (url) => {
		if (!url.endsWith("sync_pull_profiles")) return;
		if (++reads === 1) return new Response(null, { status: 503 });
		started.resolve(); await gate.promise;
		return Response.json(oldRows); // Deliberately ignores abort to exercise stale-result rejection.
	};
	const older = api.connection.refreshProfiles();
	await settleNuvioTimers();
	await advanceNuvioTimers(t, 2000);
	await started.promise;
	api.hook = null;
	api.profiles[0].name = "Newer result";
	assert.equal(await api.connection.refreshProfiles(), true);
	const current = api.connection.getState();
	gate.resolve();
	assert.equal(await older, false);
	assert.equal(api.connection.getState(), current);
	assert.equal(current.profiles[0].name, "Newer result");
});

test("a failed Nuvio identity read cancels its sibling retry wait", async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const api = mockApi(); t.after(() => api.connection.dispose());
	await api.connection.connect(account.email, "test");
	api.requests.length = 0;
	const gate = deferred();
	api.hook = async (url) => {
		if (url.endsWith("/user")) { await gate.promise; return new Response(null, { status: 500 }); }
		if (url.endsWith("sync_pull_profiles")) return new Response(null, { status: 429 });
	};
	const pending = api.connection.refreshProfiles();
	await settleNuvioTimers();
	gate.resolve();
	assert.equal(await pending, false);
	assert.equal(api.connection.getState().busy, null);
	assert.equal(api.connection.getState().error.code, "SERVICE");
	await advanceNuvioTimers(t, 60000);
	assert.equal(api.requests.filter((entry) => entry.url.endsWith("sync_pull_profiles")).length, 1);
	api.hook = null;
	assert.equal(await api.connection.refreshProfiles(), true);
});

test("successful Nuvio login survives exhausted profile retries and recovers through Refresh", async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const api = mockApi(); t.after(() => api.connection.dispose());
	api.hook = (url) => url.endsWith("sync_pull_profiles") ? new Response(null, { status: 503 }) : null;
	const connecting = api.connection.connect(account.email, "test");
	await settleNuvioTimers();
	await advanceNuvioTimers(t, 2000);
	assert.equal(await connecting, false);
	assert.equal(api.connection.getState().status, "connected");
	assert.equal(api.connection.getState().busy, null);
	assert.equal(api.connection.getState().error.code, "UNAVAILABLE");
	api.hook = null;
	assert.equal(await api.connection.refreshProfiles(), true);
	assert.equal(api.connection.getState().error, null);
	assert.equal(api.requests.filter((entry) => entry.url.includes("grant_type=password")).length, 1);
});

test("repeated Nuvio failure and manual retry use fresh operations and recover", async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const api = mockApi(); t.after(() => api.connection.dispose());
	await api.connection.connect(account.email, "test");
	api.requests.length = 0;
	for (const failure of ["RATE_LIMIT", "NETWORK", "TIMEOUT", "UNAVAILABLE"]) {
		const start = api.requests.length;
		api.hook = (url, { signal }) => {
			if (!url.endsWith("sync_pull_profiles")) return;
			if (failure === "NETWORK") throw new TypeError("private failure");
			if (failure === "TIMEOUT") return new Promise((_, reject) => signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true }));
			return new Response(null, { status: failure === "RATE_LIMIT" ? 429 : 503 });
		};
		const pending = api.connection.refreshProfiles();
		await settleNuvioTimers();
		await advanceNuvioTimers(t, failure === "TIMEOUT" ? 20000 : 2000);
		assert.equal(await pending, false);
		assert.equal(api.connection.getState().busy, null);
		assert.equal(api.connection.getState().status, "connected");
		assert.equal(api.connection.getState().error.code, failure);
		const requests = api.requests.slice(start).filter((entry) => entry.url.endsWith("sync_pull_profiles"));
		assert.equal(requests.length, ["RATE_LIMIT", "UNAVAILABLE"].includes(failure) ? 2 : 1);
		if (failure !== "NETWORK") assert.ok(requests.every((entry) => entry.signal.aborted));
	}
	api.hook = null;
	assert.equal(await api.connection.refreshProfiles(), true);
	assert.equal(api.connection.getState().busy, null);
	assert.equal(api.connection.getState().error, null);
	const signals = api.requests.filter((entry) => entry.url.endsWith("sync_pull_profiles")).map((entry) => entry.signal);
	assert.equal(new Set(signals).size, signals.length);
});

for (const status of [401, 403]) {
	test(`Nuvio HTTP ${status} ${status === 401 ? "expires" : "retains"} the current connection`, async (t) => {
		const api = mockApi(); t.after(() => api.connection.dispose());
		await api.connection.connect(account.email, "test");
		api.hook = (url) => url.endsWith("sync_pull_profiles") ? new Response("private body", { status }) : null;
		assert.equal(await api.connection.refreshProfiles(), false);
		assert.equal(api.connection.getState().status, status === 401 ? "expired" : "connected");
		assert.equal(api.connection.getState().busy, null);
		const count = api.requests.length;
		api.hook = null;
		if (status === 401) {
			assert.equal(await api.connection.refreshProfiles(), false);
			assert.equal(api.requests.length, count);
			assert.equal(api.connection.getState().error.code, "AUTH");
		} else {
			assert.equal(api.connection.getState().error.code, "FORBIDDEN");
			assert.doesNotMatch(api.connection.getState().error.message, /expired|private/);
			assert.equal(await api.connection.refreshProfiles(), true);
		}
	});
}

test("PIN identity reads may retry before and after one manual verification", async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const api = mockApi(); t.after(() => api.connection.dispose());
	api.profiles[0].pin_enabled = true;
	await api.connection.connect(account.email, "test");
	api.requests.length = 0;
	let profileReads = 0;
	api.hook = (url) => url.endsWith("sync_pull_profiles") && ++profileReads % 2 === 1 ? new Response(null, { status: 503 }) : null;
	const verifying = api.connection.verifyProfilePin(profile.id, "4826");
	await settleNuvioTimers();
	await advanceNuvioTimers(t, 2000);
	assert.equal(api.connection.getState().busy, "pin");
	await advanceNuvioTimers(t, 2000);
	assert.equal(await verifying, true);
	assert.equal(profileReads, 4);
	assert.equal(api.requests.filter((entry) => entry.url.endsWith("verify_profile_pin")).length, 1);
	assert.equal(api.connection.getProfileAccess(profile.id).unlocked, true);
});

for (const change of ["account", "removed", "replacement", "protection"]) {
	test(`Collection retry still rejects ${change} changes before publishing a snapshot`, async (t) => {
		t.mock.timers.enable({ apis: ["setTimeout"] });
		const api = mockApi(); t.after(() => api.connection.dispose());
		await api.connection.connect(account.email, "test");
		let pulls = 0;
		api.hook = (url) => url.endsWith("sync_pull_collections") && ++pulls === 1 ? new Response(null, { status: 503 }) : null;
		const pending = api.connection.pullProfile(profile.id);
		await settleNuvioTimers();
		assert.equal(pulls, 1);
		if (change === "account") api.account.id = "44444444-4444-4444-8444-444444444444";
		if (change === "removed") api.profiles = [];
		if (change === "replacement") api.profiles[0].id = account.id;
		if (change === "protection") api.profiles[0].pin_enabled = true;
		await advanceNuvioTimers(t, 2000);
		assert.equal(await pending, false);
		assert.equal(api.connection.getState().snapshot, null);
		assert.equal(api.connection.getState().busy, null);
		assert.ok(["IDENTITY", "PROTECTED"].includes(api.connection.getState().error.code));
	});
}

test("a retried Collection pull captures one immutable snapshot with local imports after expiry", async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const api = mockApi(); t.after(() => api.connection.dispose());
	await api.connection.connect(account.email, "test");
	let pulls = 0;
	api.hook = (url) => url.endsWith("sync_pull_collections") && ++pulls === 1 ? new Response(null, { status: 429 }) : null;
	const pending = api.connection.pullProfile(profile.id);
	await settleNuvioTimers();
	assert.equal(api.connection.getState().snapshot, null);
	assert.equal(api.connection.getState().busy, "pull");
	await advanceNuvioTimers(t, 2000);
	assert.equal(await pending, true);
	assert.equal(pulls, 2);
	const snapshot = api.connection.getState().snapshot;
	assert.deepEqual(snapshot.collections, collections);
	assert.ok(Object.isFrozen(snapshot.collections[0].unknown.keep));
	const requests = api.requests.length;
	api.time += 3600001;
	api.connection.checkExpiry();
	for (const mode of ["add", "merge", "replace"]) {
		const app = controller();
		assert.equal(importNuvioSnapshot({ connection: api.connection, controller: app, snapshot, project: app.getState().project, mode }).ok, true);
		assert.equal(api.connection.getState().snapshot, snapshot);
	}
	assert.equal(await api.connection.refreshProfiles(), false);
	assert.equal(api.connection.getState().snapshot, snapshot);
	assert.equal(api.requests.length, requests);
	api.connection.disconnect();
	assert.equal(api.connection.getState().snapshot, null);
	assert.equal(api.requests.length, requests);
});
