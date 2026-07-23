const REVIEWED_DATE = "2026-07-23";

export const MATRIX_PATH = "manual-tests/tmdb-discover/compatibility-matrix.json";

export const SOURCE_REFERENCES = {
	"tmdb-movie": {
		title: "TMDB Discover Movie reference",
		url: "https://developer.themoviedb.org/reference/discover-movie",
	},
	"tmdb-tv": {
		title: "TMDB Discover TV reference",
		url: "https://developer.themoviedb.org/reference/discover-tv",
	},
	"tmdb-oas": {
		title: "TMDB v3 OpenAPI document",
		url: "https://developer.themoviedb.org/openapi/tmdb-api.json",
		sha256: "1c709375fe994e58c5a35aba7c9abfa7f28aa7103ed6c2052ea5ab0b62af081b",
		lastModified: "2026-03-23T14:27:00.500Z",
	},
	"tmdb-region": {
		title: "TMDB region and release-type guide",
		url: "https://developer.themoviedb.org/docs/region-support",
	},
	"tmdb-certifications": {
		title: "TMDB Movie certification list endpoint",
		url: "https://developer.themoviedb.org/reference/certification-movie-list",
	},
	"tmdb-timezones": {
		title: "TMDB configuration timezone list endpoint",
		url: "https://developer.themoviedb.org/reference/configuration-timezones",
	},
	"tmdb-watch-regions": {
		title: "TMDB watch-provider region list endpoint",
		url: "https://developer.themoviedb.org/reference/watch-providers-available-regions",
	},
	"nuviotv-model": {
		title: "NuvioTV collection model",
		path: "app/src/main/java/com/nuvio/tv/domain/model/Collection.kt",
		url: "https://github.com/NuvioMedia/NuvioTV/blob/10fa8d4b16996a64c1636f0a04e7dd1ad3acde00/app/src/main/java/com/nuvio/tv/domain/model/Collection.kt",
	},
	"nuviotv-resolver": {
		title: "NuvioTV TMDB collection resolver",
		path: "app/src/main/java/com/nuvio/tv/core/tmdb/TmdbCollectionSourceResolver.kt",
		url: "https://github.com/NuvioMedia/NuvioTV/blob/10fa8d4b16996a64c1636f0a04e7dd1ad3acde00/app/src/main/java/com/nuvio/tv/core/tmdb/TmdbCollectionSourceResolver.kt",
	},
	"nuviotv-api": {
		title: "NuvioTV TMDB Retrofit interface",
		path: "app/src/main/java/com/nuvio/tv/data/remote/api/TmdbApi.kt",
		url: "https://github.com/NuvioMedia/NuvioTV/blob/10fa8d4b16996a64c1636f0a04e7dd1ad3acde00/app/src/main/java/com/nuvio/tv/data/remote/api/TmdbApi.kt",
	},
	"nuviotv-editor": {
		title: "NuvioTV native TMDB source editor",
		path: "app/src/main/java/com/nuvio/tv/ui/screens/collection/CollectionEditorTmdbPicker.kt",
		url: "https://github.com/NuvioMedia/NuvioTV/blob/10fa8d4b16996a64c1636f0a04e7dd1ad3acde00/app/src/main/java/com/nuvio/tv/ui/screens/collection/CollectionEditorTmdbPicker.kt",
	},
	"nuviotv-import": {
		title: "NuvioTV collection import and export data store",
		path: "app/src/main/java/com/nuvio/tv/data/local/CollectionsDataStore.kt",
		url: "https://github.com/NuvioMedia/NuvioTV/blob/10fa8d4b16996a64c1636f0a04e7dd1ad3acde00/app/src/main/java/com/nuvio/tv/data/local/CollectionsDataStore.kt",
	},
	"nuviotv-web-editor": {
		title: "NuvioTV browser collection editor",
		path: "app/src/main/java/com/nuvio/tv/core/server/AddonWebPage.kt",
		url: "https://github.com/NuvioMedia/NuvioTV/blob/10fa8d4b16996a64c1636f0a04e7dd1ad3acde00/app/src/main/java/com/nuvio/tv/core/server/AddonWebPage.kt",
	},
	"nuviotv-sync": {
		title: "NuvioTV collection sync service",
		path: "app/src/main/java/com/nuvio/tv/core/sync/CollectionSyncService.kt",
		url: "https://github.com/NuvioMedia/NuvioTV/blob/10fa8d4b16996a64c1636f0a04e7dd1ad3acde00/app/src/main/java/com/nuvio/tv/core/sync/CollectionSyncService.kt",
	},
	"nuviotv-resolver-tests": {
		title: "NuvioTV TMDB collection resolver tests",
		path: "app/src/test/java/com/nuvio/tv/core/tmdb/TmdbCollectionSourceResolverTest.kt",
		url: "https://github.com/NuvioMedia/NuvioTV/blob/10fa8d4b16996a64c1636f0a04e7dd1ad3acde00/app/src/test/java/com/nuvio/tv/core/tmdb/TmdbCollectionSourceResolverTest.kt",
	},
	"nuviotv-migration-tests": {
		title: "NuvioTV collection source migration tests",
		path: "app/src/test/java/com/nuvio/tv/data/local/CollectionsDataStoreSourceMigrationTest.kt",
		url: "https://github.com/NuvioMedia/NuvioTV/blob/10fa8d4b16996a64c1636f0a04e7dd1ad3acde00/app/src/test/java/com/nuvio/tv/data/local/CollectionsDataStoreSourceMigrationTest.kt",
	},
	"nuviomobile-model": {
		title: "NuvioMobile collection model",
		path: "composeApp/src/commonMain/kotlin/com/nuvio/app/features/collection/CollectionModels.kt",
		url: "https://github.com/NuvioMedia/NuvioMobile/blob/b1c9d08435a5b7d7487b30bbf181cb48830c2458/composeApp/src/commonMain/kotlin/com/nuvio/app/features/collection/CollectionModels.kt",
	},
	"nuviomobile-resolver": {
		title: "NuvioMobile TMDB collection resolver",
		path: "composeApp/src/commonMain/kotlin/com/nuvio/app/features/collection/TmdbCollectionSourceResolver.kt",
		url: "https://github.com/NuvioMedia/NuvioMobile/blob/b1c9d08435a5b7d7487b30bbf181cb48830c2458/composeApp/src/commonMain/kotlin/com/nuvio/app/features/collection/TmdbCollectionSourceResolver.kt",
	},
	"nuviomobile-service": {
		title: "NuvioMobile TMDB service query builder",
		path: "composeApp/src/commonMain/kotlin/com/nuvio/app/features/tmdb/TmdbService.kt",
		url: "https://github.com/NuvioMedia/NuvioMobile/blob/b1c9d08435a5b7d7487b30bbf181cb48830c2458/composeApp/src/commonMain/kotlin/com/nuvio/app/features/tmdb/TmdbService.kt",
	},
	"nuviomobile-editor": {
		title: "NuvioMobile collection editor",
		path: "composeApp/src/commonMain/kotlin/com/nuvio/app/features/collection/CollectionEditorScreen.kt",
		url: "https://github.com/NuvioMedia/NuvioMobile/blob/b1c9d08435a5b7d7487b30bbf181cb48830c2458/composeApp/src/commonMain/kotlin/com/nuvio/app/features/collection/CollectionEditorScreen.kt",
	},
	"nuviomobile-import": {
		title: "NuvioMobile collection repository",
		path: "composeApp/src/commonMain/kotlin/com/nuvio/app/features/collection/CollectionRepository.kt",
		url: "https://github.com/NuvioMedia/NuvioMobile/blob/b1c9d08435a5b7d7487b30bbf181cb48830c2458/composeApp/src/commonMain/kotlin/com/nuvio/app/features/collection/CollectionRepository.kt",
	},
	"nuviomobile-preserver": {
		title: "NuvioMobile raw JSON preservation overlay",
		path: "composeApp/src/commonMain/kotlin/com/nuvio/app/features/collection/CollectionJsonPreserver.kt",
		url: "https://github.com/NuvioMedia/NuvioMobile/blob/b1c9d08435a5b7d7487b30bbf181cb48830c2458/composeApp/src/commonMain/kotlin/com/nuvio/app/features/collection/CollectionJsonPreserver.kt",
	},
	"nuviomobile-folder-repository": {
		title: "NuvioMobile folder detail repository and post-filtering",
		path: "composeApp/src/commonMain/kotlin/com/nuvio/app/features/collection/FolderDetailRepository.kt",
		url: "https://github.com/NuvioMedia/NuvioMobile/blob/b1c9d08435a5b7d7487b30bbf181cb48830c2458/composeApp/src/commonMain/kotlin/com/nuvio/app/features/collection/FolderDetailRepository.kt",
	},
	"nuviomobile-sync": {
		title: "NuvioMobile collection sync service",
		path: "composeApp/src/commonMain/kotlin/com/nuvio/app/features/collection/CollectionSyncService.kt",
		url: "https://github.com/NuvioMedia/NuvioMobile/blob/b1c9d08435a5b7d7487b30bbf181cb48830c2458/composeApp/src/commonMain/kotlin/com/nuvio/app/features/collection/CollectionSyncService.kt",
	},
	"nuviomobile-serialization-tests": {
		title: "NuvioMobile collection source serialization tests",
		path: "composeApp/src/commonTest/kotlin/com/nuvio/app/features/collection/CollectionSourceSerializationTest.kt",
		url: "https://github.com/NuvioMedia/NuvioMobile/blob/b1c9d08435a5b7d7487b30bbf181cb48830c2458/composeApp/src/commonTest/kotlin/com/nuvio/app/features/collection/CollectionSourceSerializationTest.kt",
	},
	"builder-fields": {
		title: "Builder recognized fields",
		path: "builder/src/nuvio/known-fields.js",
	},
	"builder-domain-model": {
		title: "Builder plain-data source domain model and defaults",
		path: "builder/src/domain/model.js",
	},
	"builder-import": {
		title: "Builder source importer",
		path: "builder/src/import/editable-fields.js",
	},
	"builder-overlay": {
		title: "Builder raw source overlay",
		path: "builder/src/serialize/overlay.js",
	},
	"builder-validation": {
		title: "Builder native source serialization validation",
		path: "builder/src/serialize/nuvio-serialize.js",
	},
	"builder-migration": {
		title: "Builder addon-projection migration",
		path: "builder/src/migrate/addon-projection-migration.js",
	},
	"builder-ui": {
		title: "Builder workspace source UI",
		path: "builder/src/ui/BuilderWorkspace.jsx",
	},
	"builder-contract-tests": {
		title: "Builder import, serializer, and migration contract tests",
		paths: ["tests/builder-import.test.mjs", "tests/builder-serializer.test.mjs", "tests/builder-migration.test.mjs"],
	},
	"builder-knowledge": {
		title: "Builder knowledge base and prior Shark Movies manual evidence",
		path: "docs/v2/BUILDER_KNOWLEDGE.md",
	},
};

