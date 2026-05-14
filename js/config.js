const TMDB_API_KEY = "__TMDB_API_KEY__";
const CACHE_VERSION = "__APP_ASSET_VERSION__";

const countryDisplayNames =
	typeof Intl !== "undefined" && Intl.DisplayNames ? new Intl.DisplayNames(["en"], { type: "region" }) : null;

const countrySearchAliases = {
	GB: ["united kingdom", "uk", "great britain", "britain", "england"],
	KR: ["south korea", "korea"],
	US: ["united states", "usa", "america"],
};

const collectionAliases = {
	lotr: "lord of the rings",
	hp: "harry potter",
	mcu: "marvel",
	dceu: "dc",
	bttf: "back to the future",
	mi: "mission impossible",
	tdk: "dark knight",
	potc: "pirates of the caribbean",
	sw: "star wars",
	jp: "jurassic park",
	jw: "jurassic world",
};
