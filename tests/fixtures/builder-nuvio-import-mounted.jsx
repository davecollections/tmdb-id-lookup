import { act, StrictMode, useLayoutEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { createBuilderController } from "../../builder/src/application/controller.js";
import { createNuvioConnection } from "../../builder/src/nuvio-connection/session.js";
import { creationOptionsForScope } from "../../builder/src/ui/creation-options.js";
import { BuilderApp } from "../../builder/src/ui/BuilderApp.jsx";
import { NuvioProfileAvatar } from "../../builder/src/ui/NuvioProfileAvatar.jsx";
import { useExactUrlPreviewFailure } from "../../builder/src/ui/exact-url-preview.js";
import "../../builder/src/styles.css";

// Owner-approved mocked Nuvio responses for this slice. These checks establish
// local UI/transport mechanics, not live account or external-service evidence.
const $ = (selector) => document.querySelector(selector);
const nuvioHost = () => $("[data-nuvio-dialog]") ?? $("[data-workspace-import]");
const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
const assert = (value, message) => { if (!value) throw new Error(message); };
async function until(predicate) {
	const deadline = performance.now() + 5000;
	while (!predicate()) { if (performance.now() > deadline) throw Error("Nuvio UI did not settle"); await frame(); }
	await frame();
}
const button = (text) => [...document.querySelectorAll("button")].find((node) => node.textContent.trim() === text);
async function click(node) { assert(node && !node.disabled, "Enabled action exists"); node.focus({ preventScroll: true }); node.click(); await frame(); }
const user = { id: "11111111-1111-4111-8111-111111111111", email: "review@example.invalid" };
const main = { id: "22222222-2222-4222-8222-222222222222", user_id: user.id, profile_index: 1, name: "Family cinema", avatar_color_hex: "#1E88E5", pin_enabled: false, pin_locked_until: null };
const profiles = [main, { ...main, id: "33333333-3333-4333-8333-333333333333", profile_index: 2, name: "Kids", pin_enabled: true }];
const incoming = [
	{ id: "c", title: "Weekend favourites", custom: { preserve: [1, false, null] }, folders: [{ id: "f", title: "Family night", sources: [{ provider: "tmdb", tmdbSourceType: "CUSTOM", title: "Saved family catalogue", custom: true }] }] },
	{ id: "c2", title: "Explore more", folders: [{ id: "f2", title: "Documentaries", sources: [{ provider: "community", title: "Saved documentaries" }] }, { id: "f3", title: "World cinema", sources: [{ provider: "community", title: "Saved world cinema" }] }] },
];
let root, controller, connection, now, requests, outcome, loginFailure, pullChange, pinOutcome, holdRequest, releaseRequest, reviewIncoming;

async function mount({ existing = false, screen = "welcome", result = "ready", open = true, matching = false, localOnly = false } = {}) {
	if (root) { root.unmount(); connection.dispose(); await frame(); }
	now = Date.parse("2026-09-19T08:30:00Z"); requests = []; loginFailure = false; pullChange = false; outcome = result;
	pinOutcome = "correct"; holdRequest = null; releaseRequest = null; reviewIncoming = incoming;
	controller = createBuilderController();
	if (existing) {
		controller.importValue([{ id: "c", title: "My current collection", folders: [{ id: "f", title: "Work in progress", sources: [] }] }]);
		controller.updateNode(controller.getState().project.collections[0].internalId, { title: "My edited collection" });
		if (matching) controller.importValue([incoming[0]], { discardChanges: true });
	}
	connection = localOnly ? createNuvioConnection() : createNuvioConnection({ now: () => now, fetchImpl: async (url, options) => {
		assert(new URL(url).origin === "https://api.nuvio.tv", "Credentials sent directly to Nuvio origin");
		assert(options.credentials === "omit" && options.cache === "no-store", "No cookies or response cache");
		requests.push({ url, method: options.method });
		if (holdRequest && url.includes(holdRequest)) { holdRequest = null; await new Promise(resolve => { releaseRequest = resolve; }); }
		if (url.includes("grant_type=password")) {
			if (loginFailure) return new Response("private-test-password private-test-token", { status: 400 });
			return Response.json({ access_token: "private-test-token", refresh_token: "private-test-refresh", token_type: "bearer", expires_in: 3600, user });
		}
		if (url.endsWith("/user")) return Response.json(user);
		if (url.endsWith("sync_pull_profiles")) return Response.json(pullChange ? [{ ...main, pin_enabled: true }, profiles[1]] : profiles);
		if (url.endsWith("verify_profile_pin")) {
			const params = JSON.parse(options.body);
			assert(params.p_profile_id === 2 && /^[0-9]{4}$/.test(params.p_pin), "PIN uses authenticated profile-index request body");
			assert(options.headers.Authorization === "Bearer private-test-token", "PIN is authenticated");
			return Response.json([{ unlocked: pinOutcome === "correct", retry_after_seconds: pinOutcome === "locked" ? 30 : 0 }]);
		}
		if (url.endsWith("sync_pull_collections")) {
			const index = JSON.parse(options.body).p_profile_id;
			assert([1, 2].includes(index), "Selected numeric profile index");
			if (outcome === "protection-change") pullChange = true;
			return Response.json(outcome === "missing" ? [] : [{ profile_id: index, collections_json: outcome === "empty" ? [] : outcome === "malformed" ? null : reviewIncoming, updated_at: "2026-09-19T08:20:00Z" }]);
		}
		throw Error("Unexpected endpoint");
	} });
	root = createRoot($("#root")); root.render(<StrictMode><BuilderApp controller={controller} initialScreen={screen} nuvioConnection={connection} /></StrictMode>);
	await frame();
	if (!open) return;
	if (screen === "workspace") await click($("[data-action=open-workspace-import]"));
	await click($("[data-action=open-nuvio-import]"));
	assert(document.activeElement === (screen === "workspace" ? $("[data-nuvio-stage-heading]") : $("[data-nuvio-dialog] h2")), "Heading focus avoids unexpected keyboard");
	assert(document.body.style.position === "fixed", "Modal locks the document");
	assert(($("[data-builder-welcome]") ?? $(".workspace-underlay")).inert, "Background is inert");
}

async function login() {
	const before = controller.getState();
	$("input[name=email]").value = user.email;
	$("input[name=password]").value = "private-test-password";
	$(".nuvio-login").requestSubmit();
	assert($("input[name=password]").value === "", "Password cleared at submission");
	await until(() => !connection.getState().busy);
	assert(controller.getState() === before, "Login does not mutate Builder state");
	assert(!/private-test-(password|token|refresh)/.test(document.body.innerHTML), "No credentials in rendered UI");
}

async function pull() {
	const before = controller.getState();
	assert(!$(".nuvio-profile-choice input:disabled"), "Protected profile stays selectable");
	await click($(".nuvio-choice input:not(:disabled)"));
	await click(button("Load Collections"));
	await until(() => !connection.getState().busy);
	assert(controller.getState() === before, "Pull does not mutate Builder state");
}

function geometry() {
	const dialog = nuvioHost(); const rect = dialog.getBoundingClientRect();
	const owners = [...dialog.querySelectorAll("*")].filter((node) => node.getClientRects().length && ["auto", "scroll"].includes(getComputedStyle(node).overflowY));
	assert(document.documentElement.scrollWidth <= innerWidth + 1 && dialog.scrollWidth <= dialog.clientWidth + 1, "No horizontal overflow");
	assert(rect.left >= 0 && rect.right <= innerWidth + 1 && rect.top >= 0 && rect.bottom <= innerHeight + 1, "Dialog fits viewport");
	assert(owners.length === 1 && owners[0] === dialog.querySelector(".nuvio-dialog-content"), "One content scroll owner");
	assert([...dialog.querySelectorAll("button")].filter((node) => node.getClientRects().length).every((node) => node.getBoundingClientRect().height >= 43), "Large action targets");
	return { width: innerWidth, height: innerHeight, scrollOwners: owners.length, overflow: false };
}

function EarlyAvatarError({ profile, failEarly = false }) {
	const host = useRef(null);
	useLayoutEffect(() => {
		// Fire while the child's URL-reset passive effect is still pending.
		if (failEarly) host.current.querySelector("img")?.dispatchEvent(new Event("error"));
	}, [profile.avatarUrl, failEarly]);
	return <div ref={host}><NuvioProfileAvatar profile={profile} /></div>;
}

function PreviewFailureProbe({ url, onCommit }) {
	const preview = useExactUrlPreviewFailure(url);
	useLayoutEffect(() => onCommit(preview));
	return null;
}

async function checkAvatarFallback() {
	const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
	globalThis.IS_REACT_ACT_ENVIRONMENT = true;
	const host = document.createElement("div"); document.body.append(host);
	const avatarRoot = createRoot(host);
	// Keep a real local URL: Vite may inline import.meta assets into data URLs,
	// where appending a replacement query corrupts the SVG payload.
	const avatarUrl = new URL("/builder/src/assets/builder-mark.svg", window.location.origin).href;
	const replacementUrl = `${avatarUrl}?replacement`;
	const profile = { name: "Family cinema", avatarUrl, avatarColor: "#1E88E5" };
	const fallback = () => !host.querySelector("img") && host.textContent === "FC";
	try {
		for (const url of [avatarUrl, replacementUrl]) {
			const image = new Image(); image.src = url;
			await image.decode();
		}
		await act(async () => avatarRoot.render(<EarlyAvatarError profile={profile} failEarly />));
		assert(fallback(), "An avatar failure before mount passive effects must survive React settling");
		assert(host.querySelector(".nuvio-avatar").style.backgroundColor === "rgb(30, 136, 229)", "Nuvio color fallback");

		await act(async () => avatarRoot.render(<EarlyAvatarError profile={{ ...profile, avatarUrl: replacementUrl }} />));
		assert(host.querySelector("img")?.getAttribute("src") === replacementUrl, "A replacement URL gets a fresh image attempt");
		await act(async () => host.querySelector("img").dispatchEvent(new Event("error")));
		assert(fallback(), "An avatar failure after passive effects becomes initials");
		await act(async () => avatarRoot.render(<EarlyAvatarError profile={profile} failEarly />));
		assert(fallback(), "An avatar failure before URL-change passive effects must survive React settling");
		await act(async () => avatarRoot.render(<EarlyAvatarError profile={profile} />));
		assert(fallback(), "Rerendering the same failed URL must not retry a broken image");

		await act(async () => avatarRoot.render(<EarlyAvatarError profile={{ ...profile, avatarUrl: replacementUrl }} />));
		await act(async () => avatarRoot.render(<EarlyAvatarError profile={profile} />));
		assert(host.querySelector("img")?.getAttribute("src") === avatarUrl, "Returning to an earlier URL starts a fresh attempt");
		await act(async () => avatarRoot.render(<EarlyAvatarError profile={{ name: "Guest", avatarUrl: null, avatarColor: null }} />));
		assert(host.textContent === "G" && !host.querySelector(".nuvio-avatar").style.backgroundColor, "Initials fallback without color");

		let currentPreview;
		const capture = (preview) => { currentPreview = preview; };
		await act(async () => avatarRoot.render(<PreviewFailureProbe url={avatarUrl} onCommit={capture} />));
		const oldPreview = currentPreview;
		await act(async () => avatarRoot.render(<PreviewFailureProbe url={replacementUrl} onCommit={capture} />));
		await act(async () => currentPreview.markFailed());
		assert(currentPreview.failed, "The current URL records its failure");
		await act(async () => oldPreview.markFailed());
		assert(currentPreview.failed, "A stale error must not clear the current URL's failure");
		await act(async () => oldPreview.resetFailure());
		assert(currentPreview.failed, "A stale reset must not clear the current URL's failure");
		await act(async () => currentPreview.resetFailure());
		assert(!currentPreview.failed, "An explicit retry resets the current URL");
	} finally {
		await act(async () => avatarRoot.unmount());
		host.remove();
		globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
	}
}

window.runNuvioLocalCases = async () => {
	await checkAvatarFallback();
	await mount(); await login();
	assertSharedButton($("[aria-label='Close Nuvio import']"), "add-source-header-action add-source-close-action");
	assert(button("Disconnect").classList.contains("secondary-action"), "Disconnect extends the shared secondary action");
	await click($("input[value='33333333-3333-4333-8333-333333333333']"));
	assert($(".nuvio-lock").dataset.unlocked === "false", "Unverified profile keeps the closed lock");
	assert($("input[name=pin]") && button("Load Collections").disabled, "Protected selection prompts PIN before any pull");
	assert(button("Refresh profiles").closest(".nuvio-profile-heading") && button("Load Collections").closest("footer"), "Refresh is near heading; Load is in footer");
	assertFooter("Load Collections");
	pinOutcome = "wrong"; await submitPin();
	assert($(".nuvio-pin").textContent.includes("Incorrect PIN. Try again.") && button("Load Collections").disabled && document.activeElement === $("input[name=pin]"), "Incorrect PIN remains locked and refocuses fresh entry");
	pinOutcome = "locked"; await submitPin();
	assert($(".nuvio-pin").textContent.includes("30 seconds") && $("input[name=pin]").disabled, "Server retry-after represented");
	now += 30001; await new Promise((resolve) => setTimeout(resolve, 1100));
	assert(!$("input[name=pin]").disabled, "Lockout expires locally without requests");
	pinOutcome = "correct"; await submitPin();
	assert(connection.getProfileAccess("33333333-3333-4333-8333-333333333333").unlocked && $(".nuvio-review-profile"), "Correct PIN automatically loads the exact protected profile");
	assert($(".nuvio-review-profile").textContent.includes("Kids"), "Protected profile snapshot reviewed");
	const protectedCalls = requests.length; now += 3600001; connection.checkExpiry(); await frame();
	await click(button("Import to Dingo"));
	assert(requests.length === protectedCalls, "Protected snapshot imports after expiry without requests");
	assert(!/4826|p_pin/.test(JSON.stringify(controller.getState().project)), "PIN never enters imported data");
	assertWorkspaceStatus();
	controller.selectNode(controller.getState().project.collections[0].internalId); await frame();
	window.scrollTo(0, 20); await frame();
	assert($(".nuvio-import-status"), "Selection, scrolling and repaint retain success");
	controller.updateNode(controller.getState().project.collections[0].internalId, { title: "Working on my import" }); await frame();
	assert(!$(".nuvio-import-status"), "First content-changing action clears success");
	await mount(); loginFailure = true; await login();
	assert($("[role=alert]").textContent.includes("could not sign you in"), "Safe login failure");
	loginFailure = false; await login(); await pull();
	const snapshot = connection.getState().snapshot; const requestCount = requests.length;
	now += 3600001; connection.checkExpiry(); await frame();
	assert(connection.getState().snapshot === snapshot && button("Import to Dingo").disabled === false, "Snapshot import remains enabled after expiry");
	await click(button("Import to Dingo"));
	assert(requests.length === requestCount, "Local import has no network requests");
	assert(controller.getState().project.collections.length === 2 && !$("[data-nuvio-dialog]"), "Home import enters workspace");
	assert(controller.getState().project.collections[0].rawImported.custom.preserve[1] === false, "Unknown fields preserved");
	assert(document.activeElement === $("[data-builder-shell] h1"), "Import focuses workspace heading");
	await click($("[data-action=open-workspace-import]"));
	await click($("[data-action=open-nuvio-import]"));
	assert($(".nuvio-login"), "Next network operation requires login after expiry");
	await click(button("Disconnect"));
	assert(controller.getState().project.collections.length === 2, "Disconnect preserves imported project");
	await click($("[aria-label='Close Import']"));
	assert(document.activeElement === $("[data-action=open-workspace-import]"), "Close restores exact workspace trigger");

	await mount({ existing: true, screen: "workspace" }); await login(); await pull();
	const original = controller.getState().project; const beforeRevision = controller.getState().revision;
	assert(button("Import to Dingo").disabled, "Existing work requires explicit destination choice");
	await click([...document.querySelectorAll(".nuvio-choice")].find((node) => node.textContent.includes("Add as separate Collections")).querySelector("input"));
	assert($(".import-compatibility").textContent.includes("Some Sources have limited editing") && !$(".import-notable"), "Routine compatibility is quiet");
	assert($(".import-compatibility p").textContent === "Their Source settings can't be edited in Dingo. Collection and Folder details remain editable.", "Short review compatibility copy");
	assert(!button("Choose another profile") && !button("Import + download backup"), "Review has no superseded actions");
	const back = [...nuvioHost().querySelectorAll(".nuvio-dialog-header button, .nuvio-flow-back button")].find((node) => node.textContent.includes("Back"));
	assertSharedButton(back, "add-source-header-action");
	assert($(".nuvio-review time").parentElement.textContent.startsWith("Last updated in Nuvio:"), "Last updated label");
	assert(/^19 Sept 2026, \d{1,2}:\d{2} [ap]m$/.test($(".nuvio-review time").textContent), "Deterministic Australian date without seconds");
	assert($(".import-notice-details summary").textContent === "View import notes" && !$(".import-notice-details").open, "Grouped notes are quiet");
	await click($(".import-notice-details summary"));
	assert($(".import-notice-details").textContent.includes("3 Sources kept with limited editing") && !/UNSUPPORTED|\$\[|rawImported/.test($(".import-notice-details").textContent), "Grouped counts replace raw diagnostics");
	assertFooter("Import to Dingo");
	const calls = requests.length;
	now += 3600001; connection.checkExpiry(); await frame();
	const action = button("Import to Dingo"); action.click(); action.click(); await frame();
	assert(controller.getState().project.collections[0] === original.collections[0], "Add preserves existing Collection reference");
	assert(controller.getState().project.collections.length === 3 && controller.getState().revision === beforeRevision + 1, "Double click appends once atomically");
	assert(controller.getState().project.collections[1].editable.id !== "c", "Incoming ID conflicts repaired");
	assert(requests.length === calls, "Expired import makes no requests");

	await mount({ existing: true, screen: "workspace" }); await login(); await pull();
	const replaceBefore = controller.getState().project;
	await click([...document.querySelectorAll(".nuvio-choice")].find((node) => node.textContent.includes("Replace current project")).querySelector("input"));
	await click(button("Import to Dingo"));
	assert($(".nuvio-replace-confirmation") && controller.getState().project === replaceBefore, "Replace requires confirmation before mutation");
	await click(button("Keep current work")); assert(controller.getState().project === replaceBefore, "Cancel retains all work");
	await click(button("Import to Dingo")); await click(button("Replace current project"));
	assert(controller.getState().project.collections.length === 2 && !controller.getState().dirty, "Confirmed replacement uses normal import baseline");

	await checkLanding();
	await checkMerge();

	for (const result of ["missing", "empty", "malformed", "protection-change"]) {
		await mount({ existing: true, screen: "workspace", result }); await login(); await pull();
		assert(controller.getState().project.collections.length === 1, "Failed/empty pulls preserve existing work");
		if (["missing", "empty"].includes(result)) {
			assert(connection.getState().snapshot.kind === result, "Distinct missing/empty states");
			assert(button("Import to Dingo").disabled, "No empty-profile import");
		} else assert(!connection.getState().snapshot && $("[role=alert]"), "Unsafe pull fails closed");
		await click(button("Disconnect")); assert(!connection.getState().account && !connection.getState().snapshot, "Disconnect clears connection and review");
	}
	assert(localStorage.length === 0 && sessionStorage.length === 0, "No browser storage used");
	return { passed: true, mocked: true };
};

window.runWelcomeLayoutCases = async () => { await checkAvatarFallback(); return checkLanding(); };
window.prepareNuvioScreen = async (stage = "review") => {
	if (stage.startsWith("landing")) {
		await mount({ open: false, localOnly: true });
		if (stage === "landing-nuvio") {
			const landing = landingGeometry();
			await click($("[data-action=open-nuvio-import]"));
			assert($(".nuvio-login"), "Production disconnected login appears without an external request");
			const reassurance = $(".nuvio-login .nuvio-notice");
			assert(reassurance?.textContent === "Your login details go directly to Nuvio and aren't saved by Dingo. Dingo keeps the connection only while this page is open, and your Nuvio Collections won't be changed.", "Security reassurance keeps the exact approved wording");
			assert(!reassurance.hasAttribute("role") && !reassurance.querySelector("svg, img") && !reassurance.classList.contains("is-error"), "Reassurance stays quiet information without warning semantics or icons");
			const reassuranceStyle = getComputedStyle(reassurance);
			assert(["Top", "Right", "Bottom", "Left"].every(side => reassuranceStyle["border" + side + "Width"] === "1px"), "Reassurance uses an even thin Builder notice border");
			assert(reassuranceStyle.backgroundColor !== getComputedStyle($("[data-nuvio-dialog]")).backgroundColor && parseFloat(reassuranceStyle.fontSize) < parseFloat(getComputedStyle($(".nuvio-login label")).fontSize), "Reassurance has a quiet inset surface and smaller text");
			assert(reassurance.scrollWidth <= reassurance.clientWidth && reassurance.scrollHeight <= reassurance.clientHeight, "Reassurance wraps naturally without clipping");
			const journey = $(".nuvio-steps");
			assert(journey.querySelector("[aria-current=step]").textContent === "Connect", "Connect is the current journey stage");
			assert(!journey.querySelector("button, a, [tabindex]") && journey.children.length === 3, "Journey labels are not clickable navigation");
			assert([...journey.children].every(node => getComputedStyle(node).textDecorationLine === "none" && node.getBoundingClientRect().right <= innerWidth), "Journey is readable without tab-strip underlines or overflow");
			assert($(".welcome-import-content").getBoundingClientRect().height === landing.panelHeight, "Dialog preserves the landing panel footprint");
			return { ...landing, ...geometry() };
		}
		if (stage !== "landing") await click($(`[data-action=choose-import-${stage.slice(8)}]`));
		return landingGeometry();
	}
	// Keep the established standalone matrix; the dedicated workspace suite
	// independently covers embedded stages and their narrower content panel.
	await mount({ existing: !["login", "landing"].includes(stage), screen: stage === "workspace" ? "workspace" : "welcome", open: stage !== "landing", matching: ["review", "workspace"].includes(stage) });
	if (stage === "landing") return landingGeometry();
	if (stage !== "login") await login();
	if (stage === "profiles") await click($(".nuvio-profile-choice input"));
	if (["pin-verified", "pin-locked"].includes(stage)) {
		await click($("input[value='33333333-3333-4333-8333-333333333333']"));
		if (stage === "pin-locked") { pinOutcome = "locked"; await submitPin(); }
		if (stage === "pin-verified") { await submitPin(); await click(button("← Back")); assert($(".nuvio-lock").dataset.unlocked === "true", "Back retains the exact profile grant and open lock"); }
	}
	if (["review", "expired", "replace", "workspace"].includes(stage)) {
		await pull();
		await click([...document.querySelectorAll(".nuvio-choice")].find((node) => node.textContent.includes(stage === "replace" ? "Replace current project" : stage === "review" || stage === "workspace" ? "Merge exact matches" : "Add as separate Collections")).querySelector("input"));
		if (stage === "replace") await click(button("Import to Dingo"));
		if (stage === "expired") { now += 3600001; connection.checkExpiry(); await frame(); }
		if (stage === "workspace") {
			await click(button("Import to Dingo"));
			assertWorkspaceStatus();
			const actions = [...document.querySelectorAll(".workspace-transfer-actions button")].map((node) => node.getBoundingClientRect());
			if (innerWidth >= 900) assert(actions[0].top === actions[1].top && actions[0].right <= actions[1].left, "Desktop Import and Export share a row");
			assert(actions.every((rect) => rect.height >= 44), "Workspace actions keep tap targets");
			assert(document.documentElement.scrollWidth <= innerWidth + 1, "Workspace has no horizontal overflow");
			return { width: innerWidth, height: innerHeight, overflow: false };
		}
	}
	nuvioHost().querySelector("h2").focus({ preventScroll: true });
	for (const avatar of document.querySelectorAll(".nuvio-avatar")) assert(avatar.getBoundingClientRect().width === 38, "Profile and Review avatars use 38px");
	for (const card of document.querySelectorAll(".nuvio-profile-choice")) if (!card.querySelector(".nuvio-pin.is-inline .nuvio-muted")) assert(card.getBoundingClientRect().height <= 76, "Avatars retain compact profile rows");
	const selectedCard = $(".nuvio-choice[data-selected=true]");
	if (selectedCard) {
		assert(getComputedStyle(selectedCard, "::after").content === "none", "No bespoke second selection border");
		assert(getComputedStyle(selectedCard).outlineStyle === "none", "Selected state does not imply keyboard focus");
		assert(getComputedStyle(selectedCard).boxShadow.includes("inset"), "Shared selected state retains its structural inset");
	}
	nuvioHost().querySelector(".nuvio-dialog-content").scrollTop = stage === "review" ? nuvioHost().querySelector(".nuvio-dialog-content").scrollHeight : 0; await frame();
	return geometry();
};
window.checkNuvioClosed = () => !nuvioHost() && document.body.style.position !== "fixed" && document.activeElement === ($("[data-action=open-workspace-import]") ?? $("[data-action=open-nuvio-import]"));
window.nuvioFixtureReady = true;

// Workspace checks exercise only local project JSON and the real, unsubmitted
// Nuvio login surface. No injected external transport or fabricated media URLs.
const workspaceIncoming = [{ id: "local-c", title: "Movie nights", future: "incoming", folders: [
	{ id: "local-a", title: "Classics", coverEmoji: "📽️", sources: [] },
	{ id: "local-b", title: "Discover", coverEmoji: "🎬", sources: [{ provider: "tmdb", tmdbSourceType: "CUSTOM", title: "Preserved source" }] },
	{ id: "local-cf", title: "Favourites", coverEmoji: "🍿", sources: [] },
] }];
const workspaceExisting = [{ ...workspaceIncoming[0], future: "existing", folders: workspaceIncoming[0].folders.map((folder, index) => ({ ...folder, coverEmoji: ["🎞️", null, "🍿"][index] })) }];
const workspaceDialog = () => $("[data-workspace-import]");
const importTrigger = () => $("[data-action=open-workspace-import]");
async function mountWorkspaceImport({ empty = false, open = true } = {}) {
	await mount({ open: false, screen: "workspace", localOnly: true });
	if (!empty) { assert(controller.importValue(workspaceExisting).ok, "Local baseline imported"); await frame(); }
	assert(importTrigger().textContent === "Import" && importTrigger().getAttribute("aria-haspopup") === "dialog", "Workspace trigger has the correct accessible name");
	if (open) await click(importTrigger());
}
async function setWorkspaceText(text) {
	const field = $("#builder-import-text");
	Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(field, text);
	field.dispatchEvent(new Event("input", { bubbles: true })); await frame();
}
async function setWorkspaceFile(value = workspaceIncoming) {
	const data = new DataTransfer(); const file = new File([JSON.stringify(value)], "movie-nights.json", { type: "application/json" }); data.items.add(file);
	const input = $("#builder-import-file"); input.files = data.files; input.dispatchEvent(new Event("change", { bubbles: true })); await frame(); return file;
}
async function workspaceReview(method = "json") {
	await click($(`[data-action=choose-import-${method}]`));
	if (method === "file") await setWorkspaceFile(); else await setWorkspaceText(JSON.stringify(workspaceIncoming, null, 2));
	await click(button(method === "file" ? "Review selected file" : "Review pasted JSON"));
	await until(() => workspaceDialog().querySelector(".nuvio-review"));
}
async function workspaceChoice(value) {
	await click(workspaceDialog().querySelector(`input[type=radio][value="${value}"]`));
}
function artworkCountsText() { return workspaceDialog().querySelector("[data-artwork-counts]").textContent; }
function workspaceGeometry() {
	const modal = $("[data-nuvio-dialog]") ?? workspaceDialog(); const rect = modal.getBoundingClientRect();
	const content = modal.querySelector(".nuvio-dialog-content");
	const owners = [...modal.querySelectorAll("*")].filter((node) => node.getClientRects().length && node.tagName !== "TEXTAREA" && ["auto", "scroll"].includes(getComputedStyle(node).overflowY));
	assert(document.documentElement.scrollWidth <= innerWidth + 1 && modal.scrollWidth <= modal.clientWidth + 1, "Import has no horizontal overflow");
	assert(rect.top >= -1 && rect.bottom <= innerHeight + 1 && rect.left >= -1 && rect.right <= innerWidth + 1, "Import fits the visible viewport");
	assert(owners.length === 1 && owners[0] === content, "Import has one content scroll owner");
	assert([...modal.querySelectorAll("button, .nuvio-choice")].filter(node => node.getClientRects().length).every(node => node.getBoundingClientRect().height >= 43), "Visible actions retain touch targets");
	assert(document.querySelectorAll('[role="dialog"][aria-modal="true"]').length === 1, "Only one active dialog");
	const footer = modal.querySelector(".nuvio-dialog-footer");
	if (footer) assert(footer.getBoundingClientRect().bottom <= innerHeight + 1, "Footer remains reachable");
	return { passed: true, width: innerWidth, height: innerHeight, scrollOwner: true };
}

window.runWorkspaceImportCases = async () => {
	await mountWorkspaceImport(); const initial = controller.getState(); const trigger = importTrigger();
	assert([...workspaceDialog().querySelectorAll(".welcome-import-methods strong")].map(n => n.textContent).join("|") === "Import from Nuvio|Import from file|Import from JSON", "Method order matches Welcome");
	await click($("[data-action=choose-import-file]")); const chosen = await setWorkspaceFile(); const fileInput = $("#builder-import-file");
	await click($("[data-action=choose-import-json]")); await setWorkspaceText("retained draft");
	await click($("[data-action=open-nuvio-import]"));
	assert($(".nuvio-login") && !$("[data-nuvio-dialog]") && document.querySelectorAll('[role="dialog"]').length === 1, "Real Nuvio login is embedded in the existing Import shell");
	await click($("[data-action=choose-import-json]"));
	assert(document.activeElement === $("#builder-import-json-panel h3"), "Method switching focuses its visible heading");
	assert($("#builder-import-text").value === "retained draft" && $("#builder-import-file") === fileInput && fileInput.files[0] === chosen, "Both local drafts and native file survive handoff");
	await click(button("Cancel")); assert(controller.getState() === initial && document.activeElement === trigger && !document.body.style.position, "Cancel is nonmutating and restores Import focus/body");
	for (const method of ["file", "json"]) for (const mode of ["add", "merge", "replace"]) {
		await mountWorkspaceImport(); const before = controller.getState(); await workspaceReview(method);
		assert(controller.getState() === before && button("Import to Dingo").disabled, "Local review precedes mutation and requires a choice");
		const reviewNode = workspaceDialog().querySelector(".nuvio-review");
		$("#builder-import-file-panel").requestSubmit(); $("#builder-import-json-panel").requestSubmit(); await frame();
		assert(workspaceDialog().querySelector(".nuvio-review") === reviewNode && controller.getState() === before, "Hidden local forms cannot replace an active review");
		assert(workspaceDialog().textContent.includes("Some Sources have limited editing"), "Local warnings remain visible");
		await workspaceChoice(mode);
		assert(Boolean(workspaceDialog().querySelector(".merge-artwork-policies")) === (mode === "merge"), "Artwork appears only for Merge");
		if (mode === "merge") {
			assert(workspaceDialog().querySelector('input[value="keep-existing"]').checked, "Keep existing defaults");
			assert(artworkCountsText().includes("2 existing fields kept · 0 missing fields filled · 0 existing fields replaced"), "Keep counts are fields");
			await workspaceChoice("fill-missing"); assert(artworkCountsText().includes("2 existing fields kept · 1 missing field filled · 0 existing fields replaced"), "Fill changes preview without replacement");
			await workspaceChoice("prefer-incoming"); assert(artworkCountsText().includes("1 existing field kept · 1 missing field filled · 1 existing field replaced"), "Prefer separates fills/replacements");
			assert(controller.getState() === before, "Policy switching is preview-only");
			await workspaceChoice("add"); assert(!workspaceDialog().querySelector(".merge-artwork-policies"), "Add hides retained policy");
			await workspaceChoice("merge"); assert(workspaceDialog().querySelector('input[value="prefer-incoming"]').checked, "Same snapshot retains reviewed policy");
		}
		await click(button("Import to Dingo"));
		if (mode === "replace") {
			assert(controller.getState() === before && document.activeElement === button("Keep current work"), "Replace starts on the safe action and is not applied early");
			await click(button("Keep current work")); assert(controller.getState() === before, "Keep current work cancels Replace");
			await click(button("Import to Dingo")); await click(button("Replace current project"));
		}
		assert(!workspaceDialog() && controller.getState().revision === before.revision + 1, "Final Apply commits one revision and closes");
		assert(document.activeElement === importTrigger(), "Apply restores Import focus even after project replacement remounts the workspace");
		const project = controller.getState().project;
		assert(project.collections.length === (mode === "add" ? 2 : 1), "Exact chosen mode applied");
		if (mode === "merge") assert(project.collections[0].folders[0].editable.coverEmoji === "📽️" && project.collections[0].rawImported.future === "existing", "Exact reviewed policy applied with raw evidence preserved");
	}
	await mountWorkspaceImport(); await workspaceReview(); await workspaceChoice("merge"); await workspaceChoice("prefer-incoming");
	await click([...workspaceDialog().querySelectorAll("button")].find(n => n.textContent.includes("Back")));
	await setWorkspaceText(JSON.stringify(workspaceIncoming)); await click(button("Review pasted JSON")); await until(() => workspaceDialog().querySelector(".nuvio-review"));
	assert(button("Import to Dingo").disabled, "New review resets mode"); await workspaceChoice("merge"); assert(workspaceDialog().querySelector('input[value="keep-existing"]').checked, "New snapshot resets artwork policy");
	for (const mode of ["add", "merge", "replace"]) {
		await workspaceChoice(mode); const project = controller.getState().project;
		controller.updateNode(project.collections[0].internalId, { pinToTop: !project.collections[0].editable.pinToTop }); await frame();
		const changed = controller.getState(); assert(button("Import to Dingo").disabled && button("Review current project"), "Stale review cannot apply");
		await click(button("Review current project")); assert(controller.getState() === changed && button("Import to Dingo").disabled, "Explicit refresh is nonmutating and requires a new mode");
	}
	await click(button("Cancel"));
	await mountWorkspaceImport({ empty: true }); const empty = controller.getState(); await workspaceReview();
	assert(!workspaceDialog().querySelector(".nuvio-import-modes") && !workspaceDialog().querySelector(".merge-artwork-policies"), "Empty workspace has no meaningless modes/policy");
	assert(controller.getState() === empty, "Empty review still waits for final action"); await click(button("Import to Dingo"));
	assert(controller.getState().project.collections.length === 1 && !controller.getState().dirty, "Empty final import opens clean project");
	await mountWorkspaceImport(); const untouched = controller.getState();
	await click($("[data-action=choose-import-file]")); await click(button("Review selected file"));
	await until(() => workspaceDialog().querySelector('[role="alert"]'));
	assert(workspaceDialog().textContent.includes("Choose a JSON file before importing."), "Missing file diagnostic");
	for (const kind of ["unsupported", "oversized", "unreadable", "invalid"]) {
		const data = new DataTransfer(); const chosen = new File([kind === "invalid" ? "[" : "[]"], kind === "unsupported" ? "notes.txt" : "collections.json", { type: kind === "unsupported" ? "text/plain" : "application/json" });
		if (kind === "oversized") Object.defineProperty(chosen, "size", { value: 10 * 1024 * 1024 + 1 });
		if (kind === "unreadable") Object.defineProperty(chosen, "text", { value: async () => { throw Error("private read failure"); } });
		data.items.add(chosen); $("#builder-import-file").files = data.files; $("#builder-import-file").dispatchEvent(new Event("change", { bubbles: true })); await frame();
		await click(button("Review selected file")); await until(() => workspaceDialog().querySelector('[role="alert"]'));
		assert(controller.getState() === untouched && !workspaceDialog().querySelector(".nuvio-review"), `${kind} file cannot mutate or review`);
	}
	await click($("[data-action=choose-import-json]"));
	for (const draft of ["", "[", '{"folders":[]}']) {
		await setWorkspaceText(draft); await click(button("Review pasted JSON")); await until(() => workspaceDialog().querySelector('[role="alert"]'));
		assert(controller.getState() === untouched && !workspaceDialog().querySelector(".nuvio-review"), "Invalid pasted JSON cannot mutate or review");
	}
	await workspaceReview(); assert(controller.getState() === untouched, "Recovery review is detached"); await click(button("Cancel")); assert(controller.getState() === untouched, "Cancel reviewed snapshot keeps state exact");
	await click(importTrigger()); await click($("[data-action=choose-import-file]")); const delayed = await setWorkspaceFile(); let finishRead;
	Object.defineProperty(delayed, "text", { value: () => new Promise(resolve => { finishRead = resolve; }) });
	await click(button("Review selected file")); await until(() => Boolean(finishRead));
	assert([...workspaceDialog().querySelectorAll(".welcome-import-methods button")].every(n => n.disabled), "Async read locks method changes");
	await click(button("Cancel")); finishRead(JSON.stringify(workspaceIncoming)); await frame();
	assert(!workspaceDialog() && controller.getState() === untouched, "Late file read after Cancel has no effect");
	return { passed: true, externalServiceExercised: false };
};

window.prepareWorkspaceImportScreen = async (stage, enlarged = false) => {
	document.documentElement.style.fontSize = enlarged ? "32px" : "";
	await mountWorkspaceImport({ open: stage !== "workspace" });
	if (stage === "workspace") return { passed: true, width: innerWidth, height: innerHeight };
	if (["file", "json"].includes(stage)) {
		await click($(`[data-action=choose-import-${stage}]`));
		if (stage === "file") await setWorkspaceFile(); else await setWorkspaceText(JSON.stringify(workspaceIncoming, null, 2));
	} else if (stage === "nuvio") await click($("[data-action=open-nuvio-import]"));
	else if (stage !== "methods") {
		await workspaceReview();
		if (stage.startsWith("merge")) { await workspaceChoice("merge"); if (stage !== "merge-keep") await workspaceChoice(stage === "merge-fill" ? "fill-missing" : "prefer-incoming"); }
		if (stage === "replace") { await workspaceChoice("replace"); await click(button("Import to Dingo")); }
	}
	return workspaceGeometry();
};

// Owner-approved mocked Nuvio mechanics for the embedded-host amendment.
// These cases never claim authenticated live-service acceptance.
function assertEmbeddedShell(shell) {
	assert(workspaceDialog() === shell && shell.isConnected && shell.getClientRects().length, "Outer Import shell remains mounted and visible");
	assert(!shell.inert && !shell.closest('[inert], [aria-hidden="true"]'), "Import is never suspended or hidden");
	assert(!$("[data-nuvio-dialog]") && document.querySelectorAll(".nuvio-connection-backdrop").length === 1, "No second backdrop or Nuvio portal");
	assert(document.querySelectorAll('[role="dialog"]').length === 1 && document.querySelectorAll('[aria-modal="true"]').length === 1, "One modal semantic surface");
	assert(shell.querySelector("h2").textContent === "Import" && shell.querySelectorAll("h2").length === 1, "One outer Import heading");
	const method = $("[data-action=open-nuvio-import]");
	assert(method.getAttribute("aria-pressed") === "true" && !method.hasAttribute("aria-haspopup"), "Nuvio is the selected method, not a dialog trigger");
	assert(method.getClientRects().length && document.body.style.position === "fixed", "Methods remain present under the single body lock");
	assert(!shell.textContent.includes("Your collection JSON is processed locally"), "Nuvio does not show local-only privacy copy");
	assert(shell.querySelector('[data-nuvio-stage-heading]').tagName === "H3", "Nuvio heading is subordinate to outer Import");
	assert(![...shell.querySelectorAll("[hidden] input, [hidden] textarea")].includes(document.activeElement), "Focus never moves to a hidden local control");
}
window.runEmbeddedNuvioCases = async () => {
	for (const mode of ["add", "merge", "replace"]) {
		await mount({ existing: true, screen: "workspace", matching: true }); const shell = workspaceDialog(); const before = controller.getState();
		reviewIncoming = structuredClone(incoming); reviewIncoming[0].folders[0].coverEmoji = "🎬";
		assertEmbeddedShell(shell); assert($(".nuvio-login").textContent.includes("Your login details go directly to Nuvio"), "Existing credential/privacy reassurance retained");
		await login(); assertEmbeddedShell(shell);
		assert(document.activeElement === $("[data-nuvio-stage-heading]") && document.activeElement.textContent === "Choose a profile", "Connected stage heading receives focus");
		await pull(); assertEmbeddedShell(shell); assert(controller.getState() === before, "Snapshot review has no early mutation");
		await workspaceChoice(mode);
		assert(Boolean(shell.querySelector(".merge-artwork-policies")) === (mode === "merge"), "Only Merge exposes shared artwork choices");
		if (mode === "merge") {
			assert(shell.querySelector('input[value="keep-existing"]').checked, "Embedded Merge defaults to Keep existing");
			await workspaceChoice("fill-missing"); assert(artworkCountsText().includes("1 missing field filled"), "Embedded preview uses shared field counts");
		}
		await click(button("Import to Dingo"));
		if (mode === "replace") {
			assertEmbeddedShell(shell); assert(document.activeElement === button("Keep current work") && controller.getState() === before, "Shared Replace confirmation focuses safe action");
			const safe = document.activeElement.getBoundingClientRect(); const area = shell.querySelector(".nuvio-dialog-content").getBoundingClientRect();
			assert(safe.top >= area.top && safe.bottom <= area.bottom + 1, "Safe Replace action is visible inside the outer scroll owner");
			await click(button("Replace current project"));
		}
		assert(!workspaceDialog() && controller.getState().revision === before.revision + 1, "Embedded final Apply commits exactly once");
		assert(controller.getState().project.collections.length === (mode === "add" ? 3 : 2), "Shared Add/Merge/Replace result");
		if (mode === "merge") assert(controller.getState().project.collections[0].folders[0].editable.coverEmoji === "🎬", "Reviewed artwork policy reaches the same controller");
		assert(document.activeElement === importTrigger(), "Successful import restores workspace trigger");
	}
	for (const mode of ["add", "merge", "replace"]) {
		await mount({ existing: true, screen: "workspace" }); await login(); await pull(); await workspaceChoice(mode);
		const project = controller.getState().project; controller.updateNode(project.collections[0].internalId, { pinToTop: true }); await frame();
		assert(button("Import to Dingo").disabled && button("Review current project"), "Embedded stale project blocks every mode");
		await click(button("Review current project")); assert(button("Import to Dingo").disabled, "Refresh requires a new mode");
	}
	await mount({ existing: true, screen: "workspace" }); const shell = workspaceDialog();
	await click($("[data-action=choose-import-file]")); const chosen = await setWorkspaceFile(); const fileInput = $("#builder-import-file");
	assert(shell.textContent.includes("Your collection JSON is processed locally"), "File privacy is local");
	await click($("[data-action=choose-import-json]")); await setWorkspaceText(JSON.stringify(workspaceIncoming));
	assert(shell.textContent.includes("Your collection JSON is processed locally"), "Pasted privacy is local");
	await click($("[data-action=open-nuvio-import]")); await login(); await pull(); await workspaceChoice("merge"); await workspaceChoice("prefer-incoming");
	const reviewed = connection.getState().snapshot;
	await click($("[data-action=choose-import-file]"));
	assert(connection.getState().status === "connected" && !connection.getState().snapshot && !$("[data-nuvio-flow]"), "Method switch keeps session and discards Nuvio review authority");
	assert($("#builder-import-file") === fileInput && fileInput.files[0] === chosen, "Native file selection survives embedded Nuvio");
	await click($("[data-action=open-nuvio-import]")); assertEmbeddedShell(shell);
	assert(!$(".nuvio-login") && !$(".nuvio-review") && connection.getState().snapshot !== reviewed, "Returning retains profiles and requires a fresh snapshot");
	await pull(); await workspaceChoice("merge"); assert(shell.querySelector('input[value="keep-existing"]').checked, "New authority resets artwork policy");
	await click($("[data-action=choose-import-json]"));
	assert($("#builder-import-text").value === JSON.stringify(workspaceIncoming), "Pasted draft survives Nuvio review");
	await click(button("Review pasted JSON")); await until(() => $(".nuvio-review")); await workspaceChoice("add"); await click(button("Import to Dingo"));
	assert(controller.getState().project.collections.at(-1).editable.title === "Movie nights", "Local Apply uses only the active local snapshot");
	for (const stage of ["pin", "missing", "empty", "expired", "error"]) {
		await window.prepareEmbeddedNuvioScreen(stage);
		if (["missing", "empty"].includes(stage)) assert(button("Import to Dingo").disabled, "Missing/empty Nuvio cannot import");
		if (stage === "pin") { await submitPin(); assert($(".nuvio-review-profile").textContent.includes("Kids"), "Protected PIN advances inside the same shell"); }
		if (stage === "expired") assert(workspaceDialog().querySelector(".nuvio-notice[role=status]").textContent.includes("expired"), "Expiry retains its local snapshot notice");
		if (stage === "error") assert($("[role=alert]").textContent.includes("could not sign you in"), "Login error remains sanitized");
	}
	for (const kind of ["login", "profiles", "pin", "pull"]) {
		await mount({ existing: true, screen: "workspace" }); const before = controller.getState();
		if (kind !== "login") await login();
		if (kind === "pin") await click($("input[value='33333333-3333-4333-8333-333333333333']"));
		if (kind === "pull") await click($(".nuvio-profile-choice input"));
		holdRequest = { login: "grant_type=password", profiles: "sync_pull_profiles", pin: "verify_profile_pin", pull: "sync_pull_collections" }[kind];
		if (kind === "login") { $("input[name=email]").value = user.email; $("input[name=password]").value = "private-test-password"; $(".nuvio-login").requestSubmit(); }
		else if (kind === "pin") { const field = $("input[name=pin]"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(field, "4826"); field.dispatchEvent(new Event("input", { bubbles: true })); }
		else button(kind === "profiles" ? "Refresh profiles" : "Load Collections").click();
		$("[data-action=choose-import-file]").click(); await until(() => Boolean(releaseRequest));
		assertEmbeddedShell(workspaceDialog());
		assert([...workspaceDialog().querySelectorAll(".welcome-import-methods button")].every(n => n.disabled), "Every active Nuvio request prevents method switching");
		const finish = releaseRequest; await click($("[aria-label='Close Import']")); finish(); await frame();
		assert(!workspaceDialog() && !connection.getState().busy && !connection.getState().snapshot && controller.getState() === before, "Close cancels request authority and rejects late completion");
		assert(connection.getState().status === (kind === "login" ? "disconnected" : "connected"), "Close preserves an established memory-only session");
		assert(document.activeElement === importTrigger() && !document.body.style.position, "Close restores the workspace and single body lock");
	}
	assert(!requests.some(request => request.url.includes("sync_push")), "Import never sends a Collection mutation");
	return { passed: true, mocked: true };
};
window.prepareEmbeddedNuvioScreen = async (stage = "login", enlarged = false) => {
	document.documentElement.style.fontSize = enlarged ? "32px" : "";
	await mount({ existing: true, matching: true, screen: "workspace", result: ["missing", "empty"].includes(stage) ? stage : "ready" });
	const shell = workspaceDialog();
	if (stage === "error") loginFailure = true;
	if (stage !== "login") await login();
	if (stage === "pin") await click($("input[value='33333333-3333-4333-8333-333333333333']"));
	if (["review", "merge", "missing", "empty", "expired"].includes(stage)) await pull();
	if (stage === "merge") { await workspaceChoice("merge"); await workspaceChoice("prefer-incoming"); }
	if (stage === "expired") { now += 3600001; connection.checkExpiry(); await frame(); }
	assertEmbeddedShell(shell);
	const focused = document.activeElement.getBoundingClientRect(); const scroll = shell.querySelector(".nuvio-dialog-content"); const viewport = scroll.getBoundingClientRect();
	if (document.activeElement.matches('[data-nuvio-stage-heading], [role="alert"]')) assert(focused.top >= viewport.top - 1 && focused.bottom <= viewport.bottom + 1, `Focused embedded ${stage} stays visible at ${innerWidth}×${innerHeight}: ${focused.top}–${focused.bottom} within ${viewport.top}–${viewport.bottom}`);
	if (innerWidth >= 900 && innerHeight >= 600 && stage === "merge") {
		scroll.scrollTop = scroll.scrollHeight; await frame();
		const methods = shell.querySelector(".welcome-import-methods").getBoundingClientRect();
		assert(methods.top >= viewport.top - 1 && methods.bottom <= viewport.bottom + 1, "Desktop method choices remain visible at the final review action");
		scroll.scrollTop = 0; await frame();
	}
	return workspaceGeometry();
};

window.workspaceImportGeometry = workspaceGeometry;
window.workspaceImportClosed = () => !workspaceDialog() && !$("[data-nuvio-dialog]") && document.activeElement === importTrigger() && !document.body.style.position;

function assertSharedButton(buttonNode, className, properties = ["backgroundColor", "borderTopColor", "borderTopWidth", "borderRadius", "padding", "fontSize", "fontWeight", "minHeight", "color"]) {
	const container = document.createElement("div"); container.style.fontSize = getComputedStyle(buttonNode.parentElement).fontSize;
	const reference = document.createElement("button"); reference.className = className; container.append(reference); document.body.append(container);
	const actual = getComputedStyle(buttonNode); const expected = getComputedStyle(reference);
	for (const property of properties) {
		assert(actual[property] === expected[property], `Button reuses ${className}: ${property}`);
	}
	container.remove();
}

async function submitPin() {
	const field = $("input[name=pin]");
	Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(field, "4826");
	field.dispatchEvent(new Event("input", { bubbles: true }));
	assert(field.value === "", "PIN cleared immediately, before response");
	await until(() => !connection.getState().busy);
	assert(!/4826|p_pin/.test(JSON.stringify(connection.getState())), "PIN absent from public connection state");
	assert(!document.body.innerHTML.includes("4826"), "PIN absent from rendered UI");
}
function assertFooter(primary) {
 const actions = [...nuvioHost().querySelectorAll(".nuvio-flow-actions button, [data-nuvio-dialog] .nuvio-dialog-footer button")];
 assert(actions[0] === button(primary) && actions[1] === button("Disconnect"), "Forward left, Disconnect right in footer");
 assert(actions[1].classList.contains("secondary-action") && parseFloat(getComputedStyle(actions[1]).fontSize) < parseFloat(getComputedStyle(actions[0]).fontSize), "Disconnect uses smaller standard secondary styling");
}
function assertWorkspaceStatus() {
 assert($(".nuvio-import-status") && !$("[data-nuvio-dialog]"), "Transient success appears in workspace");
 assert(!$(".import-compatibility") && !$(".import-notice-summary") && !/View import (notes|details)/.test(document.body.textContent), "Workspace has success only, without any import details");
}
function landingGeometry() {
 assert(document.documentElement.scrollWidth <= innerWidth + 1, "Landing fits phone width");
 assert(!document.body.style.position && !$("[data-nuvio-dialog]"), "Landing uses normal document scrolling");
 const methods = $(".welcome-import-methods").getBoundingClientRect();
 for (const node of document.querySelectorAll(".welcome-import-methods button")) {
  assert(node.classList.contains("import-action"), "Import methods reuse the established secondary style paired with Create");
  assertSharedButton(node, "import-action", ["borderTopWidth", "borderRadius", "padding", "fontFamily", "fontSize", "fontWeight", "minHeight"]);
  const actual = getComputedStyle(node); const primary = getComputedStyle($("[data-action=start-new-project]"));
  for (const property of ["borderRadius", "padding", "fontFamily", "fontSize", "fontWeight", "minHeight", "transition"]) assert(actual[property] === primary[property], "Import shares Create button family: " + property);
  assert(actual.backgroundImage === "none" && actual.boxShadow !== primary.boxShadow, "Import stays secondary to Create");
  if (node.getAttribute("aria-pressed") !== "true") assertSharedButton(node, "import-action", ["backgroundColor", "borderTopColor", "color"]);
  if (node.dataset.action === "open-nuvio-import") {
   assert(!node.hasAttribute("aria-pressed") && !node.hasAttribute("data-selection-mode"), "Nuvio is a dialog trigger without sticky selection");
   assert(getComputedStyle(node.querySelector(".welcome-import-forward")).color === actual.color, "Forward chevron inherits the ordinary Builder colour");
  }
  assert(getComputedStyle(node.querySelector("strong")).fontSize === getComputedStyle(node).fontSize && getComputedStyle(node.querySelector("strong")).fontWeight === getComputedStyle(node).fontWeight, "Primary labels inherit standard button typography");
  assert(parseFloat(getComputedStyle(node.querySelector("small")).fontSize) < parseFloat(getComputedStyle(node).fontSize), "Supporting copy stays visually subordinate");
 }
 assert($("#file-import-guidance").textContent === "JSON files up to 10 MB are supported.", "File guidance uses owner-approved display units");
 assert(!$(".welcome-import-methods svg") && !$(".welcome-import-prompt svg"), "Method choices and empty state have no generic icons");
 assert([...document.querySelectorAll(".welcome-import-methods button")].every(node => node.querySelector("small").getBoundingClientRect().top >= node.querySelector("strong").getBoundingClientRect().bottom), "Supporting lines remain beneath method titles at every width");
 assert([...document.querySelectorAll(".welcome-import-methods button")].every(node => node.querySelector("strong") && node.querySelector("small") && node.getBoundingClientRect().height <= 82), "Compact choices show primary and supporting text");
 const content = $(".welcome-import-content").getBoundingClientRect();
 const card = $(".welcome-import").getBoundingClientRect();
 const selected = $(".welcome-import-methods [aria-pressed=true]");
 if (selected) {
  const active = getComputedStyle(selected); const inactive = getComputedStyle($("[data-action=open-nuvio-import]"));
  assert(active.backgroundColor !== inactive.backgroundColor && active.borderColor !== inactive.borderColor && active.boxShadow.includes("inset"), "Current method uses the shared distinct surface, border and structural inset");
 }
 if (innerWidth >= 900) {
  assert(content.height >= 300 && getComputedStyle($(".welcome-import-methods")).borderRightStyle === "solid", "Desktop has a stable panel and structural divider");
  if (!$("#builder-import-json-panel").hidden) {
   const text = $("#builder-import-text");
   assert(text.getBoundingClientRect().height >= 100 && text.getBoundingClientRect().height <= 128, "Desktop JSON field is compact but usable");
   assert(getComputedStyle(text).overflowY === "auto", "Long JSON scrolls within its field");
  }
 } else assert(["auto", "0px"].includes(getComputedStyle($(".welcome-import-content")).minHeight), "Stacked panel has no desktop minimum height");
 assert(innerWidth >= 900 ? content.left >= methods.right && Math.abs(content.top - methods.top) < 1 : content.top >= methods.bottom, "Import panel follows the responsive breakpoint");
 assert([...document.querySelectorAll(".import-card")].filter(node => node.getClientRects().length).length <= 1, "Only the selected form is visible");
 assert([...document.querySelectorAll(".welcome-import-methods button")].every(node => node.getBoundingClientRect().height >= 44), "Import methods retain tap targets");
 return { width: innerWidth, height: innerHeight, panelHeight: content.height, cardHeight: card.height, overflow: false };
}
async function checkLanding() {
 await mount({ open: false, localOnly: true });
 const method = (name) => $(`[data-action=choose-import-${name}]`);
 const fileInput = $("#builder-import-file"); const text = $("#builder-import-text");
 assert($(".welcome-import-prompt") && [...document.querySelectorAll(".import-card")].every(node => node.hidden && !node.getClientRects().length), "Initially only the quiet prompt is visible");
 assert(!$(".welcome-nuvio") && !$(".selected-file"), "No separate Connect card or duplicated filename");
 await click(method("file"));
 assert(method("file").getAttribute("aria-pressed") === "true" && document.activeElement === method("file"), "File activation has selected semantics and retains focus");
 const data = new DataTransfer(); const chosen = new File([JSON.stringify(incoming)], "chosen-collection.json", { type: "application/json" }); data.items.add(chosen);
 fileInput.files = data.files; fileInput.dispatchEvent(new Event("change", { bubbles: true })); await frame();
 await click(method("json"));
 Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(text, JSON.stringify(incoming)); text.dispatchEvent(new Event("input", { bubbles: true })); await frame();
 fileInput.focus(); assert(document.activeElement !== fileInput, "Hidden file input cannot receive focus");
 const before = controller.getState();
 $("#builder-import-file-panel").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); await frame();
 assert(controller.getState() === before, "Inactive form cannot import programmatically");
 await click($("[data-action=open-nuvio-import]"));
 assert($(".nuvio-login") && document.activeElement === $("[data-nuvio-dialog] h2"), "Nuvio opens the real login dialog without submitting or fabricating responses");
 await click($("[aria-label='Close Nuvio import']"));
 assert(document.activeElement === $("[data-action=open-nuvio-import]") && method("json").getAttribute("aria-pressed") === "true", "Close restores the trigger and prior import method");
 assert(text.value === JSON.stringify(incoming), "Pasted draft survives dialog and method switching");
 await click(method("file"));
 assert($("#builder-import-file") === fileInput && fileInput.files[0] === chosen, "Switching retains the native file input and chosen File");
 assert(!document.body.textContent.includes("chosen-collection.json"), "Native picker is the sole filename presentation");
 text.focus(); assert(document.activeElement !== text, "Hidden text area cannot receive focus");
 let finishRead; Object.defineProperty(chosen, "text", { value: () => new Promise(resolve => { finishRead = resolve; }) });
 await click(button("Import selected file"));
 assert(finishRead && [...document.querySelectorAll(".welcome-import-methods button")].every(node => node.disabled), "Pending file read disables every import method");
 method("json").click(); $("[data-action=open-nuvio-import]").click(); await frame();
 assert(method("file").getAttribute("aria-pressed") === "true" && !$("[data-nuvio-dialog]"), "Busy guard prevents switching and opening Nuvio");
 finishRead(JSON.stringify(incoming)); await until(() => $("[data-builder-shell]"));
 assert(controller.getState().project.collections.length === 2, "Ordinary local JSON file import still succeeds");
 assert(!$("[data-creation-dialog]"), "File import enters the ordinary workspace without the creation picker");
 await mount({ open: false, localOnly: true }); await click(method("json"));
 const pasted = $("#builder-import-text");
 Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(pasted, JSON.stringify(incoming)); pasted.dispatchEvent(new Event("input", { bubbles: true })); await frame();
 await click(button("Import pasted JSON")); await until(() => $("[data-builder-shell]"));
 assert(controller.getState().project.collections.length === 2, "Ordinary pasted JSON import still succeeds");
 assert(!$("[data-creation-dialog]"), "JSON import enters the ordinary workspace without the creation picker");
 return { passed: true, externalServiceExercised: false };
}
async function checkMerge() {
 await mount({ existing: true, screen: "workspace", matching: true }); await login(); await pull();
 const snapshot = connection.getState().snapshot;
 const before = controller.getState();
 await click([...document.querySelectorAll(".nuvio-choice")].find((node) => node.textContent.includes("Merge exact matches")).querySelector("input"));
 assert(controller.getState() === before, "Preview causes zero mutation");
 const preview = $(".nuvio-merge-preview").textContent;
 assert(preview.includes("Merge: 1 Collection · 1 Folder") && preview.includes("Skip: 1 duplicate Source") && preview.includes("Add: 1 Collection · 2 Folders · 2 Sources"), "Preview exposes planner counts");
 assert(preview.includes("Only exact visible names are matched. Similar or hidden names stay separate."), "Exact-match boundary explained");
 const calls = requests.length;
 now += 3600001; connection.checkExpiry(); await frame();
 await click(button("Import to Dingo"));
 assert(requests.length === calls && controller.getState().project.collections.length === 2 && controller.getState().revision === before.revision + 1, "Expired merge applies locally once");
 assertWorkspaceStatus();
 await mount(); await login(); await pull();
 const back = [...nuvioHost().querySelectorAll(".nuvio-dialog-header button, .nuvio-flow-back button")].find((node) => node.textContent.includes("Back"));
 await click(back);
 assert($(".nuvio-profile-stage") && !connection.getState().snapshot && $(".nuvio-profile-choice input:checked").value === main.id, "Standard Back returns to the retained selected Profile");
 assert(snapshot.collections.length === 2, "Reviewed snapshot remains immutable");
}


// C02 exercises only local shell/Blank creation, with the production disconnected
// connection. No external catalogue or account responses are substituted.
let welcomeOpening, welcomeHeadingBefore;
const welcomeHeadingBounds = () => { const rect = $(".welcome-brand h1").getBoundingClientRect(); return { left: rect.left, right: rect.right }; };
const creationDialog = () => $("[data-creation-dialog]");
const startAction = () => $("[data-action=start-new-project]");
const workspaceCreate = () => [...document.querySelectorAll('[data-action="create-collection"], [data-action="create-collection-empty"], [data-action="create-collection-after-list"]')].find(node => node.getClientRects().length);
function checkInitialWelcomeReturn() {
	assert($("[data-builder-welcome]") && !creationDialog(), "Initial Cancel returns to Welcome");
	assert(controller.getState().project === welcomeOpening.project && controller.getState().revision === welcomeOpening.revision, "Cancel creates no content or controller change");
	assert(controller.getState().project.collections.length === 0 && !controller.getState().dirty, "Untouched project stays clean and empty");
	assert(document.activeElement === startAction(), "Welcome Start regains focus");
	assert(document.body.style.position !== "fixed", "Initial Cancel releases the shared body lock");
	assert(JSON.stringify(welcomeHeadingBounds()) === JSON.stringify(welcomeHeadingBefore), "Returning preserves the existing Welcome heading layout");
	return true;
}
window.checkInitialWelcomeReturn = checkInitialWelcomeReturn;
window.prepareWelcomeCreation = async (enlarged = false) => {
	document.documentElement.style.fontSize = enlarged ? "200%" : "";
	await mount({ open: false, localOnly: true });
	welcomeHeadingBefore = welcomeHeadingBounds();
	const before = controller.getState();
	const snapshots = []; const focusTargets = [];
	const observe = () => { if ($("[data-builder-shell]")) snapshots.push(Boolean(creationDialog())); };
	const observer = new MutationObserver(observe);
	const focus = event => { if (!event.target.closest("[data-builder-welcome]")) focusTargets.push(Boolean(event.target.closest("[data-creation-dialog]"))); };
	observer.observe(document.body, { childList: true, subtree: true });
	document.addEventListener("focusin", focus);
	const start = startAction(); start.focus(); start.click(); start.click();
	await until(creationDialog);
	observer.disconnect(); document.removeEventListener("focusin", focus);
	welcomeOpening = controller.getState();
	assert(welcomeOpening.revision === before.revision + 1, "Double activation starts just one clean project");
	assert(snapshots.length && snapshots.every(Boolean), "First committed workspace already contains the shared picker");
	assert(focusTargets.length && focusTargets.every(Boolean), "No transient focus on unrelated workspace controls");
	const dialog = creationDialog();
	const expected = creationOptionsForScope("new-collection").map(option => option.id);
	const actual = [...dialog.querySelectorAll("button[data-creation-option]")].map(node => node.dataset.creationOption);
	assert(JSON.stringify(actual) === JSON.stringify(expected), "Welcome uses the canonical D01 family options and order");
	assert(document.querySelectorAll("[role=dialog]").length === 1, "Exactly one dialog opens under StrictMode");
	assert(document.activeElement === dialog.querySelector('[data-creation-option="blank"]'), "Existing picker first-option focus is retained");
	assert($(".workspace-underlay").inert && document.body.style.position === "fixed", "Existing modal inert/background lock is reused");
	root.render(<StrictMode><BuilderApp controller={controller} nuvioConnection={connection} /></StrictMode>); await frame();
	assert(creationDialog() === dialog && controller.getState() === welcomeOpening, "Rerender does not reopen or repeat creation");
	const rect = dialog.getBoundingClientRect();
	assert(rect.left >= -1 && rect.right <= innerWidth + 1 && rect.top >= -1 && rect.bottom <= innerHeight + 1, "Picker fits viewport");
	assert(document.documentElement.scrollWidth <= innerWidth + 1 && dialog.scrollWidth <= dialog.clientWidth + 1, "No horizontal overflow");
	return { width: innerWidth, enlarged, order: actual, singlePicker: true, noIdleWorkspace: true, overflow: false };
};
window.finishWelcomeCreationCases = async () => {
	checkInitialWelcomeReturn();
	// The same initial close callback may be invoked twice without a second action.
	await click(startAction()); welcomeOpening = controller.getState();
	const close = creationDialog().querySelector(".add-source-close-action");
	assert(close, "Existing picker Close exists"); close.click(); close.click(); await frame();
	checkInitialWelcomeReturn();
	await click(startAction());
	await click(creationDialog().querySelector('[data-creation-option="blank"]'));
	const created = controller.getState();
	assert(!creationDialog() && $("[data-builder-shell]") && created.project.collections.length === 1, "Blank completes normally and stays in workspace");
	assert(created.project.collections[0].editable.title === "Untitled Collection", "Blank retains its existing defaults");
	if (innerWidth >= 900) assert(created.selection.collectionInternalId === created.project.collections[0].internalId, "Desktop retains normal created selection");
	else assert(created.selection.collectionInternalId === null && $('[data-node-type="collection"]').getClientRects().length, "Phone retains the existing unselected created-card presentation");
	root.render(<StrictMode><BuilderApp controller={controller} nuvioConnection={connection} /></StrictMode>); await frame();
	assert(!creationDialog() && controller.getState() === created, "Successful creation never reopens on rerender");
	const trigger = workspaceCreate(); await click(trigger);
	await click(creationDialog().querySelector(".add-source-close-action"));
	assert($("[data-builder-shell]") && !creationDialog() && controller.getState() === created, "Established workspace Cancel stays in workspace");
	assert(document.activeElement === trigger, "Ordinary creation restores its workspace trigger");
	await click($("[data-action=return-builder-home]")); await click($("[data-action=discard-and-return]"));
	root.render(<StrictMode><BuilderApp controller={controller} nuvioConnection={connection} /></StrictMode>); await frame();
	assert($("[data-builder-welcome]") && !creationDialog(), "Later Welcome has no stale launch context");
	// A legitimate empty import must never acquire the special Welcome journey.
	for (const method of ["file", "json"]) {
		await mount({ open: false, localOnly: true });
		await click($(`[data-action=choose-import-${method}]`));
		if (method === "file") {
			const data = new DataTransfer(); data.items.add(new File(["[]"], "empty.json", { type: "application/json" }));
			$("#builder-import-file").files = data.files; $("#builder-import-file").dispatchEvent(new Event("change", { bubbles: true })); await frame();
		} else {
			Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call($("#builder-import-text"), "[]");
			$("#builder-import-text").dispatchEvent(new Event("input", { bubbles: true })); await frame();
		}
		await click($(`[data-action=${method === "file" ? "import-file" : "import-pasted-json"}]`));
		assert($("[data-builder-shell]") && !creationDialog(), "Empty import enters workspace without auto-opening");
		const imported = controller.getState(); await click(workspaceCreate());
		await click(creationDialog().querySelector(".add-source-close-action"));
		assert($("[data-builder-shell]") && controller.getState() === imported, "Cancel keeps the legitimate empty imported workspace");
	}
	await mount({ open: false, localOnly: true }); await click(startAction());
	await click(creationDialog().querySelector('[data-creation-option="decades"]'));
	await click($("[data-decade-preset='1980s']"));
	await click(button("Continue to Configure")); await click(button("Continue to Appearance"));
	await click($(".decades-creation-form button[type=submit]"));
	assert(!creationDialog() && $("[data-builder-shell]") && controller.getState().project.collections.some(collection => collection.folders.some(folder => folder.sources.length)), "Guided Decades creation completes normally without Preview or external requests");
	root.render(<StrictMode><BuilderApp controller={controller} nuvioConnection={connection} /></StrictMode>); await frame();
	assert(!creationDialog(), "Guided success does not reopen the initial picker");
	// Losing the opening revision, even while still empty, must prevent return.
	await mount({ open: false, localOnly: true }); await click(startAction());
	assert(controller.updateNode(controller.getState().project.internalId, { title: "Changed while open" }).ok, "Controller edit succeeds");
	await frame(); await click(creationDialog().querySelector(".add-source-close-action"));
	assert($("[data-builder-shell]") && !creationDialog(), "Changed opening project cannot return as untouched");
	root.unmount(); root = null; connection.dispose();
	document.documentElement.style.fontSize = "";
	await frame();
	return { passed: true, externalServiceExercised: false };
};
