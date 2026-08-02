import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { normalizeTextLineEndings } from "../scripts/lib/text-comparison.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRelativePath = "manual-tests/nuvio-clients/issue-74-builder-add-people/builder-generated-people-sources.json";
const fixturePath = path.join(rootDir, ...fixtureRelativePath.split("/"));
const desktopExportPath = path.join(
	rootDir,
	"manual-tests",
	"nuvio-clients",
	"issue-74-builder-add-people",
	"results",
	"nuvio-desktop-immediate-export.json",
);
const fixtureCheckerPath = path.join(rootDir, "scripts", "check-builder-people-fixture.mjs");

function textContentsEqual(left, right) {
	return normalizeTextLineEndings(left) === normalizeTextLineEndings(right);
}

function writeTemporaryTexts(t, contents) {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tmdb-fixture-line-endings-"));
	t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
	return contents.map((content, index) => {
		const filePath = path.join(directory, `fixture-${index}.txt`);
		fs.writeFileSync(filePath, content, "utf8");
		return filePath;
	});
}

function readText(filePath) {
	return fs.readFileSync(filePath, "utf8");
}

test("LF and equivalent CRLF textual fixtures compare equal", (t) => {
	const [lfPath, crlfPath] = writeTemporaryTexts(t, ["alpha\nbeta\n", "alpha\r\nbeta\r\n"]);
	assert.equal(textContentsEqual(readText(lfPath), readText(crlfPath)), true);
});

test("LF and equivalent standalone-CR textual fixtures compare equal", (t) => {
	const [lfPath, crPath] = writeTemporaryTexts(t, ["alpha\nbeta\n", "alpha\rbeta\r"]);
	assert.equal(textContentsEqual(readText(lfPath), readText(crPath)), true);
});

test("mixed CRLF, standalone CR, and LF canonicalize consistently", (t) => {
	const [lfPath, mixedPath] = writeTemporaryTexts(t, [
		"alpha\nbeta\ngamma\ndelta\n",
		"alpha\r\nbeta\rgamma\ndelta\r\n",
	]);
	assert.equal(textContentsEqual(readText(lfPath), readText(mixedPath)), true);
});

test("empty textual fixtures remain comparable", (t) => {
	const [leftPath, rightPath] = writeTemporaryTexts(t, ["", ""]);
	assert.equal(textContentsEqual(readText(leftPath), readText(rightPath)), true);
});

test("a changed character remains detectable", () => {
	assert.equal(textContentsEqual("alpha\nbeta\n", "alpha\nzeta\n"), false);
});

test("a changed JSON value remains detectable", () => {
	assert.equal(textContentsEqual('{\n  "value": 1\n}\n', '{\r\n  "value": 2\r\n}\r\n'), false);
});

test("added or removed textual content and final newlines remain detectable", () => {
	assert.equal(textContentsEqual("alpha\nbeta\n", "alpha\nbeta\ngamma\n"), false);
	assert.equal(textContentsEqual("alpha\nbeta\n", "alpha\n"), false);
	assert.equal(textContentsEqual("alpha\nbeta\n", "alpha\nbeta"), false);
});

test("changed indentation remains detectable", () => {
	assert.equal(textContentsEqual('{\n  "value": 1\n}\n', '{\r\n    "value": 1\r\n}\r\n'), false);
});

test("changed meaningful spaces and tabs remain detectable", () => {
	assert.equal(textContentsEqual("alpha beta\n", "alpha  beta\r\n"), false);
	assert.equal(textContentsEqual("alpha\tbeta\n", "alpha beta\r\n"), false);
});

test("changed ordering remains detectable", () => {
	assert.equal(textContentsEqual("first\nsecond\n", "second\r\nfirst\r\n"), false);
});

test("binary comparisons remain byte-sensitive and outside text normalization", () => {
	const lfBytes = Buffer.from("alpha\nbeta\n", "utf8");
	const crlfBytes = Buffer.from("alpha\r\nbeta\r\n", "utf8");
	assert.equal(lfBytes.equals(crlfBytes), false);
	assert.throws(() => normalizeTextLineEndings(lfBytes), {
		name: "TypeError",
		message: "normalizeTextLineEndings requires text input.",
	});
});

test("the committed issue #74 fixture passes equivalent Windows checkout behavior", (t) => {
	const committedText = execFileSync("git", ["show", `HEAD:${fixtureRelativePath}`], {
		cwd: rootDir,
		encoding: "utf8",
	});
	const windowsCheckoutText = committedText.replace(/\n/gu, "\r\n");
	const [windowsFixturePath] = writeTemporaryTexts(t, [windowsCheckoutText]);
	const worktreeText = readText(fixturePath);

	assert.notEqual(windowsCheckoutText, committedText);
	assert.equal(textContentsEqual(readText(windowsFixturePath), committedText), true);
	assert.equal(textContentsEqual(worktreeText, committedText), true);
	assert.deepEqual(JSON.parse(readText(windowsFixturePath)), JSON.parse(committedText));
});

test("the issue #74 checker retains fixture and Desktop export contract validation", () => {
	const exportBytesBefore = fs.readFileSync(desktopExportPath);
	const output = execFileSync(process.execPath, [fixtureCheckerPath], {
		cwd: rootDir,
		encoding: "utf8",
	});

	assert.match(output, /Sanitized issue #74 People review fixture matches production Builder output\./u);
	assert.match(
		output,
		/Owner-supplied Nuvio Desktop export preserves issue #74 grouping, distinct titles, source identities, and curated artwork\./u,
	);
	assert.deepEqual(fs.readFileSync(desktopExportPath), exportBytesBefore);
});
