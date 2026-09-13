// Issue #206: read private inputs, report outside Git, never rewrite an input.
// Usage: node scripts/investigate-shared-advanced.mjs audit INPUT OUTPUT_DIRECTORY
//        node scripts/investigate-shared-advanced.mjs compare INPUT EXPORT OUTPUT_DIRECTORY
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { discoverImportedMirrors } from "../builder/src/nuvio/discover-imported-filters.js";
import { COLLECTION_EDITABLE_FIELDS, FOLDER_EDITABLE_FIELDS, DISCOVER_FILTER_FIELDS } from "../builder/src/nuvio/known-fields.js";
import { createBuilderController } from "../builder/src/application/index.js";
import { serializeNuvioProject } from "../builder/src/serialize/index.js";
import { sourceEditorFor, createSourceEditSession } from "../builder/src/source-edit/index.js";
import { validateAdvancedFilters, advancedDiscoverQuery } from "../builder/src/source-add/advanced-discover.js";

const root = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
export function read(file) {
	const bytes = fs.readFileSync(file);
	const value = JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/, ""));
	assert.ok(Array.isArray(value), "Expected a Nuvio collection array; do not guess wrapper schemas.");
	return { value, filename: path.basename(file), sha256: digest(bytes), bytes: bytes.length };
}
function save(directory, name, value) {
	const resolved = path.resolve(directory);
	const relative = path.relative(root, resolved);
	assert.ok(relative.startsWith(".." + path.sep) || path.isAbsolute(relative), "Private reports must be outside the repository.");
	fs.mkdirSync(resolved, { recursive: true });
	fs.writeFileSync(path.join(resolved, name), JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
}
const stamp = () => new Date().toISOString();
const metadata = ({ filename, sha256, bytes }) => ({ filename, sha256, bytes });
function audit(input) {
	let n = 0;
	const controller = createBuilderController({ idFactory: () => "audit-" + ++n, nuvioIdFactory: () => "nuvio-" + ++n });
	assert.equal(controller.importValue(input.value).ok, true);
	const project = controller.getState().project;
	const serialized = serializeNuvioProject(project);
	assert.equal(serialized.ok, true);
	const rows = project.collections.flatMap((c, ci) => c.folders.flatMap((f, fi) => f.sources.map((s, si) => ({ c, f, s, ci, fi, si }))));
	const native = rows.filter(({ s }) => s.category === "native-tmdb");
	const blocked = native.filter(({ s }) => !sourceEditorFor(s));
	const records = blocked.map(({ c, f, s, ci, fi, si }) => {
		const original = input.value[ci].folders[fi].sources[si];
		assert.deepEqual(serialized.value[ci].folders[fi].sources[si], original);
		assert.deepEqual(s.rawImported, original);
		const opening = createSourceEditSession(project, s.internalId);
		assert.equal(opening.ok, false);
		assert.equal(controller.getState().project, project);
		const filters = s.editable.filters;
		return {
			path: "$[" + ci + "].folders[" + fi + "].sources[" + si + "]",
			collectionId: c.editable.id, collection: c.editable.title,
			folderId: f.editable.id, folder: f.editable.title,
			sourceId: original.id ?? null, title: original.title,
			type: original.tmdbSourceType, media: original.mediaType, sort: original.sortBy,
			filters: original.filters, exactSourceSha256: digest(JSON.stringify(original)),
			validation: validateAdvancedFilters(filters, original.mediaType, { allowUnknown: true }).errors,
			previewQuery: advancedDiscoverQuery(s), unchangedExport: true, editorOpens: false,
		};
	});
	const cycle = createBuilderController();
	assert.equal(cycle.importValue(serialized.value).ok, true);
	assert.deepEqual(serializeNuvioProject(cycle.getState().project).value, serialized.value);
	const expressions = [...new Set(records.map((r) => JSON.stringify([r.folder, r.media, r.filters.withOriginalLanguage, r.filters.withOriginCountry])))].map((r) => JSON.parse(r));
	return { checkedAt: stamp(), input: metadata(input), totalSources: rows.length, nativeSources: native.length,
		lists: native.filter(({ s }) => s.editable.tmdbSourceType === "LIST").length,
		blocked: records.length, expressions, records,
		boundary: "Real importer/registry/serializer audit. Blocked editors cannot exercise Save/Cancel. Opening fails without mutation. No live endpoint results inferred." };
}
export function typed(value, exists = true) {
	return exists ? { type: value === null ? "null" : Array.isArray(value) ? "array" : typeof value, value } : { type: "absent" };
}
function differences(a, b, prefix = "") {
	if (Object.is(a, b)) return [];
	if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
		return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap((key) => {
			const p = prefix ? prefix + "." + key : key;
			return Object.hasOwn(a, key) && Object.hasOwn(b, key) ? differences(a[key], b[key], p)
				: [{ path: p, before: typed(a[key], Object.hasOwn(a, key)), after: typed(b[key], Object.hasOwn(b, key)) }];
		});
	}
	return isDeepStrictEqual(a, b) ? [] : [{ path: prefix, before: typed(a), after: typed(b) }];
}
function sourceKey(source) {
	// Nuvio native Sources often have no persisted id. Sorting/filters are deliberately
	// absent from the fallback key because those are the values under investigation.
	if (source.id != null) return JSON.stringify(["id", source.id]);
	const provider = String(source.provider ?? "addon").toLowerCase();
	// Canonical numeric ID representation is comparison-only; the diff still reports
	// a numeric/string type change. Noncanonical and out-of-range IDs remain literal.
	const entity = Number.isSafeInteger(Number(source.tmdbId)) && /^[1-9]\d*$/.test(String(source.tmdbId))
		? String(Number(source.tmdbId)) : source.tmdbId ?? null;
	return JSON.stringify(provider === "tmdb" ? ["identity-and-title", provider,
		String(source.tmdbSourceType).toUpperCase(), entity, String(source.mediaType).toUpperCase(), source.title]
		: ["identity-and-title", provider, source.addonId, source.type, source.catalogId, source.genre, source.title]);
}
function uniqueIndex(values, keyOf) {
	const index = new Map();
	for (const value of values) { const key = keyOf(value); index.set(key, [...(index.get(key) ?? []), value]); }
	return index;
}
// Extend the existing identity comparator with case matching and a full field ledger.
export const caseKey = (node) => /^\[(P206-[CFS]\d{3})\]/.exec(node?.title ?? "")?.[1] ?? null;
const pointer = (parts) => "/" + parts.map((p) => String(p).replace(/~/g, "~0").replace(/\//g, "~1")).join("/");
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const at = (value, parts) => {
	let exists = true;
	for (const part of parts) { exists = exists && value != null && Object.hasOwn(value, part); value = exists ? value[part] : undefined; }
	return typed(value, exists);
};
export function fieldPaths(before, after, kind) {
	const paths = new Map();
	function walk(value, parts) {
		if (object(value) && Object.keys(value).length) for (const key of Object.keys(value)) walk(value[key], [...parts, key]);
		else paths.set(JSON.stringify(parts), parts);
	}
	const child = kind === "collection" ? "folders" : kind === "folder" ? "sources" : null;
	for (const value of [before, after]) for (const key of Object.keys(value ?? {})) if (key !== child) walk(value[key], [key]);
	const optional = kind === "collection" ? COLLECTION_EDITABLE_FIELDS : kind === "folder" ? [...FOLDER_EDITABLE_FIELDS, "catalogSources"] : ["id", "filters", ...([before?.provider, after?.provider].includes("tmdb") ? ["tmdbId", "sortBy"] : [])];
	for (const key of optional) if (!Object.hasOwn(before ?? {}, key) && !Object.hasOwn(after ?? {}, key)) paths.set(JSON.stringify([key]), [key]);
	if (kind === "source" && [before?.provider, after?.provider].includes("tmdb")) {
		for (const field of DISCOVER_FILTER_FIELDS) {
			const parts = ["filters", field]; paths.set(JSON.stringify(parts), parts);
		}
	}
	return [...paths.values()];
}
const positiveId = (value) => /^[1-9]\d*$/.test(String(value)) && Number.isInteger(Number(value)) && Number(value) <= 2147483647;
export function interpretField(parts, before, after, beforeNode, afterNode, kind) {
	if (isDeepStrictEqual(before, after)) return { label: "Kept" };
	if (parts.length === 1 && parts[0] === "tmdbId" && positiveId(before.value) && positiveId(after.value) && Number(before.value) === Number(after.value)) {
		return { label: "Equivalent change", reason: "The same positive TMDB ID, written as a number or canonical decimal string. The type change remains recorded." };
	}
	if (parts.length === 2 && parts[0] === "filters" && after.type === "absent") {
		const canonical = discoverImportedMirrors(beforeNode?.mediaType)[parts[1]];
		const oldCanonical = canonical ? at(beforeNode, ["filters", canonical]) : parts[1] === "sortBy" ? at(beforeNode, ["sortBy"]) : typed(undefined, false);
		const newCanonical = canonical ? at(afterNode, ["filters", canonical]) : parts[1] === "sortBy" ? at(afterNode, ["sortBy"]) : typed(undefined, false);
		if (before.type !== "absent" && oldCanonical.type !== "absent" && isDeepStrictEqual(before, oldCanonical) && isDeepStrictEqual(oldCanonical, newCanonical)) {
			return { label: "Equivalent change", reason: "A matching duplicate alias was removed; the canonical value and type survived." };
		}
	}
	if (before.type === "absent") {
		const defaults = kind === "collection" ? { pinToTop: [false], focusGlowEnabled: [false, true], showAllTab: [false, true], viewMode: ["TABBED_GRID"] } : kind === "folder" ? { hideTitle: [false], focusGifEnabled: [false, true], tileShape: ["SQUARE", "POSTER", "LANDSCAPE", "poster", "square", "wide"] } : {};
		if (parts.length === 1 && defaults[parts[0]]?.includes(after.value)) return { label: "Added default", reason: "An absent presentation setting gained a recognized presentation value. Record the added default separately; identical meaning across clients is not assumed." };
		return { label: "Changed", reason: "An additional field appeared. No established default equivalence is assumed." };
	}
	if (after.type === "absent") return { label: "Removed", reason: "Review preservation of this value; removal alone does not establish an unsupported-feature bug." };
	return { label: "Changed", reason: "The original value or type changed. No unverified equivalence was applied." };
}

export function compare(input, output) {
	const result = { checkedAt: stamp(), input: metadata(input), output: metadata(output), matchedCollections: 0, matchedFolders: 0, matchedSources: 0, ambiguous: [], missing: [], added: [], sourceChanges: [], folderChanges: [], collectionChanges: [], orderChanges: [], duplicateChanges: [], fieldComparison: [], nodeComparisons: [] };
	function fields(before, after, kind, location, afterLocation, unresolved = false) {
		const key = caseKey(before) ?? caseKey(after) ?? (kind === "source" ? sourceKey(before ?? after) : (before ?? after)?.id) ?? location;
		const child = kind === "collection" ? "folders" : kind === "folder" ? "sources" : null;
		const strip = (value) => value === undefined ? undefined : Object.fromEntries(Object.entries(value).filter(([key]) => key !== child));
		result.nodeComparisons.push({ case: key, kind, location, afterLocation, before: strip(before), after: strip(after), unresolved });
		for (const parts of fieldPaths(before, after, kind)) {
			const original = at(before, parts), exported = unresolved ? { type: "unresolved" } : at(after, parts);
			result.fieldComparison.push({ case: key, kind, location, afterLocation, field: pointer(parts), original, exported, ...(unresolved ? { label: "Not tested", reason: "Matching is ambiguous; no entries were paired by position." } : interpretField(parts, original, exported, before, after, kind)) });
		}
		if (before && after) {
			const changes = differences(strip(before), strip(after));
			if (changes.length) result[kind + "Changes"].push({ id: before.id, title: before.title, location, afterLocation, changes });
		}
	}
	function unmatched(node, kind, location, side, unresolved = false) {
		fields(side === "before" ? node : undefined, side === "after" ? node : undefined, kind, side === "after" ? "+" + location : location, side === "after" ? location : null, unresolved);
		const child = kind === "collection" ? "folders" : kind === "folder" ? "sources" : null;
		if (child) for (const [i, value] of (node[child] ?? []).entries()) unmatched(value, kind === "collection" ? "folder" : "source", location + "/" + child + "/" + i, side, unresolved);
	}
	function group(before, after, kind, location, afterLocation) {
		if (!Array.isArray(before) || !Array.isArray(after)) {
			result.fieldComparison.push({ case: location || "root", kind, location, afterLocation, field: "@structure", original: typed(before, before !== undefined), exported: typed(after, after !== undefined), label: "Changed", reason: "Hierarchy array type changed. No child entries were paired by position." });
			result.ambiguous.push({ kind, location, reason: "Hierarchy array type changed", before, after });
			return;
		}
		const keyOf = (v) => kind === "source" ? sourceKey(v) : v.id;
		const beforeKeys = uniqueIndex(before, keyOf), afterKeys = uniqueIndex(after, keyOf);
		const beforeCases = uniqueIndex(before, caseKey), afterCases = uniqueIndex(after, caseKey);
		const used = new Set(), matches = new Map(), handled = new Set();
		for (const [i, node] of before.entries()) {
			if (handled.has(i)) continue;
			const key = keyOf(node), marker = caseKey(node);
			let candidates = afterKeys.get(key) ?? [];
			if (key == null || beforeKeys.get(key).length !== 1 || candidates.length !== 1) candidates = [];
			if (!candidates.length && marker && beforeCases.get(marker).length === 1 && afterCases.get(marker)?.length === 1) candidates = afterCases.get(marker);
			if (!candidates.length && kind === "source" && String(node.provider ?? "addon").toLowerCase() === "addon") {
				const addonIdentity = (v) => JSON.stringify([String(v.provider ?? "addon").toLowerCase(), v.addonId, v.type, v.catalogId, v.genre]);
				const identity = addonIdentity(node);
				const old = before.filter((v) => addonIdentity(v) === identity), next = after.filter((v) => addonIdentity(v) === identity);
				if (old.length === 1 && next.length === 1) candidates = next;
			}
			// Identical copies can be treated as one content group, never as positional
			// pairs. Any different identity, field or count increase remains visible.
			const oldCopies = marker ? beforeCases.get(marker) : beforeKeys.get(key);
			const newCopies = marker ? afterCases.get(marker) ?? [] : afterKeys.get(key) ?? [];
			// Equal-size marked groups may change uniformly, for example when a client
			// adds null defaults to both copies. Compare the common content, not positions.
			const unchangedCopies = newCopies.every((v) => isDeepStrictEqual(v, node));
			const uniformMarkedCopies = marker && newCopies.length === oldCopies?.length && newCopies.every((v) => isDeepStrictEqual(v, newCopies[0]));
			if (kind === "source" && oldCopies?.length > 1 && newCopies.length > 0 && newCopies.length <= oldCopies.length && oldCopies.every((v) => isDeepStrictEqual(v, node)) && (unchangedCopies || uniformMarkedCopies) && (marker || newCopies.length < oldCopies.length)) {
				for (const copy of oldCopies) { const ci = before.indexOf(copy); handled.add(ci); matches.set(ci, after.indexOf(newCopies[0])); }
				for (const copy of newCopies) used.add(after.indexOf(copy));
				for (const copy of oldCopies) fields(copy, newCopies[0], kind, location + "/" + before.indexOf(copy), afterLocation + "/" + after.indexOf(newCopies[0]));
				result.matchedSources += oldCopies.length;
				if (oldCopies.length !== newCopies.length) result.duplicateChanges.push({ case: marker ?? key, location, before: oldCopies.length, after: newCopies.length, label: "Equivalent change", reason: "Only fully identical source copies were removed. No distinct fields or content were lost." });
				continue;
			}
			const j = candidates.length === 1 ? after.indexOf(candidates[0]) : -1;
			if (j < 0 || used.has(j)) {
				const ambiguous = used.has(j) || (afterKeys.get(key)?.length ?? 0) > 0 || (marker && (afterCases.get(marker)?.length ?? 0) > 0);
				result[ambiguous ? "ambiguous" : "missing"].push({ kind, location: location + "/" + i, case: marker, node });
				unmatched(node, kind, location + "/" + i, "before", ambiguous);
				continue;
			}
			used.add(j); matches.set(i, j);
			result["matched" + (kind === "collection" ? "Collections" : kind === "folder" ? "Folders" : "Sources")]++;
			fields(node, after[j], kind, location + "/" + i, afterLocation + "/" + j);
			const child = kind === "collection" ? "folders" : kind === "folder" ? "sources" : null;
			if (child) group(node[child], after[j][child], kind === "collection" ? "folder" : "source", location + "/" + i + "/" + child, afterLocation + "/" + j + "/" + child);
		}
		for (const [j, node] of after.entries()) if (!used.has(j)) {
			result.added.push({ kind, location: afterLocation + "/" + j, case: caseKey(node), node });
			unmatched(node, kind, afterLocation + "/" + j, "after");
		}
		// Compare matched relative order. Missing/extra entries have their own rows.
		const sequence = [...matches.values()].filter((v, i, values) => values.indexOf(v) === i);
		if (sequence.some((v, i) => i && sequence[i - 1] > v)) result.orderChanges.push({ location, before: [...matches.keys()], after: sequence });
		const token = (v) => caseKey(v) ?? keyOf(v) ?? "unidentified";
		const original = before.map(token), exported = after.map((v, j) => { const i = [...matches].find(([, matched]) => matched === j)?.[0]; return i === undefined ? token(v) : token(before[i]); });
		if (before.every((_, i) => matches.has(i)) && used.size === after.length && before.length === after.length && !isDeepStrictEqual(original, exported) && !result.orderChanges.some((v) => v.location === location)) result.orderChanges.push({ location, before: original, after: exported });
		const cleanupOnly = result.duplicateChanges.some((v) => v.location === location) && !result.orderChanges.some((v) => v.location === location) && before.every((_, i) => matches.has(i)) && used.size === after.length;
		result.fieldComparison.push({ case: location || "root", kind, location, afterLocation, field: "@order", original: typed(original), exported: typed(exported), label: isDeepStrictEqual(original, exported) ? "Kept" : cleanupOnly ? "Equivalent change" : "Changed", reason: "Saved node order and multiplicity; matched IDs may differ and are reported in their own fields." });
	}
	group(input.value, output.value, "collection", "", "");
	result.sortChanges = result.sourceChanges.filter((r) => r.changes.some((c) => c.path === "sortBy"));
	result.boundary = "Saved JSON only. Unique persisted identity, then unique P206 case marker; sources can also use the existing unique identity/title tuple. No positional pairing or ID rewriting. Ambiguous groups stay unresolved. Object key order is ignored; array order is retained. Results belong to the recorded complete route, not an inferred internal step.";
	return result;
}

export const ROUTES = ["nuvio.tv", "Desktop", "TV normal import", "TV Manage from phone"];
const cell = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\|/g, "&#124;").replace(/\r?\n/g, "<br>");
export const displayValue = (value) => value.type === "absent" ? "absent" : value.type + ": " + JSON.stringify(value.value);
const rowKey = (row) => JSON.stringify([row.case, row.location, row.field]);
export function comparisonTable(rows, reports = {}) {
	const index = Object.fromEntries(Object.entries(reports).map(([route, report]) => [route, new Map(report.fieldComparison.map((r) => [rowKey(r), r]))]));
	const allRows = new Map(rows.map((r) => [rowKey(r), r]));
	for (const report of Object.values(reports)) for (const row of report.fieldComparison) if (!allRows.has(rowKey(row))) allRows.set(rowKey(row), row);
	return "| Setting/case | Original | " + ROUTES.join(" | ") + " |\n| --- | --- | --- | --- | --- | --- |\n" + [...allRows].map(([key, row]) => "| " + [cell(row.case + " " + row.field + " (" + (row.location || "/") + ")"), cell(displayValue(row.original)), ...ROUTES.map((route) => {
		let found = index[route]?.get(key);
		if (!found && row.field.startsWith("/")) {
			const node = reports[route]?.nodeComparisons.find((n) => n.location === row.location && n.case === row.case && !n.unresolved);
			if (node) {
				const parts = row.field.slice(1).split("/").map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
				const original = at(node.before, parts), exported = at(node.after, parts);
				found = { exported, ...interpretField(parts, original, exported, node.before, node.after, node.kind) };
			}
		}
		return found ? cell(found.label + (found.label === "Kept" ? "" : ": " + displayValue(found.exported))) : "Not tested";
	})].join(" | ") + " |").join("\n") + "\n";
}

export function interpretation(reports) {
	let text = "# Saved-JSON changes by route\n\nThese findings describe each recorded route. They do not isolate import, sync or export, or establish filter application. Read probe scopes in the case manifest. Exact values, node snapshots and hashes are retained in matrix.json.\n";
	for (const route of ROUTES) {
		const report = reports[route];
		text += "\n## " + route + "\n\n";
		if (!report) { text += "Not tested.\n"; continue; }
		text += "Import: " + report.run.importMethod + ". Export: " + report.run.exportMethod + ". Version: " + report.run.version + ".\n\n";
		text += ["evidenceStatus", "startedAt", "exportedAt", "syncActivity", "isolation", "notes"].filter((field) => report.run[field]).map((field) => field + ": " + report.run[field]).join("\n\n") + "\n\n";
		const counts = Object.fromEntries(["Kept", "Changed", "Removed", "Added default", "Equivalent change", "Not tested"].map((label) => [label, report.fieldComparison.filter((r) => r.label === label).length]));
		text += Object.entries(counts).map(([label, count]) => label + ": " + count).join("; ") + ". These are field/order rows, including declared absences.\n\n";
		const changes = report.fieldComparison.filter((r) => r.label !== "Kept");
		if (!changes.length) text += "Every compared field and saved node order was kept.\n";
		else text += "| Case / field | Original | Exported | Result | Interpretation |\n| --- | --- | --- | --- | --- |\n" + changes.map((r) => "| " + [r.case + " " + r.field + " (" + r.location + ")", displayValue(r.original), displayValue(r.exported), r.label, r.reason ?? ""].map(cell).join(" | ") + " |").join("\n") + "\n";
	}
	return text;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const [mode, inputFile, second, fourth] = process.argv.slice(2);
	assert.ok(["audit", "compare", "matrix"].includes(mode), "Use audit INPUT OUTDIR, compare INPUT EXPORT OUTDIR, or matrix MASTER RUNS_JSON OUTDIR.");
	const input = read(inputFile);
	if (mode === "matrix") {
		const runs = JSON.parse(fs.readFileSync(second, "utf8"));
		const reports = {};
		assert.equal(runs.masterSha256, input.sha256, "Run log must identify this exact untouched master.");
		for (const [route, run] of Object.entries(runs.routes)) {
			assert.ok(ROUTES.includes(route), "Unknown route");
			if (!run.exportFile) { assert.notEqual(run.status, "Completed", "A completed run needs an export file."); continue; }
			assert.equal(run.status, "Completed", "Set status to Completed only after collecting this route's saved export.");
			for (const field of ["version", "startedAt", "exportedAt", "importMethod", "exportMethod", "syncActivity", "isolation"]) assert.ok(typeof run[field] === "string" && run[field].trim(), "Complete run metadata: " + field);
			const output = read(path.resolve(path.dirname(second), run.exportFile));
			reports[route] = { ...compare(input, output, { full: true }), run };
		}
		// Every report directory is new and outside Git. Retain byte-for-byte inputs
		// and the run log alongside hashes; never modify or overwrite evidence.
		assert.ok(!fs.existsSync(fourth), "Choose a new report directory to preserve prior evidence.");
		save(fourth, "matrix.json", { input: metadata(input), reports });
		fs.copyFileSync(inputFile, path.join(fourth, "original.json"), fs.constants.COPYFILE_EXCL);
		fs.copyFileSync(second, path.join(fourth, "run-log.json"), fs.constants.COPYFILE_EXCL);
		for (const [route, report] of Object.entries(reports)) fs.copyFileSync(path.resolve(path.dirname(second), report.run.exportFile), path.join(fourth, "route-" + (ROUTES.indexOf(route) + 1) + ".json"), fs.constants.COPYFILE_EXCL);
		fs.writeFileSync(path.join(fourth, "comparison.md"), comparisonTable(compare(input, input, { full: true }).fieldComparison, reports), { flag: "wx" });
		fs.writeFileSync(path.join(fourth, "interpretation.md"), interpretation(reports), { flag: "wx" });
		console.log(JSON.stringify({ routesCompared: Object.keys(reports), input: metadata(input) }, null, 2));
	} else {
		const report = mode === "audit" ? audit(input) : compare(input, read(second));
		save(mode === "audit" ? second : fourth, mode + ".json", report);
		console.log(JSON.stringify(mode === "audit" ? { totalSources: report.totalSources, nativeSources: report.nativeSources, lists: report.lists, blocked: report.blocked, expressions: report.expressions } : { matchedSources: report.matchedSources, sortChanges: report.sortChanges, ambiguous: report.ambiguous.length, missing: report.missing.length, added: report.added.length }, null, 2));
	}
}
