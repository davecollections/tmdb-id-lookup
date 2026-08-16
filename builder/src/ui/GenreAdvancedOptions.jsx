import { useState } from "react";
import {
	createGenreAdvancedState,
	GENRE_ADVANCED_HELP,
	GENRE_CONCEPTS,
	GENRE_COUNTRY_OPTIONS,
	GENRE_LANGUAGE_OPTIONS,
	genreExclusionCompatibility,
	genreExclusionsFor,
	updateGenreExclusions,
	validateGenreAdvancedOptions,
} from "../source-add/index.js";
import { GenreContextCatalogueSubview } from "./GenreCatalogueSelector.jsx";

function optionsWithImportedValue(options, value, kind) {
	if (!value || options.some((entry) => entry.code === value)) return options;
	return Object.freeze([...options, Object.freeze({ code: value, label: `${value} (imported ${kind} code)` })]);
}

function genreName(value) {
	return typeof value === "string" ? value : value?.name;
}

export function GenreExclusionSubview({ advanced, includedGenres, sharedMediaChoice, onChange, onDone, focusRef }) {
	const includedNames = includedGenres.map(genreName).filter(Boolean);
	const multiple = includedNames.length > 1;
	const [activeIncludedGenre, setActiveIncludedGenre] = useState(multiple ? null : includedNames[0] ?? null);
	const activeExclusions = activeIncludedGenre ? genreExclusionsFor(advanced, activeIncludedGenre) : [];
	const availableExclusions = activeIncludedGenre
		? GENRE_CONCEPTS.filter((concept) => genreExclusionCompatibility(concept, activeIncludedGenre, sharedMediaChoice).compatible)
		: [];
	const surfaceTitle = multiple ? "Genre exclusions" : activeIncludedGenre ? `Exclude from ${activeIncludedGenre}` : "Exclude genres";

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
			backLabel="Back to Genres"
			contexts={includedNames.map((name) => {
				const configured = genreExclusionsFor(advanced, name);
				return { id: name, label: name, summary: configured.length === 0 ? "No exclusions" : `${configured.join(", ")} excluded` };
			})}
			contextTitle="Selected genres"
			detailGuidance="Choose a Genre, then select Genres to exclude from that source."
			detailTitle={(context) => `Exclude from ${context.label}`}
			emptyText="Then select Genres to exclude from that source."
			emptyTitle="Choose a Genre"
			focusRef={focusRef}
			guidance="Choose a Genre, then select Genres to exclude from that source."
			onContextChange={setActiveIncludedGenre}
			onDone={onDone}
			onReturnToContexts={() => setActiveIncludedGenre(null)}
			title={surfaceTitle}
			titleId="genre-exclusion-picker-title"
		>
			<ul className="genre-exclusion-picker-list">
				{availableExclusions.map((concept) => {
					const selected = activeExclusions.includes(concept.name);
					return (
						<li key={concept.name}>
							<button type="button" data-selected={selected ? "true" : undefined} onClick={() => toggle(concept.name)}>
								<span><strong>{concept.name}</strong></span>
								<span aria-hidden="true">{selected ? "✓" : "+"}</span>
							</button>
						</li>
					);
				})}
			</ul>
		</GenreContextCatalogueSubview>
	);
}

export function GenreAdvancedHelpSubview({ onDone, focusRef }) {
	return (
		<section className="genre-advanced-subview genre-help-subview" aria-labelledby="genre-advanced-help-title">
			<header>
				<div><p className="panel-kicker">Advanced options</p><h4 id="genre-advanced-help-title" tabIndex={-1} ref={focusRef}>What do these options do?</h4></div>
				<button type="button" className="editor-apply genre-secondary-done" onClick={onDone}>Done</button>
			</header>
			<dl>{GENRE_ADVANCED_HELP.map((entry) => <div key={entry.field}><dt>{entry.label}</dt><dd>{entry.description}</dd></div>)}</dl>
			<div className="genre-advanced-callout genre-advanced-discover-callout"><strong>Want even more control?</strong><span>Advanced Discover will let you combine extra filters such as keywords, studios, networks, streaming providers and more.</span></div>
		</section>
	);
}

export function GenreAdvancedSecondarySurface({ surface, value, includedGenres, sharedMediaChoice = "both", onChange, onDone, focusRef }) {
	if (surface === "help") return <GenreAdvancedHelpSubview onDone={onDone} focusRef={focusRef} />;
	if (surface === "exclusions") return <GenreExclusionSubview advanced={createGenreAdvancedState(value)} includedGenres={includedGenres} sharedMediaChoice={sharedMediaChoice} onChange={onChange} onDone={onDone} focusRef={focusRef} />;
	return null;
}

