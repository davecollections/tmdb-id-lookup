import {
	DECADE_PRESETS,
	GENRE_CONCEPTS,
	GENRE_COUNTRY_OPTIONS,
	GENRE_LANGUAGE_OPTIONS,
} from "../source-add/index.js";
import {
	GenreCatalogueList,
	GenreContextCatalogueSubview,
	GenreSelectionToolbar,
} from "./GenreCatalogueSelector.jsx";

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
		<section className="genre-advanced-subview decades-exclusion-subview decade-source-exclusion-subview" aria-labelledby="decade-source-exclusion-title">
			<header><div><p className="panel-kicker">Advanced options</p><h4 id="decade-source-exclusion-title" tabIndex={-1} ref={focusRef}>Genre exclusions</h4></div><button type="button" className="editor-apply genre-secondary-done" onClick={onDone}>Done</button></header>
			<p className="genre-advanced-secondary-guidance">Choose official Genres to leave out of this Decade configuration. Each generated media source receives only compatible exclusions.</p>
			<GenreSelectionToolbar selectionCount={selection.length} totalCount={available.length} onSelectAll={onSelectAll} onClearAll={onClearAll} />
			<GenreCatalogueList concepts={available} selection={selection} onChoose={onToggle} />
		</section>
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
			className="decade-source-exclusion-subview"
			contexts={contexts}
			contextTitle="Generated source contexts"
			detailGuidance="Each generated media source receives only compatible exclusions."
			detailTitle={(context) => `Exclude from ${context.label}`}
			emptyText="Then choose Genres to leave out of it."
			emptyTitle="Choose a generated source on the left"
			focusRef={focusRef}
			guidance="Configure the main source and each selected Genre source independently."
			onContextChange={onContextChange}
			onDone={onDone}
			title="Genre exclusions"
			titleId="decade-source-exclusion-title"
		>
			<GenreSelectionToolbar selectionCount={selection.length} totalCount={available.length} onSelectAll={onSelectAll} onClearAll={onClearAll} />
			<GenreCatalogueList concepts={available} selection={selection} onChoose={onToggle} />
		</GenreContextCatalogueSubview>
	);
}

export function DecadesOrdinaryExclusionSubview({ selectedDecadeIds, selectionByDecade, sharedSelection, contextId, selection, mediaMode, onContextChange, onToggle, onSelectAll, onClearAll, onDone, focusRef }) {
	const available = GENRE_CONCEPTS.filter((concept) => optionIsAvailable(concept, mediaMode));
	const contexts = [
		{
			id: "all",
			label: "All selected Decades",
			summary: `${sharedSelection.length} shared exclusion${sharedSelection.length === 1 ? "" : "s"}`,
		},
		...selectedDecadeIds.map((decadeId) => {
			const preset = DECADE_PRESETS.find((entry) => entry.id === decadeId);
			const count = selectionByDecade[decadeId]?.length ?? 0;
			return {
				id: decadeId,
				label: preset?.label ?? decadeId,
				summary: `${count} excluded`,
			};
		}),
	];
	return (
		<GenreContextCatalogueSubview
			activeContextId={contextId}
			backLabel="Back to Decades"
			className="decades-exclusion-subview"
			contexts={contexts}
			contextTitle="Exclusion contexts"
			detailGuidance="Choose Genres to leave out of Decade overview and individual-year sources for this context."
			detailTitle={(context) => `Exclude from ${context.label}`}
			emptyText="Then choose Genres to leave out of its generated sources."
			emptyTitle="Choose a context on the left"
			focusRef={focusRef}
			guidance="Choose Genres to leave out of Decade overview and individual-year sources. Use one shared selection or customise a Decade."
			onContextChange={onContextChange}
			onDone={onDone}
			title="Genre exclusions"
			titleId="decades-exclusion-title"
		>
			<GenreSelectionToolbar selectionCount={selection.length} totalCount={available.length} onSelectAll={onSelectAll} onClearAll={onClearAll} />
			<GenreCatalogueList concepts={available} selection={selection} onChoose={onToggle} />
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

export function DecadesAdvancedOptions({ value, onChange, exclusionSummary, onOpenSecondary, idPrefix = "decades-advanced" }) {
	const update = (field, nextValue) => onChange(Object.freeze({ ...value, [field]: nextValue }));
	return (
		<details className="genre-advanced-options decades-advanced-options" data-decades-advanced="true">
			<summary>Advanced options</summary>
			<div className="genre-advanced-content">
				<div className="genre-advanced-callout">
					<strong>Fine-tune generated sources</strong>
					<span>Leave an option blank if it should not affect results. Decade dates stay fixed.</span>
				</div>
				<div className="genre-advanced-grid decades-advanced-grid">
					<div className="editor-field genre-advanced-field">
						<label htmlFor={`${idPrefix}-rating-min`}>Minimum rating</label>
						<input id={`${idPrefix}-rating-min`} className="genre-number-input" type="number" inputMode="decimal" min="0" max="10" step="0.1" placeholder="7.0" value={value.minimumRating} onChange={(event) => update("minimumRating", event.target.value)} />
					</div>
					<div className="editor-field genre-advanced-field">
						<label htmlFor={`${idPrefix}-rating-max`}>Maximum rating</label>
						<input id={`${idPrefix}-rating-max`} className="genre-number-input" type="number" inputMode="decimal" min="0" max="10" step="0.1" value={value.maximumRating} onChange={(event) => update("maximumRating", event.target.value)} />
					</div>
					<div className="editor-field genre-advanced-field">
						<label htmlFor={`${idPrefix}-votes-min`}>Minimum votes</label>
						<input id={`${idPrefix}-votes-min`} className="genre-number-input" type="number" inputMode="numeric" min="0" step="1" placeholder="250" value={value.minimumVotes} onChange={(event) => update("minimumVotes", event.target.value)} />
					</div>
					<div className="editor-field genre-advanced-field">
						<label htmlFor={`${idPrefix}-language`}>Original language</label>
						<select id={`${idPrefix}-language`} value={value.originalLanguage} onChange={(event) => update("originalLanguage", event.target.value)}>
							<option value="">Any language</option>
							{GENRE_LANGUAGE_OPTIONS.map((entry) => <option key={entry.code} value={entry.code}>{entry.label} ({entry.code})</option>)}
						</select>
					</div>
					<div className="editor-field genre-advanced-field">
						<label htmlFor={`${idPrefix}-country`}>Origin country</label>
						<select id={`${idPrefix}-country`} value={value.originCountry} onChange={(event) => update("originCountry", event.target.value)}>
							<option value="">Any country</option>
							{GENRE_COUNTRY_OPTIONS.map((entry) => <option key={entry.code} value={entry.code}>{entry.label} ({entry.code})</option>)}
						</select>
					</div>
				</div>
				<div className="genre-advanced-compact-actions"><div><strong>Genre exclusions</strong><span>{exclusionSummary}</span></div><button type="button" className="secondary-action" onClick={(event) => onOpenSecondary("ordinary-exclusions", event.currentTarget)}>Configure</button></div>
				<button type="button" className="genre-advanced-help-action" onClick={(event) => onOpenSecondary("advanced-help", event.currentTarget)}>What do these options do?</button>
			</div>
		</details>
	);
}
