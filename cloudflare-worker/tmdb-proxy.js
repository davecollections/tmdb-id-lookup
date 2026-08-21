const ALLOWED_ORIGINS = new Set([
  "https://davecollections.github.io",
]);

const ALLOWED_PATHS = [
  /^\/3\/search\/person$/,
  /^\/3\/person\/\d+$/,
  /^\/3\/person\/\d+\/combined_credits$/,

  /^\/3\/search\/collection$/,
  /^\/3\/collection\/\d+$/,

  /^\/3\/search\/movie$/,
  /^\/3\/movie\/\d+$/,
  /^\/3\/movie\/\d+\/keywords$/,

  /^\/3\/search\/tv$/,
  /^\/3\/tv\/\d+$/,
  /^\/3\/tv\/\d+\/keywords$/,

  /^\/3\/search\/keyword$/,
];

const PEOPLE_SERVICE_PATH = /^\/3\/person\/\d+$/;
const COMPANY_DISCOVER_PATHS = new Set([
  "/3/discover/movie",
  "/3/discover/tv",
]);
const WATCH_PROVIDER_PATHS = new Set([
  "/3/watch/providers/regions",
  "/3/watch/providers/movie",
  "/3/watch/providers/tv",
]);
const COMPANY_DISCOVER_SORTS = Object.freeze({
  "/3/discover/movie": new Set([
    "popularity.desc",
    "primary_release_date.desc",
    "vote_average.desc",
    "vote_count.desc",
  ]),
  "/3/discover/tv": new Set([
    "popularity.desc",
    "first_air_date.desc",
    "vote_average.desc",
    "vote_count.desc",
  ]),
});
const NETWORK_DISCOVER_SORTS = new Set([
  "popularity.desc",
  "first_air_date.desc",
  "vote_average.desc",
  "vote_count.desc",
]);
const GENRE_DISCOVER_SORTS = COMPANY_DISCOVER_SORTS;
const GENRE_DISCOVER_PARAMETERS = Object.freeze({
  "/3/discover/movie": new Set([
    "include_adult",
    "with_genres",
    "without_genres",
    "sort_by",
    "primary_release_date.gte",
    "primary_release_date.lte",
    "vote_average.gte",
    "vote_average.lte",
    "vote_count.gte",
    "with_original_language",
    "with_origin_country",
  ]),
  "/3/discover/tv": new Set([
    "include_adult",
    "with_genres",
    "without_genres",
    "sort_by",
    "first_air_date.gte",
    "first_air_date.lte",
    "vote_average.gte",
    "vote_average.lte",
    "vote_count.gte",
    "with_original_language",
    "with_origin_country",
  ]),
});

function isCanonicalPositiveSafeInteger(value) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    return false;
  }

  const number = Number(value);
  return Number.isSafeInteger(number) && String(number) === value;
}

function isCanonicalNonnegativeSafeInteger(value) {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value)) {
    return false;
  }

  const number = Number(value);
  return Number.isSafeInteger(number) && String(number) === value;
}

function isCanonicalRating(value) {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
    return false;
  }

  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 10 && String(number) === value;
}

function isCanonicalDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match || Number(match[1]) < 1000) {
    return false;
  }

  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isCanonicalPositiveIdList(value) {
  if (typeof value !== "string" || !value) {
    return false;
  }

  const ids = value.split(",");
  return ids.every(isCanonicalPositiveSafeInteger) && new Set(ids).size === ids.length;
}

function isAllowedGenreDiscoverRequest(url, entries) {
  const allowedParameters = GENRE_DISCOVER_PARAMETERS[url.pathname];
  const includedGenres = url.searchParams.getAll("with_genres");
  const includeAdult = url.searchParams.getAll("include_adult");
  if (
    includedGenres.length !== 1 ||
    !isCanonicalPositiveSafeInteger(includedGenres[0]) ||
    includeAdult.length !== 1 ||
    includeAdult[0] !== "false" ||
    entries.length !== new Set(entries.map(([key]) => key)).size ||
    entries.some(([key]) => !allowedParameters.has(key))
  ) {
    return false;
  }

  const sorts = url.searchParams.getAll("sort_by");
  if (sorts.length > 1 || (sorts.length === 1 && !GENRE_DISCOVER_SORTS[url.pathname].has(sorts[0]))) {
    return false;
  }

  const withoutGenres = url.searchParams.get("without_genres");
  if (
    withoutGenres !== null &&
    (!isCanonicalPositiveIdList(withoutGenres) || withoutGenres.split(",").includes(includedGenres[0]))
  ) {
    return false;
  }

  const lowerDateKey = url.pathname === "/3/discover/movie" ? "primary_release_date.gte" : "first_air_date.gte";
  const upperDateKey = url.pathname === "/3/discover/movie" ? "primary_release_date.lte" : "first_air_date.lte";
  const lowerDate = url.searchParams.get(lowerDateKey);
  const upperDate = url.searchParams.get(upperDateKey);
  if (
    (lowerDate !== null && !isCanonicalDate(lowerDate)) ||
    (upperDate !== null && !isCanonicalDate(upperDate)) ||
    (lowerDate !== null && upperDate !== null && lowerDate > upperDate)
  ) {
    return false;
  }

  const lowerRating = url.searchParams.get("vote_average.gte");
  const upperRating = url.searchParams.get("vote_average.lte");
  if (
    (lowerRating !== null && !isCanonicalRating(lowerRating)) ||
    (upperRating !== null && !isCanonicalRating(upperRating)) ||
    (lowerRating !== null && upperRating !== null && Number(lowerRating) > Number(upperRating))
  ) {
    return false;
  }

  const minimumVotes = url.searchParams.get("vote_count.gte");
  const language = url.searchParams.get("with_original_language");
  const country = url.searchParams.get("with_origin_country");
  return (
    (minimumVotes === null || isCanonicalNonnegativeSafeInteger(minimumVotes)) &&
    (language === null || /^[a-z]{2}$/.test(language)) &&
    (country === null || /^[A-Z]{2}$/.test(country))
  );
}

