import fs from "fs/promises";

const TOKEN = process.env.TMDB_BEARER_TOKEN;
const START_ID = Number(process.env.START_ID || 1);
const END_ID = Number(process.env.END_ID || 500);

if (!TOKEN) {
  throw new Error("Missing TMDB_BEARER_TOKEN");
}

const results = [];

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

for (let id = START_ID; id <= END_ID; id++) {
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

      results.push({
        id: data.id,
        name: data.name,
        headquarters: data.headquarters || "",
        homepage: data.homepage || "",
        logo_path: data.logo_path || "",
        tmdb_url: `https://www.themoviedb.org/company/${data.id}`
      });

      console.log(`${id}: ${data.name}`);
    } else {
      console.log(`${id}: not found`);
    }

    await sleep(120);
  } catch (err) {
    console.error(`${id}: error`, err.message);
  }
}

await fs.mkdir("data", { recursive: true });
await fs.writeFile("data/companies.json", JSON.stringify(results, null, 2));

console.log(`Saved ${results.length} companies.`);
