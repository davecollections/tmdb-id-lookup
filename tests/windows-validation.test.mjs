import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRelativePath = "manual-tests/nuvio-clients/issue-65-builder-add-source/builder-generated-tmdb-collection.json";
const fixturePath = path.join(rootDir, ...fixtureRelativePath.split("/"));
const fixtureCheckerPath = path.join(rootDir, "scripts", "check-builder-add-source-fixture.mjs");

function runWindowsCheck(controlledExitCode) {
	return spawnSync(
		process.env.ComSpec ?? "cmd.exe",
		["/d", "/s", "/c", "scripts\\check.cmd"],
		{
			cwd: rootDir,
			encoding: "utf8",
			env: {
				...process.env,
				TMDB_ID_LOOKUP_CHECK_TEST_MODE: "1",
				TMDB_ID_LOOKUP_CHECK_TEST_NODE: process.execPath,
				TMDB_ID_LOOKUP_CHECK_TEST_EXIT_CODE: String(controlledExitCode),
			},
		},
	);
}

function subprocessResult(result) {
	return [
		`status=${result.status}`,
		`signal=${result.signal}`,
		`stdout=${result.stdout}`,
		`stderr=${result.stderr}`,
	].join("\n");
}

test("issue #65 generated fixture has effective LF attributes and unchanged semantic JSON", () => {
	const attributeOutput = execFileSync(
		"git",
		["check-attr", "-z", "text", "eol", "--", fixtureRelativePath],
		{ cwd: rootDir, encoding: "utf8" },
	);
	const attributeFields = attributeOutput.split("\0");
	assert.equal(attributeFields.pop(), "");
	assert.deepEqual(attributeFields, [
		fixtureRelativePath,
		"text",
		"set",
		fixtureRelativePath,
		"eol",
		"lf",
	]);

	const fixtureBytes = fs.readFileSync(fixturePath);
	const fixtureText = fixtureBytes.toString("utf8");
	assert.match(fixtureText, /\n/u);
	assert.doesNotMatch(fixtureText, /\r\n/u);

	const committedFixtureBytes = execFileSync(
		"git",
		["show", `HEAD:${fixtureRelativePath}`],
		{ cwd: rootDir },
	);
	assert.deepEqual(
		JSON.parse(fixtureText),
		JSON.parse(committedFixtureBytes.toString("utf8")),
	);

	const checkerOutput = execFileSync(
		process.execPath,
		[fixtureCheckerPath],
		{ cwd: rootDir, encoding: "utf8" },
	);
	assert.match(
		checkerOutput,
		/Sanitized issue #65 TMDB COLLECTION review fixture matches production Builder output\./u,
	);
});

test("scripts/check.cmd returns zero when its controlled child succeeds", {
	skip: process.platform !== "win32",
}, () => {
	const result = runWindowsCheck(0);

	assert.equal(result.error, undefined, subprocessResult(result));
	assert.equal(result.signal, null, subprocessResult(result));
	assert.equal(result.status, 0, subprocessResult(result));
	assert.match(result.stdout, /Controlled check-all test exit: 0\./u);
});

test("scripts/check.cmd propagates its controlled child failure code", {
	skip: process.platform !== "win32",
}, () => {
	const result = runWindowsCheck(37);

	assert.equal(result.error, undefined, subprocessResult(result));
	assert.equal(result.signal, null, subprocessResult(result));
	assert.equal(result.status, 37, subprocessResult(result));
	assert.match(result.stdout, /Controlled check-all test exit: 37\./u);
});
