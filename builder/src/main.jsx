import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBuilderController } from "./application/index.js";
import "./styles.css";
import { BuilderApp } from "./ui/index.js";

const controller = createBuilderController({
	initialProjectTitle: "Untitled project",
});

createRoot(document.getElementById("root")).render(
	<StrictMode>
		<BuilderApp controller={controller} />
	</StrictMode>,
);
