import "../../builder/src/styles.css";
import { createRoot } from "react-dom/client";
import { createBuilderController } from "../../builder/src/application/index.js";
import { serializeNuvioProject } from "../../builder/src/serialize/index.js";
import { BuilderApp } from "../../builder/src/ui/BuilderApp.jsx";
import { projectFindData } from "./project-find-data.mjs";

// Local authored project data; this feature exercises no external service.
const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
const assert = (value, message) => { if (!value) throw new Error(message); };
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const click = async element => { assert(element, "Missing click target"); element.click(); await frame(); };
const input = async (element,value) => { assert(element,"Missing input"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(element,value); element.dispatchEvent(new Event("input",{bubbles:true})); await frame(); };
const dialog = () => $('[data-move-folders-dialog]');
const next = () => click($('.move-folders-actions button'));
const back = () => click($('[aria-label="Back to previous step"]'));
const close = () => click($('[aria-label="Close Move folders"]'));
const checks = () => $$('[aria-label="Folders to move"] input');
let root, controller, source, opening, trigger, expectedMoved, beforePayload, notifications;
let requests = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = (...args) => { requests.push(String(args[0])); return originalFetch(...args); };

async function mount({ folders = 8, collections = 3, folderEntry = false, menuOnly = false } = {}) {
	if (root) root.unmount(); await frame();
	document.documentElement.style.fontSize = "";
	controller = createBuilderController();
	const data = projectFindData({ collections, folders, sources: 2 });
	data[0].viewMode = "ROWS"; data[0].pinToTop = true; data[0].unknown = { keep: true };
	assert(controller.importValue(data).ok, "Local import succeeds");
	source = controller.getState().project.collections[0];
	if (folderEntry) controller.selectNode(source.internalId);
	root = createRoot($('#root')); root.render(<BuilderApp controller={controller} initialScreen="workspace" />); await frame();
	requests = []; notifications = [];
	controller.subscribe(() => notifications.push(controller.getState()));
	trigger = folderEntry ? $$('[data-action="open-folder-actions"]')[1] : $('[data-action="open-collection-actions"]');
	await click(trigger);
	opening = controller.getState(); beforePayload = serializeNuvioProject(opening.project).value;
	assert($(`[data-actions-menu]:not([hidden]) [data-action="move-${folderEntry ? "folder" : "collection"}-folders"]`).textContent === 'Move folders', 'Both menu entries use identical wording without ellipsis');
	if (menuOnly) return;
	await click($(`[data-actions-menu]:not([hidden]) [data-action="move-${folderEntry ? "folder" : "collection"}-folders"]`));
	assert(dialog() && $$('[role="dialog"]').length === 1, `One semantic dialog: ${JSON.stringify({ folderEntry, errors: window.__mountedErrors, text: document.body.innerText.slice(-2000) })}`);
	assert($('.workspace-underlay').inert && $('.workspace-underlay').getAttribute('aria-hidden') === 'true', "Underlay locked");
	assert(!$$('[data-actions-menu]').some(el=>!el.hidden), "Menus closed");
	assert(document.body.style.position === 'fixed', "Shared body lock");
	for(const action of ['open-project-find','open-workspace-import','open-export-collections','create-collection']) {
		const button=$(`[data-action="${action}"]`); if(button) await click(button);
	}
	assert($$('[role="dialog"]').length===1 && dialog(),'Other flows cannot open under Move');
	assert(checks().filter(el=>el.checked).length === (folderEntry ? 1 : 0), "Exact entry preselection");
	if(folderEntry) assert(checks()[1].checked, "Second duplicate-title Folder preselected by identity");
	assert(document.activeElement.tagName !== 'INPUT', "Select has no keyboard autofocus");
	assert(controller.getState() === opening, "Open does not change snapshot");
}
function unchanged() { assert(controller.getState() === opening, "No project, selection, diagnostics, dirty or revision change before Apply"); }
async function select(all = false) {
	if(all) await click($$('.genre-selection-actions button').find(el=>el.textContent==='Select all'));
	else { await click(checks()[3]); await click(checks()[1]); }
	expectedMoved = source.folders.filter((_,i)=>all || [1,3].includes(i));
	await next();
}
async function destination(kind = 'existing') {
	await click($(`input[name="move-destination-kind"][value="${kind}"]`));
	if(kind === 'existing') {
		const options = $$('input[name="move-destination"]'); assert(options.length === opening.project.collections.length-1, "Source excluded");
		assert(!options.some(el=>el.checked), "No silent destination");
		await click(options[0]);
	}
	await next();
	if(kind === 'new') {
		assert(!dialog().querySelector('[data-editor-field="folderShape"]'), "New Collection omits child management");
		assert($('#move-collection-title-input').value === '', "Normal blank title");
		assert(!dialog().querySelector('[data-editor-control="pinToTop"]').checked, "No inherited pin");
		assert(dialog().querySelector('input[value="TABBED_GRID"]')?.checked ?? dialog().querySelector('[data-editor-choice="tabs"] input')?.checked, "Normal Tabs default");
		await input($('#move-collection-title-input'),'Franchises');
	}
}
window.prepareMoveScreen = async (screen, enlarged = false) => {
	await mount({folders: screen==='long' ? 200 : 8, folderEntry: screen==='folder-entry', menuOnly:screen==='collection-menu'});
	if(screen==='collection-menu') return {passed:true};
	if(screen==='several') { await click(checks()[3]); await click(checks()[1]); }
	if(screen==='all') await click($$('.genre-selection-actions button').find(el=>el.textContent==='Select all'));
	if(['existing','new','configure','review','empty','delete','new-review','new-empty','new-delete'].includes(screen)) {
		await select(['empty','delete','new-empty','new-delete'].includes(screen));
		if(screen==='existing' || screen==='new') await click($(`input[name="move-destination-kind"][value="${screen==='existing'?'existing':'new'}"]`));
		else { await destination(screen==='configure' || screen.startsWith('new-') ? 'new' : 'existing'); }
		if(screen.startsWith('new-')) await next();
		if(screen==='delete' || screen==='new-delete') await click($('input[name="move-empty-source"][value="true"]'));
	}
	if(enlarged) { document.documentElement.style.fontSize='200%'; await frame(); }
	unchanged(); return measure();
};
function measure() {
	const rect=dialog().getBoundingClientRect(), head=$('.move-folders-heading').getBoundingClientRect(), footer=$('.move-folders-actions').getBoundingClientRect(), body=$('.move-folders-body');
	const top=visualViewport.offsetTop, bottom=top+visualViewport.height;
	assert(rect.left>=0 && rect.right<=innerWidth+1 && rect.top>=top-1 && rect.bottom<=bottom+1, 'Dialog fits viewport');
	assert(head.top>=top-1 && head.bottom<=bottom+1 && footer.top>=top && footer.bottom<=bottom+1,'Header and footer stay reachable');
	assert(body.clientHeight>=44,'Usable body scroll area');
	assert(dialog().scrollHeight<=dialog().clientHeight+1,'One main body scroll owner');
	assert(dialog().scrollWidth<=dialog().clientWidth+1 && document.documentElement.scrollWidth<=innerWidth+1,'No horizontal overflow');
	assert($$('.move-folders-heading button,.move-folders-actions button').every(el=>el.getBoundingClientRect().height>=44),'44px actions');
	assert($$('.move-folders-body label.genre-catalogue-choice').every(el=>el.getBoundingClientRect().height>=44),'44px full-row choices');
	assert($$('[role="dialog"]').length===1 && $$('.move-folders-backdrop').length===1,'One dialog/backdrop');
	const actions=$$('.move-folders-actions button');
	if(dialog().dataset.moveFoldersDialog==='review') {
		assert(actions.length===2 && actions[0].textContent.startsWith('Move ') && actions[1].textContent==='Cancel','Review DOM order: Move then Cancel');
		const primary=actions[0].getBoundingClientRect(), cancel=actions[1].getBoundingClientRect();
		assert(primary.right<=cancel.left && primary.top===cancel.top,'Review primary LEFT and Cancel RIGHT');
		assert(actions.every(el=>el.scrollWidth<=el.clientWidth+1 && el.scrollHeight<=el.clientHeight+1),'Final labels wrap without clipping');
		assert($('[aria-label="Close Move folders"]'),'Header Close remains');
		const totals=$$('.move-folders-totals > div'), selectedIds=$$('.move-folders-selected li');
		assert(totals.length===2 && totals[0].textContent===`${selectedIds.length}Folders` && totals[1].textContent===`${selectedIds.length*2}Sources`,'Exactly two shared count tiles for actual Folders and Sources');
		assert($$('.move-folders-transfer dt').map(el=>el.textContent).join('|')==='From|To','Semantic From / To labels remain outside metrics');
		assert($('.move-folders-direction').getAttribute('aria-hidden')==='true','Directional arrow is decorative');
		assert(!$('.move-folders-selected').open,'Selected Folder disclosure starts collapsed');
		const deleting=$('input[name="move-empty-source"][value="true"]')?.checked ?? false;
		assert(actions[0].classList.contains('collection-folders-delete')===deleting && actions[0].textContent.endsWith('and delete Collection')===deleting,'Destructive text and styling follow approved choice');
		if($('[data-move-new-summary]')) assert($('.move-folders-summary:last-child small').textContent==='New Collection','New destination has quiet type context');
		else assert($('.move-folders-summary:last-child small').textContent==='Collection 2','Existing duplicate-name position remains visible');
	} else assert(actions.length===1 && !actions.some(el=>el.textContent==='Cancel'),'Earlier stages retain their single footer action');
	if(innerWidth<900) assert(rect.width===innerWidth && Math.abs(rect.height-visualViewport.height)<1,'Phone fills visual viewport');
	return {width:innerWidth,height:innerHeight,stage:dialog().dataset.moveFoldersDialog,rows:checks().length,bodyHeight:body.clientHeight,passed:true};
}
window.moveCancelCheck = () => {
	assert(!dialog() && !$('.workspace-underlay').inert && document.body.style.position!=='fixed','Cancel unlocks');
	assert(document.activeElement===trigger,'Exact menu trigger focus restored'); unchanged(); return true;
};
window.moveReviewCancel = async (kind, folderEntry, remove, headerClose) => {
	await mount({folderEntry}); await select(true); await destination(kind);
	if(kind==='new') await next();
	if(remove) await click($('input[name="move-empty-source"][value="true"]'));
	measure(); unchanged();
	await click(headerClose ? $('[aria-label="Close Move folders"]') : $('.move-folders-actions .editor-cancel'));
	return window.moveCancelCheck();
};
window.movePrepareApply = async (kind, remove = false, all = false) => {
	await mount({folders:70}); await select(all || remove); await destination(kind);
	if(kind==='new') { await click($('[data-editor-control="pinToTop"]')); await next(); }
	if(remove) await click($('input[name="move-empty-source"][value="true"]'));
	assert(!$('.move-folders-selected').open,'Folder list collapsed'); unchanged(); measure();
	return true;
};
window.moveApply = async (remove=false) => {
	await next();
	const after=controller.getState();
	assert(!dialog(),'Successful flow closes');
	assert(after.revision===opening.revision+1 && notifications.length===1,'One content revision and notification');
	const target=after.project.collections.find(el=>el.internalId===after.selection.collectionInternalId);
	const start=target.folders.length-expectedMoved.length;
	assert(expectedMoved.every((folder,i)=>target.folders[start+i]===folder),'Exact original Folder objects in source order');
	assert(after.selection.folderInternalId===expectedMoved[0].internalId,'Exact first moved Folder selected');
	assert($('.node-button[data-node-type="folder"][aria-pressed="true"]')===document.activeElement,'Exact first moved Folder focused');
	const deadline=performance.now()+2500;
	let lastTop=null, stable=0;
	while(performance.now()<deadline) {
		const rect=document.activeElement.getBoundingClientRect();
		stable=lastTop!==null && Math.abs(rect.top-lastTop)<0.5 ? stable+1 : 0; lastTop=rect.top;
		if(stable>=4)break;
		await frame();
	}
	const focused=document.activeElement.getBoundingClientRect();
	assert(focused.top>=-1 && focused.bottom<=innerHeight+1,'Moved Folder visible: '+JSON.stringify({width:innerWidth,top:focused.top,bottom:focused.bottom}));
	if(innerWidth<900) assert($('.workspace').dataset.mobileLevel==='folders','Phone Folders landing');
	assert(Boolean(after.project.collections.find(el=>el.internalId===source.internalId))===!remove,'Source retained/deleted as reviewed');
	const beforeFolders=new Map(beforePayload.flatMap(c=>c.folders).map(f=>[f.id,JSON.stringify(f)]));
	for(const folder of serializeNuvioProject(after.project).value.flatMap(c=>c.folders)) assert(JSON.stringify(folder)===beforeFolders.get(folder.id),'Serialized Folder payload unchanged');
	assert(!requests.length,'Move makes no service requests');
	return {width:innerWidth,deleted:remove,moved:expectedMoved.length,passed:true};
};
window.moveLocalCases = async () => {
	await mount({folders:0,menuOnly:true}); assert($('[data-actions-menu]:not([hidden]) [data-action="move-collection-folders"]').disabled,'Empty Collection disables Move');
	await mount({collections:1}); await select(); assert($('input[value="existing"]').disabled,'Existing unavailable when alone'); await close(); window.moveCancelCheck();
	await mount({folderEntry:true}); await close(); window.moveCancelCheck();
	await mount(); await select(true); await destination();
	assert($('input[name="move-empty-source"][value="false"]').checked,'Keep empty default');
	await click($('input[name="move-empty-source"][value="true"]')); await back(); await back(); await click(checks()[0]); await next(); await next();
	assert(!$('[data-empty-source-choice]'),'Delete inapplicable after deselection');
	await back(); await back(); await click(checks()[0]); await next(); await next();
	assert($('input[name="move-empty-source"][value="false"]').checked,'Delete resets safely to Keep');
	await close(); window.moveCancelCheck();
	await mount(); await select(); await destination('new');
	await input($('#move-collection-title-input'),''); await next();
	assert(dialog().dataset.moveFoldersDialog==='configure' && $('#move-collection-title-input').getAttribute('aria-invalid')==='true' && $('#move-collection-title-error'),'Required title has associated error and retains draft'); unchanged();
	await input($('#move-collection-title-input'),'Franchises');
	await click($('[data-editor-control="pinToTop"]')); await back();
	await click($('input[name="move-destination-kind"][value="existing"]')); await click($('input[name="move-destination"]')); await next(); await back();
	await click($('input[name="move-destination-kind"][value="new"]')); await next();
	assert($('#move-collection-title-input').value==='Franchises' && $('[data-editor-control="pinToTop"]').checked,'Retains new settings across destination switch');
	await next(); await back(); assert($('#move-collection-title-input').value==='Franchises','Review Back retains draft'); await close(); window.moveCancelCheck();
	await window.movePrepareApply('existing',true);
	controller.createFolder(source.internalId,{editable:{title:'Added after Review'}}); await frame(); const stale=controller.getState(); await next();
	assert(controller.getState()===stale && dialog() && $('.move-folders-actions [role="alert"]'),'Stale delete fails closed and stays open'); await close();
	return {passed:true};
};
let clipped;
window.prepareMoveClipped = async () => {
	await window.prepareMoveScreen('long');
	const body=$('.move-folders-body'), inputs=checks(), row=inputs[12].closest('label');
	body.scrollTop+=row.getBoundingClientRect().bottom-body.getBoundingClientRect().bottom-16;
	inputs[11].focus({preventScroll:true});
	clipped={top:dialog().getBoundingClientRect().top,scrollY,scroll:body.scrollTop};
};
window.checkMoveClipped = () => {
	assert(document.activeElement===checks()[12],'Tab reaches partially clipped exact row');
	assert(dialog().getBoundingClientRect().top===clipped.top && scrollY===clipped.scrollY && dialog().scrollTop===0,'Only body scrolls for clipped row focus');
	unchanged();return true;
};
window.moveKeyboardViewport = async (height,top=0) => {
	Object.defineProperties(visualViewport,{height:{configurable:true,value:height},offsetTop:{configurable:true,value:top}});
	visualViewport.dispatchEvent(new Event('resize')); visualViewport.dispatchEvent(new Event('scroll')); await frame();
	const cover=$('.move-folders-portal').getBoundingClientRect();
	assert(cover.top===0 && cover.bottom===innerHeight && cover.width===innerWidth,'Opaque guard covers layout viewport');
	assert(getComputedStyle($('.move-folders-portal')).backgroundColor==='rgb(7, 24, 33)','Opaque keyboard gap');
	return measure();
};
window.restoreMoveViewport = async () => { delete visualViewport.height; delete visualViewport.offsetTop; visualViewport.dispatchEvent(new Event('resize')); await frame(); };
window.moveReady=true;
