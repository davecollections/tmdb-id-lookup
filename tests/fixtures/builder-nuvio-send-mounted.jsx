import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBuilderController } from "../../builder/src/application/controller.js";
import { createCollectionExportPayload } from "../../builder/src/serialize/collection-export.js";
import { BuilderApp } from "../../builder/src/ui/BuilderApp.jsx";
import { ProfilePin } from "../../builder/src/ui/NuvioConnectionParts.jsx";
import { createMockNuvioApi } from "../helpers/nuvio-api.mjs";
import "../../builder/src/styles.css";

// Owner-authorized local Nuvio mechanics only. The production transport is
// injected with this fake service; no authenticated request reaches a network.
const $ = (selector) => document.querySelector(selector);
const assert = (value, message) => { if (!value) throw Error(message); };
const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
async function until(predicate) { const deadline = performance.now() + 6000; while (!predicate()) { if (performance.now() > deadline) throw Error(`Send UI did not settle: ${document.body.innerText}`); await frame(); } await frame(); }
async function click(node) { assert(node && !node.disabled, "Enabled action exists"); node.focus({ preventScroll: true }); node.click(); await frame(); }
const button = (text) => [...document.querySelectorAll("button")].find((node) => node.textContent.trim() === text);
const escape = async () => { document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await frame(); };
const modal = () => $("[data-export-collections]") ?? $("[data-nuvio-dialog]");
const phase = () => modal()?.dataset.sendPhase;
const account = { id: "11111111-1111-4111-8111-111111111111", email: "review@example.invalid" };
const primary = { id: "22222222-2222-4222-8222-222222222222", user_id: account.id, profile_index: 1, name: "Family cinema", pin_enabled: false, pin_locked_until: null, avatar_color_hex: "#1E88E5" };
const protectedA = { ...primary, id: "33333333-3333-4333-8333-333333333333", profile_index: 2, name: "Kids", pin_enabled: true };
const protectedB = { ...protectedA, id: "44444444-4444-4444-8444-444444444444", profile_index: 3, name: "Guest" };
const collections = (title = "Weekend favourites") => [{ id: "c", title, folders: [{ id: "f", title: "Family night", sources: [{ provider: "community", title: "Saved family catalogue", unknown: { keep: [false, null, 7] } }] }] }];
const current = [...collections("Popular movies"), { id: "c2", title: "World cinema", folders: [{ id: "f2", title: "Documentaries", sources: [] }] }];
let root, controller, api, behavior, wrote, held, release, downloads, downloadFailure;
const urls = new Map();
const createUrl = URL.createObjectURL.bind(URL);
const revokeUrl = URL.revokeObjectURL.bind(URL);
URL.createObjectURL = (blob) => { const url = createUrl(blob); urls.set(url, blob); return url; };
URL.revokeObjectURL = (url) => { revokeUrl(url); urls.delete(url); };
const anchorClick = HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click = function () {
	if (!this.download) return anchorClick.call(this);
	if (downloadFailure) throw Error("Local download initiation refused");
	downloads.push({ filename: this.download, blob: urls.get(this.href) });
};
// Any accidentally uninjected Nuvio request must fail the fixture, not go live.
const originalFetch = globalThis.fetch;
globalThis.fetch = (url, options) => { if (String(url).startsWith("https://api.nuvio.tv")) throw Error("Live Nuvio is forbidden in this fixture"); return originalFetch(url, options); };
const pushCount = () => api.requests.filter(({ url }) => url.endsWith("sync_push_collections")).length;

async function mount({ connected = false, missing = false, identical = false, mode = "verified", long = false } = {}) {
	if (root) { root.unmount(); api.connection.dispose(); await frame(); }
	controller = createBuilderController(); controller.importValue(collections());
	api = createMockNuvioApi({ account, profiles: [primary, protectedA, protectedB], collections: current, allowWrites: true });
	api.blobPresent = !missing;
	if (identical) api.collections = structuredClone(createCollectionExportPayload(controller)().collections);
	if (long) {
		api.profiles[0].name = "A very long family cinema profile with documentaries and favourites";
		api.collections = Array.from({ length: 1200 }, (_, index) => ({ id: `remote-${index}`, title: `Collection ${index + 1}: ${"A long preserved community Collection name ".repeat(3)}`, folders: [] }));
	}
	behavior = mode; wrote = false; held = null; release = null; downloads = []; downloadFailure = false;
	api.hook = (url, options) => {
		if (url.includes("grant_type=password") && behavior === "hold-login") { held = "login"; return new Promise(resolve => { release = () => resolve(Response.json(api.auth())); }); }
		if (url.endsWith("sync_pull_profiles") && behavior === "hold-profiles") { held = "profiles"; return new Promise(resolve => { release = () => resolve(Response.json(api.profiles)); }); }
		if (url.endsWith("verify_profile_pin") && behavior === "hold-pin") { held = "pin"; return new Promise(resolve => { release = (unlocked = true) => resolve(Response.json([{ unlocked, retry_after_seconds: 0 }])); }); }
		if (url.endsWith("sync_push_collections")) {
			wrote = true;
			if (behavior === "rejected") return new Response(null, { status: 403 });
			if (behavior.startsWith("unknown")) {
				if (behavior === "unknown-intended") api.collections = JSON.parse(options.body).p_collections_json;
				if (behavior === "unknown-third") api.collections = collections("Different Collections");
				throw Error("Locally simulated connection loss after dispatch");
			}
			if (behavior === "hold-write") { api.collections = JSON.parse(options.body).p_collections_json; held = "write"; return new Promise((resolve) => { release = () => resolve(new Response(null, { status: 204 })); }); }
		}
		if (url.endsWith("sync_pull_collections")) {
			if (behavior === "hold-preflight" || (wrote && behavior === "hold-verify")) {
				held = wrote ? "verify" : "preflight";
				return new Promise((resolve) => { release = () => resolve(Response.json([{ profile_id: JSON.parse(options.body).p_profile_id, collections_json: api.collections, updated_at: api.updatedAt }])); });
			}
			if (wrote && behavior === "ack-unverified") throw Error("Local read failure");
		}
	};
	if (connected) await api.connection.connect(account.email, "local-password");
	root = createRoot($("#root")); root.render(<StrictMode><BuilderApp controller={controller} nuvioConnection={api.connection} initialScreen="workspace" /></StrictMode>);
	await frame(); await click($("[data-action=open-export-collections]"));
	assert(document.querySelectorAll('[role="dialog"]').length === 1 && document.body.style.position === "fixed", "One Export shell and body lock");
}

