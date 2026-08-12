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
const TV_DISCOVER_PARAMETERS = new Set([
  "with_companies",
  "with_networks",
]);

function isCanonicalPositiveSafeInteger(value) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    return false;
  }

  const number = Number(value);
  return Number.isSafeInteger(number) && String(number) === value;
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
  const allowedParameter = url.pathname === "/3/discover/tv"
    ? TV_DISCOVER_PARAMETERS.has(entries[0]?.[0])
    : entries[0]?.[0] === "with_companies";
  return (
    entries.length === 1 &&
    allowedParameter &&
    isCanonicalPositiveSafeInteger(entries[0][1])
  );
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
