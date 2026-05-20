function parseCsvRows(csvText) {
	const rows = [];
	let row = [];
	let value = "";
	let inQuotes = false;

	for (let index = 0; index < csvText.length; index += 1) {
		const character = csvText[index];
		const nextCharacter = csvText[index + 1];

		if (character === '"' && inQuotes && nextCharacter === '"') {
			value += '"';
			index += 1;
			continue;
		}

		if (character === '"') {
			inQuotes = !inQuotes;
			continue;
		}

		if (character === "," && !inQuotes) {
			row.push(value);
			value = "";
			continue;
		}

		if ((character === "\n" || character === "\r") && !inQuotes) {
			if (character === "\r" && nextCharacter === "\n") {
				index += 1;
			}

			row.push(value);
			rows.push(row);
			row = [];
			value = "";
			continue;
		}

		value += character;
	}

	row.push(value);
	rows.push(row);

	return rows
		.map((cells) => cells.map((cell) => String(cell || "").replace(/^\uFEFF/, "").trim()))
		.filter((cells) => cells.some(Boolean));
}

function getCsvNameColumnIndex(headerRow) {
	const preferredHeaders = [
		"name",
		"person",
		"people",
		"actor",
		"actors",
		"director",
		"directors",
		"personname",
		"peoplename",
		"actorname",
		"directorname",
		"fullname",
	];

	return headerRow.findIndex((header) =>
		preferredHeaders.includes(
			String(header || "")
				.trim()
				.toLowerCase()
				.replace(/[^a-z]+/g, ""),
		),
	);
}

function getCsvColumnIndex(headerRow, columnNames) {
	return headerRow.findIndex((header) =>
		columnNames.includes(
			String(header || "")
				.trim()
				.toLowerCase()
				.replace(/[^a-z]+/g, ""),
		),
	);
}

function setIncompleteNameWarning(isVisible) {
	document.getElementById("bulk-people-name-warning").hidden = !isVisible;
}

function isLikelyIncompleteName(name) {
	return !String(name || "").trim().includes(" ");
}

function looksLikePersonName(value) {
	return String(value || "").trim().includes(" ");
}