async function enterSend() {
	const before = api.requests.length;
	await click($("[data-action=send-to-nuvio]")); await until(() => !api.connection.getState().busy);
	assert(document.querySelectorAll('[role="dialog"]').length === 1 && $(".workspace-underlay").inert, "Send replaces content in the same active shell");
	assert(document.activeElement === modal().querySelector("h2"), "Stage heading focus does not open the keyboard");
	if (api.connection.getState().status === "connected") assert(api.requests.length - before === 2, "Connected entry refreshes account/profiles without login");
}
async function login() {
	$("input[name=email]").value = account.email; $("input[name=password]").value = "local-password";
	$(".nuvio-login").requestSubmit(); assert($("input[name=password]").value === "", "Password cleared immediately");
	await until(() => api.connection.getState().status === "connected" && !api.connection.getState().busy);
}
async function select(profile = primary) { await click($(`input[value="${profile.id}"]`)); }
function enterPin(value) { const field = $("input[name=pin]"); field.focus({ preventScroll: true }); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(field, value); field.dispatchEvent(new Event("input", { bubbles: true })); return field; }
function pastePin(value) { const field = $("input[name=pin]"); field.focus({ preventScroll: true }); field.select(); const data = new DataTransfer(); data.setData("text/plain", value); field.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true })); return field; }
const pinCount = () => api.requests.filter(({ url }) => url.endsWith("verify_profile_pin")).length;
async function pin() { const field = enterPin("4826"); assert(field.value === "", "PIN clears immediately on complete entry"); await until(() => !api.connection.getState().busy); }
async function review() { await click(button("Review Collections")); await until(() => phase() === "REVIEWED"); }
async function ready(options) { await mount({ connected: true, ...options }); await enterSend(); await select(); await review(); }
async function submit() { await click($("[data-action=replace-nuvio-collections]")); }
async function assertActiveProgress() {
	assert(!button("Close") && !button("← Back") && !button("Done") && !modal().textContent.includes("You can close"), "Active progress presents no dismissal or close encouragement");
	assert(![...modal().querySelectorAll("button")].some(node => !node.disabled), "Active work presents no competing enabled action");
	assert($(".send-activity")?.getAttribute("aria-hidden") === "true" && modal().querySelector("[role=status]")?.textContent.trim(), "Decorative activity supports understandable status text");
	if (matchMedia("(prefers-reduced-motion: reduce)").matches) assert([...document.querySelectorAll(".send-activity > span")].every(node => getComputedStyle(node).animationName === "none"), "Reduced motion retains static activity");
	if (matchMedia("(forced-colors: active)").matches) assert([...document.querySelectorAll(".send-activity > span")].every(node => { const style = getComputedStyle(node); return style.borderStyle === "solid" && style.borderColor !== getComputedStyle(modal()).backgroundColor; }), "Forced colours retain visible system-colour activity outlines");
	const currentDialog = modal();
	await escape();
	$(".export-collections-backdrop").dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); await frame();
	assert(modal() === currentDialog && document.body.style.position === "fixed", "Escape and backdrop cannot dismiss active Send");
}
async function complete() { await until(() => !api.connection.getState().busy && ["VERIFIED", "ACKNOWLEDGED", "OUTCOME_UNKNOWN", "CONFLICT", "REJECTED", "NOT_SENT", "REMOTE_CHANGED"].includes(phase())); }

async function pinFlow(flow, mode = "verified") {
	await mount({ connected: true, mode });
	if (flow === "send") await enterSend();
	else { await click(button("Close")); await click($("[data-action=open-workspace-import]")); await click($("[data-action=open-nuvio-import]")); }
	await select(protectedA);
	assert(!$(".nuvio-pin button") && $("input[name=pin]").inputMode === "numeric", "Shared PIN has a numeric field and no Verify button");
}

