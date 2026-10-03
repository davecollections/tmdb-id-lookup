# Native Trakt Source Foundation

## C #284 current local refinement — 2026-10-03

The owner approved the real populated discovery Preview. The current local Phase B
refinement supersedes the older name-only/no-Preview editor and text-fallback assumptions
below. Supported native Trakt Source Edit now uses the normal shared Preview action,
modal and poster-only grid. A detached current draft supplies the immutable media identity
(MOVIE → `movie`, TV → `show`) and selected `sortBy` / `sortHow`, without saving or
mutating the Source. Changing pills makes no requests; Preview and Retry are explicit.
Unknown extra source semantics fail closed for exact Preview and remain preserved.

Source Preview requires the narrow optional Dingo `/items` context:
`type=movie|show`, `sort_by=rank|added|title|released|runtime|popularity|percentage|votes`,
`sort_how=asc|desc`, all together, with page 1 and limit 50. It dispatches one upstream
media-specific sorted GET. No local sorting is performed; TMDB enrichment preserves the
returned order and missing posters are omitted. Cache identity includes List ID, media,
sort, direction, page and limit. There is no second page or automatic refresh.
Discovery and creation Media Preview retain the ordinary combined list sample.

The current NuvioTV resolver at [`e374881a78e546bbda45f52f3dccd73fbbe47cb6`](https://github.com/NuvioMedia/NuvioTV/blob/e374881a78e546bbda45f52f3dccd73fbbe47cb6/app/src/main/java/com/nuvio/tv/core/trakt/TraktPublicListSourceResolver.kt)
was rechecked: it maps MOVIE/TV to movie/show and forwards sorting to `getPublicListItems`.
Its GPL-3.0 licence was verified; no upstream implementation was copied.

The sorted-items service dependency merged in
[service PR #28](https://github.com/davecollections/trakt-list-lookup/pull/28) and is
deployed. Real Source Edit TV/title/desc Preview passed with exactly one Trakt GET/cost
one and three TV detail requests. The returned order survived poster enrichment;
Preview used the unsaved draft without saving it, including after closing Preview.

[Physical Nuvio Desktop acceptance](BUILDER_TRAKT_CREATION.md#c-284-count-clarity-and-physical-acceptance--2026-10-03)
is complete. The mixed MOVIE/TV rank/asc Builder export imported successfully. The
subsequent TV/title/desc export displayed the same order as real Builder Preview.
Re-export retained provider, List ID, media, sort and direction; Movies stayed
rank/asc and Series stayed title/desc. Added nullable compatibility fields and
`focusGifEnabled=true` did not alter source semantics. Builder integration remains
subject to canonical validation, PR CI and owner merge review. Trakt attribution
stays exclusively in About & Credits → Data credits; the related-tool link stays separate.


## Status and validation

B2 implementation, owner review and validation are recorded in [#279](https://github.com/davecollections/tmdb-id-lookup/issues/279) / [PR #280](https://github.com/davecollections/tmdb-id-lookup/pull/280). B3 subsequently merged in [PR #283](https://github.com/davecollections/tmdb-id-lookup/pull/283). [C #284](https://github.com/davecollections/tmdb-id-lookup/issues/284) has owner-approved Phase A and visible Phase B, with production sorted Preview and required physical Nuvio acceptance complete; see [the C checkpoint](BUILDER_TRAKT_CREATION.md#c-284-count-clarity-and-physical-acceptance--2026-10-03). Integration still requires canonical validation, PR CI and owner merge approval; parent [#276](https://github.com/davecollections/tmdb-id-lookup/issues/276) remains open.

Accepted implementation head [`a1017234ecc025794b810173f029db57e06589cb`](https://github.com/davecollections/tmdb-id-lookup/commit/a1017234ecc025794b810173f029db57e06589cb) passed the full canonical local suite, production Builder build and [hosted FULL PR validation](https://github.com/davecollections/tmdb-id-lookup/actions/runs/36954981756). Documentation-only follow-up heads receive separate automatic PR validation after push; these implementation-head results do not establish a follow-up head's check status.

## Category and authored contract

`SOURCE_CATEGORIES.NATIVE_TRAKT` is `native-trakt`, alongside unchanged `native-tmdb`, `addon` and `opaque`. Domain nodes retain the ordinary Source shape, internal ID and optional raw snapshot.

`buildNativeTraktSourceDraft({ title, traktListId, mediaType })` in `builder/src/source-add/trakt-source.js` is the single offline creation constructor. Its paired validator rejects extra draft/input fields. It returns `{ ok, draft, errors }`; a valid draft is:

```json
{
  "category": "native-trakt",
  "editable": {
    "title": "Movies",
    "provider": "trakt",
    "mediaType": "MOVIE",
    "traktListId": 123,
    "sortBy": "rank",
    "sortHow": "asc"
  }
}
```

Series uses `TV`. The ID must already be a JavaScript number satisfying `Number.isSafeInteger(value) && value > 0`; numeric strings are rejected, with no coercion or giant-number parsing. Title uses the shared ordinary Nuvio title validator. Provider, media and sort spelling is canonical for new sources. No TMDB, addon, filter, expanded null/default, category or internal-ID fields are invented in exported JSON.

## Import and preservation tiers

Classification remains explicit-provider-led. A case-insensitive `provider: trakt`, actual positive safe-integer numeric `traktListId`, case-insensitive `MOVIE`/`TV`, and recognized sort/direction establish supported `native-trakt`. Provider/media comparison changes no stored spelling or value. Import requires explicit sort fields; it never fills missing defaults.

Recognized imported `sortBy` values are `rank`, `added`, `title`, `released`, `runtime`, `popularity`, `percentage`, and `votes`; `sortHow` is `asc` or `desc`. B2 conservatively recognizes these exact lowercase sort spellings. Creation remains `rank`/`asc`. Canonical authored/serializable sources allow all eight supported sorts and both directions, still requiring exactly the known fields, canonical provider/media, safe numeric ID and valid title. The creation validator adds rank/asc requirements; edited authored sources therefore export without weakening unrelated canonical rules.

Explicit Trakt with missing/unsafe/string/fractional/nonpositive IDs, missing or unsupported media, or unsupported/missing sorting stays **opaque**. `UNSUPPORTED_TRAKT_SOURCE_PRESERVED` explains the unsafe fields using fixed sanitized diagnostic text without echoing imported values. Import succeeds and retains the complete source. Existing `synthetic-list-42` and `saved-list` strings remain preservation evidence, never canonical authoring examples. A lone `traktListId` does not imply a Trakt provider. Explicit addons, including AIO Metadata `trakt.*` catalog IDs, keep the addon contract; community providers remain opaque.

Unknown extra raw fields do not invalidate supported core identity. They remain raw-only and survive import, name editing and serialization. Native Trakt extraction/overlay owns exactly `provider`, `title`, `traktListId`, `mediaType`, `sortBy`, `sortHow` through `NATIVE_TRAKT_EDITABLE_FIELDS` and `sourceEditableFields(category)`. The legacy `SOURCE_EDITABLE_FIELDS` and its TMDB/addon/opaque consumers remain unchanged. In particular, Trakt `filters` and addon/TMDB compatibility fields remain raw-only, even when present.

## Serialization

Serialization overlays only the six category-owned values on a detached complete `rawImported`. Supported imports preserve raw types, casing, unknown keys and inactive compatibility data. New nodes are validated against the strict authored shape before output. Dedicated `INVALID_NATIVE_TRAKT_PROVIDER`, `NATIVE_TRAKT_LIST_ID_REQUIRED`, `INVALID_NATIVE_TRAKT_MEDIA_TYPE`, `UNSUPPORTED_NATIVE_TRAKT_SORT`, `UNSUPPORTED_NATIVE_TRAKT_SORT_DIRECTION`, `NATIVE_TRAKT_TITLE_REQUIRED` and `INVALID_NATIVE_TRAKT_FIELDS` diagnostics reject malformed new nodes.

Trakt appears only in authoritative `sources`. `catalogSources` generation is unchanged and addon-only; native-only folders retain the existing empty-array output. Supported and opaque Trakt sources both have stable second-cycle round trips under the existing preservation contract. This guarantees semantic JSON values, not the original text's whitespace or key formatting; the existing JSON parser cannot retain a pre-parse spelling of an unsafe integer, which is never promoted or authored.

## Identity, configuration and occurrences

`nativeTraktPhysicalIdentity(source)` returns `trakt|<numeric list ID>|MOVIE` or `trakt|<numeric list ID>|TV` only for safely supported native Trakt nodes/drafts. Name and sorting never change physical identity. Invalid/opaque/addon sources return `null`.

`nativeTraktConfigurationKey(source, { includeTitle })` separately compares physical identity, sort and direction. Name is included only with explicit `includeTitle: true`. Unknown raw fields make this bounded configuration key `null`: matching known identity cannot prove complete future-field equivalence. Callers must never interpret two `null` keys as a configured duplicate. Physical identity and name editing remain available.

`nativeTraktSourceOccurrences(project, source, { folderInternalId })` reuses the shared immutable project occurrence cache. It returns ordered frozen physical matches with collection/folder/source IDs and titles plus the bounded configuration key. Omit the folder option for project-wide discovery. This is location evidence only; B3 must choose its operation-specific duplicate policy. No hierarchy plans, automatic placement, override or duplicate UI exists in B2. TMDB structural/variant helpers remain unchanged because their family-specific configured semantics differ.

## Presentation and Source Edit

Supported sources use **Native Trakt** category presentation and compact **Trakt List ID**, Movies/Series and local human-readable sort metadata. No external Trakt URL is guessed. Unsupported imports retain Preserved source presentation.

The `trakt-list` editor adapter uses the existing Source Edit modal/session/action path. Its C domain and visible UI own `title`, `sortBy` and `sortHow`, including all eight supported sorts and both directions. Provider, numeric List ID and media stay immutable, with tampering rejected. Sort/direction drafts must use supported values and patch only changed fields. Unknown fields and all untouched raw values survive. Untouched/equal-value saves return no-op without advancing project state. Shared project/source/category/identity/reorder/move/delete guards remain active; title/sort changes do not change physical identity or require duplicate checks. Unsupported/opaque Trakt has Delete only.

Source Edit has no List picker, media detection or replacement. Its explicit shared poster-only Preview uses the current unsaved fixed-media draft as described above; it never saves the source. Existing Add/Guided creation remains separate.

## Current upstream evidence

**Confirmed from current Nuvio source code, checked 2026-10-01:** all 16 relevant model, import/data-store, catalog resolver, Trakt resolver, editor/picker and serialization/resolver-test files checked against Pass 1 are unchanged at the following current revisions:

- [NuvioTV dev, `5c1d9b0`](https://github.com/NuvioMedia/NuvioTV/tree/5c1d9b0e2669199114a12ade38027da132303eb3): `Collection.kt`, `CollectionsDataStore.kt`, `TraktPublicListSourceResolver.kt`, `CollectionEditorViewModel.kt`, `CollectionEditorTraktPicker.kt`, resolver tests.
- [NuvioMobile cmp-rewrite, `d667f43`](https://github.com/NuvioMedia/NuvioMobile/tree/d667f4324b5f8fbcb5954dae6ee6b82885f9a9c4): `CollectionModels.kt`, `CollectionCatalogResolver.kt`, `TraktPublicListSourceResolver.kt`, serialization/resolver tests.
- [NuvioDesktop Dev, `e166b22`](https://github.com/NuvioMedia/NuvioDesktop/tree/e166b226d6adda156c0bceda3387e5c6236bb75f): equivalent model/catalog/Trakt resolver and serialization/resolver tests.

The clients model numeric `Long` list IDs, map MOVIE/TV to movie/show, and forward recognized sort/direction. Mobile/Desktop tests exercise `added`/`desc` and unknown-field preservation. TV typed conversion and Mobile/Desktop raw-overlay preservation differ; Dingo keeps its own preservation-first contract. Upstream runtime defaults/normalization do not authorize silent Dingo import normalization. B2's safe-number range is deliberately narrower than Kotlin Long. The inspected repositories are GPL-3.0; only contract facts were used, with independent implementation. Hosted nuvio.tv/web remains unverified. The accepted physical Nuvio Desktop cases are recorded above; no cross-client runtime guarantee is claimed.

## Verification and next boundary

Focused coverage: `tests/builder-native-trakt.test.mjs`, the compatibility corpus, existing domain/import/serialize/migration/Source Edit/capability/UI suites, and the shared source-edit mounted harness's `TRAKT_SOURCE_FOUNDATION_ONLY=1` scenario. The corpus and owner-review JSON are explicitly local contract examples, not responses from an external service. The mounted check exercises actual Builder import/card/menu/editor/export behavior with zero external requests.

Use `node --test --test-name-pattern="mounted native Trakt foundation" tests/builder-source-edit-mounted.test.mjs` with that environment variable. Optional `TMDB_204_SCREENSHOTS` captures local review evidence outside Git. Import `manual-tests/native-trakt-foundation/owner-review.json` in the normal production-style Builder preview for owner review.

Historically, B2 added no Trakt networking, environment variables, API client, Cloudflare/service changes, creation modes, hierarchy family, Add Source option, search/browse/URL resolver or Preview provider. B3 built on this foundation for creation; C completes the bounded Preview/sorting behavior and accepted visible/live/physical cases described above, with repository integration still gated by validation and owner PR merge approval. Parent #276 remains open. See [status and validation](#status-and-validation) for the completed implementation checks and separate PR-head validation.
