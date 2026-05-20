import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function listFiles(dir, extensions) {
	const allowedExtensions = Array.isArray(extensions) ? extensions : [extensions];

	return fs
		.readdirSync(path.join(rootDir, dir), { withFileTypes: true })
		.filter((entry) => entry.isFile() && allowedExtensions.some((extension) => entry.name.endsWith(extension)))
		.map((entry) => path.join(dir, entry.name));
}

function readText(file) {
	return fs.readFileSync(path.join(rootDir, file), "utf8");
}

function readJson(file) {
	return JSON.parse(readText(file));
}

function checkJavaScriptSyntax() {
	const files = [...listFiles("js", ".js"), ...listFiles("scripts", [".js", ".mjs"])];

	for (const file of files) {
		try {
			execFileSync(process.execPath, ["--check", path.join(rootDir, file)], { stdio: "pipe" });
		} catch (error) {
			failures.push(`${file}: JavaScript syntax check failed\n${error.stderr || error.message}`);
		}
	}
}

function checkDataJson() {
	for (const file of listFiles("data", ".json")) {
		try {
			readJson(file);
		} catch (error) {
			failures.push(`${file}: invalid JSON (${error.message})`);
		}
	}
}

function checkDuplicateHtmlIds() {
	const html = readText("index.html");
	const ids = [...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1]);
	const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
	const uniqueDuplicateIds = [...new Set(duplicateIds)];

	if (uniqueDuplicateIds.length) {
		failures.push(`index.html: duplicate IDs found: ${uniqueDuplicateIds.join(", ")}`);
	}
}

