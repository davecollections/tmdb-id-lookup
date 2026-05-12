import fs from "fs/promises";
import zlib from "zlib";
import { promisify } from "util";

const gunzip = promisify(zlib.gunzip);

const DATA_DIR = "data";
const WATCH_PATH = `${DATA_DIR}/company-export-watch.json`;
const CURRENT_EXPORT_PATH = `${DATA_DIR}/production-company-export.json`;

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

async function readJson(path, fallback) {
  try {
    const raw = await fs.readFile(path, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function fetchLatestExportSummary() {
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
    const lines = unzipped.toString("utf8").trim().split("\n").filter(Boolean);
    const ids = lines.map(line => JSON.parse(line).id).filter(Boolean).map(Number);

    return {
      export_date: candidate.date,
      total_ids: lines.length,
      lowest_id: ids.length ? Math.min(...ids) : null,
      highest_id: ids.length ? Math.max(...ids) : null
    };
  }

  throw new Error("Could not find a recent TMDB production company export.");
}

await fs.mkdir(DATA_DIR, { recursive: true });

const previousWatch = await readJson(WATCH_PATH, null);
const previousExport = await readJson(CURRENT_EXPORT_PATH, null);
const latest = await fetchLatestExportSummary();

const previousTotal = previousWatch?.latest?.total_ids ?? previousExport?.total_ids ?? null;
const previousHighestId = previousWatch?.latest?.highest_id ?? previousExport?.highest_id ?? null;

const totalChanged = previousTotal !== null && latest.total_ids !== Number(previousTotal);
const highestIdChanged = previousHighestId !== null && latest.highest_id !== Number(previousHighestId);

const output = {
  latest,
  previous: {
    total_ids: previousTotal,
    highest_id: previousHighestId
  },
  changed: {
    total_ids: totalChanged,
    highest_id: highestIdChanged,
    any: totalChanged || highestIdChanged
  },
  difference: {
    total_ids: previousTotal === null ? null : latest.total_ids - Number(previousTotal),
    highest_id: previousHighestId === null ? null : latest.highest_id - Number(previousHighestId)
  },
  checked_at: new Date().toISOString()
};

await fs.writeFile(WATCH_PATH, JSON.stringify(output, null, 2));

console.log("\n===== COMPANY EXPORT WATCH =====");
console.log(`Latest export date : ${latest.export_date}`);
console.log(`Latest total IDs   : ${latest.total_ids.toLocaleString()}`);
console.log(`Latest highest ID  : ${latest.highest_id?.toLocaleString() ?? "n/a"}`);
console.log(`Previous total IDs : ${previousTotal?.toLocaleString?.() ?? previousTotal ?? "n/a"}`);
console.log(`Previous highest ID: ${previousHighestId?.toLocaleString?.() ?? previousHighestId ?? "n/a"}`);
console.log(`Changed            : ${output.changed.any ? "yes" : "no"}`);
console.log("================================\n");