export function GenreAdvancedOptions({ value, includedGenres, sharedMediaChoice = "both", onChange, onOpenSecondary, idPrefix = "genre-advanced" }) {
	const advanced = createGenreAdvancedState(value);
	const validation = validateGenreAdvancedOptions(advanced, { includedGenres, sharedMediaChoice });
	const languages = optionsWithImportedValue(GENRE_LANGUAGE_OPTIONS, advanced.originalLanguage, "language");
	const countries = optionsWithImportedValue(GENRE_COUNTRY_OPTIONS, advanced.originCountry, "country");
	const update = (field, nextValue) => onChange(createGenreAdvancedState({ ...advanced, [field]: nextValue }));
	const includedNames = includedGenres.map(genreName).filter(Boolean);
	const configuredCount = includedNames.filter((name) => genreExclusionsFor(advanced, name).length > 0).length;
	const directExclusions = includedNames.length === 1 ? genreExclusionsFor(advanced, includedNames[0]) : [];
	const exclusionHeading = includedNames.length === 1 ? "Exclude genres" : "Genre exclusions";
	const exclusionSummary = includedNames.length === 1
		? directExclusions.length === 0 ? "Choose genres to exclude" : directExclusions.length <= 2 ? directExclusions.join(", ") : `${directExclusions.length} selected`
		: configuredCount === 0 ? "No genre exclusions configured" : `Exclusions configured for ${configuredCount} genre${configuredCount === 1 ? "" : "s"}`;

	return (
		<details className="genre-advanced-options">
			<summary>Advanced options</summary>
			<div className="genre-advanced-content">
				<div className="genre-advanced-callout"><strong>Fine-tune your results</strong><span>Leave any option blank if you don’t want it to affect the results.</span></div>
				<div className="genre-advanced-grid">
					<div className="editor-field genre-advanced-field"><label htmlFor={`${idPrefix}-year-from`}>From year</label><input className="genre-number-input" id={`${idPrefix}-year-from`} type="number" inputMode="numeric" min="1000" max="9999" placeholder="1980" value={advanced.yearFrom} onChange={(event) => update("yearFrom", event.target.value)} /></div>
					<div className="editor-field genre-advanced-field"><label htmlFor={`${idPrefix}-year-to`}>To year</label><input className="genre-number-input" id={`${idPrefix}-year-to`} type="number" inputMode="numeric" min="1000" max="9999" placeholder="1999" value={advanced.yearTo} onChange={(event) => update("yearTo", event.target.value)} /></div>
					<div className="editor-field genre-advanced-field"><label htmlFor={`${idPrefix}-rating-min`}>Minimum rating</label><input className="genre-number-input" id={`${idPrefix}-rating-min`} type="number" inputMode="decimal" min="0" max="10" step="0.1" placeholder="7.0" value={advanced.minimumRating} onChange={(event) => update("minimumRating", event.target.value)} /></div>
					<div className="editor-field genre-advanced-field"><label htmlFor={`${idPrefix}-rating-max`}>Maximum rating</label><input className="genre-number-input" id={`${idPrefix}-rating-max`} type="number" inputMode="decimal" min="0" max="10" step="0.1" value={advanced.maximumRating} onChange={(event) => update("maximumRating", event.target.value)} /></div>
					<div className="editor-field genre-advanced-field"><label htmlFor={`${idPrefix}-votes-min`}>Minimum votes</label><input className="genre-number-input" id={`${idPrefix}-votes-min`} type="number" inputMode="numeric" min="0" step="1" placeholder="250" value={advanced.minimumVotes} onChange={(event) => update("minimumVotes", event.target.value)} /></div>
					<div className="editor-field genre-advanced-field"><label htmlFor={`${idPrefix}-language`}>Original language</label><select id={`${idPrefix}-language`} value={advanced.originalLanguage} onChange={(event) => update("originalLanguage", event.target.value)}><option value="">Any language</option>{languages.map((entry) => <option key={entry.code} value={entry.code}>{entry.label} ({entry.code})</option>)}</select></div>
					<div className="editor-field genre-advanced-field"><label htmlFor={`${idPrefix}-country`}>Origin country</label><select id={`${idPrefix}-country`} value={advanced.originCountry} onChange={(event) => update("originCountry", event.target.value)}><option value="">Any country</option>{countries.map((entry) => <option key={entry.code} value={entry.code}>{entry.label} ({entry.code})</option>)}</select></div>
				</div>
				<div className="genre-advanced-compact-actions">
					<div><strong>{exclusionHeading}</strong><span>{includedNames.length > 1 ? "Set different exclusions for individual genres. " : ""}{exclusionSummary}</span></div>
					<button type="button" className="secondary-action" onClick={(event) => onOpenSecondary("exclusions", event.currentTarget)}>{includedNames.length > 1 ? "Configure" : "Choose"}</button>
				</div>
				{validation.errors.length > 0 ? <ul className="genre-advanced-errors" aria-live="polite">{validation.errors.map((entry) => <li key={`${entry.code}-${entry.path}-${entry.message}`}>{entry.message}</li>)}</ul> : null}
				<button type="button" className="genre-advanced-help-action" onClick={(event) => onOpenSecondary("help", event.currentTarget)}>What do these options do?</button>
			</div>
		</details>
	);
}
