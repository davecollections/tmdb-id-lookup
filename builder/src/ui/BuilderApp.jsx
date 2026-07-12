import { useState } from "react";
import { BuilderWelcome } from "./BuilderWelcome.jsx";
import { BuilderWorkspace } from "./BuilderWorkspace.jsx";
import { useBuilderControllerState } from "./use-builder-controller.js";

export function BuilderApp({ controller, initialScreen = "welcome" }) {
	const state = useBuilderControllerState(controller);
	const [screen, setScreen] = useState(initialScreen === "workspace" ? "workspace" : "welcome");

	return screen === "workspace"
		? <BuilderWorkspace controller={controller} state={state} onReturnHome={() => setScreen("welcome")} />
		: (
			<BuilderWelcome
				controller={controller}
				state={state}
				onEnterWorkspace={() => setScreen("workspace")}
			/>
		);
}
