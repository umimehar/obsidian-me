import { afterEach } from "bun:test";
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

/**
 * Imported only after `GlobalRegistrator.register()` runs above.
 * `@testing-library/react` inspects `document` at import time, so a static
 * top-level import would resolve before happy-dom's `document` exists and
 * throw "a global document has to be available".
 */
const { cleanup } = await import("@testing-library/react");

/**
 * Unmounts every component tree rendered by a test before the next one
 * runs. `@testing-library/react` only wires this automatically under Jest
 * or Vitest, not bun:test, so without it a second `.tsx` test file's
 * `render()` calls pile up in the one shared happy-dom `document` this
 * preload registers -- a query that should see one chart or one overview
 * starts matching leftover nodes from an earlier file's test.
 */
afterEach(() => {
  cleanup();
});
