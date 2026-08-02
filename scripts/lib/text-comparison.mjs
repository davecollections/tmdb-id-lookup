export function normalizeTextLineEndings(text) {
	if (typeof text !== "string") {
		throw new TypeError("normalizeTextLineEndings requires text input.");
	}

	return text.replace(/\r\n?/gu, "\n");
}
