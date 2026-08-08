import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
	formatStudioLocation,
	normalizeStudioCatalogue,
	parseStudioSearchInput,
	searchStudioCatalogue,
} from "../builder/src/source-add/index.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
	return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

test("V1 Company lookup evidence covers the metadata fields adapted by V2 Studio search", () => {
	const companies = read("js/cached-companies.js");
	const utils = read("js/utils.js");
	const config = read("js/config.js");
	for (const field of ["id", "name", "parent_company", "origin_country", "headquarters"]) {
		assert.match(companies, new RegExp(`company\\.${field}`), field);
	}
	assert.match(companies, /getCountrySearchText\(company\.origin_country\)/);
	assert.match(utils, /countryDisplayNames\?\.of\(code\)/);
	assert.match(config, /new Intl\.DisplayNames/);
	assert.match(config, /US:\s*\["united states", "usa", "america"\]/);
	assert.match(companies, /minCompanyMovieCount/);
});

test("V2 adapts V1 country and headquarters concepts with deliberate country codes and compact display", () => {
	const catalogue = normalizeStudioCatalogue([
		{ i: 1, n: "Australian Studio", c: "AU", h: "10 Harbour Street, Sydney, New South Wales 2000", t: 20 },
		{ i: 2, n: "Gaumont", c: "FR", h: "Aubervilliers", t: 700 },
	]);
	assert.deepEqual(searchStudioCatalogue(catalogue, parseStudioSearchInput("Australia")).results.map((entry) => entry.id), [1]);
	assert.deepEqual(searchStudioCatalogue(catalogue, parseStudioSearchInput("AU")).results.map((entry) => entry.id), [1]);
	assert.equal(formatStudioLocation(catalogue.studios[0]), "AU · Sydney, New South Wales");
});

test("V1 logo containment and safe TMDB link behavior remain represented in the V2 treatment", () => {
	const styles = read("css/styles.css");
	const utils = read("js/utils.js");
	const builderStyles = read("builder/src/styles.css");
	const link = read("builder/src/ui/TmdbEntityLink.jsx");
	assert.match(styles, /\.logo-box\s*\{[^}]*padding:\s*4px/);
	assert.match(styles, /\.studio-logo\s*\{[^}]*object-fit:\s*contain/);
	assert.match(utils, /target:\s*"_blank"[\s\S]*rel:\s*"noopener noreferrer"/);
	assert.match(builderStyles, /\.studio-logo-image\s*\{[^}]*object-fit:\s*contain/);
	assert.match(link, /target="_blank"[\s\S]*rel="noopener noreferrer"/);
});
