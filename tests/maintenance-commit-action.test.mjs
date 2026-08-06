import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function actionSource() {
	return fs.readFile(
		path.join(root, ".github", "actions", "commit-maintenance-state", "action.yml"),
		"utf8",
	);
}

test("shared maintenance action stages only caller-declared paths", async () => {
	const source = await actionSource();
	assert.match(source, /message:\s*[\s\S]*required: true/);
	assert.match(source, /paths:\s*[\s\S]*required: true/);
	assert.match(source, /COMMIT_PATHS: \$\{\{ inputs\.paths \}\}/);
	assert.match(source, /while IFS= read -r path/);
	assert.match(source, /git add -A -- "\$path"/);
	assert.doesNotMatch(source, /git add (?:\.|--all)(?:\s|$)/);
	assert.doesNotMatch(source, /git add -A(?:\s*(?:\r?\n|$))/);
});

test("shared maintenance action preserves commit, rebase, push, and failure handling", async () => {
	const source = await actionSource();
	assert.match(source, /set -euo pipefail/);
	assert.match(source, /git diff --cached --quiet/);
	assert.match(source, /git commit -m "\$COMMIT_MESSAGE"/);
	assert.match(source, /for attempt in 1 2 3/);
	assert.match(source, /git pull --rebase origin main/);
	assert.match(source, /git rebase --abort \|\| true/);
	assert.match(source, /Unable to rebase declared maintenance changes safely/);
	assert.match(source, /git push origin HEAD:main/);
	assert.match(source, /Unable to push declared maintenance changes after three attempts/);
	assert.doesNotMatch(source, /--force(?:-with-lease)?/);
});

test("shared maintenance action contains no retired typed recovery hook", async () => {
	const source = await actionSource();
	assert.doesNotMatch(
		source,
		/integrity-manifest|RECOVERY_INTEGRITY|verify-entity-count-recovery-integrity/,
	);
});
