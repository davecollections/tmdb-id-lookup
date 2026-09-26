import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

export async function runProjectFindChecks(connection, baseUrl, evaluate) {
 await connection.command("Page.navigate", { url: baseUrl + "/tests/fixtures/builder-find-mounted.html" });
 const deadline = Date.now() + 30000;
 while (!await evaluate(connection, "window.findReady === true")) {
  if (Date.now() > deadline) throw new Error("Find fixture did not load");
  await new Promise(resolve => setTimeout(resolve, 50));
 }
 await connection.command("Emulation.setFocusEmulationEnabled", { enabled: true });
 const screenshots = process.env.BUILDER_FIND_SCREENSHOT_DIR;
 if (screenshots) await fs.mkdir(screenshots, { recursive: true });
 async function capture(name) {
  if (!screenshots) return;
  const shot = await connection.command("Page.captureScreenshot", { format: "png" });
  await fs.writeFile(path.join(screenshots, name + ".png"), Buffer.from(shot.data, "base64"));
 }
 async function key(key, code, value, modifiers = 0) {
  await connection.command("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: value, modifiers, ...(key === "Enter" ? { text: "\r" } : {}) });
  await connection.command("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: value });
  await evaluate(connection, "new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
 }
 const viewport = async (width, height = 900) => connection.command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 900 });
 await viewport(1280);
 const local = await evaluate(connection, "window.findLocalCases()");
 const busy = await evaluate(connection, "window.findBusyCases()");
 const performance = await evaluate(connection, "window.findPerformance()");
 const layouts = [], jumps = [];
 const screens = ["initial", "collection", "folder", "source", "duplicates", "none", "cap", "long"];
 for (const [width, height] of [[360,800], [384,852], [393,852], [402,852], [412,852], [899,900], [900,900], [901,900], [1280,900], [393,320], [1280,320]]) {
  await viewport(width, height);
  for (const screen of screens) {
   layouts.push({ screen, ...await evaluate(connection, "window.prepareFindScreen(" + JSON.stringify(screen) + ")") });
   if (width === 1280 && height === 900 && screen !== "long") await capture("desktop-" + screen);
   if (width === 393 && height === 852 && screen === "source") await capture("phone-results");
   // Both ends wrap using native browser Tab events.
   for (const backward of [true, false]) {
    await evaluate(connection, "(() => { const controls=[...document.querySelector('[data-find-project-dialog]').querySelectorAll('button,input')]; controls[" + (backward ? "0" : "controls.length-1") + "].focus({preventScroll:true}); })()");
    await key("Tab", "Tab", 9, backward ? 8 : 0);
    assert.equal(await evaluate(connection, "Boolean(document.activeElement.closest('[data-find-project-dialog]'))"), true);
   }
   await key("Escape", "Escape", 27);
   assert.equal(await evaluate(connection, "window.findCancelCheck()"), true);
  }
 }
 for (const variant of ["enlarged", "forced-colors", "reduced-motion"]) for (const width of [393,1280]) {
  await viewport(width, width === 393 ? 852 : 900);
  await connection.command("Emulation.setEmulatedMedia", { features: variant === "forced-colors" ? [{ name: "forced-colors", value: "active" }] : variant === "reduced-motion" ? [{ name: "prefers-reduced-motion", value: "reduce" }] : [] });
  for (const screen of ["long", "duplicates", "cap", "none"]) {
   layouts.push({ screen, variant, ...await evaluate(connection, "window.prepareFindScreen(" + JSON.stringify(screen) + ", " + (variant === "enlarged") + ")") });
   if (variant === "forced-colors" && screen === "duplicates") {
    assert.equal(await evaluate(connection, "(() => { const row=document.querySelector('.find-project-result'); row.focus(); const style=getComputedStyle(row); return style.borderStyle === 'solid' && parseFloat(style.borderWidth)>=1; })()"), true);
   }
   await key("Escape", "Escape", 27); await evaluate(connection, "window.findCancelCheck()");
  }
 }
 for (const reduced of [false,true]) for (const width of [360,393,899,900,901,1280]) {
  await viewport(width, width < 900 ? 852 : 900);
  await connection.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: reduced ? "reduce" : "no-preference" }] });
  for (const type of ["collection","folder","source"]) {
   await evaluate(connection, "window.prepareFindJump(" + JSON.stringify(type) + ", true)");
   await key("Enter", "Enter", 13);
   jumps.push({ reduced, ...await evaluate(connection, "window.finishFindJump(false)") });
   if (!reduced && width === 1280 && type === "source") await capture("desktop-jump-target");
   if (!reduced && width === 393 && type !== "collection") await capture("phone-" + type + "-jump");
   await evaluate(connection, "window.finishFindJump(true)");
  }
 }
 await viewport(1280);
 await connection.command("Emulation.setEmulatedMedia", { features: [] });
 // Exercise native pointer/touch activation in addition to the keyboard matrix.
 for (const width of [393,1280]) for (const type of ["collection","folder","source"]) {
  await viewport(width, width < 900 ? 852 : 900);
  await evaluate(connection, "window.prepareFindJump(" + JSON.stringify(type) + ")");
  const hit = await evaluate(connection, "(() => {const r=document.querySelector('.find-project-result').getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2};})()");
  if (width < 900) {
   await connection.command("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...hit }] });
   await connection.command("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } else {
   await connection.command("Input.dispatchMouseEvent", { type: "mousePressed", ...hit, button: "left", buttons: 1, clickCount: 1 });
   await connection.command("Input.dispatchMouseEvent", { type: "mouseReleased", ...hit, button: "left", buttons: 0, clickCount: 1 });
  }
  jumps.push({ activation: width < 900 ? "touch" : "pointer", ...await evaluate(connection, "window.finishFindJump()") });
 }
 await viewport(1280);
 await evaluate(connection, 'window.prepareFindScreen("workspace")');
 await capture("workspace-find-action");
 // Native keyboard reorder and captured pointer gestures make Find unavailable.
 await evaluate(connection, "document.querySelector('[data-action=reorder-collection]').focus()");
 await key("Enter", "Enter", 13);
 assert.equal(await evaluate(connection, "document.querySelector('[data-action=open-project-find]').disabled"), true, "Keyboard reorder locks Find");
 await key("Escape", "Escape", 27);
 assert.equal(await evaluate(connection, "!document.querySelector('[data-action=open-project-find]').disabled"), true);
 const point = await evaluate(connection, "(() => {const r=document.querySelector('[data-action=reorder-collection]').getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2};})()");
 await connection.command("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
	await connection.command("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", buttons: 1, clickCount: 1 });
 assert.equal(await evaluate(connection, "(() => { document.querySelector('[data-action=open-project-find]').click(); return !document.querySelector('[data-find-project-dialog]'); })()"), true, "Captured pointer prevents Find before drag threshold");
 await connection.command("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y + 12, button: "left", buttons: 1 });
 assert.equal(await evaluate(connection, "document.querySelector('[data-action=open-project-find]').disabled"), true, "Active pointer drag disables Find");
 await key("Escape", "Escape", 27);
 await connection.command("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", buttons: 0, clickCount: 1 });
 // Accessible names include type/path and quiet duplicate context.
 await evaluate(connection, 'window.prepareFindScreen("duplicates")');
 const ax = await connection.command("Accessibility.getFullAXTree");
 const buttons = ax.nodes.filter(n => n.role?.value === "button").map(n => n.name?.value);
 assert.ok(buttons.some(name => name.includes("Same source") && name.includes("Source") && name.includes("Same collection / Same folder") && name.includes("Position 1 of 8")));
 await key("Escape", "Escape", 27);
 assert.deepEqual(await evaluate(connection, "window.__mountedErrors"), []);
 if (screenshots) await fs.writeFile(path.join(screenshots, "find-measurements.json"), JSON.stringify({local,busy,performance,layouts,jumps},null,2));
 return { local, busy, performance, layouts, jumps, errors: await evaluate(connection, "window.__mountedErrors") };
}
