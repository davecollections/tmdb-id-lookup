import assert from "node:assert/strict";
import test from "node:test";
import { createBuilderController } from "../builder/src/application/controller.js";
import { createCollectionExportPayload } from "../builder/src/serialize/collection-export.js";
import { createNuvioTransport, NuvioConnectionError } from "../builder/src/nuvio-connection/transport.js";
import { captureNuvioCollections } from "../builder/src/nuvio-connection/collections.js";
import { parseNuvioProfiles } from "../builder/src/nuvio-connection/profiles.js";
import { prepareSendProposal, isSendProposalCurrent } from "../builder/src/nuvio-send/proposal.js";
import { createSendBaseline, sameSendBaseline } from "../builder/src/nuvio-send/comparison.js";
import { prepareCurrentNuvioBackup, backupProfileSlug } from "../builder/src/nuvio-send/backup.js";
import { createNuvioSendCoordinator } from "../builder/src/nuvio-send/coordinator.js";
import { prepareJsonDownload } from "../builder/src/ui/json-download.js";
import { createMockNuvioApi } from "./helpers/nuvio-api.mjs";

const account = { id: "11111111-1111-4111-8111-111111111111", email: "owner@example.invalid" };
const profile = { id: "22222222-2222-4222-8222-222222222222", user_id: account.id, profile_index: 2, name: "Kids", pin_enabled: false, pin_locked_until: null };
const other = { ...profile, id: "33333333-3333-4333-8333-333333333333", profile_index: 3, name: "Other" };
const content = (title) => [{ id: "c", title, unknown: { keep: [false, null, 7] }, folders: [
	{ id: "f", title: "Folder", sources: [{ provider: "community", title: "Preserved", extra: { x: true } }] },
] }];
const clone = structuredClone;
const settle = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const pushes = (api) => api.requests.filter((request) => request.url.endsWith("sync_push_collections"));

const replace = (send) => send.replaceCollections(send.getState().review);

async function fixture(t, options = {}) {
	const api = createMockNuvioApi({ account, profiles: [{ ...profile, pin_enabled: options.protected ?? false }, other], collections: content("Current"), allowWrites: true });
	const controller = createBuilderController();
	assert.equal(controller.importValue(content("Replacement")).ok, true);
	const send = createNuvioSendCoordinator({ controller, connection: api.connection, now: () => api.time });
	t.after(() => { send.dispose(); api.connection.dispose(); });
	assert.equal(send.prepare(), true);
	assert.equal(await api.connection.connect(account.email, "private-password-sentinel"), true);
	assert.equal(send.selectProfile(profile.id), true);
	if (options.protected) assert.equal(await api.connection.verifyProfilePin(profile.id, "4826"), true);
	if (options.review !== false) assert.equal(await send.review(), true);
	return { api, controller, send };
}

test("write transport uses only the allowlisted POST and accepts 204 without reading a body", async () => {
	const calls = [];
	const body = { p_profile_id: 2, p_collections_json: content("Replacement") };
	const request = createNuvioTransport({ fetchImpl: async (url, init) => {
		calls.push({ url, init }); return { status: 204, json() { assert.fail("204 has no JSON body"); } };
	} });
	for (const name of ["sync_push_collections", "pushProfiles", "refresh", "logout", "https://other.invalid"]) await assert.rejects(request(name));
	assert.equal(calls.length, 0);
	const result = await request("pushCollections", { token: "private-access-sentinel", body });
	assert.deepEqual(result, { kind: "acknowledged", dispatched: true, status: 204, code: null });
	assert.equal(calls.length, 1);
	assert.equal(calls[0].url, "https://api.nuvio.tv/rest/v1/rpc/sync_push_collections");
	assert.equal(calls[0].init.method, "POST"); assert.deepEqual(JSON.parse(calls[0].init.body), body);
	assert.equal(calls[0].init.credentials, "omit"); assert.equal(calls[0].init.cache, "no-store"); assert.equal(calls[0].init.redirect, "error");
	assert.equal(calls[0].init.headers.Authorization, "Bearer private-access-sentinel");
});

