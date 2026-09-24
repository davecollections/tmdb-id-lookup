import assert from "node:assert/strict";
import test from "node:test";
import { createBuilderController } from "../builder/src/application/controller.js";
import { prepareSendProposal } from "../builder/src/nuvio-send/proposal.js";
import { createSendBaseline } from "../builder/src/nuvio-send/comparison.js";
import { captureNuvioCollections } from "../builder/src/nuvio-connection/collections.js";
import { reviewedSendIsIdentical, sendProgress, sendResult, sendProblem, sendStatusLabel, sendInProgress, sendAttentionLabel, sendReviewGroups, sendRemovalCount, sendRemovalWarning, sendMergeHelp } from "../builder/src/ui/nuvio-send-presentation.js";

for (const [name, remote, proposed, expected] of [
	["zero retained identities", ["a", "b"], ["b", "a", "c"], 0],
	["one", ["a", "b"], ["a"], 1],
	["many", ["a", "b", "c", "d"], ["d"], 3],
	["equal totals with different membership", ["a", "b"], ["b", "c"], 1],
	["larger proposal can still remove", ["a", "b"], ["b", "c", "d"], 1],
	["empty", [], ["a"], 0],
	["missing id", [undefined, "a"], ["a"], null],
	["duplicate remote id", ["a", "a"], ["a"], null],
	["invalid whitespace id", [" a"], ["a"], null],
	["uncertain proposal id", ["a"], [null], null],
]) test("Collection removal count: " + name, () => {
	const state = { review: { blobPresent: true, collections: remote.map(id => ({ id, title: "Same title" })) }, proposal: { intended: { collections: proposed.map(id => ({ id, title: "Renamed" })) } } };
	assert.equal(sendRemovalCount(state), expected);
});
test("a missing remote blob has no Collections to remove", () => assert.equal(sendRemovalCount({ review: { blobPresent: false, collections: null } }), 0));

const profile = { name: "Family cinema", index: 1 };
const attempt = (kind, observation, phase = "OUTCOME_UNKNOWN") => ({ phase, busy: false, dispatch: { count: 1, kind }, observation: { kind: observation }, baseline: { profile } });

const source = { provider: "community", title: "Preserved source" };
for (const [name, raw, expected] of [
	["zero folders", [{ id: "c", title: "Empty", folders: [] }], { collections: 1, folders: 0, sources: 0 }],
	["zero sources", [{ id: "c", title: "Empty folder", folders: [{ id: "f", title: "Folder", sources: [] }] }], { collections: 1, folders: 1, sources: 0 }],
	["multiple and nested", [{ id: "c", title: "One", folders: [{ id: "f", title: "A", sources: [source, source] }, { id: "g", title: "B", sources: [source] }] }, { id: "d", title: "Two", folders: [] }], { collections: 2, folders: 2, sources: 3 }],
	["long and hidden names", [{ id: "c", title: "A long Collection name ".repeat(30), folders: [{ id: "f", title: "\u200e", sources: [source] }] }], { collections: 1, folders: 1, sources: 1 }],
	["absent blob", null, { collections: 0, folders: 0, sources: 0 }],
]) test("Review comparison uses exact validated R0 and frozen P counts: " + name, () => {
	const controller = createBuilderController();
	assert.equal(controller.importValue(raw ?? [{ id: "p", title: "Proposal", folders: [] }]).ok, true);
	const prepared = prepareSendProposal(controller); assert.equal(prepared.ok, true);
	const target = { ...profile, index: 1 };
	const review = createSendBaseline({ authority: {}, snapshot: captureNuvioCollections(raw === null ? [] : [{ profile_id: 1, collections_json: raw }], target, "2026-09-24T00:00:00Z", { retainTimestampEvidence: true }) });
	const state = { review, proposal: prepared.proposal };
	const groups = sendReviewGroups(state);
	assert.deepEqual(groups.map(group => group.label), ["Nuvio now", "From Dingo"]);
	assert.equal(groups[0].counts, review.counts); assert.deepEqual(groups[0].counts, expected);
	assert.equal(groups[1].counts, prepared.proposal.intended.counts);
	assert.deepEqual(groups[1].counts, raw === null ? { collections: 1, folders: 0, sources: 0 } : expected);
	assert.equal(groups[0].collections, review.collections); assert.equal(groups[1].collections, prepared.proposal.intended.collections);
	controller.startNewProject({ discardChanges: true });
	assert.deepEqual(sendReviewGroups(state), groups, "Later local work cannot change either historical comparison");
});

test("reviewed no-op uses complete semantic contents and blob presence", () => {
	const proposed = [{ id: "c", folders: [], extra: null }];
	const state = { proposal: { intended: { collections: proposed } }, review: { blobPresent: true, collections: [{ extra: null, folders: [], id: "c" }] } };
	assert.equal(reviewedSendIsIdentical(state), true);
	assert.equal(reviewedSendIsIdentical({ ...state, review: { ...state.review, blobPresent: false } }), false);
	assert.equal(reviewedSendIsIdentical({ ...state, review: { blobPresent: true, collections: [{ id: "c", folders: [] }] } }), false);
});

for (const [phase, text] of [["PREFLIGHT", "Checking Nuvio…"], ["DISPATCHING", "Sending to Nuvio…"], ["VERIFYING", "Verifying Collections…"]]) {
	test(`Send progress explains ${phase}`, () => assert.equal(sendProgress({ phase }), text));
}

