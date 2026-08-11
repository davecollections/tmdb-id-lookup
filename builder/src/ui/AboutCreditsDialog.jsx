import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import justWatchMark from "../assets/justwatch-mark-gold.svg";
import tmdbLogo from "../assets/tmdb-logo-square.svg";
import {
	lockAddSourceDocumentBody,
	observeAddSourceViewport,
	resolveAddSourceViewportStyle,
} from "./add-source-modal-lifecycle.js";
import { focusElementWithoutScroll } from "./hierarchy-menu-placement.js";
import { handleDialogKeyDown } from "./modal-focus.js";

const usePrePaintLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function AboutCreditsDialog({ onClose }) {
	const dialogRef = useRef(null);
	const closeButtonRef = useRef(null);
	const [viewportStyle, setViewportStyle] = useState(() => (
		typeof window === "undefined" ? null : resolveAddSourceViewportStyle(window)
	));

	usePrePaintLayoutEffect(() => {
		const unlockBody = lockAddSourceDocumentBody();
		const stopObservingViewport = observeAddSourceViewport(setViewportStyle);
		focusElementWithoutScroll(closeButtonRef.current ?? dialogRef.current);
		return () => {
			stopObservingViewport();
			unlockBody();
		};
	}, []);

	const content = (
		<div className="about-credits-portal" data-about-credits-portal="true">
			<div
				className="settings-modal-backdrop about-credits-backdrop"
				data-about-credits-backdrop="true"
				data-backdrop-dismiss="false"
				style={viewportStyle ?? undefined}
				onMouseDown={(event) => {
					if (event.target === event.currentTarget) {
						event.preventDefault();
						focusElementWithoutScroll(dialogRef.current);
					}
				}}
			>
				<section
					ref={dialogRef}
					className="about-credits-dialog"
					data-about-credits-dialog="true"
					role="dialog"
					aria-modal="true"
					aria-labelledby="about-credits-title"
					tabIndex={-1}
					onKeyDown={(event) => handleDialogKeyDown(event, dialogRef.current, onClose)}
				>
					<header className="about-credits-heading">
						<h2 id="about-credits-title">About &amp; Credits</h2>
						<button
							ref={closeButtonRef}
							className="about-credits-close"
							type="button"
							aria-label="Close About & Credits"
							onClick={onClose}
						>
							Close
						</button>
					</header>
					<div className="about-credits-content">
						<section className="about-credits-attributions" aria-label="Data credits">
							<div className="about-credit-row">
								<a
									className="about-credit-link"
									href="https://www.themoviedb.org/"
									target="_blank"
									rel="noopener noreferrer"
									aria-label="Visit TMDB"
								>
									<img
										className="about-credit-logo tmdb-credit-logo"
										src={tmdbLogo}
										alt="TMDB"
										width="36"
										height="26"
									/>
								</a>
								<div className="about-credit-copy">
									<p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
								</div>
							</div>
							<div className="about-credit-row">
								<a
									className="about-credit-link"
									href="https://www.justwatch.com/"
									target="_blank"
									rel="noopener noreferrer"
									aria-label="Visit JustWatch"
								>
									<img
										className="about-credit-logo justwatch-credit-logo"
										src={justWatchMark}
										alt="JustWatch"
										width="28"
										height="28"
									/>
								</a>
								<div className="about-credit-copy">
									<p>Streaming provider availability data supplied by JustWatch via TMDB.</p>
								</div>
							</div>
						</section>
						<footer className="about-credits-footer">
							<p className="about-credits-creator">
								Created by{" "}
								<a
									href="https://github.com/davecollections"
									target="_blank"
									rel="noopener noreferrer"
								>
									<svg
										className="about-credits-github-mark"
										width="16"
										height="16"
										viewBox="0 0 16 16"
										aria-hidden="true"
									>
										<path d="M6.766 11.328c-2.063-.25-3.516-1.734-3.516-3.656 0-.781.281-1.625.75-2.188-.203-.515-.172-1.609.063-2.062.625-.078 1.468.25 1.968.703.594-.187 1.219-.281 1.985-.281.765 0 1.39.094 1.953.265.484-.437 1.344-.765 1.969-.687.218.422.25 1.515.046 2.047.5.593.766 1.39.766 2.203 0 1.922-1.453 3.375-3.547 3.64.531.344.89 1.094.89 1.954v1.625c0 .468.391.734.86.547C13.781 14.359 16 11.53 16 8.03 16 3.61 12.406 0 7.984 0 3.563 0 0 3.61 0 8.031a7.88 7.88 0 0 0 5.172 7.422c.422.156.828-.125.828-.547v-1.25c-.219.094-.5.156-.75.156-1.031 0-1.64-.562-2.078-1.609-.172-.422-.36-.672-.719-.719-.187-.015-.25-.093-.25-.187 0-.188.313-.328.625-.328.453 0 .844.281 1.25.86.313.452.64.655 1.031.655s.641-.14 1-.5c.266-.265.47-.5.657-.656" />
									</svg>
									davecollections
								</a>
							</p>
							<nav className="about-credits-links" aria-label="About links">
								<a href="../">TMDB ID Lookup Tool</a>
								<a
									href="https://github.com/davecollections/tmdb-id-lookup/issues/new/choose"
									target="_blank"
									rel="noopener noreferrer"
								>
									Feedback / report an issue
								</a>
							</nav>
							<p className="about-credits-independence">
								Independent community tool for Nuvio collections. Not affiliated with or endorsed by Nuvio.
							</p>
						</footer>
					</div>
				</section>
			</div>
		</div>
	);

	return typeof document === "undefined" ? content : createPortal(content, document.body);
}
