import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBuilderController } from "../../builder/src/application/controller.js";
import { createNuvioConnection } from "../../builder/src/nuvio-connection/session.js";
import { BuilderApp } from "../../builder/src/ui/BuilderApp.jsx";
import { NuvioProfileAvatar } from "../../builder/src/ui/NuvioProfileAvatar.jsx";
import "../../builder/src/styles.css";

// Owner-approved mocked Nuvio responses for this slice. These checks establish
// local UI/transport mechanics, not live account or external-service evidence.
const $ = (selector) => document.querySelector(selector);
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
let root, controller, connection, now, requests, outcome, loginFailure, pullChange, pinOutcome;

async function mount({ existing = false, screen = "welcome", result = "ready", open = true, matching = false, localOnly = false } = {}) {
	if (root) { root.unmount(); connection.dispose(); await frame(); }
	now = Date.parse("2026-09-19T08:30:00Z"); requests = []; loginFailure = false; pullChange = false; outcome = result;
	pinOutcome = "correct";
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
			return Response.json(outcome === "missing" ? [] : [{ profile_id: index, collections_json: outcome === "empty" ? [] : outcome === "malformed" ? null : incoming, updated_at: "2026-09-19T08:20:00Z" }]);
		}
		throw Error("Unexpected endpoint");
	} });
	root = createRoot($("#root")); root.render(<StrictMode><BuilderApp controller={controller} initialScreen={screen} nuvioConnection={connection} /></StrictMode>);
	await frame();
	if (!open) return;
	await click($("[data-action=open-nuvio-import]"));
	assert(document.activeElement === $("[data-nuvio-dialog] h2"), "Heading focus avoids unexpected keyboard");
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
	const dialog = $("[data-nuvio-dialog]"); const rect = dialog.getBoundingClientRect();
	const owners = [...dialog.querySelectorAll("*")].filter((node) => ["auto", "scroll"].includes(getComputedStyle(node).overflowY));
	assert(document.documentElement.scrollWidth <= innerWidth + 1 && dialog.scrollWidth <= dialog.clientWidth + 1, "No horizontal overflow");
	assert(rect.left >= 0 && rect.right <= innerWidth + 1 && rect.top >= 0 && rect.bottom <= innerHeight + 1, "Dialog fits viewport");
	assert(owners.length === 1 && owners[0] === $(".nuvio-dialog-content"), "One content scroll owner");
	assert([...dialog.querySelectorAll("button")].filter((node) => node.getClientRects().length).every((node) => node.getBoundingClientRect().height >= 43), "Large action targets");
	return { width: innerWidth, height: innerHeight, scrollOwners: owners.length, overflow: false };
}

