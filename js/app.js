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
setActiveCachedTab("companies", { load: false });
initAppModalSystem();
initCachedLookups();
initTmdbLookup();
initGenreLookup();
initBulkPeopleLookup();
