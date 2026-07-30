export function parseCanonicalHttpsOrigin(value) {
	const rawValue = value.trim();
	const parsed = new URL(rawValue);

	if (
		parsed.protocol !== "https:"
		|| parsed.username !== ""
		|| parsed.password !== ""
		|| parsed.port !== ""
		|| parsed.pathname !== "/"
		|| parsed.search !== ""
		|| parsed.hash !== ""
		|| (rawValue !== parsed.origin && rawValue !== `${parsed.origin}/`)
	) {
		return null;
	}

	return parsed;
}
