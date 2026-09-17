const assetExtension = /\.(?:avif|css|gif|ico|jpe?g|js|png|svg|webp|woff2?)(?:[?#].*)?$/i;

export function collectPagesAssetReferences(source) {
	return [
		...[...source.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map((match) => match[1]),
		...[...source.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map((match) => match[1]),
		...[...source.matchAll(/["'`](\.\.?\/[^"'`\s]+)["'`]/g)].map((match) => match[1]),
		// Vite emits bare imported assets and workers in new URL(..., import.meta.url).
		// A bare filename elsewhere can be metadata used to construct an external URL.
		...[...source.matchAll(/\bnew\s+URL\(\s*["'`]([^"'`:/?#\s]+\.(?:avif|css|gif|ico|jpe?g|js|png|svg|webp|woff2?)(?:[?#][^"'`\s]*)?)["'`]\s*,\s*import\.meta\.url\s*\)/gi)].map(
			(match) => match[1],
		),
	].filter((reference) => assetExtension.test(reference));
}
