import fs from "fs/promises";
import zlib from "zlib";
import { promisify } from "util";

const gunzip = promisify(zlib.gunzip);

const TOKEN = process.env.TMDB_BEARER_TOKEN;
const REQUEST_DELAY_MS = Number(process.env.REQUEST_DELAY_MS || 120);
const OFFSET = Number(process.env.OFFSET || 0);
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : null;

const DATA_DIR = "data";
const MIN_JSON_PATH = `${DATA_DIR}/tv-networks.min.json`;
const CSV_PATH = `${DATA_DIR}/tv-networks.csv`;
const META_PATH = `${DATA_DIR}/tv-network-scan-meta.json`;
const EXPORT_PATH = `${DATA_DIR}/tv-network-export.json`;

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
        throw new Error(`TMDB auth/permission error HTTP ${res.status}. Check TMDB_BEARER_TOKEN.`);
      }

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("retry-after") || 5);
        console.log(`Rate limited. Waiting ${retryAfter}s before retry ${attempt}/${maxAttempts}...`);
        await sleep(retryAfter * 1000);
        continue;
      }

      if (res.status >= 500) {
        const waitMs = attempt * 2000;
        console.log(`TMDB server error ${res.status}. Waiting ${waitMs / 1000}s before retry ${attempt}/${maxAttempts}...`);
        await sleep(waitMs);
        continue;
      }

      return res;
    } catch (error) {
      if (error.message.includes("auth/permission")) {
        throw error;
      }

      const waitMs = attempt * 2000;
      console.log(`Network/request error: ${error.message}. Waiting ${waitMs / 1000}s before retry ${attempt}/${maxAttempts}...`);
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
      url: `https://files.tmdb.org/p/exports/tv_network_ids_${formattedDate}.json.gz`
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

    const networks = lines
      .filter(Boolean)
      .map(line => JSON.parse(line))
      .sort((a, b) => Number(a.id) - Number(b.id));

    console.log(`Loaded ${networks.length.toLocaleString()} TV network IDs from export ${candidate.date}`);

    return {
      export_date: candidate.date,
      networks
    };
  }

  throw new Error("Could not find a recent TMDB TV network export.");
}

async function fetchNetworkDetails(id) {
  const res = await tmdbFetch(`https://api.themoviedb.org/3/network/${id}`);

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    throw new Error(`Network details failed for ${id}: HTTP ${res.status}`);
  }

  return res.json();
}

async function fetchTvCount(id) {
  const res = await tmdbFetch(`https://api.themoviedb.org/3/discover/tv?with_networks=${id}`);

  if (!res.ok) {
    throw new Error(`TV count failed for ${id}: HTTP ${res.status}`);
  }

  const data = await res.json();
  return data.total_results || 0;
}

function normaliseNetwork(data, tvCount) {
  return {
    id: data.id,
    name: data.name || "",
    headquarters: data.headquarters || "",
    homepage: data.homepage || "",
    logo_path: data.logo_path || "",
    origin_country: data.origin_country || "",
    titles_count: tvCount,
    tmdb_url: `https://www.themoviedb.org/network/${data.id}`
  };
}

function expandCompactNetwork(network) {
  return {
    id: network.i,
    name: network.n || "",
    origin_country: network.c || "",
    headquarters: network.h || "",
    logo_path: network.l || "",
    titles_count: network.t || 0,
    homepage: "",
    tmdb_url: `https://www.themoviedb.org/network/${network.i}`
  };
}

function csvEscape(value) {
  const text = String(value ?? "");

  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

function toCsv(networks) {
  const headers = ["id", "name", "titles_count", "headquarters", "origin_country", "homepage", "tmdb_url"];

  const rows = networks.map(network => headers.map(header => csvEscape(network[header])).join(","));

  return [headers.join(","), ...rows].join("\n") + "\n";
}

function compactNetwork(network) {
  const compact = {
    i: network.id,
    n: network.name
  };

  if (network.origin_country) compact.c = network.origin_country;
  if (network.headquarters) compact.h = network.headquarters;
  if (network.logo_path) compact.l = network.logo_path;
  if (network.titles_count) compact.t = network.titles_count;

  return compact;
}

function toMinJson(networks) {
  return JSON.stringify(networks.map(compactNetwork));
}

await fs.mkdir(DATA_DIR, { recursive: true });

const existingCompact = await readJson(MIN_JSON_PATH, []);
const networkMap = new Map();

for (const network of existingCompact) {
  if (network?.i) {
    const expandedNetwork = expandCompactNetwork(network);
    networkMap.set(Number(expandedNetwork.id), expandedNetwork);
  }
}

const exportData = await fetchExport();
const ids = exportData.networks.map(network => Number(network.id)).filter(Boolean);
const lowestId = ids.length ? Math.min(...ids) : null;
const highestId = ids.length ? Math.max(...ids) : null;
const selectedNetworks = LIMIT ? exportData.networks.slice(OFFSET, OFFSET + LIMIT) : exportData.networks.slice(OFFSET);

const stats = {
  mode: LIMIT ? "tmdb_export_sliced_enrichment" : "tmdb_daily_export_full_enrichment",
  export_date: exportData.export_date,
  export_total_ids: exportData.networks.length,
  offset: OFFSET,
  limit: LIMIT,
  actual_limit: selectedNetworks.length,
  lowest_id: lowestId,
  highest_id: highestId,
  checked: 0,
  found: 0,
  missing: 0,
  started_at: new Date().toISOString()
};

await fs.writeFile(
  EXPORT_PATH,
  JSON.stringify(
    {
      export_date: exportData.export_date,
      total_ids: exportData.networks.length,
      last_offset: OFFSET,
      last_limit: LIMIT,
      lowest_id: lowestId,
      highest_id: highestId,
      updated_at: new Date().toISOString()
    },
    null,
    2
  )
);

console.log(
  `Enriching ${selectedNetworks.length.toLocaleString()} of ${exportData.networks.length.toLocaleString()} TV networks from export ${exportData.export_date} at offset ${OFFSET.toLocaleString()}.`
);

for (const exportNetwork of selectedNetworks) {
  const id = Number(exportNetwork.id);
  stats.checked += 1;

  try {
    const details = await fetchNetworkDetails(id);

    if (!details) {
      stats.missing += 1;
      console.log(`${id}: no network record`);
      await sleep(REQUEST_DELAY_MS);
      continue;
    }

    const tvCount = await fetchTvCount(id);
    const network = normaliseNetwork(details, tvCount);

    networkMap.set(network.id, network);

    stats.found += 1;
    console.log(`${id}: ${network.name} (${tvCount.toLocaleString()} TV titles)`);

    await sleep(REQUEST_DELAY_MS);
  } catch (error) {
    stats.missing += 1;
    console.log(`${id}: error ${error.message}`);
  }
}

const networks = Array
  .from(networkMap.values())
  .sort((a, b) => Number(a.id) - Number(b.id));

await fs.writeFile(MIN_JSON_PATH, toMinJson(networks));
await fs.writeFile(CSV_PATH, toCsv(networks));

stats.total_cached = networks.length;
stats.finished_at = new Date().toISOString();

await fs.writeFile(META_PATH, JSON.stringify({ last_scan: stats }, null, 2));

console.log(`Saved ${networks.length.toLocaleString()} total cached TV networks.`);