const MOVIE_SORTS = [
	"original_title.asc",
	"original_title.desc",
	"popularity.asc",
	"popularity.desc",
	"revenue.asc",
	"revenue.desc",
	"primary_release_date.asc",
	"primary_release_date.desc",
	"title.asc",
	"title.desc",
	"vote_average.asc",
	"vote_average.desc",
	"vote_count.asc",
	"vote_count.desc",
];

const TV_SORTS = [
	"first_air_date.asc",
	"first_air_date.desc",
	"name.asc",
	"name.desc",
	"original_name.asc",
	"original_name.desc",
	"popularity.asc",
	"popularity.desc",
	"vote_average.asc",
	"vote_average.desc",
	"vote_count.asc",
	"vote_count.desc",
];

const UI_SORTS = {
	movie: new Set(["popularity.desc", "vote_average.desc", "vote_count.desc", "primary_release_date.desc"]),
	tv: new Set(["popularity.desc", "vote_average.desc", "vote_count.desc", "first_air_date.desc"]),
};

function parameter(name, kind, officialType, options = {}) {
	return {
		name,
		kind,
		officialType,
		allowed: options.allowed ?? null,
		and: options.and ?? false,
		or: options.or ?? false,
		companions: options.companions ?? [],
		note: options.note ?? null,
	};
}

