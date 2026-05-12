import fs from "fs/promises";
import zlib from "zlib";
import { promisify } from "util";

const gunzip = promisify(zlib.gunzip);

const DATA_DIR = "data";

const DATASETS = {
  companies: {
    label: "Production Companies",
    exportPrefix: "production_company_ids",
    cachePath: `${DATA_DIR}/companies.min.json`,
    auditPath: `${DATA_DIR}/company-id-audit.json`
  },
  networks: {
    label: "TV Networks",
    exportPrefix: "tv_network_ids",
    cachePath: `${DATA_DIR}/tv-networks.min.json`,
    auditPath: `${DATA_DIR}/tv-network-id-audit.json`
  }
};

function formatExportDate(date) {
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const yyyy = date.getUTCFullYear();

  return `${mm}_${dd}_${yyyy}`;
}

function getRecentExportUrls(exportPrefix, daysBack = 7) {
  const urls = [];

  for (let i = 0; i < daysBack; i++) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - i);

    const formattedDate = formatExportDate(date);

    urls.push({
      date: formattedDate,
      url: `https://files.tmdb.org/p/exports/${exportPrefix}_${formattedDate}.json.gz`
    });
  }

  return urls;
}

async function readJson(path, fallback) {
  try {
    const raw = await fs.readFile(path, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function fetchExportIds(exportPrefix) {
  const candidates = getRecentExportUrls(exportPrefix, 7);

  for (const candidate of candidates) {
    console.log(`Trying export: ${candidate.url}`);

    const res = await fetch(candidate.url);

    if (!res.ok) {
      console.log(`Export not available: ${candidate.date} HTTP ${res.status}`);
      continue;
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    const unzipped = await gunzip(buffer);
    const lines = unzipped.toString("utf8").trim().split("\n").filter(Boolean);
    const ids = lines
      .map(line => JSON.parse(line))
      .map(item => Number(item.id))
      .filter(Boolean)
      .sort((a, b) => a - b);

    return {
      export_date: candidate.date,
      ids
    };
  }

  throw new Error(`Could not find recent TMDB export for ${exportPrefix}.`);
}

function extractCachedIds(cacheData) {
  if (!Array.isArray(cacheData)) {
    return [];
  }

  return cacheData
    .map(item => Number(item.i ?? item.id))
    .filter(Boolean)
    .sort((a, b) => a - b);
}

function difference(leftIds, rightSet) {
  return leftIds.filter(id => !rightSet.has(id));
}

function duplicateIds(ids) {
  const seen = new Set();
  const duplicates = new Set();

  for (const id of ids) {
    if (seen.has(id)) {
      duplicates.add(id);
    }

    seen.add(id);
  }

  return Array.from(duplicates).sort((a, b) => a - b);
}

async function auditDataset(key, config) {
  console.log(`\n===== AUDITING ${config.label.toUpperCase()} =====`);

  const exportData = await fetchExportIds(config.exportPrefix);
  const cacheData = await readJson(config.cachePath, []);
  const cachedIds = extractCachedIds(cacheData);

  const exportSet = new Set(exportData.ids);
  const cachedSet = new Set(cachedIds);

  const missingFromCache = difference(exportData.ids, cachedSet);
  const extraInCache = difference(cachedIds, exportSet);
  const duplicateCachedIds = duplicateIds(cachedIds);

  const matchedCount = exportData.ids.length - missingFromCache.length;
  const coveragePercent = exportData.ids.length
    ? Number(((matchedCount / exportData.ids.length) * 100).toFixed(4))
    : 0;

  const audit = {
    dataset: key,
    label: config.label,
    export_date: exportData.export_date,
    export_total_ids: exportData.ids.length,
    cached_total_ids: cachedIds.length,
    cached_unique_ids: cachedSet.size,
    matched_count: matchedCount,
    coverage_percent: coveragePercent,
    missing_from_cache_count: missingFromCache.length,
    extra_in_cache_count: extraInCache.length,
    duplicate_cached_ids_count: duplicateCachedIds.length,
    lowest_export_id: exportData.ids.length ? Math.min(...exportData.ids) : null,
    highest_export_id: exportData.ids.length ? Math.max(...exportData.ids) : null,
    lowest_cached_id: cachedIds.length ? Math.min(...cachedIds) : null,
    highest_cached_id: cachedIds.length ? Math.max(...cachedIds) : null,
    missing_from_cache: missingFromCache,
    extra_in_cache: extraInCache,
    duplicate_cached_ids: duplicateCachedIds,
    audited_at: new Date().toISOString()
  };

  await fs.writeFile(config.auditPath, JSON.stringify(audit, null, 2));

  console.log(`Export IDs        : ${audit.export_total_ids.toLocaleString()}`);
  console.log(`Cached IDs        : ${audit.cached_total_ids.toLocaleString()}`);
  console.log(`Matched IDs       : ${audit.matched_count.toLocaleString()}`);
  console.log(`Coverage          : ${audit.coverage_percent}%`);
  console.log(`Missing from cache: ${audit.missing_from_cache_count.toLocaleString()}`);
  console.log(`Extra in cache    : ${audit.extra_in_cache_count.toLocaleString()}`);
  console.log(`Duplicate cached  : ${audit.duplicate_cached_ids_count.toLocaleString()}`);
  console.log(`Saved audit       : ${config.auditPath}`);

  return audit;
}

await fs.mkdir(DATA_DIR, { recursive: true });

const requestedDataset = process.env.DATASET || "all";
const datasetKeys = requestedDataset === "all"
  ? Object.keys(DATASETS)
  : [requestedDataset];

const audits = [];

for (const key of datasetKeys) {
  const config = DATASETS[key];

  if (!config) {
    throw new Error(`Unknown DATASET: ${key}. Use all, companies, or networks.`);
  }

  audits.push(await auditDataset(key, config));
}

const summary = {
  audited_at: new Date().toISOString(),
  datasets: audits.map(audit => ({
    dataset: audit.dataset,
    label: audit.label,
    export_date: audit.export_date,
    export_total_ids: audit.export_total_ids,
    cached_total_ids: audit.cached_total_ids,
    cached_unique_ids: audit.cached_unique_ids,
    matched_count: audit.matched_count,
    coverage_percent: audit.coverage_percent,
    missing_from_cache_count: audit.missing_from_cache_count,
    extra_in_cache_count: audit.extra_in_cache_count,
    duplicate_cached_ids_count: audit.duplicate_cached_ids_count
  }))
};

await fs.writeFile(`${DATA_DIR}/id-audit-summary.json`, JSON.stringify(summary, null, 2));

console.log("\n===== AUDIT SUMMARY =====");
for (const audit of summary.datasets) {
  console.log(
    `${audit.label}: ${audit.coverage_percent}% coverage ` +
    `(${audit.matched_count.toLocaleString()}/${audit.export_total_ids.toLocaleString()})`
  );
}
console.log(`Saved summary: ${DATA_DIR}/id-audit-summary.json`);
console.log("=========================\n");
