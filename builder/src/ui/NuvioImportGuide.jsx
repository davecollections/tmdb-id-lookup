import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { focusElementWithoutScroll } from "./hierarchy-menu-placement.js";
import { NUVIO_IMPORT_ARTWORK_HELP, NUVIO_IMPORT_GUIDES } from "./nuvio-import-guide-content.js";
import "./nuvio-import-guide.css";

const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;

function GuideSection({ section, open, onToggle }) {
	const body = <>{section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}{section.items ? <dl>{section.items.map((item) => <div key={item.title}><dt>{item.title}</dt><dd>{item.text}</dd></div>)}</dl> : null}</>;
	return section.optional ? <details className="nuvio-guide-section" open={open} onToggle={onToggle}><summary tabIndex={0}>{section.title}</summary>{body}</details> : <section className={section.items ? "nuvio-guide-section nuvio-guide-reference" : "nuvio-guide-section"}><h3>{section.title}</h3>{body}</section>;
}

export function NuvioImportGuideEntry({ onClick, ref }) {
	return <button ref={ref} type="button" className="nuvio-guide-entry" data-action="open-import-guide" onClick={onClick}>
		<span><strong>How to import into Nuvio</strong><small>Instructions for your Nuvio app or the website.</small></span><span aria-hidden="true">›</span>
	</button>;
}

// Contents only: the caller retains its dialog, focus trap, body lock and session.
export function NuvioImportGuide({ titleId, hostTitle, onBack, onClose }) {
	const [platform, setPlatform] = useState(null);
	const [artworkOpen, setArtworkOpen] = useState(false);
	const headingRef = useRef(null);
	const scrollRef = useRef(null);
	const platformRefs = useRef({});
	const chooserReturn = useRef(null);
	const guide = NUVIO_IMPORT_GUIDES.find((item) => item.id === platform);
	useBeforePaint(() => {
		if (!platform && chooserReturn.current) {
			const previous = chooserReturn.current; chooserReturn.current = null;
			scrollRef.current.scrollTop = previous.top;
			focusElementWithoutScroll(platformRefs.current[previous.id]);
		} else {
			scrollRef.current.scrollTop = 0;
			focusElementWithoutScroll(headingRef.current);
		}
	}, [platform]);
	function choose(id) {
		chooserReturn.current = { id, top: scrollRef.current.scrollTop };
		setPlatform(id);
	}
	return <>
		<header className="nuvio-guide-header">
			<div className="nuvio-guide-navigation"><button type="button" data-action="import-guide-back" aria-label={guide ? "Back to platform selection" : "Back to " + hostTitle} onClick={() => guide ? setPlatform(null) : onBack()}>Back</button><button type="button" data-action="import-guide-close" aria-label={"Close " + hostTitle} onClick={onClose}>Close</button></div>
			<h2 id={titleId} ref={headingRef} tabIndex={-1}>{guide?.title ?? "How to import into Nuvio"}</h2>
		</header>
		<div className="nuvio-guide-content dingo-scrollbar" ref={scrollRef} role="region" aria-label={guide ? guide.title + " import instructions" : "Choose your Nuvio platform"} tabIndex={0} data-import-platform={platform ?? "chooser"}>
			{guide ? <>
				<section className="nuvio-guide-consequence"><h3>{guide.consequence.title}</h3><p>{guide.consequence.text}</p></section>
				<ol className="nuvio-guide-steps">{guide.steps.map((step, index) => <li key={step}>{guide.link?.step === index ? <>Sign in to <a href={guide.link.href} target="_blank" rel="noopener noreferrer" aria-label={guide.link.text + " (opens in a new tab)"}>{guide.link.text}</a>.</> : step}</li>)}</ol>
				{guide.sections.map((section) => <GuideSection key={section.title} section={section} />)}
			</> : <>
				<p>Choose where you use Nuvio.</p>
				<div className="nuvio-guide-platforms">{NUVIO_IMPORT_GUIDES.map((item) => <button key={item.id} type="button" data-guide-platform={item.id} ref={(node) => { platformRefs.current[item.id] = node; }} onClick={() => choose(item.id)}><span><strong>{item.title}</strong><small>{item.description}</small></span><span aria-hidden="true">›</span></button>)}</div>
				<GuideSection section={NUVIO_IMPORT_ARTWORK_HELP} open={artworkOpen} onToggle={(event) => setArtworkOpen(event.currentTarget.open)} />
			</>}
		</div>
	</>;
}
