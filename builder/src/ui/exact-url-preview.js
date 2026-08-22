import { useEffect, useState } from "react";

export function hasPreviewUrl(value) {
	return typeof value === "string" && value.trim().length > 0;
}

export function useExactUrlPreviewFailure(url) {
	const [failedUrl, setFailedUrl] = useState(null);

	useEffect(() => {
		setFailedUrl(null);
	}, [url]);

	return {
		failed: failedUrl === url,
		markFailed: () => setFailedUrl(url),
		resetFailure: () => setFailedUrl(null),
	};
}
