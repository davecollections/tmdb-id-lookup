// React ships CommonJS entry points. Declare their interop before Vite's first
// fixture transform so the dependency scan cannot leave stale named imports.
export function mountedReactOptimizeDeps(entries) {
	const dependencies = ["react", "react-dom", "react-dom/client", "react/jsx-runtime"];
	return { entries, include: [...dependencies], needsInterop: [...dependencies] };
}
