# Builder Franchise hierarchy creation

Status: implementation and owner review complete, merged through issue [#122](https://github.com/davecollections/tmdb-id-lookup/issues/122) / PR [#123](https://github.com/davecollections/tmdb-id-lookup/pull/123); no current-client Franchise hierarchy result is claimed

This document owns the Franchise-specific contract layered on the shared rules in [`BUILDER_HIERARCHY_CREATION.md`](./BUILDER_HIERARCHY_CREATION.md). It does not change selected-folder **Add Source → Movie franchise**, V1, Worker routes, or production deployment.

## Scope and hierarchy

Franchises is registered in both contextual launchers:

- **New Collection → Franchises** creates one `Franchises` Collection by default.
- **New Folder → Franchises** captures the selected parent Collection and leaves that parent byte-identical.

Every selected TMDB collection creates one ordinary Folder with one ordinary native source. The ordered selection is the generated Folder order. There is no arbitrary selection cap. At 50 selections the UI shows a nonblocking scale notice, and the collapsed selected list remains removable.

The visible flow is intentionally **Select → Review & Appearance → Create**. There is no Configure stage because the source recipe has no supported per-franchise option.

## Identity, naming, and source contract

TMDB Collection ID is the authoritative identity. Folder and source titles use the canonical trimmed TMDB Collection name unchanged. Meaningful wording such as leading `The` and suffixes including `Collection`, `Saga`, and `Trilogy` is preserved. V1's historical leading-article and trailing-` Collection` cleanup is not reused.

Each Folder contains exactly one source with the existing Add Source constructor's contract:

```json
{
  "category": "native-tmdb",
  "editable": {
    "title": "Canonical TMDB collection name",
    "sortBy": "original",
    "tmdbId": 1241,
    "filters": {},
    "provider": "tmdb",
    "mediaType": "MOVIE",
    "tmdbSourceType": "COLLECTION"
  }
}
```

`sortBy: "original"` means TMDB-provided collection order. Native TMDB sources do not create `catalogSources` projections.

## Artwork and presentation

Franchise folder tiles are fixed to **Poster**. Each generated Folder maps the selected TMDB Collection's poster to `coverImageUrl` through the existing bounded `w500` image origin. A backdrop is not substituted into the Poster cover when the poster is absent; the Folder instead uses empty `coverImageUrl` plus the visible `🎬` fallback. Retained V1 franchise export evidence leaves `heroBackdropUrl` empty, so issue #122 does not invent or populate a separate Hero/background mapping from the Collection backdrop.

The creator exposes no Folder-shape or per-item artwork controls. It retains only folder-title visibility and concise guidance that individual artwork can be customised later through ordinary **Edit Folder**. Folder titles default to **Hide on home screen only**.

New Collection Review reuses the shared collection name, Collection title visibility, folder title visibility, Tabs/Rows, Tabs-specific Show All tab, and Pin controls. Rows hides Show All while plans retain `showAllTab: true` for later compatibility. New Folder Review exposes captured parent presentation as read-only evidence and patches no parent field.

## Search, selection, and preview

The hierarchy flow reuses the existing TMDB collection provider instance, request/cache architecture, exact ID/URL parser, and Worker routes. It does not create a second client. Search is not automatically focused on entry, so choosing Franchises does not summon a mobile keyboard.

Every result is a full selectable card with a focusable native checkbox and circular empty/selected-tick indicator. Selection order is stable; removal and reselection append deterministically. A compact count and collapsed **View selected franchises** list replace a large chip wall.

Selected franchises may open a body-portalled poster preview using already-loaded collection details. Every Review row also keeps its compact **Preview titles** action visible while collapsed; expanding the row is reserved for source metadata and placement or elsewhere context. The Movies-only preview adds no pointless media tab. Its ready grid contains only usable poster images: title, year, and other individual result metadata are absent, posterless entries are omitted, and zero usable posters produce one modal-level empty state. The shared nested-modal layer remains above the active creation modal, bounded to 10 posters above 520px and 5 at 520px and below, supports Close/Escape, focus containment, and exact trigger restoration, and does not paginate, move the outer scroll owner, or mutate source configuration. The removable selected list keeps Preview and remove actions compact, touch-safe, and non-overflowing beside long canonical names.

## Duplicate and apply rules

Duplicate identity is exact `tmdb|COLLECTION|<id>|MOVIE`, independent of titles and artwork.

- In New Folder, a matching Collection ID anywhere in the destination Collection is **Already in this collection** and is omitted from creation.
- A match in another Collection is informational **Exists elsewhere** and remains addable.
- In New Collection, existing matches elsewhere are informational and do not block the requested new hierarchy.

Review rows remain visually neutral and use concise status text. Elsewhere locations use the shared bounded notice only when expanded.

The flow builds an ephemeral framework-independent plan, revalidates exact placement immediately before apply, and delegates one atomic `createCollectionsWithFoldersAndSources` or `createFoldersWithSources` controller operation. No recipe or family-only node is persisted. A late failure leaves the project and revision unchanged.

## Evidence boundary

Issue #122 repository tests cover registry/scopes, 100+ ordered selection, canonical naming, source shape, fixed Poster artwork and emoji fallback, both title outcomes, destination/elsewhere identity, one-revision atomic apply, stale rejection, shared Tabs/Rows compatibility, UI structure, nested preview behavior from Select and Review, shared provider routing, compact selected actions, and all required responsive widths. Owner desktop and physical mobile review are complete and accepted. No new Nuvio client import/export claim is made; the source contract continues to rely on issue #65's current Desktop evidence.
