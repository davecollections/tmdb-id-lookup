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
	try {
		const res = await fetch(url);

		if (!res.ok) {
			return null;
		}

		const contentType = res.headers.get("content-type");
		if (!contentType || !contentType.includes("application/json")) {
			return null;
		}

		return await res.json();
	} catch (error) {
		console.error("TMDB API request failed:", error);
		return null;
	}
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

		const contentType = res.headers.get("content-type");
		if (!contentType || !contentType.includes("application/json")) {
			return {
				ok: false,
				invalidResponse: true,
				rateLimited: false,
				status: 0,
				data: null,
			};
		}

		return {
			ok: true,
			rateLimited: false,
			status: res.status,
			data: await res.json(),
		};
	} catch (error) {
		console.error("TMDB API request failed:", error);
		return {
			ok: false,
			rateLimited: false,
			status: 0,
			data: null,
		};
	}
}

async function getPersonKnownCredits(personId) {
	const credits = await tmdbJson(tmdbApiUrl(`/3/person/${personId}/combined_credits`));

	if (!credits || typeof credits !== 'object') {
		return "\u2014";
	}

	const castCount = Array.isArray(credits.cast) ? credits.cast.length : 0;
	const crewCount = Array.isArray(credits.crew) ? credits.crew.length : 0;

	return (castCount + crewCount).toLocaleString();
}