test("acknowledgement remains distinct from verification and conflicting contents", () => {
	assert.match(sendResult(attempt("acknowledged", "unavailable", "ACKNOWLEDGED")).text, /accepted.*couldn’t confirm/);
	assert.match(sendResult(attempt("acknowledged", "different", "CONFLICT")).text, /accepted.*differ/);
	assert.equal(sendStatusLabel(attempt("acknowledged", "unavailable", "ACKNOWLEDGED")), "Send accepted — check needed");
});

test("unknown previous and third state copy never asserts failed delivery", () => {
	for (const observation of ["previous", "different", "unavailable"]) {
		const result = sendResult(attempt("unknown", observation));
		assert.match(result.text, /can’t confirm whether/);
		assert.doesNotMatch(JSON.stringify(result), /send failed|Send again|Restore|cancelled/);
	}
	assert.match(sendResult(attempt("unknown", "previous")).observation, /may still have reached/);
	assert.match(sendResult(attempt("unknown", "different")).observation, /remains uncertain/);
});

test("verified copy identifies only the observed profile and rejected copy makes no replay offer", () => {
	assert.equal(sendResult(attempt("unknown", "intended", "VERIFIED")).text, "Your Collections are now on ‘Family cinema’ (Profile 1).");
	assert.match(sendResult(attempt("rejected", null, "REJECTED")).text, /rejected.*No automatic retry/);
});

test("predispatch failures give safe next steps without transport details", () => {
	assert.match(sendProblem({ phase: "REMOTE_CHANGED" }), /Review the latest Collections/);
	assert.match(sendProblem({ phase: "STALE_LOCAL" }), /Return to Export & Send/);
	assert.match(sendProblem({ error: "CANCELLED" }), /Nothing was sent/);
	assert.doesNotMatch(sendProblem({ error: "unexpected-private-error" }), /unexpected-private-error/);
});

test("strong success is exclusive to exact verified readback", () => {
	for (const state of [attempt("acknowledged", "unavailable", "ACKNOWLEDGED"), attempt("acknowledged", "different", "CONFLICT"), attempt("unknown", "previous"), attempt("unknown", "different", "CONFLICT"), attempt("rejected", null, "REJECTED")]) {
		assert.notEqual(sendResult(state).title, "Sent to Nuvio"); assert.notEqual(sendResult(state).success, true);
	}
	const verified = attempt("unknown", "intended", "VERIFIED");
	assert.equal(sendResult(verified).title, "Sent to Nuvio"); assert.equal(sendResult(verified).detail, "Verified with Nuvio.");
	assert.equal(sendStatusLabel(verified), "Sent to Nuvio");
});


test("active Send interaction locks preparation, review and every remote operation", () => {
	for (const phase of ["PREPARING", "PREFLIGHT", "DISPATCHING", "VERIFYING", "ACKNOWLEDGED"]) {
		assert.equal(sendInProgress({ phase, busy: true, dispatch: { count: phase === "PREFLIGHT" ? 0 : 1 } }), true);
	}
	for (const phase of ["REVIEWED", "NO_CHANGE", "REJECTED", "VERIFIED", "CONFLICT", "OUTCOME_UNKNOWN"]) {
		assert.equal(sendInProgress({ phase, busy: false }), false);
	}
	for (const busy of ["login", "profiles", "pin", "collections"]) assert.equal(sendInProgress({ busy: false }, { busy }), true);
	assert.equal(sendInProgress({ busy: false }, { busy: null }), false);
});

test("removal warnings identify the selected profile with safe singular, plural and fallback wording", () => {
	for (const [count, name, quantity] of [[1, "Dave", "1 Collection"], [16, "Family cinema", "16 Collections"], [1200, "A long profile name with favourites", "1,200 Collections"]]) {
		const warning = sendRemovalWarning(count, name);
		assert.ok(warning.includes(quantity) && warning.includes(name) && warning.includes("will be removed"));
	}
	assert.equal(sendRemovalWarning(0, "Dave"), null);
	assert.equal(sendRemovalWarning(null, "Dave"), "Collections not included in this Dingo project will be removed from this profile.");
});

test("Merge help explicitly identifies current Nuvio Collections and the local import then Send sequence", () => {
	for (const name of ["Dave", "Family cinema", "A very long profile name"]) {
		const help = sendMergeHelp(name);
		assert.ok(help.includes(`Collections already on ‘${name}’`));
		assert.match(help, /Import this profile into Dingo and merge it with your project first/);
		assert.match(help, /return to Export & Send to send the merged project/);
		assert.doesNotMatch(help, /Want to keep them/);
	}
});

test("preparation, review and connection progress have understandable status text", () => {
	assert.equal(sendProgress({ phase: "PREPARING", busy: true }), "Preparing replacement…");
	assert.equal(sendProgress({ phase: "PREPARING", busy: true, target: profile }), "Checking Nuvio…");
	for (const [busy, expected] of [["login", "Connecting to Nuvio…"], ["pin", "Checking PIN…"], ["profiles", "Checking Nuvio…"]]) assert.equal(sendProgress({ busy: false }, { busy }), expected);
});

test("verified history is quiet while unfinished dispatched evidence remains discoverable", () => {
	assert.equal(sendAttentionLabel(attempt("acknowledged", "intended", "VERIFIED")), null);
	assert.equal(sendAttentionLabel({ dispatch: { count: 0 } }), null);
	for (const phase of ["ACKNOWLEDGED", "CONFLICT", "OUTCOME_UNKNOWN"]) assert.equal(sendAttentionLabel(attempt("unknown", "unavailable", phase)), "Check Nuvio Send");
	assert.equal(sendAttentionLabel({ ...attempt("dispatching", null, "DISPATCHING"), busy: true }), "Send in progress");
});
