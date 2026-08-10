import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = `${fs.readFileSync(path.join(root, "js", "cached-networks.js"), "utf8")}
globalThis.__networkCountTest = {
	normaliseCachedNetwork,
	networkMatchesTitleCountFilter,
	formatNetworkTitleCount,
	compareNetworkRows,
};`;

function loadNetworkCountHelpers() {
	const context = { console, Set };
	vm.createContext(context);
	vm.runInContext(source, context, { filename: "js/cached-networks.js" });
	return context.__networkCountTest;
}

test("V1 Network rows preserve confirmed zero and distinguish unknown counts", () => {
	const { normaliseCachedNetwork, formatNetworkTitleCount } = loadNetworkCountHelpers();
	assert.equal(normaliseCachedNetwork({ i: 1, n: "Zero", t: 0 }).titles_count, 0);
	assert.equal(normaliseCachedNetwork({ i: 2, n: "Positive", t: 14 }).titles_count, 14);
	assert.equal(normaliseCachedNetwork({ i: 3, n: "Unknown" }).titles_count, null);
	assert.equal(normaliseCachedNetwork({ i: 4, n: "Invalid", t: null }).titles_count, null);
	assert.equal(formatNetworkTitleCount(0), "0");
	assert.equal(formatNetworkTitleCount(null), "Unknown");
});

test("V1 Network minimum filters include unknown only in the unfiltered view", () => {
	const { networkMatchesTitleCountFilter } = loadNetworkCountHelpers();
	const unknown = { titles_count: null };
	assert.equal(networkMatchesTitleCountFilter(unknown, 0), true);
	assert.equal(networkMatchesTitleCountFilter(unknown, 10), false);
	assert.equal(networkMatchesTitleCountFilter({ titles_count: 0 }, 0), true);
	assert.equal(networkMatchesTitleCountFilter({ titles_count: 9 }, 10), false);
	assert.equal(networkMatchesTitleCountFilter({ titles_count: 10 }, 10), true);
});

test("V1 Network count sorting keeps unknown values last in both directions", () => {
	const { compareNetworkRows } = loadNetworkCountHelpers();
	const rows = [
		{ id: 1, titles_count: null },
		{ id: 2, titles_count: 0 },
		{ id: 3, titles_count: 10 },
	];
	assert.deepEqual(
		rows.toSorted((left, right) => compareNetworkRows(left, right, "titles_count", "asc")).map((row) => row.id),
		[2, 3, 1],
	);
	assert.deepEqual(
		rows.toSorted((left, right) => compareNetworkRows(left, right, "titles_count", "desc")).map((row) => row.id),
		[3, 2, 1],
	);
});
