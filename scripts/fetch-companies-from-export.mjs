import fs from "fs/promises";
import zlib from "zlib";
import { promisify } from "util";

const gunzip = promisify(zlib.gunzip);

const TOKEN = process.env.TMDB_BEARER_TOKEN;
const OFFSET = Number(process.env.OFFSET || 0);
const LIMIT = Number(process.env.LIMIT || 500);
const REQUEST_DELAY_MS = Number(process.env.REQUEST_DELAY_MS || 120);

const DATA_DIR = "data";
const MIN_JSON_PATH = `${DATA_DIR}/companies.min.json`;
const CSV_PATH = `${DATA_DIR}/companies.csv`;
const META_PATH = `${DATA_DIR}/scan-meta.json`;
const EXPORT_PATH = `${DATA_DIR}/production-company-export.json`;

if (!TOKEN) {
  throw new Error("Missing TMDB_BEARER_TOKEN");
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

function formatExportDate(date) {
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const yyyy = date.getUTCFullYear();

  return `${mm}_${dd}_${yyyy}`;
}

function getRecentExportUrls(daysBack = 7) {
  const urls = [];

  for (let i = 0; i < daysBack; i++) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - i);

    const formattedDate = formatExportDate(date);

    urls.push({
      date: formattedDate,
      url: `https://files.tmdb.org/p/exports/production_company_ids_${formattedDate}.json.gz`
    });
  }

  return urls;
}

async function fetchExport() {
  const candidates = getRecentExportUrls(7);

  for (const candidate of candidates) {
    console.log(`Trying export: ${candidate.url}`);

    const res = await fetch(candidate.url);

    if (!res.ok) {
      console.log(`Export not available: ${candidate.date} HTTP ${res.status}`);
      continue;
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    const unzipped = await gunzip(buffer);
    const lines = unzipped.toString("utf8").trim().split("\n");

    const companies = lines
      .filter(Boolean)
      .map(line => JSON.parse(line))
      .sort((a, b) => Number(a.id) - Number(b.id));

    console.log(
      `Loaded ${companies.length.toLocaleString()} company IDs from export ${candidate.date}`
    );

    return {
      export_date: candidate.date,
      companies
    };
  }

  throw new Error("Could not find a recent TMDB production company export.");
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
    headquarters: data.headquarters || "",
    homepage: data.homepage || "",
    logo_path: data.logo_path || "",
    origin_country: data.origin_country || "",
    parent_company: data.parent_company?.name || "",
    titles_count: movieCount,
    tmdb_url: `https://www.themoviedb.org/company/${data.id}`
  };
}

function expandCompactCompany(company) {
  return {
    id: company.i,
    name: company.n || "",
    parent_company: company.p || "",
    origin_country: company.c || "",
    headquarters: company.h || "",
    logo_path: company.l || "",
    titles_count: company.t || 0,
    homepage: "",
    tmdb_url: `https://www.themoviedb.org/company/${company.i}`
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

function compactCompany(company) {
  const compact = {
    i: company.id,
    n: company.name
  };

  if (company.parent_company) compact.p = company.parent_company;
  if (company.origin_country) compact.c = company.origin_country;
  if (company.headquarters) compact.h = company.headquarters;
  if (company.logo_path) compact.l = company.logo_path;
  if (company.titles_count) compact.t = company.titles_count;

  return compact;
}

function toMinJson(companies) {
  return JSON.stringify(companies.map(compactCompany));
}

await fs.mkdir(DATA_DIR, { recursive: true });

const existingCompact = await readJson(MIN_JSON_PATH, []);
const companyMap = new Map();

for (const company of existingCompact) {
  if (company?.i) {
    const expandedCompany = expandCompactCompany(company);
    companyMap.set(Number(expandedCompany.id), expandedCompany);
  }
}

const exportData = await fetchExport();

await fs.writeFile(
  EXPORT_PATH,
  JSON.stringify(
    {
      export_date: exportData.export_date,
      total_ids: exportData.companies.length,
      last_offset: OFFSET,
      last_limit: LIMIT,
      updated_at: new Date().toISOString()
    },
    null,
    2
  )
);

if (OFFSET >= exportData.companies.length) {
  console.log(
    `Offset ${OFFSET.toLocaleString()} is beyond the export total of ${exportData.companies.length.toLocaleString()}. Nothing to scan.`
  );

  const companies = Array
    .from(companyMap.values())
    .sort((a, b) => Number(a.id) - Number(b.id));

  const stats = {
    mode: "tmdb_daily_export",
    export_date: exportData.export_date,
    export_total_ids: exportData.companies.length,
    offset: OFFSET,
    limit: LIMIT,
    actual_limit: 0,
    checked: 0,
    found: 0,
    missing: 0,
    total_cached: companies.length,
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString()
  };

  await fs.writeFile(META_PATH, JSON.stringify({ last_scan: stats }, null, 2));

  process.exit(0);
}

const selectedCompanies = exportData.companies.slice(OFFSET, OFFSET + LIMIT);
const actualLimit = selectedCompanies.length;

const stats = {
  mode: "tmdb_daily_export",
  export_date: exportData.export_date,
  export_total_ids: exportData.companies.length,
  offset: OFFSET,
  limit: LIMIT,
  actual_limit: actualLimit,
  checked: 0,
  found: 0,
  missing: 0,
  started_at: new Date().toISOString()
};

console.log(
  `Enriching ${actualLimit.toLocaleString()} companies from export offset ${OFFSET.toLocaleString()}.`
);

for (const exportCompany of selectedCompanies) {
  const id = Number(exportCompany.id);
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

await fs.writeFile(MIN_JSON_PATH, toMinJson(companies));
await fs.writeFile(CSV_PATH, toCsv(companies));

stats.total_cached = companies.length;
stats.finished_at = new Date().toISOString();

await fs.writeFile(
  META_PATH,
  JSON.stringify({ last_scan: stats }, null, 2)
);

console.log(`Saved ${companies.length.toLocaleString()} total cached companies.`);
