const companySelectionPresets = {
	major: [2, 127928, 127929, 43, 174, 12, 33, 10146, 5, 559, 58, 4],
	miniMajor: [1632, 491, 21, 60, 41],
	animation: [
		6125, 3475, 3, 2785, 7899, 6760, 6704, 521, 42141, 2251, 3464, 24955, 4859, 10342,
	],
};
const networkSelectionPresets = {
	popularServices: [213, 1024, 3186, 2739, 2552, 4330, 453, 3353, 318, 1112, 2949, 1255, 4, 9, 6, 2, 16, 26, 247],
};
const networkPresetCollectionNames = {
	popularServices: "Popular Services",
};
const companyPresetCollectionNames = {
	major: "Major Studios",
	miniMajor: "Mini-Major Studios",
	animation: "Animation Studios",
};
const companyDefaultCollectionNames = new Set(["Studios", ...Object.values(companyPresetCollectionNames)]);
const networkDefaultCollectionNames = new Set(["Networks", ...Object.values(networkPresetCollectionNames)]);
const curatedCompanyCoverUrls = {
	3: "https://i.postimg.cc/1XFm0LjT/Pixar.png",
	21: "https://i.postimg.cc/SxQF7DDY/MGM.png",
	521: "https://i.postimg.cc/vZhWY6kH/Dream-Works.png",
	2251: "https://i.postimg.cc/fTYXnL1P/Sony-Pictures-Animation.png",
	2785: "https://i.postimg.cc/mrdNwFyC/Cartoon-Network.png",
	3475: "https://i.postimg.cc/RFkWGgsv/Disney-Studios.png",
	4859: "https://i.postimg.cc/QC78gRyR/Nickelodeon.png",
	6125: "https://i.postimg.cc/RFkWGgsv/Disney-Studios.png",
	6704: "https://i.postimg.cc/8c6Q6Mgj/Illumination.png",
	7899: "https://i.postimg.cc/mrdNwFyC/Cartoon-Network.png",
	10342: "https://i.postimg.cc/WzkLkgcd/Studio-Ghibli.png",
	42141: "https://i.postimg.cc/vZhWY6kH/Dream-Works.png",
};
const curatedNetworkCoverUrls = {
	2: "https://nuvioapp.space/uploads/covers/5ba4170a-5c7d-429e-af49-9d5735dfa229.jpg",
	4: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/BBC_One_logo_2021.svg/960px-BBC_One_logo_2021.svg.png",
	6: "https://nuvioapp.space/uploads/covers/257cb2c0-d716-427f-a60e-a7ad8307df49.jpg",
	9: "https://upload.wikimedia.org/wikipedia/en/thumb/1/1f/ITV1_logo_%282022%29.svg/960px-ITV1_logo_%282022%29.svg.png",
	16: "https://nuvioapp.space/uploads/covers/772006b6-af76-4fa5-85eb-04ab61f241cd.png",
	26: "https://i.postimg.cc/mgLCMLrz/Channel-4.png",
	213: "https://i.postimg.cc/bYSwjtwD/Netflix.png",
	247: "https://i.postimg.cc/fydz76r8/You-Tube.png",
	318: "https://i.postimg.cc/J0Xr392d/Starz.png",
	453: "https://i.postimg.cc/QC78gRzr/Hulu.png",
	1024: "https://i.postimg.cc/RCJZzHZH/Prime.png",
	1112: "https://i.postimg.cc/59Q2MC20/Crunchyroll.png",
	1255: "https://nuvioapp.space/uploads/covers/33c0ffcf-d617-475a-89d2-20649fd4ba26.png",
	2552: "https://i.postimg.cc/MHB60hLx/Apple-TV.png",
	2739: "https://i.postimg.cc/nV9htDhM/Disney.png",
	2949: "https://i.postimg.cc/DwtM86Jj/Shudder.png",
	3186: "https://i.postimg.cc/QC78gRzh/HBO-max.png",
	3353: "https://i.postimg.cc/Kc38yM8g/Peacock.png",
	4330: "https://i.postimg.cc/QC78gRzZ/Paramount.png",
};
const networkFocusGifUrls = {
	213: "https://raw.githubusercontent.com/luckynumb3rs/stremio-perfect-setup/main/collections/assets/original/streaming/alternatives/netflix.gif",
	1024: "https://raw.githubusercontent.com/luckynumb3rs/stremio-perfect-setup/main/collections/assets/original/streaming/alternatives/prime-video.webp",
	1112: "https://raw.githubusercontent.com/luckynumb3rs/stremio-perfect-setup/main/collections/assets/original/streaming/alternatives/crunchyroll.gifv",
	2552: "https://raw.githubusercontent.com/luckynumb3rs/stremio-perfect-setup/main/collections/assets/original/streaming/alternatives/apple-tv.gifv",
	2739: "https://raw.githubusercontent.com/luckynumb3rs/stremio-perfect-setup/main/collections/assets/original/streaming/alternatives/disney-plus.gif",
	3186: "https://raw.githubusercontent.com/luckynumb3rs/stremio-perfect-setup/main/collections/assets/original/streaming/alternatives/hbo-max.gif",
	3353: "https://raw.githubusercontent.com/luckynumb3rs/stremio-perfect-setup/main/collections/assets/original/streaming/alternatives/peacock.gifv",
};

