function tmdbApiUrl(path, params = {}) {
	const url = new URL(path, TMDB_PROXY_BASE_URL);

	Object.entries(params).forEach(([key, value]) => {
		if (value !== undefined && value !== null && value !== "") {
			url.searchParams.set(key, value);
		}
	});

	return url.toString();
}

async function tmdbJson(url) {
	const res = await fetch(url);

	if (!res.ok) {
		return null;
	}

	return res.json();
}

async function tmdbJsonWithStatus(url) {
	try {
		const res = await fetch(url);

		if (res.status === 429) {
			return {
				ok: false,
				rateLimited: true,
				status: 429,
				data: null,
			};
		}

		if (!res.ok) {
			return {
				ok: false,
				rateLimited: false,
				status: res.status,
				data: null,
			};
		}

		return {
			ok: true,
			rateLimited: false,
			status: res.status,
			data: await res.json(),
		};
	} catch {
		return {
			ok: false,
			rateLimited: false,
			status: 0,
			data: null,
		};
	}
}

async function getPersonKnownCredits(personId) {
	try {
		const credits = await tmdbJson(tmdbApiUrl(`/3/person/${personId}/combined_credits`));

		if (!credits) {
			return "\u2014";
		}

		const castCount = Array.isArray(credits.cast) ? credits.cast.length : 0;

		const crewCount = Array.isArray(credits.crew) ? credits.crew.length : 0;

		return (castCount + crewCount).toLocaleString();
	} catch {
		return "\u2014";
	}
}
