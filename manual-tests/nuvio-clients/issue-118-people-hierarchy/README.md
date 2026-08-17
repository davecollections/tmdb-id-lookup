# Issue #118 People hierarchy owner-review evidence

Status: deterministic Builder output prepared for owner review. It has not been sent to or imported into Nuvio.

The two JSON files use the same Tom Hanks (`TMDB 31`) / Movie Credits (`PERSON`, `MOVIE`) hierarchy so the artwork migration is isolated. Source identity, ordering, collection presentation, folder title, and native `catalogSources: []` are unchanged.

Relevant differences:

| Field | Before | After |
| --- | --- | --- |
| `coverImageUrl` | legacy `nuvio-assets/.../collection_covers/people/poster/31.webp?v=...` | manifest `nuvio-people-assets/.../people/31/poster.webp` |
| `heroBackdropUrl` | absent | manifest `assets.hero.url` |
| `titleLogoUrl` | absent | manifest `assets.titleLogo.url` |
| `focusGifUrl` | absent | manifest `assets.focusPoster.url` |
| `focusGifEnabled` | absent | `true`, because both focus assets exist |

The current Builder uses the static focus counterpart in the existing `focusGifUrl` field. Read-only repository evidence shows that this persisted field is an optional generic string: known-field recognition, import, overlay, and serialization do not enforce a `.gif` extension or image MIME type, and the deterministic issue output preserves the `.webp` URL. For Landscape folders the resolver uses `assets.focusLandscape.url`. If either focus member is absent, both focus fields remain absent and base artwork behavior is retained. This is schema/round-trip evidence only; issue #118 has not rendered the static WebP through a current Nuvio client, so no client compatibility claim is made here.

The after file was generated through the issue #118 hierarchy planner/controller/serializer using the checked-in deterministic schema-v2 fixture. The canonical live URLs have stable paths; per-asset SHA-256 values are retained transiently by artwork resolution for comparison/invalidation evidence and are not new Nuvio schema fields.

No Company or Network field or URL is represented or changed here. Legacy assets were not deleted.

## Owner Builder re-review

1. Open New Collection → People, select several people, and confirm Search uses one compact count plus `View selected people` with no chip wall or repeated order copy. Confirm each result keeps a clickable card and focusable native checkbox while showing an empty circular ring or a filled tick.
2. Scroll until a People result is partly clipped at the bottom. Select its visible portion with the pointer, then repeat by tabbing to a clipped result and using Space. Confirm the fixed dialog and sticky Configure action do not move, the document does not scroll, the native checkbox toggles once, and only the inner result viewport moves when focus needs it. Open/close `View selected people`, remove a person, and reselect them; confirm the dialog remains stable and the person returns at the end of selection order.
3. On Configure, confirm only Automatic and Same for all are visible; change one person's direct source pills, then change the shared set and confirm the individual override is retained without a Custom transition.
4. Open Preview titles and verify the poster-only pop-out contains focus, closes with Escape or Close, restores the exact trigger, and shows at most 10 desktop or 5 mobile posters.
5. On Review & Appearance, confirm **Title options** contains Collection title visibility and all three canonical Person-folder title outcomes, immediately followed by directly visible **Layout** controls. Change folder titles from the default **Hide on home screen only**, switch Poster/Landscape, go Back and forward, and confirm both selections persist.
6. Confirm there is no per-person artwork dropdown, URL input, focus override, or reset action. Confirm the guidance says each person's Hero, Title Logo, and Focus artwork uses the canonical People defaults and can be customised later by editing that person's folder.
7. Repeat from New Folder and confirm the destination Collection remains inherited/read-only with `parent unchanged`; generated-folder title visibility and shape remain configurable, with individual artwork customisation deferred to ordinary Folder editing.

This is Builder owner-review guidance only. Do not send the generated JSON to Nuvio as part of this repository review; the static WebP focus compatibility remains unverified in a current Nuvio client.
