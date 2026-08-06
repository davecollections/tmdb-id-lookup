import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(rootDir, "index.html"), "utf8");
const styles = fs.readFileSync(path.join(rootDir, "css", "styles.css"), "utf8");

const requiredNotice =
	"This website uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.";
const officialLogoUrl =
	"https://www.themoviedb.org/assets/2/v4/logos/v2/blue_square_2-d537fb228cf3ded904ef09b136fe3fec72548ebc1fea3fbbd1ad9e36364db38b.svg";

test("v1 displays the exact required TMDB notice with the official logo", () => {
	assert.equal(html.split(requiredNotice).length - 1, 1);
	assert.equal(html.split(officialLogoUrl).length - 1, 1);
	assert.match(html, /<img\b[^>]*class="tmdb-attribution-logo"[^>]*alt="TMDB"[^>]*>/s);
});

test("the TMDB mark stays restrained and the attribution notice stays readable", () => {
	assert.match(styles, /\.tmdb-attribution-logo\s*{[^}]*height:\s*auto;[^}]*width:\s*42px;/s);
	assert.match(styles, /\.tmdb-attribution-notice\s*{[^}]*color:\s*#c8d0da;[^}]*font-size:\s*13px;/s);
});
