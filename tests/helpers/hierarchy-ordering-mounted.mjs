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
	const layouts=[], actions=[];
	for(const width of [360,375,384,393,402,412,899,900,901,1280]) {
		await viewport(width);
		for(const level of ["collections","folders","sources"]) {
			layouts.push(await evaluate(connection,"window.prepareHierarchyOrdering("+JSON.stringify(level)+")"));
			if([360,375,384,393,900,901,1280].includes(width)) {
				const tree=await connection.command("Accessibility.getFullAXTree");
				for(const active of width<900?[level]:["collections","folders","sources"]) assert.ok(tree.nodes.some(node=>node.role?.value==="button"&&node.name?.value==="Sort "+active[0].toUpperCase()+active.slice(1)),"Sort accessible name exposed for "+active);
			}
			if([360,375,384,393].includes(width))await capture(width+"-"+level);
		}
		if(width===901||width===1280) await capture(width+"-workspace");
	}
	for(const [width,height] of [[393,320],[1280,320]]) {await viewport(width,height);layouts.push(await evaluate(connection,"window.prepareHierarchyOrdering()"));}
	for(const width of [360,393,901,1280]) {
		await viewport(width);
		await evaluate(connection,'document.documentElement.style.fontSize="200%"');
		layouts.push(await evaluate(connection,"window.prepareHierarchyOrdering()"));
		if(width===360||width===393)await capture(width+"-enlarged-text");
		await evaluate(connection,"window.prepareOrderingMenu()");
		if(width===393)await capture("393-enlarged-menu");
		await key("Escape","Escape",27);
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
	return {layouts,actions,shortMenu,reducedMenu,headerLayouts,errors};
}
