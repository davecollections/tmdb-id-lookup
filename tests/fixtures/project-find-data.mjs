// Authored local project structure only. No external service is exercised.
export function projectFindData({ collections = 3, folders = 4, sources = 5 } = {}) {
 return Array.from({ length: collections }, (_, c) => ({
  id: "collection-" + c, title: c < 2 ? "Same collection" : "Collection " + c,
  folders: Array.from({ length: folders }, (_, f) => ({
   id: "folder-" + c + "-" + f, title: f < 2 ? "Same folder" : "Folder " + c + "-" + f,
   sources: Array.from({ length: sources }, (_, s) => ({
    provider: "community", title: s < 2 ? "Same source" : "Source " + c + "-" + f + "-" + s,
    localPreservation: { c, f, s },
   })),
  })),
 }));
}