const MOVIE_PARAMETERS = [
	parameter("certification", "filter", "string", { companions: ["region"], note: "Country-dependent values come from TMDB's certification list." }),
	parameter("certification.gte", "filter", "string", { companions: ["region"], note: "Country-dependent comparison value." }),
	parameter("certification.lte", "filter", "string", { companions: ["region"], note: "Country-dependent comparison value." }),
	parameter("certification_country", "filter", "string", { companions: ["certification, certification.gte, or certification.lte"] }),
	parameter("include_adult", "filter", "boolean", { allowed: [true, false], note: "TMDB default is false." }),
	parameter("include_video", "filter", "boolean", { allowed: [true, false], note: "TMDB default is false." }),
	parameter("language", "request-control", "string", { allowed: ["BCP 47-style language tag; default en-US"] }),
	parameter("page", "request-control", "integer/int32", { allowed: ["default 1"] }),
	parameter("primary_release_year", "filter", "integer/int32"),
	parameter("primary_release_date.gte", "filter", "string/date"),
	parameter("primary_release_date.lte", "filter", "string/date"),
	parameter("region", "filter", "string", { allowed: ["ISO 3166-1 country code"], note: "Changes regional release-date filtering and projection." }),
	parameter("release_date.gte", "filter", "string/date", { note: "With region, evaluates regional releases." }),
	parameter("release_date.lte", "filter", "string/date", { note: "With region, evaluates regional releases." }),
	parameter("sort_by", "sort", "string/enum", { allowed: MOVIE_SORTS }),
	parameter("vote_average.gte", "filter", "number/float"),
	parameter("vote_average.lte", "filter", "number/float"),
	parameter("vote_count.gte", "filter", "number/float", { note: "Official OAS type is float despite count semantics." }),
	parameter("vote_count.lte", "filter", "number/float", { note: "Official OAS type is float despite count semantics." }),
	parameter("watch_region", "filter", "string", { allowed: ["dynamic TMDB watch-provider region"], companions: ["with_watch_providers or with_watch_monetization_types"] }),
	parameter("with_cast", "filter", "string", { and: true, or: true }),
	parameter("with_companies", "filter", "string", { and: true, or: true }),
	parameter("with_crew", "filter", "string", { and: true, or: true }),
	parameter("with_genres", "filter", "string", { and: true, or: true }),
	parameter("with_keywords", "filter", "string", { and: true, or: true }),
	parameter("with_origin_country", "filter", "string"),
	parameter("with_original_language", "filter", "string"),
	parameter("with_people", "filter", "string", { and: true, or: true }),
	parameter("with_release_type", "filter", "integer/int32", { allowed: ["1 Premiere", "2 Theatrical (limited)", "3 Theatrical", "4 Digital", "5 Physical", "6 TV"], and: true, or: true, note: "Official prose permits delimited combinations despite the OAS integer type; order is meaningful." }),
	parameter("with_runtime.gte", "filter", "integer/int32"),
	parameter("with_runtime.lte", "filter", "integer/int32"),
	parameter("with_watch_monetization_types", "filter", "string", { allowed: ["flatrate", "free", "ads", "rent", "buy"], and: true, or: true, companions: ["watch_region"] }),
	parameter("with_watch_providers", "filter", "string", { and: true, or: true, companions: ["watch_region"] }),
	parameter("without_companies", "filter", "string"),
	parameter("without_genres", "filter", "string"),
	parameter("without_keywords", "filter", "string"),
	parameter("without_watch_providers", "filter", "string"),
	parameter("year", "filter", "integer/int32", { note: "Distinct from primary_release_year; official docs do not compare their semantics." }),
];

