import { DiscoverFamilyAdvancedOptions } from "./DiscoverFamilyAdvancedOptions.jsx";
import {
	DECADE_PRESETS,
	GENRE_CONCEPTS,
} from "../source-add/index.js";
import {
	GenreContextCatalogueSubview,
	GenreSelectionToolbar,
} from "./GenreCatalogueSelector.jsx";
import { FamilyGenreRulePills, GenreRuleCard } from "./GenreRuleControls.jsx";
import "./advanced-discover.css";
import "./native-shared-advanced.css";

const DECADES_ADVANCED_HELP = Object.freeze([
	Object.freeze({ label: "Minimum rating", description: "Include titles at or above this TMDB user rating." }),
	Object.freeze({ label: "Maximum rating", description: "Include titles at or below this TMDB user rating." }),
	Object.freeze({ label: "Minimum votes", description: "Require at least this many TMDB user votes." }),
	Object.freeze({ label: "Original language", description: "Limit results to titles originally made in one language." }),
	Object.freeze({ label: "Origin country", description: "Limit results to titles associated with one origin country." }),
	Object.freeze({ label: "Genre exclusions", description: "Leave selected Genres out of Decade overview and individual-year sources, shared across all selected Decades or customised per Decade." }),
]);

function optionIsAvailable(concept, mediaMode) {
	return mediaMode === "movies"
		? concept.movieId !== null
		: mediaMode === "series"
			? concept.tvId !== null
			: concept.movieId !== null || concept.tvId !== null;
}

export function DecadeSingleExclusionSubview({ selection, mediaMode, includedGenre = null, onToggle, onSelectAll, onClearAll, onDone, focusRef }) {
	const available = GENRE_CONCEPTS.filter((concept) => optionIsAvailable(concept, mediaMode) && concept.name !== includedGenre);
	return (
		<GenreContextCatalogueSubview className="discover-dialog family-genre-rules decades-exclusion-subview decade-source-exclusion-subview" title="Genre rules" titleId="decade-source-exclusion-title" contexts={[{ id: "source", label: includedGenre ?? "Main source" }]} activeContextId="source" detailTitle={(context) => context.label} showSingleContextHeading focusRef={focusRef} onDone={onDone} guidance="Choose official Genres to leave out of this Decade configuration. Each generated media source receives only compatible exclusions.">
			<GenreRuleCard title="Excluded genres">
			<GenreSelectionToolbar selectionCount={selection.length} totalCount={available.length} onSelectAll={onSelectAll} onClearAll={onClearAll} />
			<FamilyGenreRulePills semantics="exclude" concepts={available} selection={selection} onChoose={onToggle} />
			</GenreRuleCard>
		</GenreContextCatalogueSubview>
	);
}

export function DecadeBundleExclusionSubview({ selectedGenreNames, selectionByContext, contextId, selection, mediaMode, onContextChange, onToggle, onSelectAll, onClearAll, onDone, focusRef }) {
	const includedGenre = contextId.startsWith("genre:") ? contextId.slice("genre:".length) : null;
	const available = GENRE_CONCEPTS.filter((concept) => optionIsAvailable(concept, mediaMode) && concept.name !== includedGenre);
	const contexts = [
		{ id: "general", label: "Main source", summary: `${selectionByContext.general?.length ?? 0} excluded` },
		...selectedGenreNames.map((genreName) => ({
			id: `genre:${genreName}`,
			label: `${genreName} source`,
			summary: `${selectionByContext[`genre:${genreName}`]?.length ?? 0} excluded`,
		})),
	];
	return (
		<GenreContextCatalogueSubview
			activeContextId={contextId}
			backLabel="Back to sources"
			className="discover-dialog family-genre-rules decade-source-exclusion-subview"
			showSingleContextHeading
			contexts={contexts}
			contextTitle="Generated source contexts"
			detailGuidance="Each generated media source receives only compatible exclusions."
			detailTitle={(context) => context.label}
			emptyText="Then choose Genres to leave out of it."
			emptyTitle="Choose a generated source on the left"
			focusRef={focusRef}
			guidance="Configure the main source and each selected Genre source independently."
			onContextChange={onContextChange}
			onDone={onDone}
			title="Genre rules"
			titleId="decade-source-exclusion-title"
		>
			<GenreRuleCard title="Excluded genres">
				<GenreSelectionToolbar selectionCount={selection.length} totalCount={available.length} onSelectAll={onSelectAll} onClearAll={onClearAll} />
				<FamilyGenreRulePills semantics="exclude" concepts={available} selection={selection} onChoose={onToggle} />
			</GenreRuleCard>
		</GenreContextCatalogueSubview>
	);
}

