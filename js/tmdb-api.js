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

function createEmptyPersonCreditSummary() {
	return {
		hasCreditData: false,
		totalCount: 0,
		formattedTotal: "\u2014",
		movieCount: 0,
		tvCount: 0,
		castMovieCount: 0,
		castTvCount: 0,
		directorMovieCount: 0,
		directorTvCount: 0,
	};
}

function addCreditMediaId(credit, movieIds, tvIds) {
	if (!credit || !credit.id) {
		return;
	}

	if (credit.media_type === "movie") {
		movieIds.add(credit.id);
	} else if (credit.media_type === "tv") {
		tvIds.add(credit.id);
	}
}

async function getPersonCreditSummary(personId) {
	const credits = await tmdbJson(tmdbApiUrl(`/3/person/${personId}/combined_credits`));

	if (!credits || typeof credits !== "object") {
		return createEmptyPersonCreditSummary();
	}

	const castCredits = Array.isArray(credits.cast) ? credits.cast : [];
	const crewCredits = Array.isArray(credits.crew) ? credits.crew : [];
	const movieIds = new Set();
	const tvIds = new Set();
	const castMovieIds = new Set();
	const castTvIds = new Set();
	const directorMovieIds = new Set();
	const directorTvIds = new Set();

	for (const credit of castCredits) {
		addCreditMediaId(credit, castMovieIds, castTvIds);
	}

	for (const credit of [...castCredits, ...crewCredits]) {
		addCreditMediaId(credit, movieIds, tvIds);
	}

	for (const credit of crewCredits) {
		if (String(credit.job || "").toLowerCase() === "director") {
			addCreditMediaId(credit, directorMovieIds, directorTvIds);
		}
	}

	const totalCount = castCredits.length + crewCredits.length;

	return {
		hasCreditData: true,
		totalCount,
		formattedTotal: totalCount.toLocaleString(),
		movieCount: movieIds.size,
		tvCount: tvIds.size,
		castMovieCount: castMovieIds.size,
		castTvCount: castTvIds.size,
		directorMovieCount: directorMovieIds.size,
		directorTvCount: directorTvIds.size,
	};
}

async function getPersonKnownCredits(personId) {
	const summary = await getPersonCreditSummary(personId);

	return summary.formattedTotal;
}