const TV_PARAMETERS = [
	parameter("air_date.gte", "filter", "string/date"),
	parameter("air_date.lte", "filter", "string/date"),
	parameter("first_air_date_year", "filter", "integer/int32"),
	parameter("first_air_date.gte", "filter", "string/date"),
	parameter("first_air_date.lte", "filter", "string/date"),
	parameter("include_adult", "filter", "boolean", { allowed: [true, false], note: "TMDB default is false." }),
	parameter("include_null_first_air_dates", "filter", "boolean", { allowed: [true, false], note: "TMDB default is false." }),
	parameter("language", "request-control", "string", { allowed: ["BCP 47-style language tag; default en-US"] }),
	parameter("page", "request-control", "integer/int32", { allowed: ["default 1"] }),
	parameter("screened_theatrically", "filter", "boolean", { allowed: [true, false], note: "No default is documented." }),
	parameter("sort_by", "sort", "string/enum", { allowed: TV_SORTS }),
	parameter("timezone", "request-control", "string", { allowed: ["dynamic TMDB timezone list"] }),
	parameter("vote_average.gte", "filter", "number/float"),
	parameter("vote_average.lte", "filter", "number/float"),
	parameter("vote_count.gte", "filter", "number/float", { note: "Official OAS type is float despite count semantics." }),
	parameter("vote_count.lte", "filter", "number/float", { note: "Official OAS type is float despite count semantics." }),
	parameter("watch_region", "filter", "string", { allowed: ["dynamic TMDB watch-provider region"], companions: ["with_watch_providers or with_watch_monetization_types"] }),
	parameter("with_companies", "filter", "string", { and: true, or: true }),
	parameter("with_genres", "filter", "string", { and: true, or: true }),
	parameter("with_keywords", "filter", "string", { and: true, or: true }),
	parameter("with_networks", "filter", "integer/int32", { note: "Official docs do not document comma or pipe composition." }),
	parameter("with_origin_country", "filter", "string"),
	parameter("with_original_language", "filter", "string"),
	parameter("with_runtime.gte", "filter", "integer/int32"),
	parameter("with_runtime.lte", "filter", "integer/int32"),
	parameter("with_status", "filter", "string", { allowed: ["0", "1", "2", "3", "4", "5"], and: true, or: true, note: "Current Discover docs do not define the numeric labels." }),
	parameter("with_watch_monetization_types", "filter", "string", { allowed: ["flatrate", "free", "ads", "rent", "buy"], and: true, or: true, companions: ["watch_region"] }),
	parameter("with_watch_providers", "filter", "string", { and: true, or: true, companions: ["watch_region"] }),
	parameter("without_companies", "filter", "string"),
	parameter("without_genres", "filter", "string"),
	parameter("without_keywords", "filter", "string"),
	parameter("without_watch_providers", "filter", "string"),
	parameter("with_type", "filter", "string", { allowed: ["0", "1", "2", "3", "4", "5", "6"], and: true, or: true, note: "Current Discover docs do not define the numeric labels." }),
];