function createNuvioExportId(prefix) {
	if (window.crypto?.randomUUID) {
		return window.crypto.randomUUID();
	}

	return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
}

function getCompanyLogoUrl(company, size = "w500") {
	return company.logo_path ? `https://image.tmdb.org/t/p/${size}${company.logo_path}` : "";
}

function getNetworkLogoUrl(network, size = "w500") {
	return network.logo_path ? `https://image.tmdb.org/t/p/${size}${network.logo_path}` : "";
}

function getCompanyNuvioCoverUrl(company) {
	return curatedCompanyCoverUrls[Number(company.id)] || getCompanyLogoUrl(company);
}

function getNetworkNuvioCoverUrl(network) {
	return curatedNetworkCoverUrls[Number(network.id)] || getNetworkLogoUrl(network);
}

function getNetworkFocusGifUrl(network) {
	return networkFocusGifUrls[Number(network.id)] || "";
}

function getCompanyNuvioOptions() {
	return {
		collectionName: document.getElementById("company-nuvio-collection-name").value.trim() || "Studios",
		collectionCoverUrl: document.getElementById("company-nuvio-cover-url").value.trim(),
		useLogos: document.getElementById("company-nuvio-use-logos").checked,
	};
}

function getSelectedCompanyPresetName() {
	const selectedIds = [...selectedCompanyIds].map(Number);

	for (const [presetName, presetIds] of Object.entries(companySelectionPresets)) {
		if (selectedIds.length !== presetIds.length) {
			continue;
		}

		if (presetIds.every((id) => selectedCompanyIds.has(Number(id)))) {
			return presetName;
		}
	}

	return null;
}

function getCompanyDefaultCollectionName() {
	const presetName = getSelectedCompanyPresetName();

	return presetName ? companyPresetCollectionNames[presetName] : "Studios";
}

function createCompanyNuvioJson() {
	const options = getCompanyNuvioOptions();
	const folders = getSelectedCompanies().map((company) => ({
		id: createNuvioExportId("folder"),
		title: company.name,
		sources: [
			{
				title: company.name,
				sortBy: "popularity.desc",
				tmdbId: Number(company.id),
				filters: {},
				provider: "tmdb",
				mediaType: "MOVIE",
				tmdbSourceType: "COMPANY",
			},
		],
		hideTitle: options.useLogos,
		tileShape: "LANDSCAPE",
		coverEmoji: options.useLogos ? "" : "🎬",
		focusGifUrl: "",
		heroVideoUrl: "",
		titleLogoUrl: "",
		coverImageUrl: options.useLogos ? getCompanyNuvioCoverUrl(company) : "",
		catalogSources: [],
		focusGifEnabled: false,
		heroBackdropUrl: "",
	}));

	const collection = {
		id: createNuvioExportId("collection"),
		title: options.collectionName,
		folders,
		pinToTop: false,
		viewMode: "TABBED_GRID",
		showAllTab: false,
		backdropImageUrl: options.collectionCoverUrl,
		focusGlowEnabled: true,
	};

	return [collection];
}

