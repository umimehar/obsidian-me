import { useEffect, useState } from "react";

const NARROW_QUERY = "(max-width: 40rem)";

/**
 * True below 40rem, where the Flow tab replaces the Sankey with two ranked
 * lists and the flows table with two-line rows instead of four columns.
 * False by default, including in every test: happy-dom's own `matchMedia`
 * always reports `matches: false` regardless of the query, so this needs no
 * stub to stay on the wide path.
 */
export function useNarrowFlow(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW_QUERY).matches);
  useEffect(() => {
    const media = window.matchMedia(NARROW_QUERY);
    const onChange = (event: MediaQueryListEvent) => setNarrow(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  return narrow;
}
