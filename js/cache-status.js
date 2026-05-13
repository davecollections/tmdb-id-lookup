async function readJson(path) {
	try {
		const response = await fetch(path);
		if (!response.ok) return null;
		return response.json();
	} catch {
		return null;
	}
}

function formatCount(value) {
	return Number(value).toLocaleString();
}

async function refreshNetworkCacheStatus() {
	const [networks, audit, scan] = await Promise.all([
		readJson("./data/tv-networks.min.json"),
		readJson("./data/tv-network-id-audit.json"),
		readJson("./data/tv-network-scan-meta.json"),
	]);

	if (!Array.isArray(networks)) return;

	const cachedCount = networks.length;
	const exportTotal = audit?.export_total_ids || scan?.last_scan?.export_total_ids || cachedCount;
	const statusText = `${formatCount(cachedCount)} of ${formatCount(exportTotal)} TMDB TV network IDs cached`;
	const element = document.getElementById("network-stats");

	if (!element) return;

	const applyStatus = () => {
		if (!element.innerText || !element.innerText.includes(" of ")) {
			element.innerText = statusText;
		}
	};

	applyStatus();

	const observer = new MutationObserver(applyStatus);
	observer.observe(element, { childList: true, characterData: true, subtree: true });
	setTimeout(() => observer.disconnect(), 30000);
}

refreshNetworkCacheStatus();
