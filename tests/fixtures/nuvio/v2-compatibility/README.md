# V2 compatibility regression corpus

Issue [#49](https://github.com/davecollections/tmdb-id-lookup/issues/49) adds profile-level evidence around the existing focused unit and contract suites. The corpus is manifest-driven, deterministic, offline, synthetic, and excluded from the Pages artifact.

## Coverage inventory

- Existing importer, serializer, migration, controller, automatic-ID, domain, and contract tests remain authoritative for their focused APIs and diagnostic details.
- `canonical/native-addon-profile.json` connects all seven supported native TMDB types, evidence-backed Movie/TV combinations, multiple addon catalogs, genre metadata, duplicate projection identities, presentation fields, and exact collection/folder/source/projection ordering.
- `preservation/comprehensive-imported-profile.json` connects native, addon, imported Trakt, and opaque/community evidence with unknown fields, raw-only values, missing/null/empty/false/zero distinctions, presentation/artwork fields, unrelated edits, and the source-removal boundary.
- `identity/problematic-nuvio-ids.json` distinguishes direct-import acceptance from deterministic controller repair while keeping builder-only internal IDs separate and unique.
- `invalid/serializer-required-text.json` gives file-backed serializer evidence for required collection/folder IDs and titles.
- Existing issue #31 invalid fixtures remain the validation-only evidence for unsupported direct TMDB shapes, native projections, and addon projection violations.
- Existing issue #37/#38 migration fixtures, generator, and Desktop evidence remain authoritative; the corpus references them instead of creating another legacy format.
- The issue #47 Discover matrix and 29-source manual fixture remain authoritative; this corpus uses only a compact representative subset.

Exact JSON equality is used for the compact canonical profile. Semantic cycle equality is used for preservation profiles because object property ordering is not a product contract. Targeted assertions are used for preservation overlays, identity repair, source removal, migration, and invalid diagnostics.

Material fields are classified in `manifest.json` as builder-owned/overlaid, copied canonical data, canonicalized/defaulted, removed, or raw-preserved only. No confirmed source-artwork field exists in current repository or client evidence, so the corpus records that boundary without inventing one.
