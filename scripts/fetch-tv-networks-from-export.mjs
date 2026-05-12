import fs from "fs/promises";
import zlib from "zlib";
import { promisify } from "util";

const gunzip = promisify(zlib.gunzip);

const DATA_DIR = "data";
const MIN_JSON_PATH = `${DATA_DIR}/tv-networks.min.json`;
const CSV_PATH = `${DATA_DIR}/tv-networks.csv`;
const META_PATH = `${DATA_DIR}/tv-network-scan-meta.json`;
const EXPORT_PATH = `${DATA_DIR}/tv-network-export.json`;

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

    console.log(
      `Loaded ${networks.length.toLocaleString()} TV network IDs from export ${candidate.date}`
    );

    return {
      export_date: candidate.date,
      networks
    };
  }

  throw new Error("Could not find a recent TMDB TV network export.");
}

function csvEscape(value) {
  const text = String(value ?? "");

  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

function toCsv(networks) {
  const headers = [
    "id",
    "name",
    "tmdb_url"
  ];

  const rows = networks.map(network =>
    headers.map(header => csvEscape(network[header])).join(",")
  );

  return [headers.join(","), ...rows].join("\n") + "\n";
}

function normaliseNetwork(network) {
  return {
    id: Number(network.id),
    name: network.name || "",
    tmdb_url: `https://www.themoviedb.org/network/${network.id}`
  };
}

function compactNetwork(network) {
  return {
    i: network.id,
    n: network.name
  };
}

function toMinJson(networks) {
  return JSON.stringify(networks.map(compactNetwork));
}

await fs.mkdir(DATA_DIR, { recursive: true });

const exportData = await fetchExport();

const networks = exportData.networks
  .map(normaliseNetwork)
  .filter(network => network.id && network.name)
  .sort((a, b) => Number(a.id) - Number(b.id));

const ids = networks.map(network => network.id);
const lowestId = ids.length ? Math.min(...ids) : null;
const highestId = ids.length ? Math.max(...ids) : null;

const stats = {
  mode: "tmdb_daily_export",
  export_date: exportData.export_date,
  export_total_ids: exportData.networks.length,
  valid_networks: networks.length,
  lowest_id: lowestId,
  highest_id: highestId,
  updated_at: new Date().toISOString()
};

await fs.writeFile(MIN_JSON_PATH, toMinJson(networks));
await fs.writeFile(CSV_PATH, toCsv(networks));
await fs.writeFile(EXPORT_PATH, JSON.stringify(stats, null, 2));
await fs.writeFile(META_PATH, JSON.stringify({ last_scan: stats }, null, 2));

console.log("\n===== TV NETWORK EXPORT STATS =====");
console.log(`Valid Networks : ${networks.length.toLocaleString()}`);
console.log(`Lowest ID      : ${lowestId}`);
console.log(`Highest ID     : ${highestId}`);
console.log(`Saved JSON     : ${MIN_JSON_PATH}`);
console.log(`Saved CSV      : ${CSV_PATH}`);
console.log(`Saved Meta     : ${META_PATH}`);
console.log("===================================\n");
