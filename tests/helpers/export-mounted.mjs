// Shared by full Workspace validation and focused Send validation.
export async function runExportRegressions(connection, origin, evaluate) {
	// Keep the existing byte/filename/warning/editor/feedback regressions intact.
	await connection.command("Page.navigate", { url: `${origin}/tests/fixtures/builder-export-collections-mounted.html` });
	const exportDeadline = Date.now() + 30000;
	while (Date.now() < exportDeadline && !await evaluate(connection, "window.exportFixtureReady === true")) await new Promise((resolve) => setTimeout(resolve, 50));
	const exports = [];
	for (const width of [393,900,1280]) {
		await connection.command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 900 });
		exports.push(await evaluate(connection, "window.runExportScenario()"));
	}
	const regressions = {};
	for (const name of ["EditorCases", "FeedbackCases", "WarningCases", "LargeCase"]) regressions[name] = await evaluate(connection, `window.runExport${name}()`);
	return { exports, regressions, exportErrors: await evaluate(connection, "window.__mountedErrors") };
}