for (const status of [400, 401, 403, 404, 405, 409, 413, 415, 422, 429, 503, 500, 408, 200]) {
	test(`write HTTP ${status} never retries and retains its response classification`, async (t) => {
		t.mock.timers.enable({ apis: ["setTimeout"] }); let count = 0;
		const request = createNuvioTransport({ fetchImpl: async () => { count++; return { status, json() { assert.fail("Private body read"); }, headers: new Headers({ "Retry-After": "1" }) }; } });
		const result = await request("pushCollections", { body: { p_profile_id: 2, p_collections_json: content("New") } });
		assert.equal(result.kind, [503, 500, 408, 200].includes(status) ? "unknown" : "rejected");
		assert.equal(result.status, status); assert.equal(result.dispatched, true);
		t.mock.timers.tick(60000); await settle(); assert.equal(count, 1);
	});
}

test("write distinguishes pre-dispatch abort, guard and encoding failure from uncertain dispatched failures", async () => {
	let calls = 0;
	const request = createNuvioTransport({ fetchImpl: () => { calls++; throw Error("private failure"); } });
	const abort = new AbortController(); abort.abort();
	assert.equal((await request("pushCollections", { signal: abort.signal })).kind, "not-sent");
	assert.equal((await request("pushCollections", { beforeDispatch() { throw new NuvioConnectionError("IDENTITY"); } })).kind, "not-sent");
	const circular = {}; circular.self = circular;
	assert.equal((await request("pushCollections", { body: circular })).kind, "not-sent");
	assert.equal(calls, 0);
	assert.equal((await request("pushCollections")).kind, "unknown"); assert.equal(calls, 1);
});

for (const action of ["timeout", "abort"]) test(`write ${action} after dispatch stays unknown even when fetch ignores cancellation`, async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const delayed = deferred(); const abort = new AbortController(); let calls = 0;
	const request = createNuvioTransport({ fetchImpl: () => { calls++; return delayed.promise; } });
	const pending = request("pushCollections", { signal: abort.signal });
	if (action === "abort") abort.abort(); else t.mock.timers.tick(20000);
	assert.equal((await pending).kind, "unknown");
	delayed.resolve({ status: 204 }); await settle(); assert.equal(calls, 1);
});

for (const action of ["timeout", "abort"]) test(`signal-aware fetch retains ${action} evidence after dispatch`, async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const abort = new AbortController();
	const request = createNuvioTransport({ fetchImpl: (url, { signal }) => new Promise((resolve, reject) => {
		signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
	}) });
	const pending = request("pushCollections", { signal: abort.signal });
	if (action === "abort") abort.abort(); else t.mock.timers.tick(20000);
	assert.deepEqual(await pending, { kind: "unknown", dispatched: true, status: null, code: action === "abort" ? "CANCELLED" : "TIMEOUT" });
});

test("a received 204 is not overwritten by generic cancellation", async () => {
	const abort = new AbortController();
	const request = createNuvioTransport({ fetchImpl: async () => ({ get status() { abort.abort(); return 204; } }) });
	assert.equal((await request("pushCollections", { signal: abort.signal })).kind, "acknowledged");
});

test("canonical proposal shares the prepared export, freezes preserved data and binds project identity", () => {
	const controller = createBuilderController(); controller.importValue(content("Replacement"));
	const payload = createCollectionExportPayload(controller)();
	assert.equal(Object.isFrozen(payload), true);
	const { proposal } = prepareSendProposal(controller);
	assert.equal(proposal.intended, payload); assert.equal(Object.isFrozen(payload.collections[0].unknown.keep), true);
	assert.throws(() => { payload.collections[0].title = "Changed"; }, TypeError);
	const revision = controller.getState().revision;
	controller.selectNode(proposal.project.collections[0].internalId);
	controller.updateNode("missing", {}); // Diagnostic-only revision.
	assert.ok(controller.getState().revision > revision); assert.equal(isSendProposalCurrent(proposal, controller), true);
	controller.updateNode(proposal.project.collections[0].internalId, { title: "New title" });
	assert.equal(isSendProposalCurrent(proposal, controller), false);
});