const FILTER_MAPPINGS = {
	movie: {
		"primary_release_date.gte": "releaseDateGte",
		"primary_release_date.lte": "releaseDateLte",
		"vote_average.gte": "voteAverageGte",
		"vote_average.lte": "voteAverageLte",
		"vote_count.gte": "voteCountGte",
		watch_region: "watchRegion",
		with_companies: "withCompanies",
		with_genres: "withGenres",
		with_keywords: "withKeywords",
		with_origin_country: "withOriginCountry",
		with_original_language: "withOriginalLanguage",
		with_watch_providers: "withWatchProviders",
		year: "year",
	},
	tv: {
		first_air_date_year: "year",
		"first_air_date.gte": "releaseDateGte",
		"first_air_date.lte": "releaseDateLte",
		"vote_average.gte": "voteAverageGte",
		"vote_average.lte": "voteAverageLte",
		"vote_count.gte": "voteCountGte",
		watch_region: "watchRegion",
		with_companies: "withCompanies",
		with_genres: "withGenres",
		with_keywords: "withKeywords",
		with_networks: "withNetworks",
		with_origin_country: "withOriginCountry",
		with_original_language: "withOriginalLanguage",
		with_watch_providers: "withWatchProviders",
	},
};

const TRANSFORMED_FIELDS = new Set([
	"primary_release_date.gte",
	"primary_release_date.lte",
	"first_air_date_year",
	"first_air_date.gte",
	"first_air_date.lte",
	"watch_region",
	"with_watch_providers",
	"year",
]);

function parameterClientDetails(media, item, client) {
	const field = item.name === "sort_by" ? "sortBy" : FILTER_MAPPINGS[media][item.name] ?? null;
	const prefix = client === "tv" ? "NuvioTV" : "NuvioMobile";
	let mapping = field ? `${field} -> ${item.name}` : null;
	let transformation = null;

	if (item.name === "language") {
		mapping = `${prefix} profile/app TMDB language setting -> language`;
		transformation = "Automatic request control; not collection JSON.";
	} else if (item.name === "page") {
		mapping = `${prefix} pagination -> page`;
		transformation = "Automatic request control; not collection JSON.";
	} else if (item.name === "sort_by") {
		mapping = "top-level sortBy -> sort_by";
		transformation = "Correct-media official strings pass through; exact cross-media descending date alias is normalized.";
	} else if (item.name === "watch_region") {
		transformation = "Sent only when withWatchProviders is nonblank; missing/blank region defaults to US.";
	} else if (item.name === "with_watch_providers") {
		transformation = "Also injects watch_region (default US) and all five monetization types.";
	} else if (item.name === "with_watch_monetization_types") {
		mapping = "Synthesized only when withWatchProviders is nonblank.";
		transformation = "Always flatrate|free|ads|rent|buy; not independently selectable.";
	} else if (item.name === "with_status" && media === "tv" && client === "tv") {
		mapping = "Synthesized only for native NETWORK sources.";
		transformation = "NuvioTV forces 0|3|4 for NETWORK; ordinary DISCOVER JSON cannot set it.";
	} else if (item.name === "with_companies") {
		transformation = "Ordinary DISCOVER forwards the field; a native COMPANY source forces tmdbId and ignores filters.withCompanies.";
	} else if (item.name === "with_networks" && media === "tv") {
		transformation = "Ordinary TV DISCOVER forwards the field; a native NETWORK source forces tmdbId and ignores filters.withNetworks.";
	} else if (item.name === "first_air_date.lte" && media === "tv" && client === "tv") {
		transformation = "releaseDateLte maps here; a NETWORK source defaults a null value to the current local date.";
	} else if (["primary_release_date.gte", "primary_release_date.lte"].includes(item.name)) {
		transformation = "Generic releaseDate field is mapped to Movie primary_release_date.";
	} else if (["first_air_date.gte", "first_air_date.lte"].includes(item.name)) {
		transformation = "Generic releaseDate field is mapped to TV first_air_date.";
	} else if (item.name === "year") {
		transformation = "Generic year maps to Movie year, not primary_release_year.";
	} else if (item.name === "first_air_date_year") {
		transformation = "Generic year maps to TV first_air_date_year.";
	} else if (item.name === "include_adult") {
		transformation = "Not sent; TMDB's documented false default governs. No source comment proves a deliberate client policy.";
	} else if (item.name === "include_video" || item.name === "include_null_first_air_dates") {
		transformation = "Not sent; TMDB's documented false default governs.";
	}

	return { field, mapping, transformation };
}

