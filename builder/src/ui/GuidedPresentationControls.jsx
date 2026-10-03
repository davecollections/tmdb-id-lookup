import { HierarchyCollectionPresentationControls } from "./CollectionPresentationChoices.jsx";
import { FolderShapeChoices, PresentationSwitch, TitleOptions } from "./PresentationControls.jsx";

export function GuidedPresentationControls({ scope, options, folderCount, destinationCollectionTitle, onChange }) {
	return <>
		{scope === "new-folder" ? <div className="franchise-inherited-summary"><strong>Collection settings stay unchanged.</strong><span>{destinationCollectionTitle || "Hidden collection"}</span></div> : null}
		<TitleOptions
			idPrefix="tmdb-list-hierarchy"
			collectionTitleVisibility={scope === "new-collection" ? { checked: options.hideCollectionTitle, onChange: (hideCollectionTitle) => onChange({ hideCollectionTitle }), descriptionId: "tmdb-list-hide-title-help", controlName: "tmdbListHideNuvioTitle" } : null}
			folderTitleVisibility={{ selectedId: options.folderTitleVisibility, name: "tmdb-list-folder-title-visibility", onChange: (folderTitleVisibility) => onChange({ folderTitleVisibility }) }}
		/>
		{scope === "new-collection" ? <>
			<fieldset className="editor-field editor-choice-field"><legend>Collection layout</legend><HierarchyCollectionPresentationControls selectedId={options.viewMode} name="tmdb-list-collection-layout" showAllTab={options.showAllTab} onPresentationChange={onChange} showAllDescriptionId="tmdb-list-all-tab-help" showAllControlName="tmdbListShowAllTab" /></fieldset>
			<PresentationSwitch label="Pin collection to top" description="Keeps this collection near the top of Nuvio." descriptionId="tmdb-list-pin-help" controlName="tmdbListPinToTop" checked={options.pinToTop} onChange={(pinToTop) => onChange({ pinToTop })} />
		</> : null}
		<fieldset className="editor-field editor-choice-field" data-editor-field="folderTileShape"><legend>Folder tile shape</legend><p className="editor-field-help">Applies to {folderCount === 1 ? "the new folder" : "all new folders"}.</p><FolderShapeChoices selectedId={options.folderTileShape} name="tmdb-list-folder-shape" idPrefix="tmdb-list-folder" onChange={(folderTileShape) => onChange({ folderTileShape })} /></fieldset>
		<aside className="franchise-inherited-summary tmdb-list-artwork-note" aria-labelledby="tmdb-list-artwork-note-title"><strong id="tmdb-list-artwork-note-title">Folder artwork</strong><span>No artwork is assigned by this flow. After creating, use Edit on each folder to add or change its artwork.</span></aside>
	</>;
}
