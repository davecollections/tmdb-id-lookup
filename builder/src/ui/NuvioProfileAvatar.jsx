import { useExactUrlPreviewFailure } from "./exact-url-preview.js";

export function NuvioProfileAvatar({ profile }) {
	const preview = useExactUrlPreviewFailure(profile.avatarUrl);
	const initials = profile.name.trim().split(/\s+/u).slice(0, 2).map((word) => [...word][0]).join("").toLocaleUpperCase();
	return <span className="nuvio-avatar" aria-hidden="true" style={profile.avatarColor ? { backgroundColor: profile.avatarColor } : undefined}>
		{profile.avatarUrl && !preview.failed ? <img src={profile.avatarUrl} alt="" referrerPolicy="no-referrer" onError={preview.markFailed} /> : <span>{initials}</span>}
	</span>;
}