test("Send requires nonempty valid canonical output and never silently repairs outgoing IDs", () => {
	const empty = createBuilderController(); assert.equal(prepareSendProposal(empty).errors[0].code, "SEND_EMPTY");
	for (const patch of [{ id: " c " }, { id: "f" }, { id: "" }, { title: "" }]) {
		const controller = createBuilderController(); controller.importValue(content("Replacement"));
		controller.updateNode(controller.getState().project.collections[0].internalId, patch);
		const before = controller.getState().project;
		assert.equal(prepareSendProposal(controller).ok, false);
		assert.equal(controller.getState().project, before); assert.deepEqual(before.collections[0].editable, controller.getState().project.collections[0].editable);
	}
	const controller = createBuilderController(); controller.importValue([...content("A"), { id: "b", title: "B", folders: [{ id: "g", title: "G", sources: [] }] }]);
	controller.updateNode(controller.getState().project.collections[1].folders[0].internalId, { id: "f" });
	assert.equal(prepareSendProposal(controller).errors[0].code, "SEND_DUPLICATE_ID");
});

const baseline = (array = content("Current"), metadata = { updated_at: "2026-09-19T00:00:00Z" }) => createSendBaseline({
	authority: { epoch: 1, accountId: account.id }, snapshot: captureNuvioCollections(array === null ? [] : [{ profile_id: 2, collections_json: array, ...metadata }], parseNuvioProfiles([profile], account.id)[0], "2026-09-22T08:15:30.123Z", { retainTimestampEvidence: true }),
});
test("baseline compares complete semantic raw JSON, presence and exact timestamp evidence", () => {
	const original = baseline();
	const reordered = content("Current"); reordered[0].unknown = { keep: [false, null, 7] };
	reordered[0] = { folders: reordered[0].folders, unknown: reordered[0].unknown, title: "Current", id: "c" };
	assert.equal(sameSendBaseline(original, baseline(reordered)), true);
	for (const change of [
		(value) => value[0].unknown.keep.reverse(),
		(value) => { value[0].unknown.future = null; },
		(value) => { delete value[0].unknown; },
		(value) => { value[0].unknown = null; },
		(value) => { value[0].unknown.keep[2] = "7"; },
	]) { const value = content("Current"); change(value); assert.equal(sameSendBaseline(original, baseline(value)), false); }
	assert.equal(sameSendBaseline(baseline(null), baseline([])), false);
	assert.equal(sameSendBaseline(original, baseline(content("Current"), { updated_at: "2026-09-19T00:00:01Z" })), false);
	assert.equal(sameSendBaseline(baseline([], {}), baseline([], { updated_at: null })), false);
	assert.throws(() => baseline([], { updated_at: 7 }), { code: "PAYLOAD" });
});

test("optional backup is the exact reviewed raw array without metadata, normalization or secrets", () => {
	const raw = baseline();
	const file = prepareCurrentNuvioBackup(raw);
	assert.equal(file.filename, "nuvio-profile-2-kids-current-before-dingo-20260922T081530123Z.json");
	assert.equal(file.json, JSON.stringify(raw.collections, null, 2));
	assert.deepEqual(JSON.parse(file.json), raw.collections);
	assert.doesNotMatch(file.json, /accountId|profile_index|capturedAt|updatedAtEvidence|authority|warnings|private-(access|password|refresh)-sentinel|4826/);
	assert.deepEqual(prepareCurrentNuvioBackup(raw), file, "Same Review always gives identical bytes and filename");
	assert.equal(backupProfileSlug("../ Kïds / <Movies>:?*\n"), "kids-movies");
	assert.equal(backupProfileSlug("🎬 / .."), "profile"); assert.equal(backupProfileSlug("x".repeat(100)).length, 48);
	assert.deepEqual(JSON.parse(prepareCurrentNuvioBackup(baseline(null)).json), []);
	const unrepresentable = content("Current"); unrepresentable[0].unknown.keep.push(-0);
	assert.throws(() => prepareCurrentNuvioBackup(baseline(unrepresentable)), /cannot exactly represent/);
});

