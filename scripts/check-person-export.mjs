import zlib from "zlib";
import { promisify } from "util";

const gunzip = promisify(zlib.gunzip);

function formatDate(date) {
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const yyyy = date.getUTCFullYear();

  return `${mm}_${dd}_${yyyy}`;
}

async function main() {
  for (let i = 0; i < 7; i++) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - i);

    const formatted = formatDate(date);

    const url =
      `https://files.tmdb.org/p/exports/person_ids_${formatted}.json.gz`;

    console.log(`Trying ${url}`);

    const res = await fetch(url);

    if (!res.ok) {
      console.log(`Not available`);
      continue;
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    const unzipped = await gunzip(buffer);

    const lines = unzipped
      .toString("utf8")
      .trim()
      .split("\n");

    console.log("");
    console.log(`TMDB Person IDs`);
    console.log(`Export Date: ${formatted}`);
    console.log(`Total IDs: ${lines.length.toLocaleString()}`);

    return;
  }

  console.log("No export found");
}

main();