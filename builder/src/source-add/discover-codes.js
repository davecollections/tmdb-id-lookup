import { GENRE_LANGUAGE_OPTIONS, GENRE_COUNTRY_OPTIONS } from "./genre-advanced.js";
let pending;
export function loadDiscoverNamedCodes({ fetchImpl = globalThis.fetch, baseUrl = globalThis.document?.baseURI } = {}) {
 if (pending) return pending;
 pending = (async () => {
  const response = await fetchImpl(new URL("./data/discover-codes.json", baseUrl), { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error("Additional language and country names could not load.");
  const value = await response.json();
  if (value.schemaVersion !== 1 || !Array.isArray(value.languages) || !Array.isArray(value.countries)) throw new Error("Named code catalogue is invalid.");
  for (const [key, expression] of [["languages", /^[a-z]{2}$/], ["countries", /^[A-Z]{2}$/]]) {
   if (value[key].length < 100 || new Set(value[key].map((r) => r.code)).size !== value[key].length || value[key].some((r) => !expression.test(r.code) || typeof r.label !== "string" || !r.label.trim())) throw new Error("Named code catalogue contains invalid entries.");
  }
  return { ...value, languages: merge(value.languages, GENRE_LANGUAGE_OPTIONS), countries: merge(value.countries, GENRE_COUNTRY_OPTIONS) };
 })().catch((error) => { pending = null; throw error; });
 return pending;
}
function merge(rows, existing) {
 const byCode = new Map(rows.map((r) => [r.code, r]));
 for (const row of existing) byCode.set(row.code, row);
 return [...byCode.values()].sort((a, b) => a.label.localeCompare(b.label, "en"));
}
