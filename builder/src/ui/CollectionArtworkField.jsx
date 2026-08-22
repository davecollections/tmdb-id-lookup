import { ExactImageUrlField } from "./ExactImageUrlField.jsx";

const collectionBackdropDescriptor = Object.freeze({
	field: "backdropImageUrl",
	label: "Backdrop Image or GIF URL",
	description: "Used as fallback folder artwork in Modern View.",
	preview: "backdrop",
});

export function CollectionArtworkField({ values, original, touched, prefix, onChange }) {
	const { field } = collectionBackdropDescriptor;
	const preserved = original?.[field]?.hasField === true
		&& !original[field].supported
		&& touched?.[field] !== true;

	return (
		<div className="folder-artwork-fields collection-artwork-fields" data-collection-artwork-fields="true">
			<ExactImageUrlField
				descriptor={collectionBackdropDescriptor}
				value={values?.[field] ?? ""}
				prefix={prefix}
				preserved={preserved}
				previewShape="wide"
				onChange={onChange}
			/>
		</div>
	);
}
