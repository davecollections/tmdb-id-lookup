import { isValidVisibleNuvioTitle } from "../nuvio/titles.js";

// Builder-only parity with the V1 title tokenizer; never rewrite saved titles.
export function titleSortWords(title, { stripArticle = true } = {}) {
	if (!isValidVisibleNuvioTitle(title)) return [];
	const text = stripArticle ? title.trim().replace(/^(the|an|a)\s+/i, "") : title;
	return text.replace(/[^\p{L}\p{N}\s'-]/gu, " ").trim().split(/\s+/).filter(Boolean);
}

export function titleSortText(title) { return titleSortWords(title).join(" "); }

export function sortedTitleIds(nodes, mode, keyForTitle = titleSortText) {
	if (!["az", "za"].includes(mode)) throw new TypeError("Unsupported title sort");
	return nodes.map((node, index) => ({ id: node.internalId, index, key: keyForTitle(node.editable.title) }))
		.sort((a, b) => {
			if (!a.key || !b.key) return a.key ? -1 : b.key ? 1 : a.index - b.index;
			return a.key.localeCompare(b.key, undefined, { sensitivity: "base" }) * (mode === "za" ? -1 : 1) || a.index - b.index;
		}).map(({ id }) => id);
}
