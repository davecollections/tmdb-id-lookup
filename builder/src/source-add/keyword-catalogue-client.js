let sharedClient;
export function keywordCatalogueClient() {
 if (sharedClient) return sharedClient;
 if (typeof Worker === "undefined") return { load: () => Promise.reject(new Error("Keyword search requires a browser.")), search: () => Promise.reject(new Error("Keyword search requires a browser.")) };
 const worker = new Worker(new URL("./keyword-catalogue-worker.js", import.meta.url), { type: "module" });
 const pending = new Map(); let sequence = 0, failed = false;
 worker.onmessage = ({ data }) => { const entry = pending.get(data.id); if (!entry) return; clearTimeout(entry.timer); pending.delete(data.id); if (data.ok) entry.resolve(data.result); else entry.reject(new Error(data.error)); };
 worker.onerror = () => { failed = true; for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error("Keyword search could not start. Close and reopen Discover to retry.")); } pending.clear(); worker.terminate(); sharedClient = null; };
 function request(action, options = {}) {
  if (failed) return Promise.reject(new Error("Keyword search could not start. Close and reopen Discover to retry."));
  return new Promise((resolve, reject) => {
   const id = ++sequence;
   const timer = setTimeout(() => { pending.delete(id); reject(new Error("Keyword search took too long. Retry when your connection is ready.")); }, 55000);
   pending.set(id, { resolve, reject, timer }); worker.postMessage({ id, action, ...options });
  });
 }
 sharedClient = {
  load: (force = false) => request("load", { baseUrl: new URL("./data/discover/", document.baseURI).href, force }),
  search: (text, negative = false) => request("search", { text, negative }),
  autocomplete: (text, negative = false) => request("autocomplete", { text, negative }),
  resolve: (ids) => request("resolve", { ids }),
 };
 return sharedClient;
}
