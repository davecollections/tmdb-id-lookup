import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

export async function runHierarchyOrderingChecks(connection, baseUrl, evaluate) {
	await connection.command("Page.navigate", { url: baseUrl + "/tests/fixtures/builder-collection-folders-mounted.html" });
	const deadline = Date.now() + 30000;
	while (!await evaluate(connection,"window.collectionFoldersFixtureReady === true")) {
		if(Date.now()>deadline) throw new Error("Hierarchy fixture did not load");
		await new Promise(resolve=>setTimeout(resolve,50));
	}
	await connection.command("Emulation.setFocusEmulationEnabled",{enabled:true});
	const screenshots=process.env.BUILDER_ORDERING_SCREENSHOT_DIR;
	if(screenshots) await fs.mkdir(screenshots,{recursive:true});
	async function capture(name) {
		if(!screenshots)return;
		const shot=await connection.command("Page.captureScreenshot",{format:"png"});
		await fs.writeFile(path.join(screenshots,name+".png"),Buffer.from(shot.data,"base64"));
	}
	async function viewport(width,height=852) {
		await connection.command("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:width<900});
		await evaluate(connection,"window.orderingExpectedWidth="+width);
	}
	const frame=()=>evaluate(connection,"new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
	async function key(key,code,value,modifiers=0) {
		await connection.command("Input.dispatchKeyEvent",{type:"keyDown",key,code,windowsVirtualKeyCode:value,modifiers,...(key==="Enter"?{text:"\r"}:{})});
		await connection.command("Input.dispatchKeyEvent",{type:"keyUp",key,code,windowsVirtualKeyCode:value}); await frame();
	}
	async function checkMenu(noun,width) {
		const menu=await evaluate(connection,"window.prepareOrderingMenu("+JSON.stringify(noun)+")");
		const expected={collection:["Edit","Move to top","Move to bottom","Move folders","Delete folders","Delete collection"],folder:["Edit","Move to top","Move to bottom","Move folders","Delete"],source:["Edit source","Delete"]};
		assert.deepEqual(menu.items.map(item=>item.text),expected[noun],"Complete "+noun+" action names remain unchanged");
		await capture(width+"-enlarged-"+noun+"-menu");
		const enabledCount=await evaluate(connection,'document.querySelectorAll("[data-actions-menu]:not([hidden]) button:not(:disabled)").length'), reached=[];
		for(let i=0;i<enabledCount;i++) {
			reached.push(await evaluate(connection,"window.measureOrderingMenuFocus()"));
			await key("ArrowDown","ArrowDown",40);
		}
		assert.equal(new Set(reached).size,enabledCount,"Every enabled enlarged menu action is reachable");
		assert.ok(reached.includes("delete-"+noun),"Enlarged Delete action is reachable");
		if(menu.scroll>menu.client) {
			assert.equal(await evaluate(connection,"window.scrollOrderingMenu()"),true);
			await capture(width+"-enlarged-"+noun+"-menu-bottom");
		}
		await key("Escape","Escape",27);
		assert.equal(await evaluate(connection,"window.isOrderingMenuTriggerFocused()"),true,"Enlarged menu Escape restores its exact trigger element");
		return {...menu,reached};
	}
	const pinnedCollections = { layouts: [], menus: [], touch: [], clicks: [], updates: [], externalRequests: [] };
	const pinGeometryEvidence = [];
	const stopPinRequests = connection.onEvent(({ method, params }) => {
		if (method === "Network.requestWillBeSent" && /^https?:/.test(params.request.url) && new URL(params.request.url).hostname !== "127.0.0.1") pinnedCollections.externalRequests.push(params.request.url);
	});
	try {
		for (const width of [360,384,393,402,412,900,1024,1280]) {
			await viewport(width, 1000);
			await connection.command("Emulation.setTouchEmulationEnabled", { enabled: width < 900, maxTouchPoints: 1 });
			for (const enlarged of [false,true]) {
				for (const forced of [false,true]) {
					await connection.command("Emulation.setEmulatedMedia", { features: [{ name: "forced-colors", value: forced ? "active" : "none" }, { name: "prefers-reduced-motion", value: forced ? "reduce" : "no-preference" }] });
					await evaluate(connection, 'document.documentElement.style.fontSize=' + JSON.stringify(enlarged ? "200%" : ""));
					const layout = await evaluate(connection, "window.prepareCollectionPins()");
					assert.equal(layout.badges, 4);
					assert.equal(layout.rootFontSize, enlarged ? "32px" : "16px");
					const tree = await connection.command("Accessibility.getFullAXTree");
					const described = tree.nodes.filter(node => !node.ignored && node.role?.value === "button" && node.description?.value === "Pinned to top");
					const named = tree.nodes.filter(node => !node.ignored && node.role?.value === "button" && /\bPINNED\b/.test(node.name?.value ?? ""));
					assert.equal(described.length, 1, "Hidden-title Collection retains one pinned description");
					assert.equal(named.length, 3, "Visible-title Collection names include visible pin status");
					assert.ok(named.every(node => node.name.value.split("PINNED").length === 2 && !node.description?.value), "No duplicate pin meaning in accessible names/descriptions");
					assert.ok(named.some(node => node.properties.some(property => property.name === "pressed" && property.value.value === "true")), "Selected pinned Collection keeps pressed state");
					assert.equal(described[0].name.value, layout.buttons.find(button => button.hidden).name, "Hidden-title accessible fallback is preserved");
					assert.ok(!tree.nodes.some(node => !node.ignored && node.role?.value === "StaticText" && node.name?.value === "Pinned to top"), "Hidden description is not repeated in reading order");
					const { geometry, ...summary } = layout;
					pinnedCollections.layouts.push(summary);
					if (screenshots) pinGeometryEvidence.push(layout);
					const suffix = width + (enlarged ? "-200pct" : "") + (forced ? "-forced" : "");
					if ([393,900,1280].includes(width)) await capture("pinned-metadata-" + suffix);
					if (screenshots && width === 900 && enlarged && !forced) {
						const shot = await connection.command("Page.captureScreenshot", {format:"png",captureBeyondViewport:true,clip:{x:0,y:0,width,height:1400,scale:1}});
						await fs.writeFile(path.join(screenshots,"pinned-metadata-900-200pct-complete.png"),Buffer.from(shot.data,"base64"));
					}
					await evaluate(connection,"window.beginPinMenuCheck()");
					await key("Enter","Enter",13);
					pinnedCollections.menus.push({width,enlarged,forced,...await evaluate(connection,"window.checkPinMenu()")});
					if ([393,1280].includes(width) && !enlarged && !forced) await capture("pinned-metadata-" + width + "-menu-open");
					await key("Escape","Escape",27);
					if ([360,393].includes(width) && !enlarged && !forced) {
						for (const side of ["left","right"]) {
							await evaluate(connection,"window.prepareCollectionPins()");
							const point = await evaluate(connection,"window.beginPinSelectionCheck()");
							await connection.command("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:point[side],y:point.y}]});
							await connection.command("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]}); await frame();
							pinnedCollections.touch.push({width,side,...await evaluate(connection,"window.checkPinSelection()")});
						}
					}
					if (width === 1280 && !enlarged && !forced) {
						const point = await evaluate(connection,"window.beginPinSelectionCheck()");
						for (const type of ["mousePressed","mouseReleased"]) await connection.command("Input.dispatchMouseEvent",{type,x:point.x,y:point.y,button:"left",clickCount:1});
						await frame();
						pinnedCollections.clicks.push(await evaluate(connection,"window.checkPinSelection()"));
					}
				}
			}
		}
		await connection.command("Emulation.setTouchEmulationEnabled", {enabled:false});
		await connection.command("Emulation.setEmulatedMedia", { features: [] });
		await evaluate(connection, 'document.documentElement.style.fontSize=""');
		for (const width of [393,1280]) {
			await viewport(width,1000);
			await evaluate(connection, "window.prepareCollectionPins()");
			await evaluate(connection, 'document.querySelector("[data-node-type=collection]").focus()');
			await key("Tab","Tab",9);
			assert.equal(await evaluate(connection,"document.activeElement.dataset.action"), "open-collection-actions", "Tab goes directly to original menu target");
			await key("Tab","Tab",9,8);
			assert.equal(await evaluate(connection,"document.activeElement.dataset.nodeType"), "collection", "Reverse Tab returns to selection button");
			await key("Tab","Tab",9,8);
			assert.equal(await evaluate(connection,'document.activeElement.className'), "reorder-handle", "Original reorder handle remains immediately before selection");
			await key(" ","Space",32);
			await key("Escape","Escape",27);
			assert.equal(await evaluate(connection,'document.activeElement.className'), "reorder-handle", "Keyboard reorder still cancels on its handle");
			const hidden = await evaluate(connection,"window.selectHiddenPinnedCollection()");
			assert.ok(hidden.buttons.some(button => button.hidden && button.selected));
			const updates = [];
			updates.push(await evaluate(connection,"window.changeCollectionPinThroughEditor()"));
			updates.push(await evaluate(connection,"window.changeCollectionPinsGlobally(true)"));
			updates.push(await evaluate(connection,"window.changeCollectionPinsGlobally(false)"));
			updates.push(await evaluate(connection,"window.replaceCollectionPinImport()"));
			assert.deepEqual(updates.map(update => update.badges), [3,7,0,4]);
			pinnedCollections.updates.push({width, updates});
		}
		assert.deepEqual(pinnedCollections.externalRequests, [], "Local pin scenarios require zero external requests");
		if (screenshots) await fs.writeFile(path.join(screenshots,"pinned-metadata-evidence.json"), JSON.stringify({ ...pinnedCollections, layouts: pinGeometryEvidence }, null, 2) + "\n");
	} finally {
		stopPinRequests();
		// Leave the pointer off controls before the existing header-style comparisons.
		await connection.command("Input.dispatchMouseEvent", {type:"mouseMoved",x:0,y:0});
		await connection.command("Emulation.setTouchEmulationEnabled", {enabled:false});
		await connection.command("Emulation.setEmulatedMedia", {features: []});
		await evaluate(connection, 'document.documentElement.style.fontSize=""');
	}
	const menuDiagnostics=process.env.BUILDER_ORDERING_MENU_DIAGNOSTICS==="1";
	await evaluate(connection,"window.orderingMenuDiagnostics="+menuDiagnostics);
	const layouts=[], actions=[], enlargedChecks=[], ordinaryMenus=[];
	if(menuDiagnostics) {
		await viewport(360);
		for(const noun of ["collection","folder","source"]) {
			const after=await evaluate(connection,"window.prepareOrderingMenu("+JSON.stringify(noun)+")");
			// Compare ordinary geometry with the previous two CSS values, then restore.
			const before=await evaluate(connection,'(()=>{const buttons=[...document.querySelectorAll("[data-actions-menu]:not([hidden]) button")];for(const item of buttons){item.style.minWidth="auto";item.style.overflowWrap="normal";}const result=window.measureOrderingMenuDetails();for(const item of buttons){item.style.removeProperty("min-width");item.style.removeProperty("overflow-wrap");}return result;})()');
			const shape=details=>({clientWidth:details.clientWidth,scrollWidth:details.scrollWidth,rect:details.rect,items:details.items.map(({text,rect,lineCount})=>({text,rect,lineCount}))});
			assert.deepEqual(shape(after.details),shape(before),"Ordinary "+noun+" menu geometry is unchanged");
			ordinaryMenus.push({noun,unchanged:true,before,after:after.details});
			await capture("360-ordinary-"+noun+"-menu");
			await key("Escape","Escape",27);
		}
	}
	for(const width of [360,375,384,393,402,412,899,900,901,1023,1024,1025,1079,1080,1280]) {
		await viewport(width);
		for(const level of ["collections","folders","sources"]) {
			layouts.push(await evaluate(connection,"window.prepareHierarchyOrdering("+JSON.stringify(level)+")"));
			if([360,375,384,393,900,901,1023,1024,1025,1079,1080,1280].includes(width)) {
				const tree=await connection.command("Accessibility.getFullAXTree");
				for(const active of width<900?[level]:["collections","folders","sources"]) {
					assert.ok(tree.nodes.some(node=>node.role?.value==="button"&&node.name?.value==="Sort "+active[0].toUpperCase()+active.slice(1)),"Sort accessible name exposed for "+active);
					const createName={collections:"New collection",folders:"New folder",sources:"Add source"}[active];
					assert.ok(tree.nodes.some(node=>node.role?.value==="button"&&node.name?.value===createName),"Full creation accessible name exposed for "+active);
				}
			}
			if([360,375,384,393].includes(width))await capture(width+"-"+level);
		}
		if([900,901,1023,1024,1025,1079,1080,1280].includes(width)) await capture(width+"-workspace");
		if([900,901,1024,1080].includes(width)) {
			await evaluate(connection,'document.querySelector("[data-action=sort-collections]").focus()');
			await key("Enter","Enter",13);
			assert.equal(await evaluate(connection,'Boolean(document.querySelector("[data-hierarchy-sort-dialog]"))'),true,"Narrow-desktop keyboard activation opens Sort");
			await key("Escape","Escape",27);
			assert.equal(await evaluate(connection,"document.activeElement.dataset.action"),"sort-collections","Narrow-desktop Sort restores its exact trigger");
		}
	}
	for(const [width,height] of [[393,320],[1280,320]]) {await viewport(width,height);layouts.push(await evaluate(connection,"window.prepareHierarchyOrdering()"));}
	for(const width of [360,393,901,1024,1280]) {
		await viewport(width);
		await evaluate(connection,'document.documentElement.style.fontSize="200%"');
		const enlargedContext=await evaluate(connection,'({requestedWidth:window.orderingExpectedWidth,width:innerWidth,height:innerHeight,rootInlineFontSize:document.documentElement.style.fontSize,rootFontSize:getComputedStyle(document.documentElement).fontSize})');
		console.log("Hierarchy 200% text iteration: "+JSON.stringify({...enlargedContext,method:'document.documentElement.style.fontSize = "200%"'}));
		assert.equal(enlargedContext.rootFontSize,"32px","200% test uses the expected enlarged root size");
		try {
			layouts.push(await evaluate(connection,"window.prepareHierarchyOrdering()"));
			if([360,393,1024].includes(width))await capture(width+"-enlarged-text");
			const sortActions=await evaluate(connection,'[...document.querySelectorAll(".panel-sort-action")].filter(el=>el.getClientRects().length).map(el=>el.dataset.action)');
			const sorts=[];
			for(const action of sortActions) {
				await evaluate(connection,'document.querySelector("[data-action='+action+']").focus()');
				await key("Enter","Enter",13);
				const sort=await evaluate(connection,"window.measureCollectionSortPresentation(false,{hierarchyOrdering:true})");
				await key("Escape","Escape",27);
				assert.equal(await evaluate(connection,"document.activeElement.dataset.action"),action,"Enlarged Sort Escape restores the exact trigger");
				await key("Enter","Enter",13);
				await evaluate(connection,'document.querySelector("[data-hierarchy-sort-dialog] .editor-cancel").click()'); await frame();
				assert.equal(await evaluate(connection,"document.activeElement.dataset.action"),action,"Enlarged Sort Cancel restores the exact trigger");
				sorts.push({action,...sort});
			}
			const disabled=await evaluate(connection,"window.checkHierarchySortDisabled()");
			const menu=await checkMenu("collection",width);
			const otherMenus=[];
			let shortMenu=null;
			if(width===360) {
				for(const noun of ["folder","source"])otherMenus.push({noun,...await checkMenu(noun,width)});
				await viewport(360,320);
				shortMenu=await checkMenu("collection","360-short");
				assert.ok(shortMenu.scroll>shortMenu.client,"Short enlarged Collection menu scrolls internally");
				await viewport(width);
			}
			enlargedChecks.push({width,rootFontSize:enlargedContext.rootFontSize,sorts,disabled,menu,otherMenus,shortMenu});
		} catch(error) {
			const diagnostics=await evaluate(connection,"window.measureHierarchyOverflow()");
			throw new Error("Hierarchy 200% text iteration "+JSON.stringify(enlargedContext)+": "+error.message+"; diagnostics="+JSON.stringify(diagnostics),{cause:error});
		}
		await evaluate(connection,'document.documentElement.style.fontSize=""');
	}
	for(const forcedWidth of [360,393]) {
		await viewport(forcedWidth);
		await connection.command("Emulation.setEmulatedMedia",{features:[{name:"forced-colors",value:"active"},{name:"prefers-reduced-motion",value:"reduce"}]});
		layouts.push(await evaluate(connection,"window.prepareHierarchyOrdering()"));
		await evaluate(connection,'document.querySelector("[data-action=sort-collections]").focus()');
		await key("Enter","Enter",13);
		assert.equal(await evaluate(connection,'Boolean(document.querySelector("[data-hierarchy-sort-dialog]"))'),true,"Forced-colours keyboard activation opens Sort");
		await key("Escape","Escape",27);
		assert.equal(await evaluate(connection,"document.activeElement.dataset.action"),"sort-collections");
		await capture(forcedWidth+"-forced-colours");
		await connection.command("Emulation.setEmulatedMedia",{features:[]});
	}
	for(const width of [393,1280]) {
		await viewport(width);
		for(const level of ["collections","folders","sources"]) actions.push(await evaluate(connection,"window.runHierarchySortCase("+JSON.stringify(level)+")"));
		for(const noun of ["collection","folder"])actions.push(await evaluate(connection,"window.runHierarchyBoundaryCase("+JSON.stringify(noun)+")"));
		await evaluate(connection,"window.prepareHierarchyOrdering()");
		await evaluate(connection,'document.querySelector("[data-action=sort-collections]").focus()');
		await key("Enter","Enter",13);
		assert.equal(await evaluate(connection,'Boolean(document.querySelector("[data-hierarchy-sort-dialog]"))'),true,"Native keyboard activation opens Sort");
		for(const backwards of [false,true]) {
			await evaluate(connection,'(()=>{const buttons=[...document.querySelector("[data-hierarchy-sort-dialog]").querySelectorAll("button")];buttons['+(backwards?"0":"buttons.length-1")+'].focus();})()');
			await key("Tab","Tab",9,backwards?8:0);
			assert.equal(await evaluate(connection,'Boolean(document.activeElement.closest("[data-hierarchy-sort-dialog]"))'),true);
		}
		await key("Escape","Escape",27);
		assert.equal(await evaluate(connection,'document.activeElement.dataset.action'),"sort-collections");
		await evaluate(connection,"window.prepareOrderingMenu()"); if(width===393)await capture("393-collection-menu");
		for(let i=0;i<4;i++)await key("ArrowDown","ArrowDown",40);
		assert.equal(await evaluate(connection,'document.activeElement.dataset.action'),"delete-collection");
		await key("Escape","Escape",27);
		assert.equal(await evaluate(connection,'document.activeElement.dataset.action'),"open-collection-actions");
		for(const [name,code] of [["ArrowUp",38],["ArrowDown",40]]) {
			await key(name,name,code);
			assert.equal(await evaluate(connection,'document.activeElement.dataset.action'),"edit-collection");
			await key("ArrowUp","ArrowUp",38);
			assert.equal(await evaluate(connection,'document.activeElement.dataset.action'),"delete-collection");
			await key("Escape","Escape",27);
		}
		const handles=await evaluate(connection,"window.prepareSourceOrderingDrag()");
		await connection.command("Input.dispatchMouseEvent",{type:"mouseMoved",...handles[0]});
		await connection.command("Input.dispatchMouseEvent",{type:"mousePressed",button:"left",buttons:1,clickCount:1,...handles[0]});
		for(let step=1;step<=8;step++) await connection.command("Input.dispatchMouseEvent",{type:"mouseMoved",button:"left",buttons:1,x:handles[0].x,y:handles[0].y+(handles[1].y-8-handles[0].y)*step/8});
		await connection.command("Input.dispatchMouseEvent",{type:"mouseReleased",button:"left",buttons:0,clickCount:1,x:handles[1].x,y:handles[1].y-8});
		assert.equal(await evaluate(connection,"window.finishSourceOrderingDrag()"),true);
	}
	await viewport(393,240);
	const shortMenu=await evaluate(connection,"window.prepareOrderingMenu()");
	assert.ok(shortMenu.scroll>shortMenu.client,"Short menu has internal overflow");
	await capture("393-short-menu-top");
	await key("ArrowUp","ArrowUp",38);
	assert.equal(await evaluate(connection,'document.activeElement.dataset.action'),"delete-collection");
	assert.equal(await evaluate(connection,"window.scrollOrderingMenu()"),true); await capture("393-short-menu-bottom");
	await key("Escape","Escape",27);
	await viewport(393,852);
	await evaluate(connection,'window.orderingViewportDescriptor=Object.getOwnPropertyDescriptor(window,"visualViewport");Object.defineProperty(window,"visualViewport",{configurable:true,value:Object.assign(new EventTarget(),{width:393,height:180,offsetLeft:0,offsetTop:35})});true');
	const reducedMenu=await evaluate(connection,"window.prepareOrderingMenu()");
	assert.ok(reducedMenu.scroll>reducedMenu.client);
	assert.equal(await evaluate(connection,"window.scrollOrderingMenu()"),true);
	await evaluate(connection,'window.dispatchEvent(new Event("scroll"))'); await frame();
	assert.equal(await evaluate(connection,'document.querySelector("[data-actions-menu=collection]:not([hidden])")===null'),true);
	await evaluate(connection,'Object.defineProperty(window,"visualViewport",window.orderingViewportDescriptor);true');
	const orderingErrors=await evaluate(connection,"window.__mountedErrors");
	await connection.command("Page.navigate",{url:baseUrl+"/tests/fixtures/builder-bulk-edit-mounted.html"});
	const headerDeadline=Date.now()+30000;
	while(!await evaluate(connection,'window.__builderBulkEditMounted?.status==="complete"')) {
		if(Date.now()>headerDeadline) throw new Error("Existing header fixture did not load");
		await new Promise(resolve=>setTimeout(resolve,50));
	}
	const headerLayouts=[];
	for(const width of [393,900,1280]) {
		await viewport(width);
		const layout=await evaluate(connection,"window.__runWorkspaceHeaderGeometryScenario()");
		for(const state of layout.states) {
			assert.equal(state.bottomSpread,0,"Conditional creation actions retain aligned panel dividers");
			assert.ok(state.noClipping&&state.noHorizontalOverflow&&state.focusableHeaderButtonsWork);
		}
		headerLayouts.push(layout);
	}
	const errors=[...orderingErrors,...await evaluate(connection,"window.__mountedErrors")];
	// Restore the existing fixture for subsequent checks in the full workspace run.
	await connection.command("Page.navigate",{url:baseUrl+"/tests/fixtures/builder-collection-folders-mounted.html"});
	const restoreDeadline=Date.now()+30000;
	while(!await evaluate(connection,"window.collectionFoldersFixtureReady === true")) {
		if(Date.now()>restoreDeadline)throw new Error("Collection fixture did not restore");
		await new Promise(resolve=>setTimeout(resolve,50));
	}
	await viewport(1280,900);
	return {layouts,actions,enlargedChecks,ordinaryMenus,shortMenu,reducedMenu,headerLayouts,pinnedCollections,errors};
}