test("browser download preparation does not click and releases failed allocations", async () => {
	let clicks = 0; let removals = 0; const revoked = []; const blobs = [];
	const environment = { document: { body: { append() {} }, createElement() { return { click() { clicks++; }, remove() { removals++; } }; } },
		url: { createObjectURL(blob) { blobs.push(blob); return `blob:${blobs.length}`; }, revokeObjectURL(url) { revoked.push(url); } } };
	const first = prepareJsonDownload({ json: "[]", filename: "current.json" }, environment);
	const second = prepareJsonDownload({ json: "[1]", filename: "proposed.json" }, environment);
	assert.equal(clicks, 0); assert.equal(await blobs[1].text(), "[1]");
	assert.equal(first.initiate(), true); assert.equal(first.initiate(), false); second.dispose();
	assert.equal(clicks, 1); assert.equal(removals, 1); assert.ok(revoked.includes("blob:2"));
	assert.throws(() => prepareJsonDownload({ json: "[]", filename: "x" }, { ...environment, document: { createElement() { throw Error("denied"); } } }));
	assert.ok(revoked.includes("blob:3"));
});

test("Replace makes one fresh preflight then one push and exact readback without any download", async (t) => {
	const { api, controller, send } = await fixture(t);
	const proposed = send.getState().proposal; const project = controller.getState().project;
	const before = api.requests.length;
	const pending = replace(send); assert.equal(await replace(send), false);
	assert.equal(await pending, true); assert.equal(send.getState().phase, "VERIFIED");
	assert.equal(send.getState().dispatch.kind, "acknowledged"); assert.equal(send.getState().dispatch.count, 1);
	assert.deepEqual(JSON.parse(pushes(api)[0].body).p_collections_json, proposed.intended.collections);
	assert.deepEqual(send.getState().observation.baseline.collections, proposed.intended.collections);
	assert.equal(controller.getState().project, project); assert.equal(api.requests.length, 19);
	assert.equal(api.requests.length - before, 11, "Five fresh reads, one push, five readback requests");
	assert.equal(await replace(send), false); assert.equal(pushes(api).length, 1);
	assert.doesNotMatch(JSON.stringify(send.getState()), /private-(access|password|refresh)-sentinel/);
});

test("identical state is a checked no-op with no push", async (t) => {
	const { api, send } = await fixture(t, { review: false });
	api.collections = clone(send.getState().proposal.intended.collections);
	assert.equal(await send.review(), true); assert.equal(await replace(send), true);
	assert.equal(send.getState().phase, "NO_CHANGE"); assert.equal(pushes(api).length, 0);
	assert.equal(api.requests.length, 13);
});

test("missing and explicitly empty blobs retain their distinction through replacement without backup", async (t) => {
	for (const missing of [true, false]) {
		const { api, send } = await fixture(t, { review: false });
		api.blobPresent = !missing; api.collections = [];
		assert.equal(await send.review(), true); assert.equal(await replace(send), true);
		assert.equal(send.getState().baseline.blobPresent, !missing); assert.equal(pushes(api).length, 1);
	}
});

for (const change of ["contents", "timestamp", "missing"]) test(`fresh ${change} change stops before dispatch and requires new review`, async (t) => {
	const { api, send } = await fixture(t);
	if (change === "contents") api.collections[0].unknown.new = true;
	if (change === "timestamp") api.updatedAt = "2026-09-20T00:00:00Z";
	if (change === "missing") api.blobPresent = false;
	assert.equal(await replace(send), false); assert.equal(send.getState().phase, "REMOTE_CHANGED");
	assert.equal(send.getState().review, null); assert.equal(pushes(api).length, 0);
	assert.equal(await replace(send), false); assert.equal(await send.review(), true);
});

