// Prepare without initiating. A successful click only proves browser initiation,
// never file retention. Each utility invocation owns and releases one resource.
export function prepareJsonDownload({ json, filename }, {
	document = globalThis.document, url = globalThis.URL, BlobType = globalThis.Blob,
} = {}) {
	if (typeof json !== "string" || typeof filename !== "string" || !filename) throw new TypeError("JSON and a filename are required.");
	const objectUrl = url.createObjectURL(new BlobType([json], { type: "application/json;charset=utf-8" }));
	let link;
	try {
		link = document.createElement("a");
		link.href = objectUrl; link.download = filename; link.hidden = true;
	} catch (error) { url.revokeObjectURL(objectUrl); throw error; }
	let used = false;
	let released = false;
	let disposed = false;
	function release() {
		if (released) return;
		released = true;
		url.revokeObjectURL(objectUrl);
	}
	return Object.freeze({
		initiate() {
			if (disposed || released || used) return false;
			used = true;
			try { document.body.append(link); link.click(); }
			finally { try { link.remove(); } finally { setTimeout(release, 0); } }
			return true;
		},
		dispose() { disposed = true; if (used) setTimeout(release, 0); else release(); },
	});
}
