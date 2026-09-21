import { groupedImportNotes } from "../import/import-notices.js";

export function ImportWarningSummary({ warnings, limitedSourceCount = 0, idsRepaired = 0 }) {
	const notes = groupedImportNotes(warnings, limitedSourceCount, idsRepaired);
	if (!notes.length) return null;
	return <div className="import-notice-summary">
		{limitedSourceCount > 0 ? <div className="import-compatibility">
			<strong>Some Sources have limited editing</strong>
			<p>Their Source settings can't be edited in Dingo. Collection and Folder details remain editable.</p>
		</div> : null}
		<details className="import-notice-details"><summary>View import notes</summary><ul>{notes.map((note) => <li key={note}>{note}</li>)}</ul></details>
	</div>;
}
