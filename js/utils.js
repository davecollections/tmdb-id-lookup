function getCountrySearchText(countryCode) {
	const code = String(countryCode || "")
		.trim()
		.toUpperCase();

	if (!code) {
		return "";
	}

	const countryName = countryDisplayNames?.of(code) || "";
	const aliases = countrySearchAliases[code] || [];

	return [code, countryName, ...aliases].join(" ").toLowerCase();
}

function showCopyToast() {
	const toast = document.getElementById("copy-toast");

	toast.classList.add("show");

	clearTimeout(window.copyToastTimeout);

	window.copyToastTimeout = setTimeout(() => {
		toast.classList.remove("show");
	}, 1800);
}

function copyId(id) {
	navigator.clipboard.writeText(String(id));
	showCopyToast();
}

function csvEscape(value) {
	const text = String(value ?? "");

	if (/[",\n\r]/.test(text)) {
		return `"${text.replaceAll('"', '""')}"`;
	}

	return text;
}

function downloadTextFile(filename, content, mimeType = "text/csv") {
	const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");

	link.href = url;
	link.download = filename;
	link.click();

	URL.revokeObjectURL(url);
}

function createElement(tagName, options = {}, children = []) {
	const element = document.createElement(tagName);

	if (options.className) {
		element.className = options.className;
	}

	if (options.text !== undefined) {
		element.textContent = String(options.text);
	}

	for (const [name, value] of Object.entries(options.attrs || {})) {
		element.setAttribute(name, String(value));
	}

	for (const child of children) {
		if (child !== null && child !== undefined) {
			element.appendChild(child);
		}
	}

	return element;
}

function createOpenLinkCell(url) {
	return createElement("td", {}, [
		createElement("a", {
			text: "Open",
			attrs: {
				href: url,
				target: "_blank",
				rel: "noopener",
			},
		}),
	]);
}
