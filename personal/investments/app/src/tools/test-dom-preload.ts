import { GlobalRegistrator } from "@happy-dom/global-registrator";

/**
 * Registers a DOM (via happy-dom) into the global scope before any test
 * file runs, so a `.tsx` component test can call `render()` from
 * `@testing-library/react` outside a browser. Loaded through `bunfig.toml`'s
 * `test.preload`, not imported directly by any test file, so every test run
 * gets one DOM registered exactly once regardless of which files are
 * selected.
 */
GlobalRegistrator.register();
