import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

export async function runMoveFoldersChecks(connection, baseUrl, evaluate) {
	await connection.command('Page.navigate',{url:baseUrl+'/tests/fixtures/builder-move-folders-mounted.html'});
	const deadline=Date.now()+30000;
	while(!await evaluate(connection,'window.moveReady===true')) { if(Date.now()>deadline) throw new Error('Move fixture did not load'); await new Promise(r=>setTimeout(r,50)); }
	await connection.command('Emulation.setFocusEmulationEnabled',{enabled:true});
	const screenshots=process.env.BUILDER_MOVE_SCREENSHOT_DIR;
	if(screenshots) await fs.mkdir(screenshots,{recursive:true});
	async function capture(name) { if(!screenshots)return; const shot=await connection.command('Page.captureScreenshot',{format:'png'}); await fs.writeFile(path.join(screenshots,name+'.png'),Buffer.from(shot.data,'base64')); }
	async function key(key,code,value,modifiers=0) { await connection.command('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:value,modifiers}); await connection.command('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:value}); await evaluate(connection,'new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))'); }
	async function viewport(width,height=852) { await connection.command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<900}); }
	await viewport(1280,900);
	const local=await evaluate(connection,'window.moveLocalCases()');
	const layouts=[], landings=[], keyboard=[];
	const screens=['none','folder-entry','several','all','existing','new','configure','review','empty','delete','long'];
	for(const [width,height] of [[360,800],[384,852],[393,852],[402,852],[412,852],[899,900],[900,900],[901,900],[1280,900],[1280,320]]) {
		await viewport(width,height);
		if(width===1280 && height===900) {await evaluate(connection,'window.prepareMoveScreen("collection-menu")');await capture('01-collection-menu');}
		for(const screen of screens) {
			layouts.push(await evaluate(connection,`window.prepareMoveScreen(${JSON.stringify(screen)})`));
			if(width===1280 && height===900 && screen!=='long' && screen!=='all') await capture('desktop-'+screen);
			if(width===393 && ['several','configure','delete'].includes(screen))await capture('phone-'+screen);
			for(const reverse of [false,true]) {
				await evaluate(connection,`(()=>{const controls=[...document.querySelector('[data-move-folders-dialog]').querySelectorAll('button,input,summary')].filter(el=>!el.disabled && el.getClientRects().length);controls[${reverse?'0':'controls.length-1'}].focus({preventScroll:true});})()`);
				await key('Tab','Tab',9,reverse?8:0); assert.equal(await evaluate(connection,"Boolean(document.activeElement.closest('[data-move-folders-dialog]'))"),true,'Focus trap');
			}
			await key('Escape','Escape',27); assert.equal(await evaluate(connection,'window.moveCancelCheck()'),true);
		}
	}
	for(const variant of ['enlarged','forced-colors','reduced-motion']) for(const width of [393,1280]) {
		await viewport(width,width===393?852:900);
		await connection.command('Emulation.setEmulatedMedia',{features:variant==='forced-colors'?[{name:'forced-colors',value:'active'}]:variant==='reduced-motion'?[{name:'prefers-reduced-motion',value:'reduce'}]:[]});
		for(const screen of ['several','configure','delete','long']) {
			layouts.push({variant,...await evaluate(connection,`window.prepareMoveScreen(${JSON.stringify(screen)},${variant==='enlarged'})`)});
			if(variant==='forced-colors' && screen==='several') assert.equal(await evaluate(connection,"(()=>{const choice=document.querySelector('.move-folders-body [data-selected=true]');const style=getComputedStyle(choice,'::after');return choice.querySelector('input').checked && style.borderStyle==='solid' && parseFloat(style.borderWidth)>=1;})()"),true,'Non-colour selected inset');
			await key('Escape','Escape',27); await evaluate(connection,'window.moveCancelCheck()');
		}
	}
	await connection.command('Emulation.setEmulatedMedia',{features:[]});
	for(const width of [393,1280]) {
		await viewport(width); await evaluate(connection,'window.prepareMoveClipped()');
		await key('Tab','Tab',9); assert.equal(await evaluate(connection,'window.checkMoveClipped()'),true);
		await key('Escape','Escape',27); await evaluate(connection,'window.moveCancelCheck()');
		await viewport(1280,900); await evaluate(connection,'window.prepareMoveScreen("folder-entry")');
		await viewport(width); await key('Escape','Escape',27); await evaluate(connection,'window.moveCancelCheck()');
	}
	for(const width of [360,393]) {
		await viewport(width);
		for(const screen of ['several','configure','delete']) {
			await evaluate(connection,`window.prepareMoveScreen(${JSON.stringify(screen)})`);
			for(const [height,top] of [[460,0],[320,42],[500,18],[852,0]]) keyboard.push(await evaluate(connection,`window.moveKeyboardViewport(${height},${top})`));
			await evaluate(connection,'window.restoreMoveViewport()'); await key('Escape','Escape',27); await evaluate(connection,'window.moveCancelCheck()');
		}
	}
	for(const width of [360,393,899,900,901,1280]) for(const kind of ['existing','new']) for(const scenario of ['partial','keep-empty','delete-empty']) {
		const remove=scenario==='delete-empty';
		await viewport(width,width<900?852:900);
		await evaluate(connection,`window.movePrepareApply('${kind}',${remove},${scenario!=='partial'})`);
		landings.push(await evaluate(connection,`window.moveApply(${remove})`));
		if([393,1280].includes(width) && scenario==='partial')await capture(`${width<900?'phone':'desktop'}-${kind}-landing`);
	}
	await viewport(1280,900); await evaluate(connection,'window.prepareMoveScreen("several")');
	const ax=await connection.command('Accessibility.getFullAXTree');
	assert.equal(ax.nodes.filter(n=>n.role?.value==='dialog').length,1);
	assert.ok(ax.nodes.some(n=>n.role?.value==='checkbox' && n.name?.value.includes('Same folder')),'Named native selection');
	await key('Escape','Escape',27);
	const errors=await evaluate(connection,'window.__mountedErrors'); assert.deepEqual(errors,[]);
	const result={local,layouts,landings,keyboard,errors};
	if(screenshots)await fs.writeFile(path.join(screenshots,'move-measurements.json'),JSON.stringify(result,null,2));
	return result;
}