function checkUnsafeFrontendPatterns() {
	const patterns = [/\.innerHTML\b/, /\.outerHTML\b/, /\.insertAdjacentHTML\b/, /\beval\s*\(/, /\bnew Function\b/];

	for (const file of listFiles("js", ".js")) {
		const source = readText(file);

		for (const pattern of patterns) {
			if (pattern.test(source)) {
				failures.push(`${file}: contains ${pattern}`);
			}
		}
	}
}

function parseCsvLine(line) {
	const values = [];
	let value = "";
	let inQuotes = false;

	for (let index = 0; index < line.length; index += 1) {
		const character = line[index];

		if (character === '"') {
			if (inQuotes && line[index + 1] === '"') {
				value += '"';
				index += 1;
			} else {
				inQuotes = !inQuotes;
			}
			continue;
		}

		if (character === "," && !inQuotes) {
			values.push(value);
			value = "";
			continue;
		}

		value += character;
	}

	values.push(value);
	return values;
}

function parseCsvFile(file) {
	const lines = readText(file)
		.split(/\r?\n/)
		.filter((line) => line.trim());

	if (!lines.length) {
		failures.push(`${file}: CSV file is empty`);
		return [];
	}

	const headers = parseCsvLine(lines[0]).map((header) => header.trim());

	return lines.slice(1).map((line, lineIndex) => {
		const values = parseCsvLine(line);

		if (values.length !== headers.length) {
			failures.push(`${file}:${lineIndex + 2}: expected ${headers.length} columns, found ${values.length}`);
		}

		return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
	});
}

function reportDuplicateValues(label, values) {
	const seen = new Map();

	for (const value of values) {
		if (!value) {
			continue;
		}

		seen.set(value, (seen.get(value) || 0) + 1);
	}

	const duplicates = [...seen.entries()]
		.filter(([, count]) => count > 1)
		.map(([value, count]) => `${value} (${count})`);

	if (duplicates.length) {
		failures.push(`${label}: duplicate values found: ${duplicates.slice(0, 20).join(", ")}`);
	}
}

function checkCompactCache(file, idKey, nameKey, label) {
	const records = readJson(file);

	if (!Array.isArray(records)) {
		failures.push(`${file}: expected an array`);
		return new Set();
	}

	const ids = [];

	records.forEach((record, index) => {
		const id = Number(record[idKey]);

		if (!Number.isInteger(id) || id <= 0) {
			failures.push(`${file}: row ${index + 1} has invalid ${label} ID`);
		}

		if (!String(record[nameKey] || "").trim()) {
			failures.push(`${file}: row ${index + 1} has no ${label} name`);
		}

		ids.push(String(record[idKey]));
	});

	reportDuplicateValues(`${file} ${label} IDs`, ids);
	return new Set(ids);
}

function checkCsvIds(file, label) {
	const rows = parseCsvFile(file);
	const ids = rows.map((row) => row.id);

	rows.forEach((row, index) => {
		const id = Number(row.id);

		if (!Number.isInteger(id) || id <= 0) {
			failures.push(`${file}: row ${index + 2} has invalid ${label} ID`);
		}

		if (!String(row.name || "").trim()) {
			failures.push(`${file}: row ${index + 2} has no ${label} name`);
		}
	});

	reportDuplicateValues(`${file} ${label} IDs`, ids);
	return rows;
}

function checkCachedDataIds() {
	const companyJsonIds = checkCompactCache("data/companies.min.json", "i", "n", "company");
	const networkJsonIds = checkCompactCache("data/tv-networks.min.json", "i", "n", "network");
	const companyCsvRows = checkCsvIds("data/companies.csv", "company");
	const networkCsvRows = checkCsvIds("data/tv-networks.csv", "network");

	if (companyJsonIds.size !== companyCsvRows.length) {
		failures.push("Company JSON and CSV cache sizes do not match");
	}

	if (networkJsonIds.size !== networkCsvRows.length) {
		failures.push("Network JSON and CSV cache sizes do not match");
	}

	const genreRows = parseCsvFile("data/genres.csv");
	const genreKeys = genreRows.map((row) => `${row.type}:${row.media}:${row.tmdb_id}`);

	for (const [index, row] of genreRows.entries()) {
		if (!String(row.name || "").trim()) {
			failures.push(`data/genres.csv: row ${index + 2} has no genre name`);
		}

		if (!Number.isInteger(Number(row.tmdb_id)) || Number(row.tmdb_id) <= 0) {
			failures.push(`data/genres.csv: row ${index + 2} has invalid genre ID`);
		}
	}

	reportDuplicateValues("data/genres.csv genre reference keys", genreKeys);
}

function getConstObjectBlock(source, constName, file) {
	const marker = `const ${constName} = {`;
	const start = source.indexOf(marker);

	if (start === -1) {
		failures.push(`${file}: missing ${constName}`);
		return "";
	}

	const blockStart = source.indexOf("{", start);
	let depth = 0;

	for (let index = blockStart; index < source.length; index += 1) {
		if (source[index] === "{") {
			depth += 1;
		}

		if (source[index] === "}") {
			depth -= 1;

			if (depth === 0) {
				return source.slice(blockStart + 1, index);
			}
		}
	}

	failures.push(`${file}: could not parse ${constName}`);
	return "";
}

function getObjectKeys(block) {
	return [...block.matchAll(/^\s*(?:"([^"]+)"|([A-Za-z_$][\w$]*))\s*:/gm)].map((match) => match[1] || match[2]);
}

function getNumericObjectEntries(block) {
	return [...block.matchAll(/^\s*(\d+)\s*:\s*"([^"]+)"/gm)].map((match) => ({
		id: match[1],
		url: match[2],
	}));
}

function getPresetIds(block) {
	return [...block.matchAll(/^\s*([A-Za-z_$][\w$]*)\s*:\s*\[([\s\S]*?)\]/gm)].flatMap(([, , values]) =>
		[...values.matchAll(/\d+/g)].map((match) => match[0]),
	);
}

function assertIdsExist(ids, validIds, label) {
	const missingIds = [...new Set(ids)].filter((id) => !validIds.has(String(id)));

	if (missingIds.length) {
		failures.push(`${label}: IDs not found in cache: ${missingIds.join(", ")}`);
	}
}