function looksLikePersonNameListItem(value) {
	const name = String(value || "").trim();

	if (name.length < 2 || name.length > 80) {
		return false;
	}

	if (/https?:\/\/|www\.|@|[<>={}[\]\\|;]/i.test(name)) {
		return false;
	}

	if (/\b(function|const|let|class|import|export|return|doctype|html|body|script|style)\b/i.test(name)) {
		return false;
	}

	if (!/\p{L}/u.test(name)) {
		return false;
	}

	if (!/^[\p{L}\p{M}0-9 .,'’`-]+$/u.test(name)) {
		return false;
	}

	return name.split(/\s+/).filter(Boolean).length <= 6;
}

function looksLikePersonNameList(names) {
	const sample = names.slice(0, BULK_PEOPLE_LIMIT);

	if (!sample.length) {
		return false;
	}

	const likelyCount = sample.filter(looksLikePersonNameListItem).length;
	const requiredCount = sample.length < 5 ? sample.length : Math.ceil(sample.length * 0.65);

	return likelyCount >= requiredCount;
}

function looksLikeMarkupOrCodeFileText(text) {
	const trimmedText = String(text || "").trim();
	const lowerStart = trimmedText.slice(0, 4000).toLowerCase();

	if (!trimmedText) {
		return false;
	}

	if (
		lowerStart.startsWith("<!doctype") ||
		lowerStart.startsWith("<html") ||
		lowerStart.startsWith("<?xml") ||
		lowerStart.includes("<head") ||
		lowerStart.includes("<body") ||
		lowerStart.includes("<script") ||
		lowerStart.includes("<style")
	) {
		return true;
	}

	const htmlTagMatches = lowerStart.match(/<\/?[a-z][^>]{0,120}>/g) || [];

	return htmlTagMatches.length >= 3;
}

function hasLikelyIncompleteName(names) {
	return names.some(isLikelyIncompleteName);
}

function getIncompleteNameSet(names) {
	return new Set(names.filter(isLikelyIncompleteName));
}

function limitIncompleteNamesToBatch(names) {
	lastBulkPeopleIncompleteInputs = new Set(
		[...lastBulkPeopleIncompleteInputs].filter((name) => names.includes(name)),
	);
	setIncompleteNameWarning(lastBulkPeopleIncompleteInputs.size > 0);
}

function updateIncompleteInputsFromNames(names) {
	lastBulkPeopleIncompleteInputs = getIncompleteNameSet(names);
	setIncompleteNameWarning(lastBulkPeopleIncompleteInputs.size > 0);
}

function getBulkPeopleMatchStatus(matchType, hasIncompleteInput) {
	return hasIncompleteInput ? "Incomplete name - check match" : matchType;
}

function getNamesFromCsvText(csvText) {
	const rows = parseCsvRows(csvText);

	if (!rows.length) {
		return {
			hasIncompleteNames: false,
			names: [],
		};
	}

	if (rows.length === 1) {
		const names = rows[0].map((name) => String(name || "").trim()).filter(Boolean);

		return {
			hasIncompleteNames: hasLikelyIncompleteName(names),
			incompleteNames: getIncompleteNameSet(names),
			names,
		};
	}

	const nameColumnIndex = getCsvNameColumnIndex(rows[0]);
	const shouldUseNameColumn = nameColumnIndex >= 0 && !(nameColumnIndex > 0 && looksLikePersonName(rows[0][0]));

	if (shouldUseNameColumn) {
		const names = rows
			.slice(1)
			.map((row) => row[nameColumnIndex])
			.map((name) => String(name || "").trim())
			.filter(Boolean);

		return {
			hasIncompleteNames: hasLikelyIncompleteName(names),
			incompleteNames: getIncompleteNameSet(names),
			names,
		};
	}

	const firstNameColumnIndex = getCsvColumnIndex(rows[0], [
		"first",
		"firstname",
		"forename",
		"given",
		"givenname",
	]);
	const lastNameColumnIndex = getCsvColumnIndex(rows[0], [
		"family",
		"familyname",
		"last",
		"lastname",
		"surname",
	]);

	if (firstNameColumnIndex >= 0 || lastNameColumnIndex >= 0) {
		let hasIncompleteNames = false;
		const incompleteNames = new Set();
		const names = rows
			.slice(1)
			.map((row) => {
				const firstName = String(row[firstNameColumnIndex] || "").trim();
				const lastName = String(row[lastNameColumnIndex] || "").trim();

				if ((firstName && !lastName) || (!firstName && lastName)) {
					hasIncompleteNames = true;
				}

				const name = [firstName, lastName].filter(Boolean).join(" ");

				if ((firstName && !lastName) || (!firstName && lastName) || isLikelyIncompleteName(name)) {
					incompleteNames.add(name);
				}

				return name;
			})
			.filter(Boolean);

		return {
			hasIncompleteNames: hasIncompleteNames || hasLikelyIncompleteName(names),
			incompleteNames,
			names,
		};
	}

	const names = rows
		.map((row) => row[0])
		.map((name) => String(name || "").trim())
		.filter(Boolean);

	return {
		hasIncompleteNames: hasLikelyIncompleteName(names),
		incompleteNames: getIncompleteNameSet(names),
		names,
	};
}

function getBulkPeopleNames() {
	const inputText = document.getElementById("bulk-people-input").value;

	if (inputText.includes(",") || inputText.includes('"')) {
		const csvResult = getNamesFromCsvText(inputText);

		setIncompleteNameWarning(csvResult.hasIncompleteNames);
		lastBulkPeopleIncompleteInputs = csvResult.incompleteNames || new Set();

		if (csvResult.names.length) {
			return csvResult.names;
		}
	}

	setIncompleteNameWarning(false);
	lastBulkPeopleIncompleteInputs = new Set();

	const names = inputText
		.split("\n")
		.map((name) => name.trim())
		.filter(Boolean);

	updateIncompleteInputsFromNames(names);

	return names;
}

function isSupportedBulkPeopleFile(file) {
	const filename = String(file.name || "").toLowerCase();
	const mimeType = String(file.type || "").toLowerCase();
	const hasSupportedExtension = filename.endsWith(".csv") || filename.endsWith(".txt");
	const hasSupportedMimeType = ["text/csv", "text/plain", "application/vnd.ms-excel"].includes(mimeType);

	return hasSupportedExtension || hasSupportedMimeType;
}

function looksLikeJsonFileText(text) {
	const trimmedText = String(text || "").trim();

	if (!trimmedText || !["[", "{"].includes(trimmedText[0])) {
		return false;
	}

	try {
		JSON.parse(trimmedText);
		return true;
	} catch {
		return false;
	}
}

function rejectBulkPeopleFile(message) {
	document.getElementById("bulk-people-csv-file").value = "";
	document.getElementById("bulk-people-csv-name").textContent = "No file selected";
	setIncompleteNameWarning(false);
	lastBulkPeopleIncompleteInputs = new Set();
	document.getElementById("bulk-people-status").innerText = message;
}

function loadBulkPeopleCsvFile(file) {
	const status = document.getElementById("bulk-people-status");

	if (!file) {
		return;
	}

	if (!isSupportedBulkPeopleFile(file)) {
		rejectBulkPeopleFile("Unsupported file type. Choose a CSV or TXT file with person names.");
		return;
	}

	const reader = new FileReader();

	reader.addEventListener("load", () => {
		const fileText = String(reader.result || "");
		const fileName = document.getElementById("bulk-people-csv-name");

		if (looksLikeJsonFileText(fileText)) {
			rejectBulkPeopleFile("That file looks like JSON. Choose a CSV or TXT file with person names, or paste CSV text instead.");
			return;
		}

		if (looksLikeMarkupOrCodeFileText(fileText)) {
			rejectBulkPeopleFile("That file looks like HTML or code. Choose a CSV or TXT file containing person names.");
			return;
		}

		const csvResult = getNamesFromCsvText(fileText);

		fileName.textContent = file.name;
		setIncompleteNameWarning(csvResult.hasIncompleteNames);
		lastBulkPeopleIncompleteInputs = csvResult.incompleteNames || new Set();

		if (!csvResult.names.length) {
			status.innerText =
				"No people names were found. Use a name, person, actor, director, or first/last name column, or put names in the first column.";
			return;
		}

		if (!looksLikePersonNameList(csvResult.names)) {
			rejectBulkPeopleFile(
				"That file does not look like a person-name list. Use one name per line, a name/person column, or first and last name columns.",
			);
			return;
		}

		const namesToUse = csvResult.names.slice(0, BULK_PEOPLE_LIMIT);
		const extraCount = csvResult.names.length - namesToUse.length;

		limitIncompleteNamesToBatch(namesToUse);
		document.getElementById("bulk-people-input").value = namesToUse.join("\n");

		if (extraCount > 0) {
			lastBulkPeopleBatchMessage = `More than ${BULK_PEOPLE_LIMIT} names were provided, matching the first ${BULK_PEOPLE_LIMIT} of ${csvResult.names.length} names. Last included: ${
				namesToUse[namesToUse.length - 1]
			}. Start the next batch after that name.`;
			status.innerText = lastBulkPeopleBatchMessage;
			return;
		}

		lastBulkPeopleBatchMessage = "";
		status.innerText = `Loaded ${csvResult.names.length} names from ${file.name}.`;
	});

	reader.addEventListener("error", () => {
		status.innerText = "Could not read that CSV or TXT file.";
	});

	reader.readAsText(file);
}
