import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import deploymentMark from "./assets/deployment-mark.svg";
import "./styles.css";

function App() {
	return (
		<main className="page-shell">
			<section className="status-card" aria-labelledby="builder-title">
				<img className="status-mark" src={deploymentMark} alt="" width="80" height="80" />
				<p className="eyebrow">Deployment coexistence test</p>
				<h1 id="builder-title">Nuvio Collection Builder</h1>
				<p className="summary">
					This isolated placeholder proves that the future builder can be published beside the existing TMDB ID Lookup.
				</p>
				<p className="scope-note">No collection-builder functionality exists yet.</p>
				<a className="root-link" data-root-link="true" href="../">
					Back to TMDB ID Lookup
				</a>
			</section>
		</main>
	);
}

createRoot(document.getElementById("root")).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
