import fs from "fs/promises";

const TOKEN = process.env.TMDB_BEARER_TOKEN;
const REQUEST_DELAY_MS = Number(process.env.REQUEST_DELAY_MS || 120);
const MAX_REPAIR_IDS = process.env.MAX_REPAIR_IDS ? Number(process.env.MAX_REPAIR_IDS) : null;

const DATA_DIR = "data";
const MIN_JSON_PATH = `${DATA_DIR}/companies.min.json`;
const CSV_PATH = `${DATA_DIR}/companies.csv`;
const AUDIT_PATH = `${DATA_DIR}/company-id-audit.json`;
const REPAIR_META_PATH = `${DATA_DIR}/company-cache-repair-meta.json`;

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

const audit = await readJson(AUDIT_PATH, null);

if (!audit) {
  throw new Error(`Missing audit file: ${AUDIT_PATH}. Run the audit workflow first.`);
}

const missingIds = Array.isArray(audit.missing_from_cache) ? audit.missing_from_cache.map(Number).filter(Boolean) : [];
const extraIds = Array.isArray(audit.extra_in_cache) ? audit.extra_in_cache.map(Number).filter(Boolean) : [];

const repairStats = {
  source_audit_date: audit.audited_at || "",
  max_repair_ids: MAX_REPAIR_IDS,
  missing_requested: missingIds,
  extra_requested: extraIds,
  added: [],
  removed: [],
  not_found: [],
  failed: [],
  started_at: new Date().toISOString()
};

console.log("\n===== COMPANY CACHE REPAIR =====");
console.log(`Missing IDs to add : ${missingIds.length ? missingIds.join(", ") : "none"}`);
console.log(`Extra IDs to remove: ${extraIds.length ? extraIds.join(", ") : "none"}`);

if (missingIds.length === 0 && extraIds.length === 0) {
  repairStats.skipped = true;
  repairStats.reason = "nothing_to_repair";
  repairStats.finished_at = new Date().toISOString();
  await fs.writeFile(REPAIR_META_PATH, JSON.stringify({ last_repair: repairStats }, null, 2));
  console.log("Nothing to repair. Skipping company cache update.");
  process.exit(0);
}

const requestedRepairCount = missingIds.length + extraIds.length;

if (MAX_REPAIR_IDS !== null && requestedRepairCount > MAX_REPAIR_IDS) {
  repairStats.skipped = true;
  repairStats.reason = "max_repair_ids_exceeded";
  repairStats.requested_repair_count = requestedRepairCount;
  repairStats.finished_at = new Date().toISOString();

  await fs.writeFile(REPAIR_META_PATH, JSON.stringify({ last_repair: repairStats }, null, 2));

  console.log(
    `Repair skipped: ${requestedRepairCount.toLocaleString()} requested changes exceed MAX_REPAIR_IDS=${MAX_REPAIR_IDS.toLocaleString()}.`
  );
  process.exit(0);
}

const existingCompact = await readJson(MIN_JSON_PATH, []);
const companyMap = new Map();

for (const company of existingCompact) {
  if (company?.i) {
    const expandedCompany = expandCompactCompany(company);
    companyMap.set(Number(expandedCompany.id), expandedCompany);
  }
}

for (const id of extraIds) {
  if (companyMap.delete(id)) {
    repairStats.removed.push(id);
    console.log(`${id}: removed stale cached company`);
  } else {
    console.log(`${id}: extra ID was not present in cache`);
  }
}

for (const id of missingIds) {
  try {
    const details = await fetchCompanyDetails(id);

    if (!details) {
      repairStats.not_found.push(id);
      console.log(`${id}: not found in TMDB company details`);
      await sleep(REQUEST_DELAY_MS);
      continue;
    }

    const movieCount = await fetchMovieCount(id);
    const company = normaliseCompany(details, movieCount);

    companyMap.set(company.id, company);
    repairStats.added.push(company.id);

    console.log(`${id}: added ${company.name} (${movieCount.toLocaleString()} movies)`);

    await sleep(REQUEST_DELAY_MS);
  } catch (error) {
    repairStats.failed.push({ id, error: error.message });
    console.log(`${id}: error ${error.message}`);
  }
}

const companies = Array
  .from(companyMap.values())
  .sort((a, b) => Number(a.id) - Number(b.id));

await fs.writeFile(MIN_JSON_PATH, toMinJson(companies));
await fs.writeFile(CSV_PATH, toCsv(companies));

repairStats.total_cached = companies.length;
repairStats.finished_at = new Date().toISOString();

await fs.writeFile(REPAIR_META_PATH, JSON.stringify({ last_repair: repairStats }, null, 2));

console.log(`Saved ${companies.length.toLocaleString()} total cached companies.`);
console.log(`Added ${repairStats.added.length.toLocaleString()} missing companies.`);
console.log(`Removed ${repairStats.removed.length.toLocaleString()} stale companies.`);
console.log(`Repair meta: ${REPAIR_META_PATH}`);
console.log("================================\n");
