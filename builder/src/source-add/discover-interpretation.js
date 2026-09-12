import { normalizeKeywordText } from "./keyword-matching.js";
import { GENRE_CONCEPTS } from "./genre-catalogue.js";
import { setDiscoverSelection, discoverMediaTypes, discoverExpressionIds } from "./advanced-discover.js";
export async function interpretDiscoverDescription(draft, input, search) {
 const original = input.trim();
 const unchanged = (reason) => ({ ...draft, topic: original, unresolved: [...draft.unresolved.filter((c) => c.text !== original), { text: original, reason, candidates: [] }] });
 let rest = normalizeKeywordText(original).replace(/[?.!]+$/, "");
 if (!rest) return draft;
 if (/[()]/.test(rest) || (/\band\b/.test(rest) && /\bor\b/.test(rest))) return unchanged("Grouped or mixed AND/OR wording needs your choice of filters.");
 if (/\b(?:not|except|no|but)\b/.test(rest.replace(/\bbut not\b/g, ""))) return unchanged("This exclusion wording needs an explicit filter.");
 if (/\b(?:with|under|rated|votes|in french|feel good|clever)\b/.test(rest)) return unchanged("This wording is not understood. Choose its filters directly, then remove this wording.");
 let mediaMode = draft.mediaMode, foundMovie = false, foundTv = false;
 rest = rest.replace(/\b(?:tv shows|shows|series)\b/g, () => { foundTv = true; return ""; }).replace(/\b(?:movies|films)\b/g, () => { foundMovie = true; return ""; });
 if (foundMovie || foundTv) mediaMode = foundMovie && foundTv ? "both" : foundMovie ? "movies" : "series";
 let filters = { ...draft.filters };
 rest = rest.replace(/\b(?:from|between)\s+(\d{4})\s+(?:to|and)\s+(\d{4})\b/g, (_, a, b) => { filters.releaseDateGte = a + "-01-01"; filters.releaseDateLte = b + "-12-31"; return ""; });
 rest = rest.replace(/\bafter (\d{4})\b/g, (_, a) => { filters.releaseDateGte = (+a + 1) + "-01-01"; return ""; });
 rest = rest.replace(/\bbefore (\d{4})\b/g, (_, a) => { filters.releaseDateLte = (+a - 1) + "-12-31"; return ""; });
 rest = rest.replace(/\bin (\d{4})\b/g, (_, a) => { filters.year = a; return ""; });
 rest = rest.replace(/\b(19\d0|20\d0)s\b/g, (_, a) => { filters.releaseDateGte = a + "-01-01"; filters.releaseDateLte = (+a + 9) + "-12-31"; return ""; });
 if (filters.releaseDateGte && filters.releaseDateLte && filters.releaseDateGte > filters.releaseDateLte) return unchanged("The date range is reversed.");
 rest = rest.trim().replace(/\s+/g, " ").replace(/^(?:find|show me)\s+/, "").replace(/^and\s+/, "").replace(/^about\s+/, "");
 let next = { ...draft, topic: original, mediaMode, filters, unresolved: [...draft.unresolved] };
 const compatibleOperator = (field, operator) => field.startsWith("without") || !discoverExpressionIds(draft.filters[field]).length || (draft.filters[field].includes("|") ? "|" : ",") === operator;
 const conflict = () => unchanged("This wording would change the existing All/Any rule. Choose the intended filters and rule directly.");
 const parts = rest.split(/\s+(?:without|excluding|but not)\s+/);
 for (let n = 0; n < parts.length; n++) {
  const phrase = parts[n].trim(); if (!phrase) continue;
  const whole = await search(phrase, n > 0);
  const clauses = whole.candidates.some((c) => normalizeKeywordText(c.name) === phrase) ? [phrase] : phrase.split(/\s+(?:and|or)\s+/);
  const operator = n === 0 && /\bor\b/.test(phrase) ? "|" : ",";
  for (const text of clauses) {
   const genre = GENRE_CONCEPTS.find((g) => normalizeKeywordText(g.name) === text);
   if (genre) {
    const ids = discoverMediaTypes(mediaMode).map((m) => m === "TV" ? genre.tvId : genre.movieId);
    if (ids.some((id) => id === null) || new Set(ids).size > 1) { next.unresolved.push({ text, reason: "This genre does not apply to both selected media types.", candidates: [] }); continue; }
    if (!compatibleOperator(n ? "withoutGenres" : "withGenres", operator)) return conflict();
    next = setDiscoverSelection(next, n ? "withoutGenres" : "withGenres", { id: ids[0], name: genre.name }, { operator });
    continue;
   }
   const result = clauses.length === 1 ? whole : await search(text, n > 0);
   if (result.status === "exact") {
    if (!compatibleOperator(n ? "withoutKeywords" : "withKeywords", operator)) return conflict();
    next = setDiscoverSelection(next, n ? "withoutKeywords" : "withKeywords", result.candidates[0], { operator });
   }
   else next.unresolved.push({ text, field: n ? "withoutKeywords" : "withKeywords", operator, reason: result.candidates.length ? "Choose the intended topic. Related wording is not an equivalent meaning." : "No understood topic. Keep this wording until you choose filters or remove it.", candidates: result.candidates });
  }
 }
 next.unresolved = next.unresolved.filter((clause, index, all) => all.findIndex((c) => c.text === clause.text && c.field === clause.field) === index);
 return next;
}
