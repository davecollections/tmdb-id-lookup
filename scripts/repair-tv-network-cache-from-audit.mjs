import fs from "fs/promises";

const TOKEN = process.env.TMDB_BEARER_TOKEN;
const REQUEST_DELAY_MS = Number(process.env.REQUEST_DELAY_MS || 120);
const MAX_REPAIR_IDS = process.env.MAX_REPAIR_IDS ? Number(process.env.MAX_REPAIR_IDS) : null;

const DATA_DIR = "data";
const MIN_JSON_PATH = `${DATA_DIR}/tv-networks.min.json`;
const CSV_PATH = `${DATA_DIR}/tv-networks.csv`;
const AUDIT_PATH = `${DATA_DIR}/tv-network-id-audit.json`;
const REPAIR_META_PATH = `${DATA_DIR}/tv-network-cache-repair-meta.json`;

if (!TOKEN) throw new Error("Missing TMDB_BEARER_TOKEN");

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await fs.readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

async function tmdbFetch(url, options = {}) {
  for (let attempt = 1; attempt <= 5; attempt++) {
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
        console.log(`Rate limited. Waiting ${retryAfter}s before retry ${attempt}/5...`);
        await sleep(retryAfter * 1000);
        continue;
      }

      if (res.status >= 500) {
        const waitMs = attempt * 2000;
        console.log(`TMDB server error ${res.status}. Waiting ${waitMs / 1000}s before retry ${attempt}/5...`);
        await sleep(waitMs);
        continue;
      }

      return res;
    } catch (error) {
      if (error.message.includes("auth/permission")) throw error;
      const waitMs = attempt * 2000;
      console.log(`Network/request error: ${error.message}. Waiting ${waitMs / 1000}s before retry ${attempt}/5...`);
      await sleep(waitMs);
    }
  }

  throw new Error(`TMDB request failed after 5 attempts: ${url}`);
}

async function fetchNetworkDetails(id) {
  const res = await tmdbFetch(`https://api.themoviedb.org/3/network/${id}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Network details failed for ${id}: HTTP ${res.status}`);
  return res.json();
}

async function fetchTvCount(id) {
  const res = await tmdbFetch(`https://api.themoviedb.org/3/discover/tv?with_networks=${id}`);
  if (!res.ok) throw new Error(`TV count failed for ${id}: HTTP ${res.status}`);
  const data = await res.json();
  return data.total_results || 0;
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

function compactNetwork(network) {
  const compact = { i: network.id, n: network.name };
  if (network.origin_country) compact.c = network.origin_country;
  if (network.headquarters) compact.h = network.headquarters;
  if (network.logo_path) compact.l = network.logo_path;
  if (network.titles_count) compact.t = network.titles_count;
  return compact;
}

function toMinJson(networks) {
  return JSON.stringify(networks.map(compactNetwork));
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(networks) {
  const headers = ["id", "name", "titles_count", "headquarters", "origin_country", "homepage", "tmdb_url"];
  const rows = networks.map(network => headers.map(header => csvEscape(network[header])).join(","));
  return [headers.join(","), ...rows].join("\n") + "\n";
}

await fs.mkdir(DATA_DIR, { recursive: true });

const audit = await readJson(AUDIT_PATH, null);
if (!audit) throw new Error(`Missing audit file: ${AUDIT_PATH}. Run the audit workflow first.`);

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

console.log("\n===== TV NETWORK CACHE REPAIR =====");
console.log(`Missing IDs to add : ${missingIds.length ? missingIds.join(", ") : "none"}`);
console.log(`Extra IDs to remove: ${extraIds.length ? extraIds.join(", ") : "none"}`);

if (missingIds.length === 0 && extraIds.length === 0) {
  repairStats.skipped = true;
  repairStats.reason = "nothing_to_repair";
  repairStats.finished_at = new Date().toISOString();
  await fs.writeFile(REPAIR_META_PATH, JSON.stringify({ last_repair: repairStats }, null, 2));
  console.log("Nothing to repair. Skipping TV network cache update.");
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
const networkMap = new Map();

for (const network of existingCompact) {
  if (network?.i) networkMap.set(Number(network.i), expandCompactNetwork(network));
}

for (const id of extraIds) {
  if (networkMap.delete(id)) {
    repairStats.removed.push(id);
    console.log(`${id}: removed stale cached network`);
  }
}

for (const id of missingIds) {
  try {
    const details = await fetchNetworkDetails(id);
    if (!details) {
      repairStats.not_found.push(id);
      console.log(`${id}: not found in TMDB network details`);
      await sleep(REQUEST_DELAY_MS);
      continue;
    }
    const tvCount = await fetchTvCount(id);
    const network = normaliseNetwork(details, tvCount);
    networkMap.set(network.id, network);
    repairStats.added.push(network.id);
    console.log(`${id}: added ${network.name} (${tvCount.toLocaleString()} TV titles)`);
    await sleep(REQUEST_DELAY_MS);
  } catch (error) {
    repairStats.failed.push({ id, error: error.message });
    console.log(`${id}: error ${error.message}`);
  }
}

const networks = Array.from(networkMap.values()).sort((a, b) => Number(a.id) - Number(b.id));
await fs.writeFile(MIN_JSON_PATH, toMinJson(networks));
await fs.writeFile(CSV_PATH, toCsv(networks));

repairStats.total_cached = networks.length;
repairStats.finished_at = new Date().toISOString();
await fs.writeFile(REPAIR_META_PATH, JSON.stringify({ last_repair: repairStats }, null, 2));

console.log(`Saved ${networks.length.toLocaleString()} total cached TV networks.`);
console.log(`Added ${repairStats.added.length.toLocaleString()} missing networks.`);
console.log(`Removed ${repairStats.removed.length.toLocaleString()} stale networks.`);
console.log("================================\n");
