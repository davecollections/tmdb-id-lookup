import { genreAdvancedMediaMode } from "../source-add/genre-advanced.js";
import { DiscoverFamilyAdvancedOptions } from "./DiscoverFamilyAdvancedOptions.jsx";
import { useState } from "react";
import {
	createGenreAdvancedState,
	GENRE_ADVANCED_HELP,
	GENRE_CONCEPTS,
	genreExclusionCompatibility,
	genreExclusionsFor,
	updateGenreExclusions,
} from "../source-add/index.js";
import { GenreContextCatalogueSubview } from "./GenreCatalogueSelector.jsx";
import { FamilyGenreRulePills, GenreRuleCard } from "./GenreRuleControls.jsx";
import "./advanced-discover.css";
import "./native-shared-advanced.css";

function genreName(value) {
	return typeof value === "string" ? value : value?.name;
}

export function GenreExclusionSubview({ advanced, includedGenres, sharedMediaChoice, onChange, onDone, focusRef, contextActions = null, readOnly = false }) {
	const includedNames = includedGenres.map(genreName).filter(Boolean);
	const multiple = includedNames.length > 1;
	const [activeIncludedGenre, setActiveIncludedGenre] = useState(multiple ? null : includedNames[0] ?? null);
	const activeExclusions = activeIncludedGenre ? genreExclusionsFor(advanced, activeIncludedGenre) : [];
	const availableExclusions = activeIncludedGenre
		? GENRE_CONCEPTS.filter((concept) => genreExclusionCompatibility(concept, activeIncludedGenre, sharedMediaChoice).compatible)
		: [];

	function toggle(name) {
		if (!activeIncludedGenre) return;
		onChange(updateGenreExclusions(
			advanced,
			activeIncludedGenre,
			activeExclusions.includes(name)
				? activeExclusions.filter((entry) => entry !== name)
				: [...activeExclusions, name],
		));
	}

	return (
		<GenreContextCatalogueSubview
			activeContextId={activeIncludedGenre}
			className="discover-dialog family-genre-rules"
			showSingleContextHeading
			backLabel="Back to Genres"
			contexts={includedNames.map((name) => {
				const configured = genreExclusionsFor(advanced, name);
				return { id: name, label: name, summary: `${configured.length} excluded` };
			})}
			contextTitle="Selected genres"
			detailTitle={(context) => context.label}
			emptyText="Then select Genres to exclude from that source."
			emptyTitle="Choose a Genre"
			focusRef={focusRef}
			guidance="The defining Genre stays fixed. Choose compatible Genres to exclude from each source."
			onContextChange={setActiveIncludedGenre}
			onDone={onDone}
			onReturnToContexts={() => setActiveIncludedGenre(null)}
			statusContent={contextActions}
			title="Genre rules"
			titleId="genre-exclusion-picker-title"
		>
			{!readOnly ? <GenreRuleCard title="Excluded genres"><FamilyGenreRulePills semantics="exclude" concepts={availableExclusions} selection={activeExclusions} onChoose={toggle} /></GenreRuleCard> : null}
		</GenreContextCatalogueSubview>
	);
}

export function GenreAdvancedHelpSubview({ onDone, focusRef }) {
	return (
		<section className="genre-advanced-subview genre-help-subview" aria-labelledby="genre-advanced-help-title">
			<header>
				<div><p className="panel-kicker">Filters</p><h4 id="genre-advanced-help-title" tabIndex={-1} ref={focusRef}>What do these options do?</h4></div>
				<button type="button" className="editor-apply genre-secondary-done" onClick={onDone}>Done</button>
			</header>
			<dl>{GENRE_ADVANCED_HELP.map((entry) => <div key={entry.field}><dt>{entry.label}</dt><dd>{entry.description}</dd></div>)}</dl>
			<div className="genre-advanced-callout genre-advanced-discover-callout"><strong>Additional filters</strong><span>Use Keywords, Studios, TV Networks and streaming providers to refine the fixed Genre. Provider filters need a watch region.</span></div>
		</section>
	);
}

export function GenreAdvancedSecondarySurface({ surface, value, includedGenres, sharedMediaChoice = "both", onChange, onDone, focusRef }) {
	if (surface === "help") return <GenreAdvancedHelpSubview onDone={onDone} focusRef={focusRef} />;
	if (surface === "exclusions") return <GenreExclusionSubview advanced={createGenreAdvancedState(value)} includedGenres={includedGenres} sharedMediaChoice={sharedMediaChoice} onChange={onChange} onDone={onDone} focusRef={focusRef} />;
	return null;
}

export function GenreAdvancedOptions({ value, includedGenres, sharedMediaChoice = "both", onChange, onOpenSecondary, extraEditable }) {
 const advanced = createGenreAdvancedState(value);
 const names = includedGenres.map(genreName).filter(Boolean);
 const count = names.filter((name) => genreExclusionsFor(advanced, name).length).length;
 const genres = extraEditable?.withoutGenres === false ? <p className="editor-field-help">Imported Genre exclusions are preserved.</p> : <div className="genre-advanced-compact-actions"><div><strong>Genre exclusions</strong><span>{names.length === 1 && count ? genreExclusionsFor(advanced, names[0]).join(", ") : count ? `Exclusions configured for ${count} genre${count === 1 ? "" : "s"}` : "No genre exclusions configured"}</span></div><button type="button" className="secondary-action" onClick={(event) => onOpenSecondary("exclusions", event.currentTarget)}>{names.length === 1 ? "Choose" : "Configure"}</button></div>;
 return <DiscoverFamilyAdvancedOptions value={advanced} onChange={(next) => onChange(createGenreAdvancedState(next))} mediaMode={genreAdvancedMediaMode(includedGenres, sharedMediaChoice)} legacy genreControls={genres} genresApplied={count > 0} extraEditable={extraEditable}>
  <button type="button" className="genre-advanced-help-action" onClick={(event) => onOpenSecondary("help", event.currentTarget)}>What do these options do?</button>
 </DiscoverFamilyAdvancedOptions>;
}