async function runPinCases() {
	for (const flow of ["send", "import"]) {
		await pinFlow(flow, "hold-pin");
		for (const value of ["4", "48", "482"]) { enterPin(value); await frame(); assert(pinCount() === 0, flow + ": incomplete PIN never verifies"); }
		enterPin("48x2"); pastePin("48265"); assert($("input[name=pin]").value === "482" && pinCount() === 0, "Mixed/overlong entry is rejected without submitting a prefix");
		const field = enterPin("4826"); assert(field.value === "", "Complete PIN digits clear immediately"); await until(() => held === "pin");
		assert(field.disabled && $(".nuvio-pin").textContent.includes("Checking PIN…"), "Small checking state disables entry");
		enterPin("48265"); pastePin("4826"); field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
		controller.selectNode(controller.getState().project.collections[0].internalId); await frame();
		assert(pinCount() === 1 && field.value === "", "Fifth digit, paste, Enter and rerender cannot replay PIN");
		const finish = release; behavior = "verified"; finish(); await until(() => !api.connection.getState().busy);
		assert(api.connection.getProfileAccess(protectedA.id).unlocked && pinCount() === 1, "One completed entry records the exact-profile grant");
		assert(flow === "send" ? phase() === "REVIEWED" : $(".nuvio-review-profile")?.textContent.includes("Kids"), "PIN success advances directly to the existing Review");

		await pinFlow(flow); api.pinResult = [{ unlocked: false, retry_after_seconds: 0 }]; await pin();
		assert($("input[name=pin]").value === "" && document.activeElement === $("input[name=pin]") && $(".nuvio-pin [role=status]").textContent === "Incorrect PIN. Try again.", "Incorrect PIN clears, announces and restores input focus");
		await frame(); assert(pinCount() === 1, "Wrong PIN is never automatically retried");
		api.pinResult = [{ unlocked: true, retry_after_seconds: 0 }]; const pasted = pastePin("4826");
		pasted.dispatchEvent(new Event("input", { bubbles: true })); await until(() => !api.connection.getState().busy);
		assert(pinCount() === 2 && api.connection.getProfileAccess(protectedA.id).unlocked, "Fresh four-digit paste plus input verifies once and advances");

		await pinFlow(flow); api.pinResult = [{ unlocked: false, retry_after_seconds: 30 }]; await pin();
		assert($("input[name=pin]").disabled && $("input[name=pin]").value === "" && $(".nuvio-pin").textContent.includes("30 seconds"), "Lockout clears digits and prevents entry");
		pastePin("4826"); await frame(); assert(pinCount() === 1, "Lockout cannot produce a request storm");
		api.time += 30001; await until(() => !$("input[name=pin]").disabled); assert(pinCount() === 1, "Elapsed lockout awaits fresh digits");
		api.pinResult = [{ unlocked: true, retry_after_seconds: 0 }]; await pin(); assert(pinCount() === 2, "Fresh entry after authority cooldown may verify");

		await pinFlow(flow); enterPin("123"); await select(protectedB); assert($("input[name=pin]").value === "", "Changing target clears unsubmitted digits");
		await select(protectedA); enterPin("123"); api.profiles[1].updated_at = "2026-09-24T12:00:00Z"; await api.connection.refreshProfiles(); await frame();
		assert($("input[name=pin]").value === "", "Changed protection version clears an unsubmitted draft");
		enterPin("123"); api.connection.disconnect(); await frame(); assert(!$("input[name=pin]"), "Disconnect removes the transient PIN draft");
		await api.connection.connect(account.email, "local-password"); await frame(); await select(protectedA); assert($("input[name=pin]").value === "", "Relogin never restores digits");

		await pinFlow(flow, "hold-pin"); enterPin("4826"); await until(() => held === "pin"); const late = release;
		if (flow === "send") { await assertActiveProgress(); root.render(<p>Application interrupted</p>); await frame(); }
		else await click(button("Close"));
		late(); await frame();
		assert(!api.connection.getProfileAccess(protectedA.id).unlocked && !$("input[name=pin]"), "Genuine interruption/Import Close abandons the owned PIN response without a late grant or navigation");
	}
	for (const unlocked of [true, false]) {
		await pinFlow("send", "hold-pin"); enterPin("4826"); await until(() => held === "pin"); const late = release;
		// Replace the shared component's target while a request is held, beyond
		// the normal UI's disabled radio guard, to exercise stale response cleanup.
		const profile = api.connection.getState().profiles.find(entry => entry.id === protectedB.id);
		let advanced = 0; root.render(<StrictMode><ProfilePin key={profile.id} connection={api.connection} profile={profile} busy={false} feedback={null} id="race-pin" onVerified={() => { advanced++; }} /></StrictMode>); await frame();
		enterPin("13"); behavior = "verified"; late(unlocked); await frame();
		assert($("input[name=pin]").value === "13" && !api.connection.getProfileAccess(protectedA.id).unlocked && !api.connection.getProfileAccess(protectedB.id).unlocked, "Late A success/failure cannot grant B or erase its newer draft");
		pastePin("1357"); await until(() => !api.connection.getState().busy); assert(advanced === 1 && api.connection.getProfileAccess(protectedB.id).unlocked, "Only B's fresh entry may advance B");
	}
}

