import fs from "fs/promises";
import zlib from "zlib";
import { promisify } from "util";

const gunzip = promisify(zlib.gunzip);

const TOKEN = process.env.TMDB_BEARER_TOKEN;
const OFFSET = Number(process.env.OFFSET || 0);
const LIMIT = Number(process.env.LIMIT || 500);
const REQUEST_DELAY_MS = Number(process.env.REQUEST_DELAY_MS || 120);

const DATA_DIR = "data";
const JSON_PATH = `${DATA_DIR}/companies.json`;
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

    console.log(`Loaded ${companies.length.toLocaleString()} company IDs from export ${candidate.date}`);

    return {
      export_date: candidate.date,
      companies
    };
  }

  throw new Error("Could not find a recent TMDB production company export.");
}

async function fetchCompanyDetails(id) {
  const res = await fetch(`https://api.themoviedb.org/3/company/${id}`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      accept: "application/json"
    }
  });

  if (!res.ok) {
    return null;
  }

  return res.json();
}

async function fetchMovieCount(id) {
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/discover/movie?with_companies=${id}`,
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          accept: "application/json"
        }
      }
    );

    if (!res.ok) {
      return 0;
    }

    const data = await res.json();
    return data.total_results || 0;
  } catch {
    return 0;
  }
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

const exportData = await fetchExport();

await fs.writeFile(
  EXPORT_PATH,
  JSON.stringify(
    {
      export_date: exportData.export_date,
      total_ids: exportData.companies.length,
      ids: exportData.companies.map(company => company.id)
    },
    null,
    2
  )
);

const selectedCompanies = exportData.companies.slice(OFFSET, OFFSET + LIMIT);

const stats = {
  mode: "tmdb_daily_export",
  export_date: exportData.export_date,
  export_total_ids: exportData.companies.length,
  offset: OFFSET,
  limit: LIMIT,
  checked: 0,
  found: 0,
  missing: 0,
  started_at: new Date().toISOString()
};

console.log(`Enriching ${selectedCompanies.length.toLocaleString()} companies from export offset ${OFFSET}.`);

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

await fs.writeFile(JSON_PATH, JSON.stringify(companies, null, 2));
await fs.writeFile(CSV_PATH, toCsv(companies));

stats.total_cached = companies.length;
stats.finished_at = new Date().toISOString();

await fs.writeFile(
  META_PATH,
  JSON.stringify({ last_scan: stats }, null, 2)
);

console.log(`Saved ${companies.length.toLocaleString()} total cached companies.`);
