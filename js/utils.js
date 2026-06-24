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

function copyText(text) {
	if (navigator.clipboard?.writeText) {
		navigator.clipboard.writeText(String(text));
		showCopyToast();
		return;
	}

	const textarea = document.createElement("textarea");
	textarea.value = String(text);
	textarea.setAttribute("readonly", "");
	textarea.style.position = "fixed";
	textarea.style.left = "-9999px";
	document.body.appendChild(textarea);
	textarea.select();
	document.execCommand("copy");
	textarea.remove();
	showCopyToast();
}

function copyId(id) {
	copyText(id);
}

function createNuvioId(prefix = "id") {
	if (window.crypto?.randomUUID) {
		return window.crypto.randomUUID();
	}

	if (window.crypto?.getRandomValues) {
		const bytes = new Uint8Array(16);
		window.crypto.getRandomValues(bytes);
		bytes[6] = (bytes[6] & 0x0f) | 0x40;
		bytes[8] = (bytes[8] & 0x3f) | 0x80;
		const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

		return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
	}

	return `${prefix}-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

function createNuvioIdFactory(existingIds = []) {
	const seenIds = new Set([...existingIds].map((id) => String(id || "").trim()).filter(Boolean));

	return {
		add(id) {
			const value = String(id || "").trim();

			if (!value || seenIds.has(value)) {
				return false;
			}

			seenIds.add(value);
			return true;
		},
		create(prefix) {
			let id = createNuvioId(prefix);

			while (seenIds.has(id)) {
				id = createNuvioId(prefix);
			}

			seenIds.add(id);
			return id;
		},
		has(id) {
			return seenIds.has(String(id || "").trim());
		},
	};
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
				rel: "noopener noreferrer",
			},
		}),
	]);
}