window.runNuvioLocalCases = async () => {
	// Isolated avatar presentation check uses a real local repository image, not an external identity lookup.
	const avatarHost = document.createElement("div"); document.body.append(avatarHost);
	const avatarRoot = createRoot(avatarHost);
	const avatarUrl = new URL("../../builder/src/assets/builder-mark.svg", import.meta.url).href;
	avatarRoot.render(<NuvioProfileAvatar profile={{ name: "Family cinema", avatarUrl, avatarColor: "#1E88E5" }} />); await frame();
	assert(avatarHost.querySelector("img").getAttribute("src") === avatarUrl, "Supplied avatar image is rendered");
	avatarHost.querySelector("img").dispatchEvent(new Event("error")); await frame();
	assert(!avatarHost.querySelector("img") && avatarHost.textContent === "FC", "Failed image becomes initials, never a broken image");
	assert(avatarHost.firstChild.style.backgroundColor === "rgb(30, 136, 229)", "Nuvio color fallback");
	avatarRoot.render(<NuvioProfileAvatar profile={{ name: "Guest", avatarUrl: null, avatarColor: null }} />); await frame();
	assert(avatarHost.textContent === "G" && !avatarHost.firstChild.style.backgroundColor, "Initials fallback without color");
	avatarRoot.unmount(); avatarHost.remove();
	await mount(); await login();
	assertSharedButton($("[aria-label='Close Nuvio import']"), "add-source-header-action add-source-close-action");
	assert(button("Disconnect").classList.contains("secondary-action"), "Disconnect extends the shared secondary action");
	await click($("input[value='33333333-3333-4333-8333-333333333333']"));
	assert($(".nuvio-lock").dataset.unlocked === "false", "Unverified profile keeps the closed lock");
	assert($("input[name=pin]") && button("Load Collections").disabled, "Protected selection prompts PIN before any pull");
	assert(button("Refresh profiles").closest(".nuvio-profile-heading") && button("Load Collections").closest("footer"), "Refresh is near heading; Load is in footer");
	assertFooter("Load Collections");
	pinOutcome = "wrong"; await submitPin();
	assert($(".nuvio-pin").textContent.includes("didn’t match") && button("Load Collections").disabled, "Incorrect PIN remains locked");
	pinOutcome = "locked"; await submitPin();
	assert($(".nuvio-pin").textContent.includes("30 seconds") && button("Verify PIN").disabled, "Server retry-after represented");
	now += 30001; await new Promise((resolve) => setTimeout(resolve, 1100));
	assert(!button("Verify PIN").disabled, "Lockout expires locally without requests");
	pinOutcome = "correct"; await submitPin();
	assert($(".nuvio-pin-success") && !button("Load Collections").disabled, "Correct PIN enables load");
	assert($(".nuvio-lock").dataset.unlocked === "true" && $(".nuvio-lock").getBoundingClientRect().width === 13, "Verified profile uses the same small icon with an open shackle");
	await click(button("Load Collections")); await until(() => !connection.getState().busy);
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
	await click($("[data-action=open-nuvio-import]"));
	assert($(".nuvio-login"), "Next network operation requires login after expiry");
	await click(button("Disconnect"));
	assert(controller.getState().project.collections.length === 2, "Disconnect preserves imported project");
	await click($("[aria-label='Close Nuvio import']"));
	assert(document.activeElement === $("[data-action=open-nuvio-import]"), "Close restores exact workspace trigger");

	await mount({ existing: true, screen: "workspace" }); await login(); await pull();
	const original = controller.getState().project; const beforeRevision = controller.getState().revision;
	assert(button("Import to Dingo").disabled, "Existing work requires explicit destination choice");
	await click([...document.querySelectorAll(".nuvio-choice")].find((node) => node.textContent.includes("Add as separate Collections")).querySelector("input"));
	assert($(".import-compatibility").textContent.includes("Some Sources have limited editing") && !$(".import-notable"), "Routine compatibility is quiet");
	assert($(".import-compatibility p").textContent === "Their Source settings can't be edited in Dingo. Collection and Folder details remain editable.", "Short review compatibility copy");
	assert(!button("Choose another profile") && !button("Import + download backup"), "Review has no superseded actions");
	const back = [...document.querySelectorAll(".nuvio-dialog-header button")].find((node) => node.textContent.includes("Back"));
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

window.runWelcomeLayoutCases = checkLanding;
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
	await mount({ existing: !["login", "landing"].includes(stage), screen: ["login", "landing"].includes(stage) ? "welcome" : "workspace", open: stage !== "landing", matching: ["review", "workspace"].includes(stage) });
	if (stage === "landing") return landingGeometry();
	if (stage !== "login") await login();
	if (stage === "profiles") await click($(".nuvio-profile-choice input"));
	if (["pin-verified", "pin-locked"].includes(stage)) {
		await click($("input[value='33333333-3333-4333-8333-333333333333']"));
		if (stage === "pin-locked") { pinOutcome = "locked"; await submitPin(); }
		if (stage === "pin-verified") await submitPin();
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
	$("[data-nuvio-dialog] h2").focus({ preventScroll: true });
	for (const avatar of document.querySelectorAll(".nuvio-avatar")) assert(avatar.getBoundingClientRect().width === 38, "Profile and Review avatars use 38px");
	for (const card of document.querySelectorAll(".nuvio-profile-choice")) if (!card.querySelector(".nuvio-pin.is-inline .nuvio-muted")) assert(card.getBoundingClientRect().height <= 76, "Avatars retain compact profile rows");
	const selectedCard = $(".nuvio-choice[data-selected=true]");
	if (selectedCard) {
		assert(getComputedStyle(selectedCard, "::after").content === "none", "No bespoke second selection border");
		assert(getComputedStyle(selectedCard).outlineStyle === "none", "Selected state does not imply keyboard focus");
		assert(getComputedStyle(selectedCard).boxShadow.includes("inset"), "Shared selected state retains its structural inset");
	}
	$(".nuvio-dialog-content").scrollTop = stage === "review" ? $(".nuvio-dialog-content").scrollHeight : 0; await frame();
	return geometry();
};
window.checkNuvioClosed = () => !$("[data-nuvio-dialog]") && document.body.style.position !== "fixed" && document.activeElement === $("[data-action=open-nuvio-import]");
window.nuvioFixtureReady = true;

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
	$("input[name=pin]").value = "4826";
	$(".nuvio-pin form").requestSubmit();
	assert($("input[name=pin]").value === "", "PIN cleared immediately, before response");
	await until(() => !connection.getState().busy);
	assert(!/4826|p_pin/.test(JSON.stringify(connection.getState())), "PIN absent from public connection state");
	assert(!document.body.innerHTML.includes("4826"), "PIN absent from rendered UI");
}
function assertFooter(primary) {
 const actions = [...document.querySelectorAll(".nuvio-dialog-footer button")];
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
 await mount({ open: false, localOnly: true }); await click(method("json"));
 const pasted = $("#builder-import-text");
 Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(pasted, JSON.stringify(incoming)); pasted.dispatchEvent(new Event("input", { bubbles: true })); await frame();
 await click(button("Import pasted JSON")); await until(() => $("[data-builder-shell]"));
 assert(controller.getState().project.collections.length === 2, "Ordinary pasted JSON import still succeeds");
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
 const back = [...document.querySelectorAll(".nuvio-dialog-header button")].find((node) => node.textContent.includes("Back"));
 await click(back);
 assert($(".nuvio-profile-stage") && !connection.getState().snapshot && $(".nuvio-profile-choice input:checked").value === main.id, "Standard Back returns to the retained selected Profile");
 assert(snapshot.collections.length === 2, "Reviewed snapshot remains immutable");
}
