import { useId } from "react";

/**
 * A document-unique id safe to put in an SVG `url(#...)` reference.
 *
 * React's `useId` returns something like `:r3:`, and a colon inside a
 * functional IRI is not something every renderer resolves, so the
 * non-alphanumerics are stripped and a caller-supplied prefix keeps the
 * result readable in the DOM. Every chart that defines a `clipPath` or a
 * `pattern` needs exactly this, and three of them had written it out
 * separately before this existed.
 */
export function useSvgId(prefix: string): string {
  return `${prefix}-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
}
