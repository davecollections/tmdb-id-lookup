import { nodeTitle } from "./view-model.js";

export function CollectionFolderSelectionList({ folders, selected, onToggle, label }) {
	return <ul className="genre-catalogue-list collection-folder-list" aria-label={label}>
		{folders.map((folder, index) => {
			const title = nodeTitle(folder.editable.title, "folder");
			return <li key={folder.internalId}>
				<label className="genre-catalogue-choice" data-selection-mode="multiple" data-selected={selected.includes(folder.internalId) ? "true" : undefined}>
					<input className="visually-hidden choice-card-input" type="checkbox" checked={selected.includes(folder.internalId)} onChange={() => onToggle(folder.internalId)} />
					<span><strong>{title.text}</strong><small>Folder {index + 1} · {folder.sources.length} {folder.sources.length === 1 ? "source" : "sources"}{title.hidden ? " · Invisible in Nuvio" : ""}</small></span>
				</label>
			</li>;
		})}
	</ul>;
}