async function runMergeInsteadCases() {
	for (const profile of [primary, protectedA]) {
		await mount({ connected: true }); await enterSend(); await select(profile); if (profile.pin_enabled) await pin(); else await review();
		assert($(".send-consequence").textContent.includes(`1 Collection from ‘${profile.name}’ will be removed`) && button("Merge instead"), "Exact identity difference identifies the selected profile");
		assert($(".send-merge-alternative").textContent.includes(`Collections already on ‘${profile.name}’`) && $(".send-merge-alternative").textContent.includes("return to Export & Send to send the merged project"), "Merge explanation names the profile and the local import then Send sequence");
		const project = controller.getState().project, pins = pinCount(), logins = api.requests.filter(call => call.url.includes("grant_type")).length;
		api.collections.push({ id: "fresh", title: "Fresh since Review", folders: [] }); const remote = JSON.stringify(api.collections);
		await click(button("Merge instead")); await until(() => Boolean(api.connection.getState().snapshot));
		assert(document.querySelectorAll('[role="dialog"]').length === 1 && $("[data-nuvio-dialog]") && !$("[data-export-collections]") && document.body.style.position === "fixed" && $(".workspace-underlay").inert, "Merge transitions to one existing Import modal/focus/body lock");
		assert(controller.getState().project === project && pushCount() === 0 && pinCount() === pins && api.requests.filter(call => call.url.includes("grant_type")).length === logins, "Handoff reuses session/grant and makes zero remote writes or local changes");
		assert(api.connection.getState().snapshot.collections.some(collection => collection.id === "fresh"), "Import obtains a fresh snapshot through its existing safe read");
		assert(!$(".nuvio-import-modes input:checked") && button("Import to Dingo").disabled, "Existing Import review requires an explicit local mode");
		await click([...document.querySelectorAll(".nuvio-import-modes label")].find(node => node.textContent.includes("Merge exact matches")).querySelector("input"));
		assert(controller.getState().project === project && $(".nuvio-merge-preview"), "Choosing Merge only previews the existing algorithm");
		await click(button("Import to Dingo")); assert(controller.getState().project !== project && controller.getState().project.collections.length > project.collections.length && !modal(), "Only explicit Import applies the local merge");
		assert(pushCount() === 0 && JSON.stringify(api.collections) === remote, "Merge alternative never calls sync_push_collections or mutates the remote array");
	}
	for (const change of ["protection", "identity", "pin-version"]) {
		await mount({ connected: true }); await enterSend(); await select(change === "pin-version" ? protectedA : primary); if (change === "pin-version") await pin(); else await review();
		const project = controller.getState().project;
		if (change === "protection") api.profiles[0].pin_enabled = true;
		if (change === "identity") api.profiles[0].id = "55555555-5555-4555-8555-555555555555";
		if (change === "pin-version") api.profiles[1].updated_at = "2026-09-24T12:00:00Z";
		await click(button("Merge instead")); await until(() => !api.connection.getState().busy);
		assert(!api.connection.getState().snapshot && controller.getState().project === project && pushCount() === 0, "Changed identity/protection cannot bypass ordinary Import authority");
		if (change !== "identity") { assert($("input[name=pin]"), "Current protected profile requires fresh PIN authority"); await pin(); assert($(".nuvio-review-profile"), "Fresh valid PIN advances through normal Import review"); }
		else assert(api.connection.getState().status === "disconnected", "Replaced profile follows the existing identity failure policy");
	}
	for (const fallback of [false, true]) {
		await mount({ connected: true }); api.collections = [{ ...current[0], ...(fallback ? { id: null } : {}) }]; await enterSend(); await select(); await review();
		assert(!button("Merge instead"), "Zero/uncertain removals do not present an unproven merge nudge");
		assert(fallback ? $(".send-consequence")?.textContent === "Collections not included in this Dingo project will be removed from this profile." : !$(".send-consequence"), "Uncertain identities use generic warning; zero removes warning entirely");
	}
}

