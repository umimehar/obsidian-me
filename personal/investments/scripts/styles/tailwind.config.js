/**
 * Tailwind config for the investments pages. Compiles to a single local
 * stylesheet (personal/_assets/personal.css) so the pages stay self-contained
 * and open offline in Obsidian and the browser. Preflight is disabled so the
 * hand-tuned "Ledger Instrument" base styles in app.css are preserved; Tailwind
 * adds the utility layer and maps the design tokens to theme-aware utilities.
 */
module.exports = {
  content: [
    "./investments/render.py",
    "./investments/explorer.js",
    "../notes/*.html",
  ],
  corePlugins: { preflight: false },
  safelist: [
    "on",
    "show",
    "scrubbing",
    "kpi",
    "kpi-label",
    "kpi-value",
    "chip",
    "seg-btn",
  ],
  theme: {
    extend: {
      colors: {
        page: "var(--page)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        ink: "var(--ink)",
        "ink-2": "var(--ink-2)",
        muted: "var(--muted)",
        accent: "var(--accent)",
        balance: "var(--data-balance)",
        income: "var(--data-income)",
        contrib: "var(--data-contrib)",
        outflow: "var(--data-outflow)",
      },
      borderColor: { hairline: "var(--hairline)" },
      fontFamily: {
        serif: "var(--serif)",
        sans: "var(--sans)",
        mono: "var(--mono)",
      },
      borderRadius: {
        xs: "var(--radius-xs)",
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
      },
    },
  },
};
