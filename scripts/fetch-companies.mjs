import fs from "fs/promises";

const TOKEN = process.env.TMDB_BEARER_TOKEN;
const START_ID = Number(process.env.START_ID || 1);
const END_ID = Number(process.env.END_ID || 500);
const REQUEST_DELAY_MS = Number(process.env.REQUEST_DELAY_MS || 120);

const DATA_DIR = "data";
const JSON_PATH = `${DATA_DIR}/companies.json`;
const CSV_PATH = `${DATA_DIR}/companies.csv`;
const META_PATH = `${DATA_DIR}/scan-meta.json`;

if (!TOKEN) {
  throw new Error("Missing TMDB_BEARER_TOKEN");
}

if (START_ID > END_ID) {
  throw new Error(`START_ID ${START_ID} cannot be greater than END_ID ${END_ID}`);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function readJson(path, fallback) {
  try {
    const raw = await fs.readFile(path, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function tmdbFetch(url, options = {}) {
  const maxAttempts = 5;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, {
        ...options,
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          accept: "application/json",
          ...(options.headers || {})
        }
      });

      if (res.status === 401 || res.status === 403) {
        throw new Error(
          `TMDB auth/permission error HTTP ${res.status}. Check TMDB_BEARER_TOKEN.`
        );
      }

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("retry-after") || 5);
        console.log(
          `Rate limited. Waiting ${retryAfter}s before retry ${attempt}/${maxAttempts}...`
        );
        await sleep(retryAfter * 1000);
        continue;
      }

      if (res.status >= 500) {
        const waitMs = attempt * 2000;
        console.log(
          `TMDB server error ${res.status}. Waiting ${waitMs / 1000}s before retry ${attempt}/${maxAttempts}...`
        );
        await sleep(waitMs);
        continue;
      }

      return res;
    } catch (error) {
      if (error.message.includes("auth/permission")) {
        throw error;
      }

      const waitMs = attempt * 2000;
      console.log(
        `Network/request error: ${error.message}. Waiting ${waitMs / 1000}s before retry ${attempt}/${maxAttempts}...`
      );
      await sleep(waitMs);
    }
  }

  throw new Error(`TMDB request failed after ${maxAttempts} attempts: ${url}`);
}

async function fetchCompanyDetails(id) {
  const res = await tmdbFetch(`https://api.themoviedb.org/3/company/${id}`);

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    throw new Error(`Company details failed for ${id}: HTTP ${res.status}`);
  }

  return res.json();
}

async function fetchMovieCount(id) {
  const res = await tmdbFetch(
    `https://api.themoviedb.org/3/discover/movie?with_companies=${id}`
  );

  if (!res.ok) {
    throw new Error(`Movie count failed for ${id}: HTTP ${res.status}`);
  }

  const data = await res.json();
  return data.total_results || 0;
}

function normaliseCompany(data, movieCount) {
  return {
    id: data.id,
    name: data.name || "",
    description: data.description || "",
    headquarters: data.headquarters || "",
    homepage: data.homepage || "",
    logo_path: data.logo_path || "",
    origin_country: data.origin_country || "",
    parent_company: data.parent_company?.name || "",
    titles_count: movieCount,
    tmdb_url: `https://www.themoviedb.org/company/${data.id}`,
    updated_at: new Date().toISOString()
  };
}

function csvEscape(value) {
  const text = String(value ?? "");

  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

function toCsv(companies) {
  const headers = [
    "id",
    "name",
    "titles_count",
    "headquarters",
    "origin_country",
    "homepage",
    "tmdb_url"
  ];

  const rows = companies.map(company =>
    headers.map(header => csvEscape(company[header])).join(",")
  );

  return [headers.join(","), ...rows].join("\n") + "\n";
}

await fs.mkdir(DATA_DIR, { recursive: true });

const existing = await readJson(JSON_PATH, []);
const companyMap = new Map();

for (const company of existing) {
  if (company?.id) {
    companyMap.set(Number(company.id), company);
  }
}

const stats = {
  mode: "raw_id_range",
  start_id: START_ID,
  end_id: END_ID,
  checked: 0,
  found: 0,
  missing: 0,
  started_at: new Date().toISOString()
};

for (let id = START_ID; id <= END_ID; id++) {
  stats.checked += 1;

  try {
    const details = await fetchCompanyDetails(id);

    if (!details) {
      stats.missing += 1;
      console.log(`${id}: no company record`);
      await sleep(REQUEST_DELAY_MS);
      continue;
    }

    const movieCount = await fetchMovieCount(id);
    const company = normaliseCompany(details, movieCount);

    companyMap.set(company.id, company);

    stats.found += 1;
    console.log(`${id}: ${company.name} (${movieCount.toLocaleString()} movies)`);

    await sleep(REQUEST_DELAY_MS);
  } catch (error) {
    stats.missing += 1;
    console.log(`${id}: error ${error.message}`);
  }
}

const companies = Array
  .from(companyMap.values())
  .sort((a, b) => Number(a.id) - Number(b.id));

await fs.writeFile(JSON_PATH, JSON.stringify(companies, null, 2));
await fs.writeFile(CSV_PATH, toCsv(companies));

stats.total_cached = companies.length;
stats.finished_at = new Date().toISOString();

await fs.writeFile(
  META_PATH,
  JSON.stringify({ last_scan: stats }, null, 2)
);

console.log(`Saved ${companies.length.toLocaleString()} total cached companies.`);