function supplementalOfficialReferences(media, item) {
	const references = [];
	if (media === "movie" && item.name.startsWith("certification")) references.push("tmdb-certifications");
	if (media === "movie" && ["certification", "certification.gte", "certification.lte", "region", "release_date.gte", "release_date.lte", "with_release_type"].includes(item.name)) references.push("tmdb-region");
	if (item.name === "timezone") references.push("tmdb-timezones");
	if (["watch_region", "with_watch_monetization_types", "with_watch_providers", "without_watch_providers"].includes(item.name)) references.push("tmdb-watch-regions");
	return references;
}

function classificationForParameter(media, item, field) {
	if (item.name === "sort_by") return "sort-pass-through";
	if (["language", "page"].includes(item.name)) return "transformed-or-defaulted";
	if (item.name === "with_watch_monetization_types") return "transformed-or-defaulted";
	if (item.name === "with_status" && media === "tv") return "client-divergence";
	if (TRANSFORMED_FIELDS.has(item.name)) return "transformed-or-defaulted";
	if (field) return "code-supported-both-manual-pending";
	return "official-tmdb-only";
}

function parameterRow(media, item) {
	const tv = parameterClientDetails(media, item, "tv");
	const mobile = parameterClientDetails(media, item, "mobile");
	const field = tv.field;
	const refs = [
		media === "movie" ? "tmdb-movie" : "tmdb-tv",
		"tmdb-oas",
		...supplementalOfficialReferences(media, item),
		"nuviotv-model",
		"nuviotv-resolver",
		"nuviotv-api",
		"nuviotv-editor",
		"nuviotv-import",
		"nuviotv-sync",
		"nuviotv-resolver-tests",
		"nuviotv-migration-tests",
		"nuviomobile-model",
		"nuviomobile-resolver",
		"nuviomobile-service",
		"nuviomobile-editor",
		"nuviomobile-import",
		"nuviomobile-preserver",
		"nuviomobile-sync",
		"nuviomobile-serialization-tests",
		"builder-fields",
		"builder-domain-model",
		"builder-import",
		"builder-overlay",
		"builder-validation",
		"builder-migration",
		"builder-ui",
		"builder-contract-tests",
		...(media === "movie" && item.name === "with_keywords" ? ["builder-knowledge"] : []),
	];

	return {
		key: `${media}:parameter:${item.name}`,
		recordType: "parameter",
		kind: item.kind,
		officialTmdbParameter: item.name,
		officialSortValue: null,
		media,
		officialType: item.officialType,
		officialAllowedValues: item.allowed,
		supportsCommaAnd: item.and,
		supportsPipeOr: item.or,
		requiredCompanionParameters: item.companions,
		proposedNuvioJsonField: field,
		actualNuvioTvJsonField: field,
		actualNuvioMobileJsonField: field,
		nuvioTvDeserializes: field !== null,
		nuvioMobileDeserializes: field !== null,
		nuvioTvRequestMapping: tv.mapping,
		nuvioMobileRequestMapping: mobile.mapping,
		tvTransformationOrDefault: tv.transformation,
		mobileTransformationOrDefault: mobile.transformation,
		nuvioTvEditorOffers: field !== null && item.name !== "sort_by",
		nuvioMobileEditorOffers: field !== null && item.name !== "sort_by",
		builderCurrentlyRecognizes: field !== null,
		builderCurrentlyEditable: false,
		builderImportedRepresentation: field === null ? "rawImported-only" : "editable-and-rawImported",
		builderPreservesUnknownRawValue: field === null ? true : null,
		builderRecognizedEditCanOverwriteOrClearThisValue: field !== null,
		builderRoundTripsOnUnrelatedEdit: true,
		builderLosesRawEvidenceOnSourceReplacement: true,
		builderRequiresDomainSchemaExpansion: field === null && item.kind === "filter",
		builderValueTypeValidation: field === null
			? "Not recognized; retained only in rawImported while the source survives."
			: "Recognized value must be JSON-compatible; no filter-specific semantic type/range validation.",
		directTmdbEvidence: "official-documentation-and-oas; live-result-effect-pending",
		priorManualNuvioEvidence: media === "movie" && item.name === "with_keywords"
			? "Historical unpaired Shark Movies test recorded in BUILDER_KNOWLEDGE.md; client/version scope is not recorded and current cross-client parity is unconfirmed."
			: null,
		priorManualNuvioEvidenceReferences: media === "movie" && item.name === "with_keywords" ? ["builder-knowledge"] : [],
		nuvioTvEvidence: ["nuviotv-model", "nuviotv-resolver", "nuviotv-api", "nuviotv-editor", "nuviotv-import"],
		nuvioMobileEvidence: ["nuviomobile-model", "nuviomobile-resolver", "nuviomobile-service", "nuviomobile-editor", "nuviomobile-import", "nuviomobile-preserver"],
		classification: classificationForParameter(media, item, field),
		confidence: "high-static-contract; runtime-effect-pending",
		notes: [
			item.note,
			field === null ? "No current Nuvio camelCase JSON field exists; no future field name is invented here." : null,
			field === null
				? "Unsupported/unknown raw keys survive unrelated edits, including edits to recognized filters; source replacement or removal loses their raw evidence."
				: "Recognized imported values round-trip on unrelated edits; deliberately editing or clearing this same recognized field can replace/remove it, without removing other unknown keys.",
			"NuvioTV typed import drops unknown filter keys; NuvioMobile accepts then loses unknown nested filter keys during its shallow preservation merge.",
		].filter(Boolean),
		sourceReferences: refs,
	};
}

