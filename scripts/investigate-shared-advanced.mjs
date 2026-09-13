// Issue #206: read private inputs, report outside Git, never rewrite an input.
// Usage: node scripts/investigate-shared-advanced.mjs audit INPUT OUTPUT_DIRECTORY
//        node scripts/investigate-shared-advanced.mjs compare INPUT EXPORT OUTPUT_DIRECTORY
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createBuilderController } from "../builder/src/application/index.js";
import { serializeNuvioProject } from "../builder/src/serialize/index.js";
import { sourceEditorFor, createSourceEditSession } from "../builder/src/source-edit/index.js";
import { validateAdvancedFilters, advancedDiscoverQuery } from "../builder/src/source-add/advanced-discover.js";

const root = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
function read(file) {
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
function typed(value, exists = true) {
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
	return JSON.stringify(a) === JSON.stringify(b) ? [] : [{ path: prefix, before: typed(a), after: typed(b) }];
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
function compare(input, output) {
	const result = { checkedAt: stamp(), input: metadata(input), output: metadata(output), matchedCollections: 0, matchedFolders: 0, matchedSources: 0, ambiguous: [], missing: [], added: [], sourceChanges: [], folderChanges: [], collectionChanges: [], orderChanges: [] };
	function order(before, after, location) {
		if (JSON.stringify(before) !== JSON.stringify(after)) result.orderChanges.push({ location, before, after });
	}
	order(input.value.map((c) => c.id), output.value.map((c) => c.id), "collections");
	const outputCollections = uniqueIndex(output.value, (v) => v.id), inputCollections = uniqueIndex(input.value, (v) => v.id);
	for (const collection of input.value) {
		const candidates = outputCollections.get(collection.id) ?? [];
		if (collection.id == null || inputCollections.get(collection.id).length !== 1) { result.ambiguous.push({ collectionId: collection.id ?? null }); continue; }
		if (candidates.length !== 1) { result[candidates.length ? "ambiguous" : "missing"].push({ collectionId: collection.id }); continue; }
		const afterCollection = candidates[0]; result.matchedCollections++;
		const { folders: beforeFolders = [], ...beforeC } = collection;
		const { folders: afterFolders = [], ...afterC } = afterCollection;
		order(beforeFolders.map((f) => f.id), afterFolders.map((f) => f.id), collection.id + "/folders");
		const cc = differences(beforeC, afterC); if (cc.length) result.collectionChanges.push({ id: collection.id, changes: cc });
		const folderIndex = uniqueIndex(afterFolders, (v) => v.id), beforeFolderIndex = uniqueIndex(beforeFolders, (v) => v.id);
		for (const folder of beforeFolders) {
			const matches = folderIndex.get(folder.id) ?? [];
			if (folder.id == null || beforeFolderIndex.get(folder.id).length !== 1) { result.ambiguous.push({ collectionId: collection.id, folderId: folder.id ?? null }); continue; }
			if (matches.length !== 1) { result[matches.length ? "ambiguous" : "missing"].push({ collectionId: collection.id, folderId: folder.id }); continue; }
			const afterFolder = matches[0]; result.matchedFolders++;
			const { sources: beforeSources = [], ...beforeF } = folder;
			const { sources: afterSources = [], ...afterF } = afterFolder;
			order(beforeSources.map(sourceKey), afterSources.map(sourceKey), collection.id + "/" + folder.id + "/sources");
			const fc = differences(beforeF, afterF);
			if (fc.length) result.folderChanges.push({ collectionId: collection.id, id: folder.id, title: folder.title, changes: fc });
			const sourceIndex = uniqueIndex(afterSources, sourceKey), beforeIndex = uniqueIndex(beforeSources, sourceKey);
			for (const source of beforeSources) {
				const key = sourceKey(source), matched = sourceIndex.get(key) ?? [];
				const location = { collectionId: collection.id, folderId: folder.id, folder: folder.title, key, title: source.title, type: source.tmdbSourceType, media: source.mediaType };
				if (matched.length !== 1 || beforeIndex.get(key).length !== 1) { result[matched.length ? "ambiguous" : "missing"].push(location); continue; }
				result.matchedSources++;
				const changes = differences(source, matched[0]);
				if (changes.length) result.sourceChanges.push({ ...location, changes });
			}
			for (const source of afterSources) if (!beforeIndex.has(sourceKey(source))) result.added.push({ collectionId: collection.id, folderId: folder.id, key: sourceKey(source) });
		}
		for (const folder of afterFolders) if (!beforeFolders.some((f) => f.id === folder.id)) result.added.push({ collectionId: collection.id, folderId: folder.id });
	}
	for (const collection of output.value) if (!input.value.some((c) => c.id === collection.id)) result.added.push({ collectionId: collection.id });
	result.sortChanges = result.sourceChanges.filter((r) => r.changes.some((c) => c.path === "sortBy"));
	result.boundary = "Collection/folder IDs plus persisted source ID where present, otherwise unique provider/type/entity/media/title tuple. Ambiguous duplicates are reported, never zipped by position. A title change without a source ID is unmatched. This comparison cannot attribute changes to import, editing, sync, export or a build.";
	return result;
}
const [mode, inputFile, second, fourth] = process.argv.slice(2);
assert.ok(["audit", "compare"].includes(mode), "Use audit INPUT OUTPUT_DIRECTORY or compare INPUT EXPORT OUTPUT_DIRECTORY.");
const input = read(inputFile);
const report = mode === "audit" ? audit(input) : compare(input, read(second));
save(mode === "audit" ? second : fourth, mode + ".json", report);
console.log(JSON.stringify(mode === "audit" ? { totalSources: report.totalSources, nativeSources: report.nativeSources, lists: report.lists, blocked: report.blocked, expressions: report.expressions } : { matchedSources: report.matchedSources, sortChanges: report.sortChanges, ambiguous: report.ambiguous.length, missing: report.missing.length, added: report.added.length }, null, 2));