for (const change of ["account", "uuid", "index", "protection"]) test(`identity ${change} discovered during final preflight prevents dispatch`, async (t) => {
	const { api, send } = await fixture(t);
	api.hook = (url) => {
		if (!url.endsWith("sync_pull_collections")) return;
		if (change === "account") api.account.id = other.id;
		if (change === "uuid") api.profiles[0].id = "44444444-4444-4444-8444-444444444444";
		if (change === "index") api.profiles[0].profile_index = 4;
		if (change === "protection") api.profiles[0].pin_enabled = true;
	};
	assert.equal(await replace(send), false); assert.equal(pushes(api).length, 0);
});

for (const action of ["edit", "new", "import", "remove", "order", "settings"]) test(`local ${action} invalidates the reviewed proposal without a push`, async (t) => {
	const { controller, send, api } = await fixture(t);
	const collection = controller.getState().project.collections[0];
	if (action === "edit") controller.updateNode(collection.folders[0].sources[0].internalId, { title: "Edited" });
	if (action === "new") controller.startNewProject({ discardChanges: true });
	if (action === "import") controller.importValue(content("Different"), { discardChanges: true });
	if (action === "remove") controller.removeNode(collection.folders[0].internalId);
	if (action === "settings") controller.updateNode(collection.internalId, { pinToTop: true });
	if (action === "order") { controller.createCollection({ editable: { title: "Extra" } }); controller.moveNode(collection.internalId, 1); }
	assert.equal(send.getState().phase, "STALE_LOCAL"); assert.equal(await replace(send), false); assert.equal(pushes(api).length, 0);
});

test("selection and diagnostic revisions do not invalidate Review", async (t) => {
	const { controller, send } = await fixture(t); const reviewed = send.getState().review;
	controller.selectNode(controller.getState().project.collections[0].internalId); controller.updateNode("missing", {});
	assert.equal(send.getState().review, reviewed); assert.equal(await replace(send), true);
});

test("target switching retains A's exact current PIN grant, invalidates review, and never grants B", async (t) => {
	const { api, send } = await fixture(t, { protected: true });
	api.profiles[1].pin_enabled = true; await api.connection.refreshProfiles();
	const pinCount = api.requests.filter((call) => call.url.endsWith("verify_profile_pin")).length;
	assert.equal(send.selectProfile(other.id), true); assert.equal(send.getState().review, null);
	assert.equal(api.connection.getProfileAccess(profile.id).unlocked, true);
	assert.equal(api.connection.getProfileAccess(other.id).unlocked, false); assert.equal(await send.review(), false);
	assert.equal(send.selectProfile(profile.id), true); assert.equal(await send.review(), true);
	assert.equal(api.requests.filter((call) => call.url.endsWith("verify_profile_pin")).length, pinCount);
	assert.equal(await replace(send), true);
});

test("a new page connection cannot inherit a previous page's protected-profile grant", async (t) => {
	const { api } = await fixture(t, { protected: true });
	assert.equal(api.connection.getProfileAccess(profile.id).unlocked, true);
	const reloaded = createMockNuvioApi({ account, profiles: api.profiles, collections: api.collections });
	t.after(() => reloaded.connection.dispose());
	assert.equal(await reloaded.connection.connect(account.email, "private-password-sentinel"), true);
	assert.equal(reloaded.connection.getProfileAccess(profile.id).unlocked, false);
	await assert.rejects(reloaded.connection.readProfileForSend(reloaded.connection.getState().profiles[0]), { code: "PROTECTED" });
});

for (const change of ["account", "uuid", "index", "protection", "version", "lockout", "removed", "disconnect", "reconnect", "expiry"]) {
	test(`real ${change} change invalidates authority or PIN and prevents dispatch`, async (t) => {
		const { api, send } = await fixture(t, { protected: true });
		const authority = send.getState().review.authority;
		if (change === "account") api.account.id = other.id;
		if (change === "uuid") api.profiles[0].id = "44444444-4444-4444-8444-444444444444";
		if (change === "index") api.profiles[0].profile_index = 4;
		if (change === "protection") api.profiles[0].pin_enabled = false;
		if (change === "version") api.profiles[0].updated_at = "2026-09-22T00:00:00Z";
		if (change === "lockout") api.profiles[0].pin_locked_until = new Date(api.time + 60000).toISOString();
		if (change === "removed") api.profiles.shift();
		if (change === "disconnect") api.connection.disconnect();
		else if (change === "reconnect") await api.connection.connect(account.email, "private-password-sentinel");
		else if (change === "expiry") { api.time += 3600001; api.connection.checkExpiry(); }
		else await api.connection.refreshProfiles();
		assert.equal(api.connection.isSendAuthorityCurrent(authority, parseNuvioProfiles([{ ...profile, pin_enabled: true }], account.id)[0]), false);
		assert.equal(await replace(send), false); assert.equal(pushes(api).length, 0);
	});
}

