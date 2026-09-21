import { useState } from "react";

export function hasPreviewUrl(value) {
	return typeof value === "string" && value.trim().length > 0;
}

export function useExactUrlPreviewFailure(url) {
	const [preview, setPreview] = useState({ url, failed: false });

	// Reset before committing the new URL. A passive reset could erase an
	// image error that arrives between the commit and its effects.
	if (preview.url !== url) setPreview({ url, failed: false });

	function setFailure(failed) {
		setPreview((current) => current.url === url && current.failed !== failed
			? { url, failed }
			: current);
	}

	return {
		failed: preview.url === url && preview.failed,
		markFailed: () => setFailure(true),
		resetFailure: () => setFailure(false),
	};
}