function openCompanyNuvioExportModal() {
	const selectedCount = selectedCompanyIds.size;

	if (!selectedCount) {
		return;
	}

	const nameInput = document.getElementById("company-nuvio-collection-name");
	const defaultCollectionName = getCompanyDefaultCollectionName();

	if (!nameInput.value.trim() || companyDefaultCollectionNames.has(nameInput.value.trim())) {
		nameInput.value = defaultCollectionName;
	}

	document.getElementById("company-nuvio-export-summary").textContent =
		`This will create one ${nameInput.value.trim()} collection with ${selectedCount.toLocaleString()} folder${selectedCount === 1 ? "" : "s"}.`;
	openAppModal("company-nuvio-export-modal", nameInput);
}

function closeCompanyNuvioExportModal() {
	closeNuvioImportHelpModal();
	closeAppModal("company-nuvio-export-modal");
}

function downloadCompanyNuvioJson() {
	if (!selectedCompanyIds.size) {
		return;
	}

	const options = getCompanyNuvioOptions();
	const json = JSON.stringify(createCompanyNuvioJson(), null, "\t");
	const filename = `${String(options.collectionName || "studios")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "") || "studios"}.nuvio.json`;

	downloadTextFile(filename, `${json}\n`, "application/json");
}

function clearCompanySelection() {
	selectedCompanyIds.clear();
	render(getPageItems());
	updateCompanySelectionStatus();
	closeCompanyNuvioExportModal();
}

function selectCompanyPreset(presetName) {
	const presetIds = companySelectionPresets[presetName] || [];
	const availableIds = new Set(companies.map((company) => Number(company.id)));
	const selectableIds = presetIds.filter((id) => availableIds.has(Number(id))).map(Number);
	const shouldRemovePreset = selectableIds.length && selectableIds.every((id) => selectedCompanyIds.has(id));

	for (const id of selectableIds) {
		if (shouldRemovePreset) {
			selectedCompanyIds.delete(id);
		} else {
			selectedCompanyIds.add(id);
		}
	}

	render(getPageItems());
	updateCompanySelectionStatus();
}

function getSelectedNetworks() {
	return networks
		.filter((network) => selectedNetworkIds.has(Number(network.id)))
		.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
}

function getNetworkNuvioOptions() {
	return {
		collectionName: document.getElementById("network-nuvio-collection-name").value.trim() || "Networks",
		collectionCoverUrl: document.getElementById("network-nuvio-cover-url").value.trim(),
		useLogos: document.getElementById("network-nuvio-use-logos").checked,
		useFocusGifs: document.getElementById("network-nuvio-use-focus-gifs").checked,
	};
}

function getSelectedNetworkPresetName() {
	const selectedIds = [...selectedNetworkIds].map(Number);

	for (const [presetName, presetIds] of Object.entries(networkSelectionPresets)) {
		if (selectedIds.length !== presetIds.length) {
			continue;
		}

		if (presetIds.every((id) => selectedNetworkIds.has(Number(id)))) {
			return presetName;
		}
	}

	return null;
}

function getNetworkDefaultCollectionName() {
	const presetName = getSelectedNetworkPresetName();

	return presetName ? networkPresetCollectionNames[presetName] : "Networks";
}

