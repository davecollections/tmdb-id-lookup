import fs from "fs/promises";

const TOKEN = process.env.TMDB_BEARER_TOKEN;
const START_ID = Number(process.env.START_ID || 1);
const END_ID = Number(process.env.END_ID || 500);

const DATA_DIR = "data";
const JSON_PATH = `${DATA_DIR}/companies.json`;
const CSV_PATH = `${DATA_DIR}/companies.csv`;
const META_PATH = `${DATA_DIR}/scan-meta.json`;

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

await fs.mkdir(DATA_DIR, { recursive: true });

const existing = await readJson(JSON_PATH, []);
const companyMap = new Map();

for (const company of existing) {
  companyMap.set(company.id, company);
}

const stats = {
  start_id: START_ID,
  end_id: END_ID,
  checked: 0,
  found: 0,
  missing: 0,
  started_at: new Date().toISOString()
};

for (let id = START_ID; id <= END_ID; id++) {
  stats.checked++;

  const url = `https://api.themoviedb.org/3/company/${id}`;

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        accept: "application/json"
      }
    });

    if (res.status === 200) {
      const data = await res.json();
    let titlesCount = 0;
try {
  const moviesRes = await fetch(
    `https://api.themoviedb.org/3/discover/movie?with_companies=${id}`,
    {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        accept: "application/json"
      }
    }
  );

  if (moviesRes.status === 200) {
    const moviesData = await moviesRes.json();
    titlesCount = moviesData.total_results || 0;
  }
} catch (err) {
  console.log(`${id}: title count failed`);
}

      companyMap.set(data.id, {
        id: data.id,
        name: data.name || "",
        description: data.description || "",
        headquarters: data.headquarters || "",
        homepage: data.homepage || "",
        logo_path: data.logo_path || "",
        origin_country: data.origin_country || "",
        parent_company: data.parent_company?.name || "",
        titles_count: titlesCount,
        tmdb_url: `https://www.themoviedb.org/company/${data.id}`,
        updated_at: new Date().toISOString()
      });

      stats.found++;

      console.log(`${id}: ${data.name}`);
    } else {
      stats.missing++;
      console.log(`${id}: not found`);
    }

    await sleep(120);
  } catch (err) {
    console.error(`${id}: error`, err.message);
  }
}

const companies = Array
  .from(companyMap.values())
  .sort((a, b) => a.id - b.id);

await fs.writeFile(
  JSON_PATH,
  JSON.stringify(companies, null, 2)
);

const csvHeaders = [
  "id",
  "name",
  "titles_count",
  "headquarters",
  "origin_country",
  "homepage",
  "tmdb_url"
];

const csvRows = companies.map(company =>
  csvHeaders.map(h => `"${String(company[h] || "").replaceAll('"', '""')}"`).join(",")
);

await fs.writeFile(
  CSV_PATH,
  [csvHeaders.join(","), ...csvRows].join("\n")
);

stats.total_cached = companies.length;
stats.finished_at = new Date().toISOString();

await fs.writeFile(
  META_PATH,
  JSON.stringify(
    {
      last_scan: stats
    },
    null,
    2
  )
);

console.log(`Saved ${companies.length} total companies.`);
