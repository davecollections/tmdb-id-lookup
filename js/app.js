function setActiveCachedTab(tabName, options = {}) {
	document.querySelectorAll(".cached-tab-button").forEach((button) => {
		const isActive = button.dataset.cachedTab === tabName;

		button.classList.toggle("active", isActive);
		button.setAttribute("aria-selected", String(isActive));
	});

	document.querySelectorAll(".cached-tab-panel").forEach((panel) => {
		panel.classList.toggle("active", panel.dataset.cachedPanel === tabName);
	});

	if (options.load !== false && typeof ensureCachedLookupDataForTab === "function") {
		ensureCachedLookupDataForTab(tabName);
	}
}

function setActiveBulkTab(tabName) {
	document.querySelectorAll(".bulk-tab-button").forEach((button) => {
		const isActive = button.dataset.bulkTab === tabName;

		button.classList.toggle("active", isActive);
		button.setAttribute("aria-selected", String(isActive));
	});

	document.querySelectorAll(".bulk-tab-panel").forEach((panel) => {
		const isActive = panel.dataset.bulkPanel === tabName;

		panel.classList.toggle("active", isActive);
		panel.hidden = !isActive;
	});
}

function initBulkLookupTabs() {
	document.querySelectorAll(".bulk-tab-button").forEach((button) => {
		button.addEventListener("click", () => {
			setActiveBulkTab(button.dataset.bulkTab || "people");
		});
	});

	setActiveBulkTab("people");
}

document.querySelectorAll(".cached-tab-button").forEach((button) => {
	button.addEventListener("click", () => {
		setActiveCachedTab(button.dataset.cachedTab || "companies");
	});
});

document.getElementById("back-to-top").addEventListener("click", () => {
	window.scrollTo({
		top: 0,
		behavior: "smooth",
	});
});

function runAppInitializer(name, initializer) {
	try {
		initializer();
	} catch (error) {
		console.error(`${name} failed to initialize`, error);
	}
}

setActiveCachedTab("companies", { load: false });

runAppInitializer("Modal system", initAppModalSystem);
runAppInitializer("Cached lookups", initCachedLookups);
runAppInitializer("Top TMDB lookup", initTmdbLookup);
runAppInitializer("Genre lookup", initGenreLookup);
runAppInitializer("Bulk people lookup", initBulkPeopleLookup);
runAppInitializer("Bulk lookup tabs", initBulkLookupTabs);
runAppInitializer("Bulk media lookup", () => {
	if (typeof window.initBulkMediaLookup === "function") {
		window.initBulkMediaLookup();
	}
});
