# TMDB Lists

Status: complete through issue [#170](https://github.com/davecollections/tmdb-id-lookup/issues/170) / merged [PR #171](https://github.com/davecollections/tmdb-id-lookup/pull/171) at `3e1ceace849d137e17ddfedb8637bc147f511285`; the reviewed Worker bytes were manually deployed, bounded live production-path and current-Nuvio gates passed, owner review completed, and Pages publication succeeded

Last reviewed: 2026-09-06

Issue [#196](https://github.com/davecollections/tmdb-id-lookup/issues/196), in local owner review, treats an imported List filters object containing only null placeholders as empty for Source Edit eligibility. The List ID, `LIST`/`MOVIE`/`original` requirements remain fixed. Any non-null filter value, including an unknown preserved filter, stays outside the editor contract; non-object filters remain invalid. Import, opening/Cancel, no-op and title-only Save preserve those placeholders and unknown top-level metadata. Creation still emits `{}` filters and request/output behavior is unchanged. This List case is synthetic regression evidence; the supplied desktop exports demonstrate Genre/Year Sources.

## Product contract

**TMDB Lists** is available from selected Folder → Add Source and from the guided New Collection/New Folder launcher. It accepts one public TMDB list per line as either a canonical positive signed-32-bit decimal ID or an exact HTTPS `themoviedb.org/list/<id>` URL with an optional safe slug. Query and fragment text are ignored only after scheme, exact host, credentials, port, raw path, and ID validation. Search is not part of this family.

The first version exposes neither Last Updated metadata nor username/account search. It does not call v4 account-list enumeration or infer dates from response headers, ETags, list IDs, website content, or other indirect evidence.

Resolve is explicit and never rewrites the textarea. Successful lines accumulate as an uncapped ordered removable selection; invalid, inaccessible, malformed, rate-limited, timed-out, and network-failed lines retain per-line feedback beneath the input. Each error identifies its line and complete submitted value, and editing the textarea clears stale errors. **Clear input** clears the textarea and its input-specific errors/notices without removing resolved selections. A repeated already-selected ID is a silent no-op with no network request; repeats within one submitted batch show one calm batch-duplicate notice, including equivalent numeric-ID and canonical-URL forms. Newly resolved lists append in first-seen order, so the selected order remains the source order. Successful metadata supplies the exact ID, public name or `TMDB list <id>` fallback, description, item count, creator when reliable, and ordered mixed Movie/TV title rows.

Review exposes one independent editable Source name per selected list, explains that the name is shown in Nuvio and can be customised, and labels the fixed source sort as **Original order**. Selected-Folder Add Source keeps the unnumbered **Review** kicker, its count-bearing **Add N sources** action, and no container presentation controls. Guided New Collection/New Folder uses the unnumbered **Review & Appearance** kicker and a header description that names both names and appearance. Guided actions use the concise labels **Create collection** and **Create folder**. They remain actionable when required names are blank: submission marks every missing field invalid, focuses and scrolls to the first, and shows one footer message for the exact missing-name combination without applying a mutation. Guided New Collection starts its required Collection and Folder names empty, reuses the normal Collection title visibility, Tabs/Rows, All-tab and pin controls plus the normal Folder title visibility and Poster/Landscape tile-shape controls, and creates exactly one Collection → one Folder → `N` sources. Guided New Folder starts its required Folder name empty, states **Collection settings stay unchanged.**, reuses the normal Folder title visibility and tile-shape controls, and creates exactly one Folder → `N` sources. Defaults remain visible Collection title, Tabs, All tab on, unpinned, Folder title hidden on the home screen only, and Poster. These flows assign no list-derived artwork and do not expose the internal `focusGlowEnabled` default.

## Persisted source contract

Every saved source has exactly:

```json
{
  "title": "Resolved or edited source name",
  "sortBy": "original",
  "tmdbId": 123,
  "filters": {},
  "provider": "tmdb",
  "mediaType": "MOVIE",
  "tmdbSourceType": "LIST"
}
```

`mediaType: "MOVIE"` is the canonical source-level current Nuvio representation even when the remote List contains Movies and Series; it is not a claim that the remote List is Movie-only. Owner runtime testing in current Nuvio passed Movie-only, Series-only, and mixed Lists with this fixed value: Nuvio derived each returned item's actual Movie/Series type from TMDB `media_type`, routed items accordingly, preserved original order, and retained `MOVIE` plus `original` in an immediate export. Keeping one fixed source identity avoids unstable composition inference for mutable Lists. The source is native and authoritative in `sources`; it is never projected into `catalogSources`.

Selection identity is `tmdb|LIST|<canonical id>`. Physical duplicate identity is `tmdb|LIST|<canonical id>|MOVIE`. Imported numeric and decimal-string IDs normalize only for identity comparison; preserved raw representation remains under the existing importer/serializer contract. Destination-folder duplicates are omitted normally and may be explicitly overridden in Add Source. Elsewhere matches are informational and remain addable. New Folder omits exact identities already anywhere in its destination Collection so it never creates an empty Folder; New Collection treats project matches as informational. Every mutation rebuilds or revalidates current placement and applies one ordinary atomic controller batch.

## Provider and Preview

The injected provider makes only:

```text
GET /3/list/{canonical signed-int32 ID}?language=en-US&page=1
```

The frontend normalizer fails closed for mismatched IDs, missing item counts, malformed title rows, and unknown `media_type` values. Movie rows use `title`/`release_date`; TV rows use `name`/`first_air_date`; source order follows the returned `items` array. HTTP 401/403/404 share safe inaccessible/not-found copy. Rate limit, timeout, network, non-JSON, and malformed responses use sanitized retryable errors. Only successful responses—including a successful empty list—enter the bounded 40-entry, five-minute in-memory cache. Concurrent identical requests share one in-flight request while each consumer retains its own stale/abort outcome.

Add and guided creation expose Preview on the resolved-list Choose cards, while Source Edit exposes the shared title Preview action. Lists Review deliberately omits Preview so it can focus on placement, presentation, names, IDs, counts, **Original order**, duplicates, and the final atomic action. Back from Review preserves the resolved selection so Preview remains immediately available on Choose without resolving again. All three Preview entry points reuse the shared body-portalled poster-only dialog. The mixed-list label is **Titles** rather than Movies or Series. Opening Preview is explicit and does not mutate, save, re-resolve placement, or change source order.

The bounded #170 Preview experiment uses every valid normalized item already returned by the existing page-1 List request and makes no further request. The provider already retained that complete normalized `items` array; the former ten-title limit lived only in the shared dialog's poster-grid `limit`. LIST Preview renders that complete loaded sample into the existing internal poster scroll area at open time. The LIST dialog keeps the established five-column responsive poster sizing and a fixed viewport equivalent to the former two-row/ten-poster presentation, so further page-1 posters sit below the fold and ordinary vertical scrolling reveals them without resizing the modal. Poster images retain native `loading="lazy"`; scroll, wheel, touch, and keyboard movement have no reveal state or request handler. The grid stops after the loaded page-1 sample, offers no Load more control, and creates no paging URL, second cache, prefetch, or page-2 request. Closing and reopening returns the same fully rendered sample to scroll position zero while reusing the established provider success cache. Other Preview families retain their fixed ten-poster behavior.

A shared Preview of up to 100 titles remains parked future work. It is not an extension of the page-1 #170 contract and would require a separately approved Worker change followed by Dave's manual deployment gate.

The LIST-only subtitle is derived from the usable loaded sample and the provider total: **Showing all N titles** when loaded and total counts agree, **Showing N of M titles** when the known total is larger, and **Showing N titles** if a defensive caller lacks a reliable total. Zero loaded titles use the established empty state rather than **Showing all 0 titles**. A bounded live audit on 2026-08-30 found List `5916` (**Musicals**) reporting 124 total with 20 raw, normalized, poster-bearing page-1 items, and List `8679739` (**Top 10 Netflix Movies**) reporting ten total with all ten available on page 1. The implementation does not assume that every page contains exactly 20 items.

## Source Edit

A complete supported native `LIST`/`MOVIE` source with `sortBy: "original"` and empty or all-null filters is registered through the existing fail-closed source-editor adapter registry. Edit owns only Source name, repeats the Nuvio/customisation helper, describes the fixed sort as **Original order**, and presents the numeric List ID as a safe new-tab link to `https://www.themoviedb.org/list/<id>`. List ID, provider, source type, canonical media configuration, filters, category, raw imported values, unknown fields, and physical identity stay fixed. Preview uses the same List provider/cache and mixed **Titles** presentation. Unknown imported fields remain preserved and do not prevent a canonical List source from receiving a title-only edit; incomplete, differently configured, meaningfully filtered, or otherwise unsupported List shapes remain preservable and Delete-only. Other source editors retain their existing identity presentation.

## Worker deployment gate

The tracked Worker adds only the exact browser-origin route above. IDs must be canonical positive decimal integers no greater than `2147483647`. `language=en-US` and `page=1` must each appear exactly once; missing, duplicated, changed, or extra parameters fail closed. Service-token access does not authorize this route.

Dave manually deployed the reviewed complete `cloudflare-worker/tmdb-proxy.js` bytes. The bounded direct production and mounted Builder acceptance gates passed against the real production Worker, TMDB response, and image CDN without fabricated integrated payloads. No additional Worker deployment is part of integration.

## Deterministic evidence

- `tests/builder-tmdb-lists.test.mjs` covers strict input and batches, selected-ID silence versus same-batch duplicates, mixed normalization, truthful complete/partial/unknown/empty Preview summaries, provider request/error/cache/coalescing behavior, source validation and identities, duplicate override, exact guided shapes and shared presentation mappings, atomic apply, stale rejection, native serialization, and title-only Source Edit/Preview.
- `tests/builder-tmdb-lists-ui.test.mjs` covers all entry points, shared selection and Preview seams, LIST-only complete page-one display in a fixed two-row viewport, the shared Dingo scrollbar, pre-experiment five-column responsive sizing, preserved fixed-ten behavior elsewhere, preserved-input and Clear-input behavior, line/value error rendering, concise guided actions, required-name validation, Source-name guidance, List identity linking, compact regular textarea typography, shared presentation-control reuse, Review-only Preview removal, **Original order**, one scroll owner, fixed footer, and responsive style boundaries.
- `tests/builder-source-edit-ui.test.mjs` and `tests/builder-source-edit-mounted.test.mjs` cover the exact List Source Edit link and accessible name, retained Preview behavior, preserve-on-save semantics, guided validation focus/placement, no-op repeated selection, retained selection after Clear input, long-error containment, 2/12/26-line input typography, and the 360/384/393/402/412/899/900/901/1280-pixel plus 393×320 viewport matrix. The mounted Preview evidence uses the live Worker/TMDB/image path for Lists `5916` and `8679739`, verifies fixed modal width/height through real scroll, wheel, and touch input, complete page-one reachability, exact subtitles, pre-experiment poster sizing, Dingo scrollbar styling, vertical-only overflow, cache reuse, one scroll owner, body lock, focus restoration, non-mutation, and zero requests during scrolling.
- `tests/cloudflare-worker.test.mjs` covers the exact valid route and the fail-closed ID/query/service-token matrix.

Current-Nuvio Movie-only, Series-only, mixed-List, and immediate-export validation passed, as did owner desktop and physical-phone review.