function isAllowedTmdbRequest(url) {
  if (WATCH_PROVIDER_PATHS.has(url.pathname)) {
    const entries = [...url.searchParams.entries()];
    return (
      entries.length === 1 &&
      entries[0][0] === "language" &&
      entries[0][1] === "en-US"
    );
  }

  if (ALLOWED_PATHS.some((pattern) => pattern.test(url.pathname))) {
    return true;
  }

  if (!COMPANY_DISCOVER_PATHS.has(url.pathname)) {
    return false;
  }

  const entries = [...url.searchParams.entries()];
  const companyIds = url.searchParams.getAll("with_companies");
  const networkIds = url.searchParams.getAll("with_networks");
  const genreIds = url.searchParams.getAll("with_genres");
  const sorts = url.searchParams.getAll("sort_by");

  if (genreIds.length > 0) {
    return isAllowedGenreDiscoverRequest(url, entries);
  }

  if (networkIds.length > 0) {
    if (
      url.pathname !== "/3/discover/tv" ||
      networkIds.length !== 1 ||
      companyIds.length !== 0 ||
      sorts.length > 1 ||
      entries.length !== 1 + sorts.length ||
      entries.some(([key]) => key !== "with_networks" && key !== "sort_by") ||
      !isCanonicalPositiveSafeInteger(networkIds[0])
    ) {
      return false;
    }

    return sorts.length === 0 || NETWORK_DISCOVER_SORTS.has(sorts[0]);
  }

  if (
    companyIds.length !== 1 ||
    networkIds.length !== 0 ||
    sorts.length > 1 ||
    entries.length !== 1 + sorts.length ||
    entries.some(([key]) => key !== "with_companies" && key !== "sort_by") ||
    !isCanonicalPositiveSafeInteger(companyIds[0])
  ) {
    return false;
  }

  return sorts.length === 0 || COMPANY_DISCOVER_SORTS[url.pathname].has(sorts[0]);
}

function isAllowedOrigin(origin) {
  if (!origin) {
    return false;
  }

  if (ALLOWED_ORIGINS.has(origin)) {
    return true;
  }

  return /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin);
}

function corsHeaders(origin) {
  const headers = {
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };

  if (isAllowedOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}

function textResponse(message, status, origin, extraHeaders = {}) {
  return new Response(message, {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";

    const suppliedServiceToken =
      request.headers.get("X-Nuvio-Service-Token") || "";

    const hasServiceAccess =
      (PEOPLE_SERVICE_PATH.test(url.pathname) ||
        WATCH_PROVIDER_PATHS.has(url.pathname)) &&
      typeof env.NUVIO_PEOPLE_SERVICE_TOKEN === "string" &&
      env.NUVIO_PEOPLE_SERVICE_TOKEN.length >= 32 &&
      suppliedServiceToken === env.NUVIO_PEOPLE_SERVICE_TOKEN;

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin),
      });
    }

    if (request.method !== "GET") {
      return textResponse("Method not allowed", 405, origin, {
        Allow: "GET, OPTIONS",
      });
    }

    if (!isAllowedOrigin(origin) && !hasServiceAccess) {
      return textResponse("Origin not allowed", 403, origin);
    }

    if (!env.TMDB_BEARER_TOKEN) {
      return textResponse("TMDB token not configured", 500, origin);
    }

    if (!isAllowedTmdbRequest(url)) {
      return textResponse("TMDB path not allowed", 403, origin);
    }

    const tmdbUrl = new URL(`https://api.themoviedb.org${url.pathname}`);

    url.searchParams.forEach((value, key) => {
      if (key !== "api_key") {
        tmdbUrl.searchParams.set(key, value);
      }
    });

    let tmdbResponse;
    let body;

    try {
      tmdbResponse = await fetch(tmdbUrl, {
        headers: {
          Authorization: `Bearer ${env.TMDB_BEARER_TOKEN}`,
          Accept: "application/json",
        },
      });

      body = await tmdbResponse.text();
    } catch (error) {
      console.error("TMDB request failed:", error);

      return textResponse("TMDB request failed", 502, origin);
    }

    return new Response(body, {
      status: tmdbResponse.status,
      headers: {
        ...corsHeaders(origin),
        "Content-Type":
          tmdbResponse.headers.get("Content-Type") ||
          "application/json; charset=utf-8",
        "Cache-Control": tmdbResponse.ok
          ? "public, max-age=300"
          : "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  },
};