function assertUrlEntries(entries, label) {
	for (const entry of entries) {
		if (!/^https?:\/\//.test(entry.url)) {
			failures.push(`${label}: ID ${entry.id} has invalid URL`);
		}
	}
}

function checkNuvioExportSanity() {
	const companyIds = new Set(readJson("data/companies.min.json").map((company) => String(company.i)));
	const networkIds = new Set(readJson("data/tv-networks.min.json").map((network) => String(network.i)));
	const cachedExportSource = readText("js/cached-nuvio-export.js");
	const genreExportSource = readText("js/genre-nuvio-export.js");
	const genreRows = parseCsvFile("data/genres.csv");
	const genreCounts = readJson("data/genre-counts.json").counts || {};

	const companyPresetIds = getPresetIds(getConstObjectBlock(cachedExportSource, "companySelectionPresets", "js/cached-nuvio-export.js"));
	const networkPresetIds = getPresetIds(getConstObjectBlock(cachedExportSource, "networkSelectionPresets", "js/cached-nuvio-export.js"));
	const companyCoverEntries = getNumericObjectEntries(
		getConstObjectBlock(cachedExportSource, "curatedCompanyCoverUrls", "js/cached-nuvio-export.js"),
	);
	const networkCoverEntries = getNumericObjectEntries(
		getConstObjectBlock(cachedExportSource, "curatedNetworkCoverUrls", "js/cached-nuvio-export.js"),
	);
	const networkGifEntries = getNumericObjectEntries(
		getConstObjectBlock(cachedExportSource, "networkFocusGifUrls", "js/cached-nuvio-export.js"),
	);

	assertIdsExist(companyPresetIds, companyIds, "Company selection presets");
	assertIdsExist(networkPresetIds, networkIds, "Network selection presets");
	assertIdsExist(
		companyCoverEntries.map((entry) => entry.id),
		companyIds,
		"Curated company cover URLs",
	);
	assertIdsExist(
		networkCoverEntries.map((entry) => entry.id),
		networkIds,
		"Curated network cover URLs",
	);
	assertIdsExist(
		networkGifEntries.map((entry) => entry.id),
		networkIds,
		"Network focus GIF URLs",
	);
	assertUrlEntries(companyCoverEntries, "Curated company cover URLs");
	assertUrlEntries(networkCoverEntries, "Curated network cover URLs");
	assertUrlEntries(networkGifEntries, "Network focus GIF URLs");

	const genreNames = new Set(genreRows.map((row) => row.name));
	const posterNames = new Set(getObjectKeys(getConstObjectBlock(genreExportSource, "genrePosterArtworkFiles", "js/genre-nuvio-export.js")));
	const wideNames = new Set(getObjectKeys(getConstObjectBlock(genreExportSource, "genreWideArtworkNames", "js/genre-nuvio-export.js")));
	const missingPosterNames = [...genreNames].filter((name) => !posterNames.has(name));
	const missingWideNames = [...genreNames].filter((name) => !wideNames.has(name));

	if (missingPosterNames.length) {
		failures.push(`Genre poster artwork map missing: ${missingPosterNames.join(", ")}`);
	}

	if (missingWideNames.length) {
		failures.push(`Genre wide artwork map missing: ${missingWideNames.join(", ")}`);
	}

	for (const row of genreRows) {
		const countKey =
			row.type === "Curated TMDB List" ? `list:${row.tmdb_id}` : `${row.media === "TV" ? "tv" : "movie"}:${row.tmdb_id}`;

		if (!Object.prototype.hasOwnProperty.call(genreCounts, countKey)) {
			failures.push(`data/genre-counts.json: missing count for ${row.name} (${countKey})`);
		}
	}
}

checkJavaScriptSyntax();
checkDataJson();
checkDuplicateHtmlIds();
checkUnsafeFrontendPatterns();
checkCachedDataIds();
checkNuvioExportSanity();

if (failures.length) {
	console.error(failures.join("\n\n"));
	process.exit(1);
}

console.log("Frontend checks passed.");