for (const result of ["match", "different", "failure"]) test(`204 plus ${result} readback preserves acknowledgement`, async (t) => {
	const { api, send } = await fixture(t); let wrote = false;
	api.hook = (url) => {
		if (url.endsWith("sync_push_collections")) wrote = true;
		if (wrote && url.endsWith("sync_pull_collections")) {
			if (result === "failure") throw Error("read unavailable");
			if (result === "different") return Response.json([{ profile_id: 2, collections_json: content("Third"), updated_at: api.updatedAt }]);
		}
	};
	assert.equal(await replace(send), result === "match");
	assert.equal(send.getState().dispatch.kind, "acknowledged");
	assert.equal(send.getState().phase, result === "match" ? "VERIFIED" : result === "different" ? "CONFLICT" : "ACKNOWLEDGED");
	assert.equal(pushes(api).length, 1);
});

test("disconnect as 204 is observed preserves coordinator acknowledgement when verification is unavailable", async (t) => {
	const { api, send } = await fixture(t);
	api.hook = (url) => url.endsWith("sync_push_collections") ? { get status() { api.connection.disconnect(); return 204; } } : null;
	assert.equal(await replace(send), false);
	assert.equal(send.getState().dispatch.kind, "acknowledged"); assert.equal(send.getState().dispatch.status, 204);
	assert.equal(send.getState().phase, "ACKNOWLEDGED"); assert.equal(send.getState().observation.kind, "unavailable");
	assert.equal(send.getState().unresolved, false); assert.equal(pushes(api).length, 1);
});

for (const observed of ["intended", "previous", "different"]) test(`timeout plus ${observed} observation never resends or restores`, async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const { api, send } = await fixture(t); const late = deferred();
	api.hook = (url, options) => {
		if (!url.endsWith("sync_push_collections")) return;
		if (observed === "intended") api.collections = JSON.parse(options.body).p_collections_json;
		if (observed === "different") api.collections = content("Third");
		return late.promise;
	};
	const pending = replace(send); await settle(); assert.equal(pushes(api).length, 1);
	t.mock.timers.tick(20000); await pending;
	assert.equal(send.getState().observation.kind, observed); assert.equal(send.getState().dispatch.kind, "unknown");
	assert.equal(send.getState().unresolved, observed !== "intended");
	if (observed !== "intended") {
		assert.equal(send.prepare(), false); assert.equal(send.selectProfile(other.id), false);
		assert.equal(send.cancel(), false); assert.equal(await send.checkNuvioAgain(), false);
		assert.equal(send.getState().unresolved, true);
		api.collections = clone(send.getState().proposal.intended.collections);
		assert.equal(await send.checkNuvioAgain(), true); assert.equal(send.getState().unresolved, false);
	}
	late.resolve(new Response(null, { status: 204 })); await settle();
	assert.equal(pushes(api).length, 1); assert.equal(send.getState().dispatch.kind, "unknown");
});

test("cancel before and during preflight is definitely not sent", async (t) => {
	const { api, send } = await fixture(t); const delayed = deferred();
	api.hook = (url) => url.endsWith("sync_pull_collections") ? delayed.promise : null;
	const pending = replace(send); await settle(); assert.equal(send.cancel(), true);
	delayed.resolve(Response.json([{ profile_id: 2, collections_json: content("Current"), updated_at: api.updatedAt }]));
	assert.equal(await pending, false); assert.equal(send.getState().phase, "NOT_SENT");
	assert.equal(send.getState().error, "CANCELLED"); assert.equal(pushes(api).length, 0);
});