function sortRow(media, value) {
	const endpoint = media === "movie" ? "Movie" : "TV";
	return {
		key: `${media}:sort:${value}`,
		recordType: "sort-value",
		kind: "sort",
		officialTmdbParameter: "sort_by",
		officialSortValue: value,
		media,
		officialType: "string/enum",
		officialAllowedValues: [value],
		supportsCommaAnd: false,
		supportsPipeOr: false,
		requiredCompanionParameters: [],
		proposedNuvioJsonField: "sortBy",
		actualNuvioTvJsonField: "sortBy",
		actualNuvioMobileJsonField: "sortBy",
		nuvioTvDeserializes: true,
		nuvioMobileDeserializes: true,
		nuvioTvRequestMapping: `sortBy ${value} -> ${endpoint} sort_by unchanged`,
		nuvioMobileRequestMapping: `sortBy ${value} -> ${endpoint} sort_by unchanged`,
		tvTransformationOrDefault: "No transformation for the correct-media official value.",
		mobileTransformationOrDefault: "No transformation for the correct-media official value.",
		nuvioTvEditorOffers: UI_SORTS[media].has(value),
		nuvioMobileEditorOffers: UI_SORTS[media].has(value),
		builderCurrentlyRecognizes: true,
		builderCurrentlyEditable: false,
		builderImportedRepresentation: "editable-and-rawImported",
		builderPreservesUnknownRawValue: null,
		builderRecognizedEditCanOverwriteOrClearThisValue: true,
		builderRoundTripsOnUnrelatedEdit: true,
		builderLosesRawEvidenceOnSourceReplacement: true,
		builderRequiresDomainSchemaExpansion: false,
		builderValueTypeValidation: "Known top-level field; no official sort enum validation.",
		directTmdbEvidence: "official-documentation-and-oas; live-result-effect-pending",
		priorManualNuvioEvidence: null,
		priorManualNuvioEvidenceReferences: [],
		nuvioTvEvidence: ["nuviotv-model", "nuviotv-resolver", "nuviotv-editor", "nuviotv-import"],
		nuvioMobileEvidence: ["nuviomobile-model", "nuviomobile-resolver", "nuviomobile-editor", "nuviomobile-import", "nuviomobile-preserver"],
		classification: "sort-pass-through",
		confidence: "high-static-contract; runtime-effect-pending",
		notes: [
			UI_SORTS[media].has(value) ? "Offered in both clients' current Discover editor." : "Raw-JSON-only in both clients' current Discover editor.",
			"Arbitrary nonblank strings also pass through; invalid or cross-media runtime behavior needs direct TMDB evidence.",
		],
		sourceReferences: [media === "movie" ? "tmdb-movie" : "tmdb-tv", "tmdb-oas", "nuviotv-model", "nuviotv-resolver", "nuviotv-editor", "nuviotv-import", "nuviomobile-model", "nuviomobile-resolver", "nuviomobile-editor", "nuviomobile-import", "nuviomobile-preserver", "builder-fields", "builder-domain-model", "builder-overlay"],
	};
}

