// Independently authored from the upstream evidence recorded in BUILDER_EXPORT.md.
const replacementWarning = "Import replaces the complete Collection list in the current profile. Collections not included in the imported JSON may be lost. Save your existing Collections first if needed.";

export const NUVIO_IMPORT_ARTWORK_HELP = {
	title: "Missing artwork or title details?", optional: true,
	paragraphs: [
		"After importing, TMDB Enrichment may help Nuvio display artwork and title details. In the Nuvio app, go to Settings → Integrations → TMDB and enable TMDB Enrichment, where available.",
		"TMDB Enrichment is optional and isn't required to import Collections.",
	],
};

export const NUVIO_IMPORT_GUIDES = [
	{
		id: "web", title: "Nuvio.tv", description: "Import JSON through your browser.",
		consequence: { title: "Choose how to import", text: "Add as new keeps your existing Collections. Merge combines Collections by ID. Overwrite replaces the complete Collection list in the selected profile." },
		steps: ["Download JSON from Dingo.", "Sign in to Nuvio.tv.", "Select the intended profile and open Collections.", "Choose Import and select the downloaded JSON file.", "Choose Add as new, Merge or Overwrite.", "Review and confirm the operation."],
		link: { step: 1, text: "Nuvio.tv", href: "https://nuvio.tv/" },
		sections: [
			{ title: "Import modes", items: [
				{ title: "Add as new", text: "Keep existing Collections and add the imported ones. Nuvio resolves conflicting Collection IDs so they can coexist." },
				{ title: "Merge", text: "Match Collection IDs, append incoming folders and skip Sources Nuvio recognises as duplicates. It does not combine folders by name." },
				{ title: "Overwrite", text: "Replace the complete Collection list in the selected profile. Save your existing Collections first if needed; Collections outside the imported JSON will be removed." },
			] },
			{ title: "Merging in Dingo", paragraphs: ["Dingo’s local Import/Merge can combine data using exact names before you Export or Send. It is separate from Nuvio.tv’s Collection-ID-based Merge. Dingo Send replaces the complete Collection list on the selected Nuvio profile."] },
		],
	},
	{
		id: "tv", title: "Android TV / Google TV", description: "Import from Downloads or a JSON URL.",
		consequence: { title: "Matching Collections are replaced", text: "New Collection IDs are added. If an imported Collection has the same ID as an existing Collection, that entire Collection is replaced, including its folders and Sources." },
		steps: ["Download JSON from Dingo.", "Rename the downloaded file to exactly nuvio-collections.json.", "Transfer it to the TV device’s Downloads folder.", "Open Nuvio with the intended profile.", "Go to Settings → Content & Discovery → Addons → Collections → Import.", "Choose From File → Load File.", "Review the import and confirm."],
		sections: [
			{ title: "From URL (optional)", paragraphs: ["In Collections → Import, choose From URL. Enter the direct URL of a hosted JSON file, load it, then review and confirm the import.", "Dingo does not generate a hosted JSON URL."] },
		],
	},
	{
		id: "mobile", title: "Android Mobile", description: "Paste JSON into the mobile app.",
		consequence: { title: "Your Collection list will be replaced", text: replacementWarning },
		steps: ["In Nuvio, copy your existing Collections JSON and paste/save it somewhere safe, such as a note or file.", "In Dingo, choose Copy JSON.", "Select the intended profile in the Nuvio mobile app.", "Open Settings → Appearance → Collections.", "Tap the Import icon.", "Paste the complete JSON and confirm Import."],
		sections: [{ title: "If you are signed in", paragraphs: ["Imported Collections can sync to your Nuvio account and other devices using this profile. Check the intended profile before importing."] }],
	},
	{
		id: "desktop", title: "Desktop", description: "Paste JSON into the desktop app.",
		consequence: { title: "Your Collection list will be replaced", text: replacementWarning },
		steps: ["In Nuvio, copy your existing Collections JSON and paste/save it somewhere safe, such as a note or file.", "In Dingo, choose Copy JSON.", "Select the intended profile in the Nuvio desktop app.", "Open Settings → Appearance → Collections.", "Click the Import icon.", "Paste the complete JSON and click Import."],
		sections: [{ title: "If you are signed in", paragraphs: ["Imported Collections can sync to your Nuvio account and other devices using this profile. Check the intended profile before importing."] }],
	},
];