function createNetworkNuvioJson() {
	const options = getNetworkNuvioOptions();
	const folders = getSelectedNetworks().map((network) => ({
		id: createNuvioExportId("folder"),
		title: network.name,
		sources: [
			{
				title: network.name,
				sortBy: "popularity.desc",
				tmdbId: Number(network.id),
				filters: {},
				provider: "tmdb",
				mediaType: "TV",
				tmdbSourceType: "NETWORK",
			},
		],
		hideTitle: options.useLogos,
		tileShape: "LANDSCAPE",
		coverEmoji: options.useLogos ? "" : "📺",
		focusGifUrl: options.useFocusGifs ? getNetworkFocusGifUrl(network) : "",
		heroVideoUrl: "",
		titleLogoUrl: "",
		coverImageUrl: options.useLogos ? getNetworkNuvioCoverUrl(network) : "",
		catalogSources: [],
		focusGifEnabled: Boolean(options.useFocusGifs && getNetworkFocusGifUrl(network)),
		heroBackdropUrl: "",
	}));

	const collection = {
		id: createNuvioExportId("collection"),
		title: options.collectionName,
		folders,
		pinToTop: false,
		viewMode: "TABBED_GRID",
		showAllTab: false,
		backdropImageUrl: options.collectionCoverUrl,
		focusGlowEnabled: true,
	};

	return [collection];
}

function openNetworkNuvioExportModal() {
	const selectedCount = selectedNetworkIds.size;

	if (!selectedCount) {
		return;
	}

	const nameInput = document.getElementById("network-nuvio-collection-name");
	const defaultCollectionName = getNetworkDefaultCollectionName();

	if (!nameInput.value.trim() || networkDefaultCollectionNames.has(nameInput.value.trim())) {
		nameInput.value = defaultCollectionName;
	}

	document.getElementById("network-nuvio-export-summary").textContent =
		`This will create one ${nameInput.value.trim()} collection with ${selectedCount.toLocaleString()} folder${selectedCount === 1 ? "" : "s"}.`;
	openAppModal("network-nuvio-export-modal", nameInput);
}

function closeNetworkNuvioExportModal() {
	closeNuvioImportHelpModal();
	closeAppModal("network-nuvio-export-modal");
}

function downloadNetworkNuvioJson() {
	if (!selectedNetworkIds.size) {
		return;
	}

	const options = getNetworkNuvioOptions();
	const json = JSON.stringify(createNetworkNuvioJson(), null, "\t");
	const filename = `${String(options.collectionName || "networks")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "") || "networks"}.nuvio.json`;

	downloadTextFile(filename, `${json}\n`, "application/json");
}

function clearNetworkSelection() {
	selectedNetworkIds.clear();
	renderNetworks(getNetworkPageItems());
	updateNetworkSelectionStatus();
	closeNetworkNuvioExportModal();
}

function selectNetworkPreset(presetName) {
	const presetIds = networkSelectionPresets[presetName] || [];
	const availableIds = new Set(networks.map((network) => Number(network.id)));
	const selectableIds = presetIds.filter((id) => availableIds.has(Number(id))).map(Number);
	const shouldRemovePreset = selectableIds.length && selectableIds.every((id) => selectedNetworkIds.has(id));

	for (const id of selectableIds) {
		if (shouldRemovePreset) {
			selectedNetworkIds.delete(id);
		} else {
			selectedNetworkIds.add(id);
		}
	}

	renderNetworks(getNetworkPageItems());
	updateNetworkSelectionStatus();
}

function updateCompanyPresetButtons() {
	document.querySelectorAll(".company-preset-button").forEach((button) => {
		const presetIds = companySelectionPresets[button.dataset.companyPreset] || [];
		const isActive = presetIds.length && presetIds.every((id) => selectedCompanyIds.has(Number(id)));

		button.classList.toggle("active", Boolean(isActive));
		button.setAttribute("aria-pressed", String(Boolean(isActive)));
	});
}

function updateNetworkPresetButtons() {
	document.querySelectorAll(".network-preset-button").forEach((button) => {
		const presetIds = networkSelectionPresets[button.dataset.networkPreset] || [];
		const isActive = presetIds.length && presetIds.every((id) => selectedNetworkIds.has(Number(id)));

		button.classList.toggle("active", Boolean(isActive));
		button.setAttribute("aria-pressed", String(Boolean(isActive)));
	});
}