test("cancel/close after dispatch cannot erase evidence or stop verification", async (t) => {
	const { api, send } = await fixture(t); const delayed = deferred();
	api.hook = (url, options) => { if (url.endsWith("sync_push_collections")) { api.collections = JSON.parse(options.body).p_collections_json; return delayed.promise; } };
	const pending = replace(send); await settle(); assert.equal(send.getState().phase, "DISPATCHING");
	assert.equal(send.cancel(), false); assert.equal(send.getState().dispatch.count, 1);
	delayed.resolve(new Response(null, { status: 204 })); assert.equal(await pending, true); assert.equal(send.getState().phase, "VERIFIED");
});

test("Import cancellation and competing reads cannot own or hide an active Send write", async (t) => {
	const { api, send } = await fixture(t); const delayed = deferred();
	api.hook = (url, options) => { if (url.endsWith("sync_push_collections")) { api.collections = JSON.parse(options.body).p_collections_json; return delayed.promise; } };
	const pending = replace(send); await settle();
	api.connection.cancelReview();
	assert.equal(api.connection.getState().busy, "send-write");
	const count = api.requests.length;
	assert.equal(await api.connection.refreshProfiles(), false);
	await assert.rejects(api.connection.readProfileForSend(send.getState().target), { code: "BUSY" });
	assert.equal(api.requests.length, count);
	delayed.resolve(new Response(null, { status: 204 }));
	assert.equal(await pending, true); assert.equal(pushes(api).length, 1);
});

test("Send reads retain the completed local Import snapshot", async (t) => {
	const { api, send } = await fixture(t);
	assert.equal(await api.connection.pullProfile(profile.id), true);
	const snapshot = api.connection.getState().snapshot;
	assert.equal(await replace(send), true);
	assert.equal(api.connection.getState().snapshot, snapshot);
	assert.deepEqual(snapshot.collections, content("Current"));
});

test("a failed Send identity read cancels its sibling retry wait", async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const { api, send } = await fixture(t);
	api.hook = (url) => url.endsWith("/user") ? new Response(null, { status: 403 }) : new Response(null, { status: 503 });
	const count = api.requests.length;
	assert.equal(await replace(send), false);
	t.mock.timers.tick(2000); await settle();
	assert.equal(api.requests.length - count, 2); assert.equal(pushes(api).length, 0);
});

test("disconnect after dispatch retains unknown attempt through local replacement and supports read-only recovery after reconnect", async (t) => {
	const { api, send, controller } = await fixture(t);
	api.hook = (url) => url.endsWith("sync_push_collections") ? new Promise(() => {}) : null;
	const pending = replace(send); await settle(); api.connection.disconnect(); await pending;
	assert.equal(send.getState().dispatch.kind, "unknown"); assert.equal(send.getState().unresolved, true);
	controller.startNewProject({ discardChanges: true }); assert.equal(send.prepare(), false);
	assert.equal(await api.connection.connect(account.email, "private-password-sentinel"), true);
	assert.equal(await send.checkNuvioAgain(), false); assert.equal(send.getState().observation.kind, "previous");
	assert.equal(pushes(api).length, 1);
});

for (const change of ["project", "disconnect", "cancel"]) test('final synchronous guard catches ' + change + ' after preflight when write preparation is announced', async (t) => {
	const { send, api, controller } = await fixture(t);
	let changed = false;
	const unsubscribe = api.connection.subscribe(() => {
		if (changed || api.connection.getState().busy !== "send-write") return;
		changed = true;
		if (change === "project") controller.updateNode(controller.getState().project.collections[0].internalId, { title: "Late edit" });
		if (change === "disconnect") api.connection.disconnect();
		if (change === "cancel") send.cancel();
	});
	t.after(unsubscribe);
	assert.equal(await replace(send), false); assert.equal(changed, true);
	assert.equal(pushes(api).length, 0); assert.equal(send.getState().dispatch.count, 0);
});

