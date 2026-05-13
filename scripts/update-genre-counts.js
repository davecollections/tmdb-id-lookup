const fs = require("fs");
const path = require("path");
const vm = require("vm");

const TMDB_API_KEY = process.env.TMDB_API_KEY;

if (!TMDB_API_KEY) {
	console.error("Missing TMDB_API_KEY environment variable.");
	process.exit(1);
}

const rootDir = path.resolve(__dirname, "..");
const genresPath = path.join(rootDir, "js", "genres.js");
const outputPath = path.join(rootDir, "data", "genre-counts.json");

function loadGenreReference() {
	const source = fs.readFileSync(genresPath, "utf8");
	const context = { window: {} };

	vm.createContext(context);
	vm.runInContext(source, context, { filename: genresPath });

	if (!Array.isArray(context.window.tmdbGenreReference)) {
		throw new Error("window.tmdbGenreReference was not found in js/genres.js");
	}

	return context.window.tmdbGenreReference;
}

function getCountKey(genre) {
	if (genre.type === "Official TMDB Genre" && genre.media === "Movie") {
		return `movie:${genre.id}`;
	}

	if (genre.type === "Official TMDB Genre" && genre.media === "TV") {
		return `tv:${genre.id}`;
	}

	if (genre.type === "Curated TMDB List") {
		return `list:${genre.id}`;
	}

	return null;
}

function getCountUrl(genre) {
	if (genre.type === "Official TMDB Genre" && genre.media === "Movie") {
		return `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&with_genres=${genre.id}&page=1`;
	}

	if (genre.type === "Official TMDB Genre" && genre.media === "TV") {
		return `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&with_genres=${genre.id}&page=1`;
	}

	if (genre.type === "Curated TMDB List") {
		return `https://api.themoviedb.org/3/list/${genre.id}?api_key=${TMDB_API_KEY}`;
	}

	return null;
}

async function fetchCount(genre) {
	const url = getCountUrl(genre);

	if (!url) {
		return null;
	}

	const response = await fetch(url);

	if (!response.ok) {
		console.warn(`Failed ${genre.name} (${genre.media} ${genre.id}): HTTP ${response.status}`);
		return null;
	}

	const data = await response.json();

	if (typeof data.total_results === "number") {
		return data.total_results;
	}

	if (typeof data.item_count === "number") {
		return data.item_count;
	}

	if (Array.isArray(data.items)) {
		return data.items.length;
	}

	return null;
}

async function main() {
	const genres = loadGenreReference();
	const counts = {};

	for (const genre of genres) {
		const key = getCountKey(genre);

		if (!key) {
			continue;
		}

		counts[key] = await fetchCount(genre);
		console.log(`${key}: ${counts[key] ?? "unknown"}`);
	}

	const output = {
		updated_at: new Date().toISOString(),
		counts,
	};

	fs.writeFileSync(outputPath, `${JSON.stringify(output, null, "\t")}\n`);
	console.log(`Updated ${path.relative(rootDir, outputPath)}`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
