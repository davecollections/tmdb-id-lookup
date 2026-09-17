// Presentation shared by full Discover rules and the fixed-identity family adapters.
export function GenreRuleCard({ title = "Genres", headingRef, children }) {
	return <section className="editor-settings-section discover-genres" aria-label={title}><h3 ref={headingRef} tabIndex={-1}>{title}</h3>{children}</section>;
}

export function GenreRulePills({ rows, onChoose }) {
	return <div className="discover-genre-pills">{rows.map((row) => {
		const { included = false, excluded = false } = row;
		return <button type="button" key={row.id} data-genre-name={row.genreName} aria-label={(excluded ? "Exclude: " : included ? "Include: " : "") + row.name + (row.unavailable ? " (unavailable for this media)" : row.only ? " (" + row.only + " only)" : "")} aria-pressed={included || excluded} data-chosen={included || excluded || undefined} data-excluded={excluded || undefined} onClick={() => onChoose(row)}>{row.name}{row.only ? <span className="discover-genre-media" aria-hidden="true">{row.only}</span> : null}</button>;
	})}</div>;
}

export function FamilyGenreRulePills({ concepts, selection, onChoose, semantics, showMedia = true }) {
	return <GenreRulePills rows={concepts.map((concept) => ({
		id: concept.name,
		name: concept.name,
		genreName: concept.name,
		only: showMedia && !concept.shared ? concept.movieId !== null ? "Movies" : "Series" : null,
		included: semantics === "include" && selection.includes(concept.name),
		excluded: semantics === "exclude" && selection.includes(concept.name),
	}))} onChoose={(row) => onChoose(row.name)} />;
}
