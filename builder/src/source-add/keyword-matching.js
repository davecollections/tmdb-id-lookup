export const normalizeKeywordText = (text) => String(text ?? "").normalize("NFKC").toLowerCase().trim().replace(/[-\u2010\u2011]/g, " ").replace(/\s+/g, " ");
const groups = [
 ["shark", "sharks"], ["alien", "aliens"], ["werewolf", "werewolves"], ["talking animal", "talking animals"],
 ["ai", "artificial intelligence", "artificial intelligence (a.i.)"], ["courtroom dramas", "courtroom drama"],
 ["dumb blondes", "dumb blonde"], ["serial killers", "serial killer"], ["heists", "heist"], ["superheroes", "superhero"], ["zombies", "zombie"], ["vampires", "vampire"],
];
const related = {
 "legal proceedings": ["courtroom", "trial", "legal drama"], "time travelling": ["time travel"],
 "based on a true story": ["based on true story"], "end of the world": ["apocalypse", "post-apocalyptic future"],
 "the end of the world": ["apocalypse", "post-apocalyptic future"],
};
export function oneEditApart(a, b) {
 if (Math.abs(a.length - b.length) > 1) return false;
 if (a.length === b.length) {
  const p = []; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) p.push(i);
  return p.length === 1 || (p.length === 2 && p[1] === p[0] + 1 && a[p[0]] === b[p[1]] && a[p[1]] === b[p[0]]);
 }
 let i = 0, j = 0, n = 0;
 while (i < a.length && j < b.length) {
  if (a[i] === b[j]) { i++; j++; }
  else { if (++n > 1) return false; if (a.length > b.length) i++; else j++; }
 }
 return n + (i < a.length || j < b.length ? 1 : 0) === 1;
}
export function createKeywordIndex(rows) {
 const exact = new Map(), lengths = new Map(), byId = new Map();
 const indexed = rows.map(([id, name]) => ({ id, name, key: normalizeKeywordText(name) }));
 for (const row of indexed) {
  if (!exact.has(row.key)) exact.set(row.key, []);
  if (!lengths.has(row.key.length)) lengths.set(row.key.length, []);
  exact.get(row.key).push(row); lengths.get(row.key.length).push(row); byId.set(row.id, row);
 }
 return { exact, lengths, byId, indexed };
}
function aliasNames(key) { return groups.find((g) => g.includes(key)) ?? related[key] ?? []; }
export function searchKeywordIndex(index, text, { negative = false, limit = 12 } = {}) {
 const key = normalizeKeywordText(text);
 if (!key) return { status: "unresolved", candidates: [] };
 const exact = index.exact.get(key) ?? [];
 let candidates = exact.map((r) => ({ id: r.id, name: r.name, kind: "exact" }));
 if (!candidates.length && !negative) {
  const near = key.length >= 5 ? [-1, 0, 1].flatMap((d) => index.lengths.get(key.length + d) ?? []).filter((r) => r.key.split(" ").length === key.split(" ").length && oneEditApart(key, r.key)).sort((a, b) => a.id - b.id).slice(0, limit) : [];
  candidates = near.map((r) => ({ id: r.id, name: r.name, kind: "typo suggestion" }));
  if (!candidates.length) candidates = index.indexed.filter((r) => (" " + r.key + " ").includes(" " + key + " ")).slice(0, limit).map((r) => ({ id: r.id, name: r.name, kind: "phrase suggestion" }));
 }
 const names = [...aliasNames(key), ...candidates.filter((r) => r.kind === "typo suggestion").flatMap((r) => aliasNames(normalizeKeywordText(r.name)))];
 for (const name of names) for (const row of index.exact.get(name) ?? []) if (!candidates.some((c) => c.id === row.id)) candidates.push({ id: row.id, name: row.name, kind: "related wording" });
 return { status: candidates.length === 1 && candidates[0].kind === "exact" && key !== "christmas horror" ? "exact" : candidates.length ? "choice" : "unresolved", candidates: candidates.slice(0, limit) };
}

export function autocompleteKeywordIndex(index, text, { negative = false, limit = 12 } = {}) {
 const key = normalizeKeywordText(text);
 if (key.length < 2) return [];
 const exact = index.exact.get(key) ?? [];
 const prefixes = [], phrases = [];
 for (const row of index.indexed) {
  if (row.key === key) continue;
  if (row.key.startsWith(key)) { if (prefixes.length < limit) prefixes.push(row); }
  else if (row.key.includes(key) && phrases.length < limit) phrases.push(row);
 }
 const rows = [...exact, ...prefixes, ...phrases].slice(0, limit).map(({ id, name }) => ({ id, name, kind: "name" }));
 // Suggestions are explicit positive choices. Exclusions never use fuzzy matching.
 return rows.length ? rows : negative ? [] : searchKeywordIndex(index, text, { limit }).candidates;
}
