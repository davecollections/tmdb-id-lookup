import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import * as add from "../../builder/src/source-add/index.js";
import { applyAdvancedDiscoverPlan } from "../../builder/src/source-add/advanced-discover-plan.js";
import { AddSourceDialog } from "../../builder/src/ui/AddSourceDialog.jsx";
import { DecadeSourceFlow } from "../../builder/src/ui/DecadeSourceFlow.jsx";
import { GenreSourceFlow } from "../../builder/src/ui/GenreSourceFlow.jsx";
import { NetworkSourceFlow } from "../../builder/src/ui/NetworkSourceFlow.jsx";
import { PeopleSourceFlow } from "../../builder/src/ui/PeopleSourceFlow.jsx";
import { StudioSourceFlow } from "../../builder/src/ui/StudioSourceFlow.jsx";
import { StreamingSourceFlow } from "../../builder/src/ui/StreamingSourceFlow.jsx";
import { TmdbListSourceFlow } from "../../builder/src/ui/TmdbListSourceFlow.jsx";
import AdvancedDiscoverFlow from "../../builder/src/ui/AdvancedDiscoverFlow.jsx";

// Reuse production providers and caches. No injected external results or artwork.
const people = add.createTmdbPersonProvider(), franchise = add.createTmdbCollectionProvider(), lists = add.createTmdbListProvider();
const studio = add.createStudioCatalogueProvider({ catalogueUrl: "/data/companies.min.json" }), network = add.createNetworkCatalogueProvider({ catalogueUrl: "/data/tv-networks.min.json" });
const streaming = add.createStreamingCatalogueProvider();
const studioCounts = add.createTmdbStudioCountProvider(), networkCounts = add.createTmdbNetworkCountProvider();
const previews = { studio: add.createTmdbStudioPreviewProvider(), network: add.createTmdbNetworkPreviewProvider(), streaming: add.createTmdbStreamingPreviewProvider(), genre: add.createTmdbGenrePreviewProvider(), decade: add.createTmdbDecadesPreviewProvider() };
const components = { people: PeopleSourceFlow, franchise: AddSourceDialog, list: TmdbListSourceFlow, studio: StudioSourceFlow, network: NetworkSourceFlow, streaming: StreamingSourceFlow, genre: GenreSourceFlow, decade: DecadeSourceFlow, discover: AdvancedDiscoverFlow };