window.runSendLocalCases = async () => {
	await runPinCases();
	await runMergeInsteadCases();
	let blockedLive = false;
	try { await globalThis.fetch("https://api.nuvio.tv/rest/v1/rpc/sync_push_collections", { method: "POST" }); } catch { blockedLive = true; }
	assert(blockedLive, "Local fixture refuses even an uninjected production Nuvio transport request");
	await mount();
	assert(button("Send to NuvioReplace the Collections on a Nuvio profile.") && modal().querySelector("h2").textContent === "Export & Send", "Renamed export and primary Send action");
	assert(api.requests.length === 0, "Opening ordinary Export never contacts Nuvio");
	await click($("[data-action=download-collections-json]")); assert(downloads.length === 1 && api.requests.length === 0, "Manual download works disconnected");
	await enterSend(); await login();
	await click(button("Close")); assert(!modal() && api.connection.getState().status === "connected", "Close before dispatch retains a healthy connection");
	await click($("[data-action=open-export-collections]")); await enterSend(); await select(protectedA);
	assert(button("Review Collections").disabled, "Protected target needs its own PIN");
	await pin(); assert(phase() === "REVIEWED", "Valid PIN automatically advances to Send Review"); await click(button("← Back")); await select(protectedB);
	assert(api.connection.getProfileAccess(protectedA.id).unlocked && !api.connection.getProfileAccess(protectedB.id).unlocked, "B does not inherit or revoke A's grant");
	enterPin("123"); await select(protectedA);
	assert(!$("input[name=pin]") && !button("Review Collections").disabled, "Returning to A reuses its exact grant and discards unsubmitted B digits");
	await review(); assert(/Profile 2 · PIN verified/.test(modal().textContent), "Review shows slot and PIN evidence");
	const reviewedDialog = modal(); $(".export-collections-backdrop").dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); await frame();
	assert(modal() === reviewedDialog && document.body.style.position === "fixed", "Backdrop never dismisses or unlocks the modal");
	assert(modal().textContent.includes("Nuvio now") && modal().textContent.includes("From Dingo") && modal().textContent.includes("will be removed"), "Concise current/replacement review and consequence");
	await click(button("← Back")); api.profiles[1].updated_at = "2026-09-22T00:00:00Z"; await click(button("Refresh profiles")); await until(() => !api.connection.getState().busy);
	assert(!api.connection.getProfileAccess(protectedA.id).unlocked && $("input[name=pin]"), "Changed protection metadata revokes the old grant");
	await click(button("← Back")); assert(!$("[data-nuvio-send]") && document.querySelectorAll('[role="dialog"]').length === 1 && document.body.style.position === "fixed", "Back returns to Export inside one shell");
	await escape(); assert(!modal() && document.body.style.position !== "fixed", "Escape releases the shell");


	await ready({ identical: true }); assert(modal().textContent.includes("already matches") && !button("Replace Collections"), "Identical Review has no destructive action or fake success");
	assert(pushCount() === 0 && downloads.length === 0 && !modal().textContent.includes("Sent to Nuvio"), "No-op starts no downloads or write");
	assert(button("Done") && modal().querySelectorAll("button").length === 1 && !$(".send-activity"), "No-op has Done only and no activity visual");
	await click(button("Done")); assert(!modal(), "No-op Done dismisses");
	await ready({ missing: true }); await click($("[data-action=download-nuvio-backup]"));
	assert(await downloads[0].blob.text() === "[]" && pushCount() === 0 && phase() === "REVIEWED", "Absent blob optional backup is a plain empty array");

	await ready(); api.collections = structuredClone(createCollectionExportPayload(controller)().collections); await submit(); await complete();
	assert(phase() === "REMOTE_CHANGED" && downloads.length === 0 && pushCount() === 0, "Changed-to-intended still requires new Review");
	await click(button("Review latest Collections")); await until(() => phase() === "REVIEWED"); assert(!button("Replace Collections"), "Fresh identical Review is a no-op");
	await ready(); api.updatedAt = "2026-09-22T00:00:00Z"; await submit(); await complete();
	assert(phase() === "REMOTE_CHANGED" && !downloads.length && !pushCount(), "Timestamp-only change stops replacement");
	assert(modal().querySelector("h2").textContent === "Nuvio changed" && modal().textContent.includes("Nothing was replaced"), "Compact remote-change explanation");

	await ready();
	assert(!$("[data-nuvio-send] .nuvio-steps") && !modal().textContent.includes(account.email) && !button("Disconnect"), "Review omits journey/account/disconnect chrome");
	assert(!button("Replace Collections").disabled && downloads.length === 0, "Replace is usable without a backup");
	await submit(); await complete();
	assert(phase() === "VERIFIED" && pushCount() === 1 && downloads.length === 0, "A normal Send requires no download");

	await ready(); downloadFailure = true; await click($("[data-action=download-nuvio-backup]"));
	assert(phase() === "REVIEWED" && modal().textContent.includes("Backup download could not start") && !button("Replace Collections").disabled && !pushCount(), "Backup failure stays a utility failure");
	await submit(); await complete(); assert(phase() === "VERIFIED" && pushCount() === 1, "Backup failure cannot gate Send");

	await ready({ long: true }); const reviewedRaw = JSON.stringify(api.collections, null, 2); const requests = api.requests.length;
	await click($("[data-action=download-nuvio-backup]")); await click(button("Download backup again"));
	assert(downloads.length === 2 && downloads[0].filename === downloads[1].filename && downloads[0].filename.length > 100, "Long backup filename is stable");
	assert(await downloads[0].blob.text() === reviewedRaw && await downloads[1].blob.text() === reviewedRaw, "Backup and retry retain exact reviewed raw bytes");
	assert(api.requests.length === requests && !pushCount() && phase() === "REVIEWED", "Backup never requests, advances or changes Send state");
	assert(modal().textContent.includes("Backup download started.") && !/File saved|Backup complete/.test(modal().textContent), "Neutral download feedback");
	api.collections[0].title = "Remote edit after backup"; await submit(); await complete();
	assert(phase() === "REMOTE_CHANGED" && !pushCount(), "Changed remote contents invalidate optional backup Review");
	await click(button("Review latest Collections")); await until(() => phase() === "REVIEWED"); await click($("[data-action=download-nuvio-backup]"));
	assert((await downloads.at(-1).blob.text()).includes("Remote edit after backup"), "Fresh Review offers the new raw baseline");

	await ready(); const replaceButton = $("[data-action=replace-nuvio-collections]");
	replaceButton.click(); replaceButton.click(); await complete();
	assert(phase() === "VERIFIED" && pushCount() === 1, "Duplicate Replace dispatches once");
	assert(modal().querySelector("h2").textContent === "Sent to Nuvio" && modal().textContent.includes("Your Collections are now on ‘Family cinema’ (Profile 1).") && modal().textContent.includes("Verified with Nuvio."), "Strong success requires exact readback");
	assert(!button("Disconnect") && !button("Close") && button("Done") && modal().querySelectorAll("button").length === 1, "Verified success has Done only");
	await click(button("Done")); assert(!modal() && !$(".workspace-transfer-actions [data-action=open-nuvio-send-status]"), "Verified workspace has no extra status action");
	await click($("[data-action=open-export-collections]"));
	assert($(".send-last").textContent.includes("Family cinema · Profile 1") && $(".send-last").textContent.includes("Verified with Nuvio"), "Quiet Last Send identifies the frozen target");
	await click($("[data-action=view-send-status]")); assert(phase() === "VERIFIED", "Verified history remains inspectable from Export");

	for (const mode of ["rejected", "ack-unverified", "unknown-previous", "unknown-third", "unknown-intended"]) {
		await ready({ mode }); await submit(); await complete();
		const expected = { rejected: "REJECTED", "ack-unverified": "ACKNOWLEDGED", "unknown-previous": "OUTCOME_UNKNOWN", "unknown-third": "CONFLICT", "unknown-intended": "VERIFIED" }[mode];
		assert(phase() === expected && pushCount() === 1, `${mode}: independent outcome evidence`);
		assert((modal().querySelector("h2").textContent === "Sent to Nuvio") === (expected === "VERIFIED"), "Only exact verification presents strong success");
		assert(!/Retry Send|Send again|Restore backup|Send cancelled/.test(modal().textContent), "No unsafe resend, restore or cancellation claim");
		if (mode === "rejected") { assert(button("Done") && modal().querySelectorAll("button").length === 1 && !$(".send-activity"), "Rejected terminal result has Done only"); await click(button("Done")); assert(!modal(), "Rejected Done dismisses"); }
		if (["ack-unverified", "unknown-previous", "unknown-third"].includes(mode)) {
			assert(button("Check Nuvio again") && button("Close") && !button("Done") && !$(".send-activity"), "Stable unresolved result retains read-only checking and Close");
			await click(button("Close"));
			const attention = $(".workspace-transfer-actions .send-attention");
			assert(attention && !attention.classList.contains("export-entry-action") && attention.getBoundingClientRect().height >= 43, "Unfinished status uses a compact reachable attention control");
			await click(attention); assert(phase() === expected && button("Check Nuvio again"), "Attention reopens historical details and read-only check");
			if (mode === "unknown-previous") assert(modal().textContent.includes("previous Collections are visible"), "Previous observation does not claim failure");
			if (mode === "unknown-third") assert(modal().textContent.includes("Different Collections"), "Third state is explained");
			behavior = "hold-preflight"; api.collections = structuredClone(createCollectionExportPayload(controller)().collections);
			await click(button("Check Nuvio again")); await until(() => held); await assertActiveProgress();
			const finish = release; behavior = "verified"; finish(); await complete(); assert(phase() === "VERIFIED" && pushCount() === 1, "Checking resolves by reading only");
		}
	}

	await ready(); behavior = "hold-preflight"; await submit(); await until(() => held === "preflight");
	assert(phase() === "PREFLIGHT" && modal().textContent.includes("Checking Nuvio"), "Preflight progress announced");
	await assertActiveProgress(); assert(pushCount() === 0, "Checking remains before dispatch"); const endPreflight = release; behavior = "verified"; endPreflight(); await complete();
	assert(pushCount() === 1 && downloads.length === 0 && phase() === "VERIFIED", "Blocked dismissal does not cancel or duplicate Send");
	for (const action of ["Close", "Escape", "Back"]) {
		await ready();
		if (action === "Escape") await escape(); else await click(button(action === "Back" ? "← Back" : "Close"));
		assert(pushCount() === 0 && downloads.length === 0, action + " before Replace performs no write or download");
	}

	await ready({ mode: "hold-write" }); await submit(); await until(() => held === "write");
	assert(phase() === "DISPATCHING" && modal().textContent.includes("Sending to Nuvio"), "Dispatch progress");
	await assertActiveProgress();
	const endWrite = release;
	controller.updateNode(controller.getState().project.collections[0].internalId, { title: "Edited after dispatch" }); await frame();
	assert(phase() === "DISPATCHING", "Local content edit cannot change the in-flight proposal");
	// Genuine owner/application interruption bypasses normal modal interaction.
	controller.startNewProject({ discardChanges: true }); await frame();
	assert(!modal() && $(".send-attention"), "Application-owned dispatched evidence survives workspace replacement");
	await click($("[data-action=open-nuvio-send-status]")); assert(phase() === "DISPATCHING", "Reopen retains original pending attempt");
	await assertActiveProgress();
	endWrite(); await complete(); assert(phase() === "VERIFIED" && pushCount() === 1, "Readback retains original payload after project replacement");
	await click(button("Done"));
	assert(!$("[data-action=open-nuvio-send-status]") && $("[data-action=open-export-collections]"), "Verified history uses Export even after ordinary export eligibility is lost");
	await click($("[data-action=open-export-collections]")); await click($("[data-action=view-send-status]"));
	assert(phase() === "VERIFIED" && modal().textContent.includes("Family cinema"), "Project replacement retains verified historical target");
	await click(button("Done")); await click($("[data-action=return-builder-home]"));
	assert($("[data-builder-welcome]") && button("Export & Send"), "Welcome keeps a quiet Export entry for retained history");
	await click(button("Export & Send")); await click($("[data-action=view-send-status]"));
	assert(phase() === "VERIFIED", "Welcome Export can inspect retained history"); await click(button("Done"));

	await ready({ mode: "hold-verify" }); await submit(); await until(() => held === "verify");
	assert(phase() === "VERIFYING" && modal().textContent.includes("Verifying Collections"), "Readback progress"); await assertActiveProgress();
	const endVerify = release; behavior = "verified"; endVerify(); await complete();

	await ready({ mode: "unknown-previous" }); await submit(); await complete();
	api.connection.disconnect(); await frame(); assert(phase() === "OUTCOME_UNKNOWN", "Disconnect retains unknown outcome");
	await click(button("Check Nuvio again")); await login();
	assert(modal().textContent.includes("Original Send profile") && !button("Replace Collections"), "Reconnect can only check original target");
	await click(button("Check Nuvio again")); await complete(); assert(pushCount() === 1 && phase() === "OUTCOME_UNKNOWN", "Reconnect never revives a push");
	await escape(); await click($("[data-action=open-export-collections]"));
	assert($("[data-action=send-to-nuvio]").disabled && !$("[data-action=download-collections-json]").disabled && !$("[data-action=copy-collections-json]").disabled, "Unknown dispatch blocks new Send without blocking manual export");
	return { passed: true, mocked: true };
};