export function DecadesOrdinaryExclusionSubview({ selectedDecadeIds, selectionByDecade, sharedSelection, contextId, selection, mediaMode, onContextChange, onToggle, onSelectAll, onClearAll, onDone, focusRef, onInheritanceChange }) {
 const custom = Object.hasOwn(selectionByDecade, contextId);
 const editable = contextId === "all" || custom;
	const available = GENRE_CONCEPTS.filter((concept) => optionIsAvailable(concept, mediaMode));
	const contexts = [
		{
			id: "all",
			label: "Shared exclusions",
			summary: `${sharedSelection.length} shared exclusion${sharedSelection.length === 1 ? "" : "s"}`,
		},
		...selectedDecadeIds.map((decadeId) => {
			const preset = DECADE_PRESETS.find((entry) => entry.id === decadeId);
			const count = selectionByDecade[decadeId]?.length ?? 0;
			return {
				id: decadeId,
				label: preset?.label ?? decadeId,
				summary: Object.hasOwn(selectionByDecade, decadeId) ? `Custom · ${count} excluded` : "Using default",
			};
		}),
	];
	return (
		<GenreContextCatalogueSubview
			activeContextId={contextId}
			backLabel="Back to Decades"
			className="discover-dialog family-genre-rules decades-exclusion-subview"
			contexts={contexts}
			contextTitle="Shared exclusions and selected Decades"
			detailTitle={(context) => context.label}
			emptyText="Then choose Genres to leave out of its generated sources."
			emptyTitle="Choose a context on the left"
			focusRef={focusRef}
			guidance="Choose Genres to leave out of Decade overview and individual-year sources. Use one shared selection or customise a Decade."
			onContextChange={onContextChange}
			onDone={onDone}
			title="Genre rules"
			titleId="decades-exclusion-title"
		>
			<DecadesExclusionInheritance contextId={contextId} custom={custom} onChange={onInheritanceChange} />
			{editable ? <GenreRuleCard title="Excluded genres">
				<GenreSelectionToolbar selectionCount={selection.length} totalCount={available.length} onSelectAll={onSelectAll} onClearAll={onClearAll} />
				<FamilyGenreRulePills semantics="exclude" concepts={available} selection={selection} onChoose={onToggle} />
			</GenreRuleCard> : null}
		</GenreContextCatalogueSubview>
	);
}

export function DecadesAdvancedHelpSubview({ onDone, focusRef }) {
	return (
		<section className="genre-advanced-subview genre-help-subview" aria-labelledby="decades-advanced-help-title">
			<header><div><p className="panel-kicker">Advanced options</p><h4 id="decades-advanced-help-title" tabIndex={-1} ref={focusRef}>What do these options do?</h4></div><button type="button" className="editor-apply genre-secondary-done" onClick={onDone}>Done</button></header>
			<dl>{DECADES_ADVANCED_HELP.map((entry) => <div key={entry.label}><dt>{entry.label}</dt><dd>{entry.description}</dd></div>)}</dl>
			<div className="genre-advanced-callout"><strong>Decade dates stay fixed</strong><span>These options refine the generated sources without changing the selected Decade ranges.</span></div>
		</section>
	);
}

export function DecadesAdvancedOptions({ value, onChange, mediaMode = "both", exclusionSummary, onOpenSecondary, extraEditable }) {
 const genres = extraEditable?.withoutGenres === false ? <p className="editor-field-help">Imported Genre exclusions are preserved.</p> : <div className="genre-advanced-compact-actions"><div><strong>Genre exclusions</strong><span>{exclusionSummary}</span></div><button type="button" className="secondary-action" onClick={(event) => onOpenSecondary("ordinary-exclusions", event.currentTarget)}>Configure</button></div>;
 return <DiscoverFamilyAdvancedOptions value={value} onChange={onChange} mediaMode={mediaMode} legacy dates={false} genreControls={genres} extraEditable={extraEditable} className="decades-advanced-options">
  <p className="editor-field-help">Decade dates stay fixed.</p>
  <button type="button" className="genre-advanced-help-action" onClick={(event) => onOpenSecondary("advanced-help", event.currentTarget)}>What do these options do?</button>
 </DiscoverFamilyAdvancedOptions>;
}

export function DecadesExclusionInheritance({ contextId, custom, onChange, wholeMap = false }) {
	const label = DECADE_PRESETS.find((entry) => entry.id === contextId)?.label ?? contextId;
	return contextId === "all" ? <p className="editor-field-help">{wholeMap ? "Shared exclusions · " : ""}Changes apply to Decades using the default.{wholeMap ? " Each defining Genre keeps its own exclusions." : ""}</p> : <div className="native-genre-inheritance"><div>{wholeMap ? <strong>{label} · All Genre sources</strong> : null}<p className="editor-field-help">{custom ? "Custom" : "Using default"}</p>{!custom ? <p className="editor-field-help">Click customise to make changes specific to {label}.</p> : null}{wholeMap ? <p className="editor-field-help">Default or Custom applies to the complete set of Genre-source exclusions for this Decade.</p> : null}</div><div className="native-genre-context-actions"><button type="button" className="secondary-action" onClick={() => onChange(custom)}>{custom ? "Use default" : "Customise genres"}</button>{custom ? <button type="button" className="secondary-action" onClick={() => onChange(false)}>Clear selections</button> : null}</div></div>;
}