export async function runSourceNamesScenario(helpers, view) {
 const { family, enlargedText = false, large = false, capture = false, preview: checkPreview = false } = view;
 const { createController, importSources, clickAndSettle: click, afterCommittedEffects: settle, setInputValue, setTextareaValue, waitForMountedCondition: wait, serializedValue } = helpers;
 const check = (condition, message) => { if (!condition) throw new Error(`${family} names ${innerWidth}: ${message}`); return condition; };
 const app = createController(), folder = importSources(app, []); app.selectNode(folder.internalId);
 const initial = app.getState(), before = serializedValue(app);
 const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
 const originalFont = document.documentElement.style.fontSize;
 if (enlargedText) document.documentElement.style.fontSize = "200%";
 let applied;
 const apply = (payload) => {
  const options = { ...payload, folderInternalId: folder.internalId };
  applied = family === "people" ? add.createPeopleSourceBundle(app, { ...options, destination: { kind: "existing-folder", folderInternalId: folder.internalId } })
   : family === "franchise" ? add.createMovieFranchiseSource(app, { folderInternalId: folder.internalId, draft: payload })
   : family === "discover" ? applyAdvancedDiscoverPlan(app, payload)
   : ({ list: add.createTmdbListSourceBundle, studio: add.createStudioSourceBundle, network: add.createNetworkSource, genre: add.createGenreSourceBundle, decade: add.createDecadeSourceBundle, streaming: add.createStreamingSourceBundle })[family](app, options);
  return applied;
 };
 const props = { project: initial.project, projectRevision: initial.revision, folder, onApply: apply, onBack() {}, onCancel() {}, previewProvider: previews[family], ...(family === "people" ? { context: "folder", provider: people } : family === "franchise" ? { provider: franchise, folderName: folder.editable.title, collectionName: "Collection" } : family === "list" ? { provider: lists } : family === "studio" || family === "network" ? { catalogueProvider: family === "studio" ? studio : network, countProvider: family === "studio" ? studioCounts : networkCounts } : family === "streaming" ? { catalogueProvider: streaming } : family === "discover" ? { scope: "add-source", collectionInternalId: initial.project.collections[0].internalId, folderInternalId: folder.internalId, streamingProvider: streaming, studioProvider: studio, networkProvider: network } : {}) };
 const evidence = { family, width: innerWidth, height: innerHeight, enlargedText, large };
 let dialog;
 const button = (label) => [...dialog.querySelectorAll("button")].find(b => b.textContent.trim() === label);
 const write = async (input, value) => { check(input, "input missing"); await act(async () => { setInputValue(input, value); await settle(); }); };
 const shot = async (name) => {
  const selected = { "franchise-393": ["automatic", "expanded", "custom-context"], "franchise-1280": ["custom-context"], "genre-393": ["automatic", "expanded", "custom-summary"], "genre-1280": ["expanded", "custom-context"], "discover-393": ["expanded", "custom-context"], "discover-1280": ["custom-context"], "decade-393": ["large-list"] };
  if (!capture || !selected[family + "-" + innerWidth]?.includes(name) || !globalThis.capture204Preview) return;
  if (["expanded", "large-list", "custom-context"].includes(name)) { dialog.querySelector(".source-names-disclosure").scrollIntoView({ block: "start" }); await settle(); }
  await new Promise(resolve => { window.__finish204Capture = resolve; window.capture204Preview(JSON.stringify({ name: `pass-d-${family}-${innerWidth}-${name}` })); });
 };
 try {
  await act(async () => { root.render(createElement(components[family], props)); await settle(); });
  dialog = check(document.querySelector('.add-source-dialog'), "dialog missing");
  if (["people", "franchise", "studio", "network"].includes(family)) {
   const id = { people: 31, franchise: 10, studio: 3, network: 213 }[family];
   await write(dialog.querySelector('input[type="search"]'), String(id));
   const attr = family === "people" ? "person" : family === "franchise" ? "collection" : family;
   const selected = await wait(() => dialog.querySelector(".source-names-disclosure") || dialog.querySelector(`[data-tmdb-${attr}-result="${id}"]`), { label: "live entity " + family, timeoutMs: 30000 });
   if (!selected.classList.contains("source-names-disclosure")) await click(selected);
  } else if (family === "list") {
   await act(async () => { setTextareaValue(dialog.querySelector("textarea"), "5916\n8679739"); await settle(); });
   await click(button("Resolve lists"));
   await wait(() => dialog.querySelectorAll(".tmdb-list-selected-items li").length === 2, { label: "live public lists", timeoutMs: 30000 });
   await click(button("Continue to Review"));
  } else if (family === "genre") {
   await click(await wait(() => [...dialog.querySelectorAll('[data-genre-name]')].find(e => e.dataset.genreName === "Action"), { label: "Action genre" }));
   await click([...dialog.querySelectorAll('[data-genre-name]')].find(e => e.dataset.genreName === "Comedy"));
   await click(button("Continue to Configure"));
   const currentFolder = dialog.querySelector('input[name="genre-destination"][value="current-folder"]');
   if (currentFolder && !currentFolder.checked) await click(currentFolder);
  } else if (family === "streaming") {
   await click(await wait(() => dialog.querySelector('[data-streaming-region="AU"]'), { label: "live regions", timeoutMs: 30000 }));
   await click(button("Continue to Provider"));
   await click(await wait(() => dialog.querySelector('[data-streaming-provider="8"]'), { label: "live Netflix", timeoutMs: 30000 }));
  } else if (family === "discover") {
   await click(dialog.querySelector('input[name="discover-media"][value="both"]'));
   await click(button("Continue to Review"));
  }
  if (large) {
   const yearInputs = [...dialog.querySelectorAll('input[name="decade-source-year"]')];
   for (const input of yearInputs) if (input.value.startsWith("year-") && !input.checked) await click(input);
  }
  const details = await wait(() => dialog.querySelector(".source-names-disclosure"), { label: "Source names", timeoutMs: 30000 });
  check(!details.open && !details.querySelector("input"), "naming must start collapsed and lazy");
  check(details.textContent.includes("Generated automatically."), "automatic summary");
  if (family === "list") check(details.querySelector("summary").textContent === "Source namesGenerated automatically." && [...dialog.querySelectorAll(".tmdb-list-review-item")].every(row => !row.querySelector("input")), "List review retains optional naming outside result rows");
  details.scrollIntoView({ block: "center" }); await settle(); await shot("automatic");
  const summary = details.querySelector("summary");
  await act(async () => { summary.focus({ preventScroll: true }); await new Promise(resolve => { window.__finishNamesKey = resolve; window.sourceNamesSpace("space"); }); await settle(); });
  check(details.open && document.activeElement === summary, "native Space expansion/focus");
  check(getComputedStyle(summary).outlineStyle !== "none", "keyboard focus not visible");
  evidence.keyboard = true;
  let fields = [...details.querySelectorAll("input[data-source-name]")]; check(fields.length > 0, "lazy rows missing");
  check(family !== "discover" || fields.length === 1 && details.textContent.includes("Base name"), "Discover per-output UI");
  const generated = fields.map(f => f.value), contexts = fields.map(f => f.labels[0]?.textContent);
  check(contexts.every(Boolean) && generated.every(Boolean), "label/default missing");
  evidence.rows = fields.length;
  await shot(large ? "large-list" : "expanded");
  const custom = "Dave's picks — a long display name that keeps the Source recipe intact";
  if (family === "streaming") {
   await write(fields[0], "Temporary Movie name");
   await write(fields[1], generated[1]);
   const recent = dialog.querySelector('input[name="streaming-configure-sort"][value="recent"]');
   await click(recent);
   const changed = [...details.querySelectorAll("input[data-source-name]")];
   check(changed.length === 4 && changed.filter(f => f.value === "Temporary Movie name").length === 1, "same candidate custom name did not survive multi-sort");
   check(changed.filter(f => f.value === generated[1]).length === 0, "automatic title froze after equivalent input");
   await click(recent);
   fields = [...details.querySelectorAll("input[data-source-name]")];
   check(fields[0].value === "Temporary Movie name" && fields[1].value === generated[1], "returning configuration titles");
  }

  await write(fields[0], custom);
  check(fields[0].labels[0].textContent === contexts[0], "canonical context changed");
  check(details.textContent.includes("1 customised."), "custom count");
  check(dialog.textContent.includes(custom), "effective review name missing");
  if (fields.length > 1) { await write(fields[1], "Second custom title"); check(details.textContent.includes("2 customised."), "multi count"); }
  details.scrollIntoView({ block: "center" }); await settle(); await shot("custom-context");
  if (fields.length > 1) {
   await click([...details.querySelectorAll("button")].find(b => b.textContent === "Reset all"));
   check(document.activeElement === summary, "Reset all focus");
   check(fields.every((f, i) => f.value === generated[i]) && details.textContent.includes("Generated automatically."), "Reset all changed candidate configuration");
   await write(fields[0], custom); await write(fields[1], "Second custom title");
  }

  // A hidden-format-only nonblank name remains mounted, labelled and recoverable.
  await write(fields[0], "\u200B");
  check(fields[0].isConnected && fields[0].getAttribute("aria-invalid") === "true", "invalid field lost");
  check(document.getElementById(fields[0].getAttribute("aria-describedby"))?.textContent.includes("visible characters"), "linked error missing");
  check(dialog.querySelector('button[type="submit"]').disabled, "invalid custom title permits Add");
  await click(fields[0].closest(".source-name-field").querySelector("button"));
  check(document.activeElement === fields[0] && fields[0].value === generated[0], "Reset focus/default");
  await write(fields[0], custom); await write(fields[0], "");
  check(fields[0].value === "", "blank cannot be typed");
  await act(async () => { fields[0].focus(); fields[0].blur(); await settle(); });
  check(fields[0].value === generated[0] && !fields[0].hasAttribute("aria-invalid"), "blank did not return to automatic");
  await write(fields[0], " " + generated[0] + " ");
  await act(async () => { fields[0].focus(); fields[0].blur(); await settle(); });
  check(fields[0].value === generated[0], "generated-equivalent was retained");
  await write(fields[0], custom);
  await click(summary); check(!details.querySelector("input"), "closed heavy rows remain mounted");
  await shot("custom-summary");
  if (checkPreview) {
   const previewButton = [...dialog.querySelectorAll("button")].find(b => b.textContent.trim() === "Preview titles");
   await click(check(previewButton, "Preview trigger"));
   await wait(() => document.querySelector('.franchise-preview-modal')?.textContent.match(/Showing all|Showing the only|titles found|No titles to preview|Preview shows up to|No posters available|could not|unavailable|failed/), { label: "live Preview", timeoutMs: 60000 });
   const modal = document.querySelector('.franchise-preview-modal'); check(!modal.querySelector('[role="alert"]'), "live Preview failed: " + modal.textContent);
   await click([...modal.querySelectorAll("button")].find(b => b.textContent.trim() === "Close")); evidence.livePreview = true;
  }
  check(serializedValue(app) === before, "typing/Preview mutated project");
  check(document.documentElement.scrollWidth <= innerWidth + 1 && dialog.scrollWidth <= dialog.clientWidth + 1, "horizontal overflow");
  const action = dialog.querySelector('button[type="submit"]');
  const rect = action.getBoundingClientRect(); check(rect.top >= 0 && rect.bottom <= innerHeight + 1, "Add unreachable");
  await click(action);
  check(applied?.ok, "save failed: " + JSON.stringify(applied?.errors));
  const output = JSON.parse(app.stringifyProject().json)[0].folders[0].sources;
  check(output[0].title === custom || family === "discover" && output[0].title.startsWith(custom + " · "), "saved title mismatch");
  check(!/"(?:nameMode|customName|candidateKey|titleOverride)":/.test(app.stringifyProject().json), "naming metadata leaked");
  evidence.saved = true; evidence.noOverflow = true; evidence.recoverable = true; evidence.sourceCount = output.length;
  return evidence;
 } catch (error) { throw new Error(error.message + "\nVisible state: " + dialog?.textContent.slice(-1400) + "\nPreview: " + document.querySelector(".franchise-preview-modal")?.textContent); } finally { document.documentElement.style.fontSize = originalFont; await act(async () => { root.unmount(); await settle(); }); host.remove(); }
}