for (const change of ["intended", "version", "lockout", "missing-to-empty"]) test('fresh ' + change + ' change invalidates Review without dispatch', async (t) => {
	const { send, api } = await fixture(t, { protected: change === "version", review: change !== "missing-to-empty" });
	if (change === "missing-to-empty") { api.blobPresent = false; api.collections = []; assert.equal(await send.review(), true); api.blobPresent = true; }
	if (change === "intended") api.collections = clone(send.getState().proposal.intended.collections);
	if (change === "version") api.profiles[0].updated_at = "2026-09-23T00:00:00Z";
	if (change === "lockout") api.profiles[0].pin_locked_until = new Date(api.time + 60000).toISOString();
	assert.equal(await replace(send), false); assert.equal(pushes(api).length, 0);
	assert.equal(send.getState().review, null);
	assert.ok(!["VERIFIED", "NO_CHANGE"].includes(send.getState().phase));
});

for (const change of ["edit", "new", "import", "disconnect", "expiry"]) test(change + ' during fresh preflight prevents dispatch', async (t) => {
	const { send, api, controller } = await fixture(t);
	const delayed = deferred();
	api.hook = (url) => url.endsWith("sync_pull_collections") ? delayed.promise : null;
	const pending = replace(send); await settle();
	if (change === "edit") controller.updateNode(controller.getState().project.collections[0].internalId, { title: "Changed" });
	if (change === "new") controller.startNewProject({ discardChanges: true });
	if (change === "import") controller.importValue(content("Other project"), { discardChanges: true });
	if (change === "disconnect") api.connection.disconnect();
	if (change === "expiry") { api.time += 3600001; api.connection.checkExpiry(); }
	assert.equal(await pending, false);
	delayed.resolve(Response.json([{ profile_id: 2, collections_json: content("Obsolete"), updated_at: api.updatedAt }]));
	await settle(); assert.equal(pushes(api).length, 0);
});

test("optional backup preparation and retry leave Send state and requests unchanged", async (t) => {
	const { send, api } = await fixture(t);
	const state = send.getState(); const count = api.requests.length;
	const first = prepareCurrentNuvioBackup(state.review);
	assert.deepEqual(prepareCurrentNuvioBackup(state.review), first);
	assert.equal(send.getState(), state); assert.equal(api.requests.length, count); assert.equal(pushes(api).length, 0);
	assert.equal(await replace(send), true);
	assert.deepEqual(JSON.parse(first.json), send.getState().baseline.collections, "Optional R0 file still represents the required R1 baseline");
});

test("new Review replaces the optional backup and refuses stale Replace handlers", async (t) => {
	const { send, api } = await fixture(t);
	const original = send.getState().review; const oldBackup = prepareCurrentNuvioBackup(original);
	api.collections[0].title = "Changed"; api.time += 1;
	assert.equal(await replace(send), false); assert.equal(send.getState().phase, "REMOTE_CHANGED");
	assert.equal(await send.review(), true);
	const next = prepareCurrentNuvioBackup(send.getState().review);
	assert.notEqual(next.json, oldBackup.json); assert.notEqual(next.filename, oldBackup.filename);
	assert.equal(await send.replaceCollections(original), false); assert.equal(pushes(api).length, 0);
	assert.equal(await replace(send), true);
});

test("late cancelled preflight cannot overwrite a newer Review", async (t) => {
	const { send, api } = await fixture(t); const delayed = deferred();
	api.hook = (url) => url.endsWith("sync_pull_collections") ? delayed.promise : null;
	const pending = replace(send); await settle();
	assert.equal(send.cancel(), true); assert.equal(await pending, false);
	api.hook = null;
	assert.equal(send.prepare(), true); assert.equal(send.selectProfile(profile.id), true); assert.equal(await send.review(), true);
	const newer = send.getState().review;
	delayed.resolve(Response.json([{ profile_id: 2, collections_json: content("Obsolete"), updated_at: api.updatedAt }]));
	await settle(); assert.equal(send.getState().review, newer); assert.equal(send.getState().phase, "REVIEWED");
	assert.equal(pushes(api).length, 0);
});
