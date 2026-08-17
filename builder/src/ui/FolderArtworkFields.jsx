import { PresentationSwitch } from "./PresentationControls.jsx";
import { FOLDER_ARTWORK_URL_FIELDS } from "../nuvio/folder-artwork-fields.js";

export function FolderArtworkFields({
	values,
	prefix,
	original = null,
	touched = null,
	onChange,
}) {
	return (
		<div className="folder-artwork-fields" data-folder-artwork-fields="true">
			{FOLDER_ARTWORK_URL_FIELDS.map(({ field, label, description }) => {
				const preserved = original?.[field]?.hasField === true && !original[field].supported && touched?.[field] !== true;
				return (
					<div className="editor-field folder-artwork-url-field" data-editor-field={field} key={field}>
						<label htmlFor={`${prefix}-${field}`}>{label}</label>
						<input
							id={`${prefix}-${field}`}
							type="url"
							inputMode="url"
							value={values?.[field] ?? ""}
							autoComplete="off"
							spellCheck="false"
							placeholder="https://"
							onChange={(event) => onChange(field, event.target.value)}
						/>
						<p className="editor-field-help">{description} Leave blank to clear it.</p>
						{preserved ? <p className="editor-field-status">The current imported value is preserved until this field is edited.</p> : null}
					</div>
				);
			})}
			<div className="editor-switch-field folder-focus-enabled-field" data-editor-field="focusGifEnabled">
				<PresentationSwitch
					label="Enable focus artwork"
					description="Use the Focus artwork URL when the folder tile is focused."
					descriptionId={`${prefix}-focus-enabled-help`}
					controlName="focusGifEnabled"
					checked={values?.focusGifEnabled === true}
					onChange={(checked) => onChange("focusGifEnabled", checked)}
				/>
			</div>
		</div>
	);
}