window.prepareSendScreen = async (screen) => {
	if (screen === "export" || screen === "connect") { await mount(); if (screen === "connect") await enterSend(); }
	else if (screen === "connecting") {
		await mount({ mode: "hold-login" }); await enterSend();
		$("input[name=email]").value = account.email; $("input[name=password]").value = "local-password"; $(".nuvio-login").requestSubmit(); await until(() => held === "login");
	}
	else if (["profiles-loading", "review-loading"].includes(screen)) {
		await mount({ connected: true }); await enterSend(); await select();
		behavior = screen === "profiles-loading" ? "hold-profiles" : "hold-preflight";
		await click(button(screen === "profiles-loading" ? "Refresh profiles" : "Review Collections")); await until(() => held);
	}
	else if (screen === "profiles" || screen.startsWith("pin")) {
		await mount({ connected: true, mode: screen === "pin-checking" ? "hold-pin" : "verified" }); await enterSend(); await select(screen.startsWith("pin") ? protectedA : primary);
		if (screen === "pin") { enterPin("482"); await frame(); }
		if (screen === "pin-checking") { enterPin("4826"); await until(() => held === "pin"); }
		if (["pin-incorrect", "pin-locked"].includes(screen)) { api.pinResult = [{ unlocked: false, retry_after_seconds: screen === "pin-locked" ? 30 : 0 }]; await pin(); }
	}
	else if (["no-removals", "removal-fallback"].includes(screen)) {
		await mount({ connected: true }); api.collections = screen === "no-removals" ? [structuredClone(current[0])] : [{ ...current[0], id: null }]; await enterSend(); await select(); await review();
	}
	else {
		await ready({ missing: screen === "missing", identical: screen === "identical", long: ["long-review", "backup", "details"].includes(screen), mode: ["unknown", "workspace-attention"].includes(screen) ? "unknown-previous" : ["ack-unverified", "rejected"].includes(screen) ? screen : "verified" });
		if (screen === "details") await click($(".send-review-details summary"));
		if (screen === "backup") await click($("[data-action=download-nuvio-backup]"));
		if (screen === "merge-review") { await click($("[data-action=merge-instead]")); await until(() => api.connection.getState().snapshot && !api.connection.getState().busy); }
		if (["checking", "sending", "verifying"].includes(screen)) {
			behavior = screen === "checking" ? "hold-preflight" : screen === "sending" ? "hold-write" : "hold-verify";
			await submit(); await until(() => held);
		}
		if (screen === "remote-changed") { api.updatedAt = "2026-09-22T00:00:00Z"; await submit(); await complete(); }
		if (["unknown", "verified", "rejected", "ack-unverified", "workspace-verified", "workspace-attention", "history"].includes(screen)) { await submit(); await complete(); }
	}

	if (screen.startsWith("workspace-") || screen === "history") {
		await click(button(screen === "workspace-attention" ? "Close" : "Done"));
		if (screen === "history") await click($("[data-action=open-export-collections]"));
		else {
			const attention = $(".workspace-transfer-actions .send-attention");
			assert(Boolean(attention) === (screen === "workspace-attention"), "Workspace attention appears only for unfinished state");
			assert(!modal() && document.body.style.position !== "fixed", "Workspace restored after result dismissal");
			assert(document.documentElement.scrollWidth <= innerWidth + 1, "Workspace status never causes horizontal overflow");
			if (attention) assert(attention.getBoundingClientRect().width < 190 && attention.getBoundingClientRect().height >= 43, "Attention remains compact with a full tap target");
			return { screen, width: innerWidth, height: innerHeight, workspace: true, passed: true };
		}
	}
	const dialog = modal(); const box = dialog.getBoundingClientRect();
	if (dialog.matches("[data-export-collections]")) assert(!dialog.querySelector(".export-diagnostics.warnings, .export-warning-group") && !/preservation warning|Ready to export with warnings/.test(dialog.textContent), "Export and Send Review omit informational preservation warnings");
	const owners = [dialog, ...dialog.querySelectorAll("*")].filter((node) => node.getClientRects().length && ["auto", "scroll"].includes(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight + 1);
	assert(document.querySelectorAll('[role="dialog"]').length === 1, `${screen}: one active modal`);
	assert(document.body.style.position === "fixed" && $(".workspace-underlay").inert, `${screen}: body locked and background inert`);
	assert(box.top >= -1 && box.bottom <= innerHeight + 1 && dialog.scrollWidth <= dialog.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1, `${screen}: viewport containment at ${innerWidth}×${innerHeight}`);
	assert(owners.length <= 1 && (!owners.length || owners[0].matches(".nuvio-dialog-content, .export-collections-content")), `${screen}: single content scroll owner`);
	const footer = dialog.querySelector("footer")?.getBoundingClientRect(); assert(!footer || footer.bottom <= innerHeight + 1, `${screen}: footer reachable`);
	assert([...dialog.querySelectorAll("button")].filter((node) => node.getClientRects().length).every((node) => node.getBoundingClientRect().height >= 43), `${screen}: 44px actions`);
	if (screen.startsWith("pin")) assert(Boolean($(".nuvio-pin.is-inline")) === (innerWidth >= 900) && document.querySelectorAll("input[name=pin]").length === 1 && !button("Verify PIN") && $("input[name=pin]").inputMode === "numeric", "Responsive PIN uses exactly one numeric form without Verify");
	if (!["export", "history", "details", "merge-review"].includes(screen) && innerWidth >= 768 && innerHeight >= 800 && getComputedStyle(document.documentElement).fontSize === "16px") assert(owners.length === 0, screen + ": ordinary desktop stage needs no internal scrolling");
	if (screen === "review") {
		assert(dialog.querySelectorAll(".send-comparison > section").length === 2 && dialog.querySelectorAll("[data-send-count]").length === 6 && dialog.querySelectorAll(".send-consequence").length === 1, "Six summary tiles and one consequence");
		const groups = [...dialog.querySelectorAll(".send-comparison > section")].map(node => node.getBoundingClientRect());
		assert(innerWidth >= 768 ? Math.abs(groups[0].top - groups[1].top) < 1 && groups[1].left > groups[0].right : groups[1].top > groups[0].bottom, "Desktop comparison side by side; phone stacked");
		assert([...dialog.querySelectorAll(".send-comparison-totals span")].map(node => node.textContent).join("|") === "Collections|Folders|Sources|Collections|Folders|Sources", "Stable generic category labels");
		assert([...dialog.querySelectorAll("[data-send-count]")].map(node => node.textContent).join("|") === "2|2|1|1|1|1", "Mounted tile values come from reviewed remote and frozen proposal");
		assert($(".send-consequence").textContent.includes("1 Collection from ‘Family cinema’ will be removed") && $("[data-action=merge-instead]"), "Exact singular removal and secondary Merge alternative");
		assert($("[data-send-comparison=current]").textContent.startsWith("Nuvio now") && $("[data-send-comparison=proposed]").textContent.startsWith("From Dingo"), "Explicit labels retain meaning without tint");
		if (!matchMedia("(forced-colors: active)").matches) assert(getComputedStyle($("[data-send-comparison=current] [data-send-count]").parentElement).backgroundColor !== getComputedStyle($("[data-send-comparison=proposed] [data-send-count]").parentElement).backgroundColor, "Current neutral and proposed cyan surfaces differ subtly");
	}
	if (screen === "details") {
		const groups = [...dialog.querySelectorAll(".send-detail-columns > section")].map(node => node.getBoundingClientRect());
		assert(innerWidth >= 768 ? Math.abs(groups[0].top - groups[1].top) < 1 : groups[1].top > groups[0].bottom, "Expanded Collection names align like their comparison groups");
	}
	if (["export", "history"].includes(screen) && !matchMedia("(forced-colors: active)").matches) {
		const primaryStyle = getComputedStyle($("[data-action=send-to-nuvio]"));
		for (const node of document.querySelectorAll(".export-manual-action")) assert(!node.disabled && getComputedStyle(node).opacity === "1" && getComputedStyle(node).backgroundColor !== primaryStyle.backgroundColor && getComputedStyle(node).borderColor !== primaryStyle.borderColor, "Manual JSON actions remain enabled with softer surfaces and borders than Send");
	}
	if (["review", "long-review", "backup"].includes(screen)) {
		const name = api.connection.getState().profiles[0].name;
		assert($(".send-consequence").textContent.includes(name) && $(".send-merge-alternative").textContent.includes(`Collections already on ‘${name}’`) && !modal().textContent.includes("Want to keep them"), "Review warning and merge explanation use the actual profile name");
		if (screen !== "review") assert($(".send-consequence").textContent.includes("1,200 Collections"), "Long Review uses exact plural removal count");
	}
	const active = ["connecting", "profiles-loading", "pin-checking", "review-loading", "checking", "sending", "verifying"].includes(screen);
	assert(Boolean($(".send-activity")) === active, `${screen}: activity appears only while work is active`);
	if (active) await assertActiveProgress();
	if (["review-loading", "checking", "sending", "verifying"].includes(screen)) {
		const heading = dialog.querySelector("h2"), support = $(".send-progress > p"), activity = $(".send-progress .send-activity");
		assert(getComputedStyle(heading).textAlign === "center" && getComputedStyle(support).textAlign === "center", "Active heading and supporting text are centered");
		const [headingBox, supportBox, activityBox] = [heading, support, activity].map(node => node.getBoundingClientRect());
		const center = box.left + box.width / 2;
		assert([headingBox, supportBox, activityBox].every(rect => Math.abs(rect.left + rect.width / 2 - center) <= 1) && activityBox.top >= supportBox.bottom, "Progress title, supporting line and dots form one centered vertical unit");
	}
	if (["review", "verified", "identical"].includes(screen)) assert(getComputedStyle(dialog.querySelector("h2")).textAlign !== "center", "Stable modal content keeps its approved alignment");
	if (screen === "export" && innerWidth === 393 && innerHeight === 900 && getComputedStyle(document.documentElement).fontSize === "16px") assert(box.height < 584, "Phone Export is materially shorter than the prior 624px warning-bearing view");
	if (["verified", "identical", "rejected"].includes(screen)) assert(button("Done") && dialog.querySelectorAll("button").length === 1, `${screen}: one Done dismissal`);
	return { screen, width: innerWidth, height: innerHeight, modalHeight: Math.round(box.height), words: dialog.innerText.trim().split(/\s+/).length, scrollOwners: owners.length, passed: true };

};
window.finishSendProgress = async (screen) => {
	const finish = release; behavior = "verified"; finish();
	if (["checking", "sending", "verifying"].includes(screen)) { await complete(); assert(phase() === "VERIFIED" && pushCount() === 1, "Active progress reaches a stable dismissible result once"); await click(button("Done")); }
	else { await until(() => !api.connection.getState().busy && (!["review-loading", "pin-checking"].includes(screen) || phase() === "REVIEWED")); assert(pushCount() === 0, "Connection/review work never dispatches"); await click(button("Close")); }
};
window.checkSendClosed = () => !modal() && document.body.style.position !== "fixed" && document.activeElement === $("[data-action=open-export-collections]");
window.prepareSendKeyboardConfirmation = async () => { await ready(); $("[data-action=replace-nuvio-collections]").focus(); };
window.checkSendKeyboardConfirmation = async () => { await complete(); return phase() === "VERIFIED" && pushCount() === 1; };
window.preparePinKeyboard = async (flow) => { await pinFlow(flow, "hold-pin"); $("input[name=pin]").focus(); };
window.checkPinKeyboard = async (digits) => {
	if (digits === 4) await until(() => held === "pin"); else await frame();
	return pinCount() === (digits === 4 ? 1 : 0) && $("input[name=pin]").value === (digits === 4 ? "" : "4826".slice(0, digits));
};
window.finishPinKeyboard = async (flow) => {
	const finish = release; behavior = "verified"; finish(); await until(() => !api.connection.getState().busy);
	return pinCount() === 1 && api.connection.getProfileAccess(protectedA.id).unlocked && (flow === "send" ? phase() === "REVIEWED" : Boolean($(".nuvio-review-profile")));
};
window.nuvioSendFixtureReady = true;