export function buildCompatibilityMatrix() {
	const parameterRows = [
		...MOVIE_PARAMETERS.map((item) => parameterRow("movie", item)),
		...TV_PARAMETERS.map((item) => parameterRow("tv", item)),
	];
	const sortRows = [
		...MOVIE_SORTS.map((value) => sortRow("movie", value)),
		...TV_SORTS.map((value) => sortRow("tv", value)),
	];

	return {
		schemaVersion: 1,
		reviewedDate: REVIEWED_DATE,
		generatedBy: "scripts/generate-tmdb-discover-compatibility.mjs",
		startingOriginMainSha: "33fe0fb70cb11f840215dc7538086b82059fb759",
		scope: "Official TMDB v3 Discover parameters and sort values compared with current NuvioTV, NuvioMobile, and local builder contracts.",
		evidenceWarning: "Static code or HTTP 200 is not proof that a filter changes visible results. No direct TMDB or device result-effect evidence was produced during this audit.",
		counts: {
			movieOfficialParameters: MOVIE_PARAMETERS.length,
			tvOfficialParameters: TV_PARAMETERS.length,
			endpointSpecificParameterRows: parameterRows.length,
			movieOfficialSortValues: MOVIE_SORTS.length,
			tvOfficialSortValues: TV_SORTS.length,
			endpointSpecificSortRows: sortRows.length,
			commonNuvioJsonFilterFields: 14,
			nuvioTvOnlyFilterFields: 0,
			nuvioMobileOnlyFilterFields: 0,
			movieOfficialFilterContextParameters: 35,
			tvOfficialFilterContextParameters: 29,
			movieIndependentlyControllableOfficialFilterFields: 13,
			tvIndependentlyControllableOfficialFilterFields: 14,
			movieOfficialFilterContextParametersNotIndependentlyControllable: 22,
			tvOfficialFilterContextParametersNotIndependentlyControllable: 15,
			ordinaryDiscoverJsonFieldsWithConditionalOrMediaMapping: 5,
			priorRepositoryManualFilterCases: 1,
			issue47ControlledManualFilterEffects: 0,
			issue47ControlledManualSortEffects: 0,
		},
		clientSnapshots: {
			nuvioTv: {
				repository: "https://github.com/NuvioMedia/NuvioTV",
				reviewedDate: REVIEWED_DATE,
				defaultBranch: "dev",
				defaultBranchSha: "10fa8d4b16996a64c1636f0a04e7dd1ad3acde00",
				latestRelease: "0.7.19-beta",
				latestReleaseSha: "44743a289687cd30a3c2d6a137c9454e8f42c45f",
				latestReleasePublishedAt: "2026-07-20T19:39:30Z",
				releaseMateriallyDiffers: false,
			},
			nuvioMobile: {
				repository: "https://github.com/NuvioMedia/NuvioMobile",
				reviewedDate: REVIEWED_DATE,
				defaultBranch: "cmp-rewrite",
				defaultBranchSha: "b1c9d08435a5b7d7487b30bbf181cb48830c2458",
				latestRelease: "0.3.1",
				latestReleaseSha: "b1c9d08435a5b7d7487b30bbf181cb48830c2458",
				latestReleasePublishedAt: "2026-07-20",
				releaseMateriallyDiffers: false,
			},
		},
		liveResearch: {
			tokenAvailable: false,
			requestsSent: 0,
			plannedRequests: 58,
			hardRequestCap: 60,
			status: "pending-local-token-and-owner-device-evidence",
		},
		clientDivergences: [
			{
				key: "movie-with-networks",
				description: "Both clients deserialize withNetworks on Movie DISCOVER. NuvioTV omits it; NuvioMobile sends undocumented with_networks to /discover/movie. Runtime handling is pending.",
			},
			{
				key: "network-source-hidden-filters",
				description: "NuvioTV NETWORK forces with_status=0|3|4 and defaults first_air_date.lte to today when null. NuvioMobile forces TV/network ID but adds neither restriction.",
			},
			{
				key: "unknown-filter-preservation",
				description: "NuvioTV typed import drops unknown keys. NuvioMobile accepts unknown keys but its shallow filters overlay loses them on import/persist/export/sync. The local builder preserves them on unrelated edits.",
			},
			{
				key: "original-sort",
				description: "NuvioMobile maps Discover sortBy=original to popularity.desc; NuvioTV forwards original for DISCOVER. Neither value is an official Discover sort.",
			},
		],
		sourceReferences: SOURCE_REFERENCES,
		entries: [...parameterRows, ...sortRows],
	};
}

export function serializeCompatibilityMatrix() {
	return `${JSON.stringify(buildCompatibilityMatrix(), null, 2)}\n`;
}
