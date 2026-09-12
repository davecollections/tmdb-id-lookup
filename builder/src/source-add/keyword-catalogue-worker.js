import { createKeywordCatalogueLoader } from "./keyword-catalogue.js";
import { createKeywordIndex, searchKeywordIndex, autocompleteKeywordIndex } from "./keyword-matching.js";
const loader = createKeywordCatalogueLoader();
let index = null, hash = null;
self.onmessage = async ({ data: { id, action, baseUrl, force, text, negative, ids } }) => {
 try {
  let result;
  if (action === "load") {
   const loaded = await loader.load(baseUrl, { force });
   if (hash !== loaded.sha256) { index = createKeywordIndex(loaded.catalogue.keywords); hash = loaded.sha256; }
   result = { sourceDate: loaded.sourceDate, count: index.byId.size, stale: loaded.stale, warning: loaded.warning };
  } else {
   if (!index) throw new Error("Keyword catalogue has not loaded.");
   result = action === "resolve" ? ids.map((key) => { const row = index.byId.get(key); return row ? { id: row.id, name: row.name } : { id: key, name: null }; }) : action === "autocomplete" ? autocompleteKeywordIndex(index, text, { negative }) : searchKeywordIndex(index, text, { negative });
  }
  self.postMessage({ id, ok: true, result });
 } catch (error) { self.postMessage({ id, ok: false, error: error.message }); }
};
