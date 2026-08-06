---
title: "Investments phase 2b: the dashboard"
tags: [personal/investments, plan]
created: 2026-08-06
updated: 2026-08-06
status: active
type: spike
personal: investments
---

# Investments Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local React app that reads `data/analytics.json` and shows the portfolio: value over time, three grouping lenses, per-wrapper room and grant views, tax figures, and the reconciliation report.

**Architecture:** Vite + React + TypeScript inside the existing `app/` workspace, run with `bun dev`. Radix Themes for components, `d3-scale` for chart scales with hand-built SVG, Motion for transitions. The app reads `analytics.json` and **never re-derives** anything from statements.

**Why Radix Themes:** the anti-slop frontend skill declares dashboards out of scope and directs data-dense UI to a real design system. Carbon and Fluent impose an enterprise IBM or Microsoft look on what should feel like a personal tool. Radix gives accessible primitives, a coherent token system, and dark and light out of the box, without dictating a corporate aesthetic.

**Spec:** `docs/superpowers/specs/2026-08-04-investments-rebuild-design.md`

## Global Constraints

- Bun; never npm. TypeScript strict with `noUncheckedIndexedAccess`; zero `tsc` errors. No `any`, no non-null assertions.
- Biome line width 100; cognitive complexity at or under 15. `bun run check` clean before every commit. The 290 existing tests must keep passing.
- **Never write a real account number, name or address into a tracked file.** Thirteen identifier leaks occurred in phase 1.
- **Zero em-dash characters** anywhere in UI copy. Use a comma, a period, or a regular hyphen.
- **Never `window.addEventListener("scroll")`.** Use Motion's `useScroll`, or IntersectionObserver.
- Every animation honours `prefers-reduced-motion`.
- One theme for the whole page, dark and light both supported, following the system preference with a manual toggle.

## The rule that shapes this interface

**Show what is known as a figure, and what is uncertain as uncertain.** The analytics layer went to considerable trouble to distinguish these, and the interface is where that pays off or is thrown away:

- `contributionsSource` is `"stated"` or `"derived"`. A derived figure must be visibly marked, never rendered as though the statement printed it.
- A room line's `remaining` is `null` when the limit is the generic annual maximum, because carry-forward is not visible in statement data. Render that as "carry-forward not visible", **never as zero and never as a negative**. The only real remaining figure in the corpus is RRSP 2026 at $37,752, which comes from a notice of assessment and is marked `assessed`.
- A return point is `stated` (Wealthsimple's own money-weighted rate) or `derived` with a `reason` when it is null. Never plot a null as zero.
- Cash accounts appear in every lens with `inTotals: false` and a total of $0.00. They are shown and visibly excluded, not hidden, so the ledger reads as complete.
- Realized gains are negative in both years. Show a loss as a loss.

Wherever a figure carries a caveat, the caveat belongs next to the number, not in a footnote nobody reads.

## Data the app consumes

`data/analytics.json`, 130KB, top level `{ meta, series, rooms, income, returns, rollups }`.

- `series[]` per account: `maskedId`, `shortId`, `kind`, `style`, `purpose`, `inTotals`, `contributionsByYear`, and `months[]` with `period`, `marketValue`, `bookCost`, `cashBalance`, `deposits`, `withdrawals`, `grants`, `contributions`, `contributionMonthsSpanned`, `contributionFirst60Days`, `contributionRestOfYear`, `contributionsSource`.
- `rooms` keyed by year, `income` keyed by year, `returns[]` per account with `points[]`, `rollups` with `registration`, `account`, `purpose`, each a list of `{ key, label, lens, accounts[], total }`.

Verified figures the UI must show correctly: total $241,739.67 at 2026-06, identical across all three lenses; RRSP 2026 $33,000 used of an assessed $70,752; FHSA $24,000 of $40,000 lifetime; RESP $3,000 of $50,000 with CESG $550 of $7,200; 2026 eligible dividends $201.86, foreign $16.84, realized gains -$1,335.86.

---

### Task 1: Scaffold, data loading, theme

**Files:** `app/vite.config.ts`, `app/index.html`, `app/src/ui/main.tsx`, `app/src/ui/App.tsx`, `app/src/ui/data.ts`, `app/src/ui/data.test.ts`; add `dev` and `build:ui` scripts.

- [ ] **Step 1: Install and scaffold.** `bun add react react-dom @radix-ui/themes d3-scale motion` and `bun add -d @vitejs/plugin-react vite @types/react @types/react-dom @types/d3-scale`. Vite config with the React plugin, root at `app/`, importing `analytics.json` as data.
- [ ] **Step 2: Write the failing test for `data.ts`.** It parses the analytics payload into typed structures and computes the derived view-model figures the UI needs (latest period, grand total, per-lens totals). Assert against the real committed `analytics.json`: total $241,739.67, 14 accounts, three lenses agreeing.
- [ ] **Step 3: Run it, confirm it fails, implement, confirm it passes.**
- [ ] **Step 4: `App.tsx`** renders a Radix `<Theme>` with `appearance="inherit"`, a manual light and dark toggle, and the total. Nothing else yet.
- [ ] **Step 5:** `bun run check` clean, `bun dev` serves and shows the real total. Commit.

---

### Task 2: Value over time

**Files:** `app/src/ui/charts/ValueOverTime.tsx`, `app/src/ui/charts/scales.ts`, tests for `scales.ts`.

Hand-built SVG on `d3-scale`. One area for market value, one line for book cost, so the gap between them reads as gain or loss. 2023-06 to 2026-07, 174 month points.

- [ ] **Step 1: Tests for the scale helpers**  domain from data, nice ticks, and an empty-data guard. A chart with no points must render an empty state, not crash or draw axes into nothing.
- [ ] **Step 2-4: Fail, implement, pass.**
- [ ] **Step 5: The chart.** Responsive via `viewBox`, no fixed pixel width. Accessible: `role="img"` with a text summary naming the range and end value. Motion draws the area once on mount and honours reduced motion.
- [ ] **Step 6: Verify against real data**  the line ends at $241,739.67 for the full portfolio. Commit.

---

### Task 3: The lens toggle and the overview

**Files:** `app/src/ui/LensToggle.tsx`, `app/src/ui/Overview.tsx`, tests.

- [ ] **Step 1: Tests.** Switching lens changes the grouping and **never changes the grand total**; every lens shows Cash groups with a zero total and a visible excluded marker.
- [ ] **Step 2-4: Fail, implement, pass.**
- [ ] **Step 5: The overview** shows the grand total, the value-over-time chart, and the lens toggle above a group list. Each group row: label, account count, market value, and share of total. Motion animates the reorder between lenses using `layout`, honouring reduced motion.
- [ ] **Step 6:** The `unassigned` purpose bucket must render with a short line explaining purposes are not configured yet, rather than looking broken. Commit.

---

### Task 4: The wrapper views

**Files:** `app/src/ui/wrappers/RoomBar.tsx`, `RegisteredView.tsx`, `TaxView.tsx`, tests.

- [ ] **Step 1: Tests, and these are the ones that matter.**
  - A room line with `remaining: null` renders "carry-forward not visible" and **no bar fill percentage**, because a percentage against an annual maximum implies a completeness the data does not have.
  - A line with `assessed: true` renders the real remaining figure and is labelled as coming from a notice of assessment.
  - **No line ever renders a negative remaining.**
  - RESP renders no annual contribution limit, its lifetime position, and a separate CESG line with received, the grant-maximising contribution, and the lifetime cap.
  - A derived contribution figure renders with its derived marker.
- [ ] **Step 2-4: Fail, implement, pass.** Mutation-verify the null-remaining and negative-remaining tests.
- [ ] **Step 5: The tax view** shows income by type and realized gains for the selected year, with the not-for-filing disclaimer adjacent to the estimate rather than at the foot of the page. Realized losses render as losses. The corporate account is visibly absent from personal figures, with one line saying why.
- [ ] **Step 6:** Commit.

---

### Task 5: Reconciliation, states and polish

**Files:** `app/src/ui/Reconciliation.tsx`, `app/src/ui/states/`, tests.

- [ ] **Step 1: The reconciliation view** reads `data/reconciliation.json`: findings grouped by check, each with account, period, expected, actual, delta and severity. Errors first. Acknowledged findings are shown with their reason, not hidden.
- [ ] **Step 2: The ground-truth line** is the headline: computed value against the figure observed in the app, with the delta and its explanation. Today that is $241,739.67 against $242,019.61, a delta of -$279.94 caused by one holding whose statement says its valuation is not final.
- [ ] **Step 3: Loading, empty and error states** for every view. A missing `analytics.json` must say "run bun run analytics" rather than rendering a blank page or crashing.
- [ ] **Step 4: Accessibility and motion pass.** Keyboard reachable, focus visible, contrast AA in both themes, every animation reduced-motion aware. No scroll listeners.
- [ ] **Step 5: Verify in both themes.** `bun run check` clean, all tests passing. Commit.

---

## Definition of done

- `bun dev` opens a dashboard showing the real portfolio.
- The grand total reads $241,739.67 and is identical across all three lenses.
- No room line shows a negative remaining; generic-limit lines say carry-forward is not visible; only the assessed RRSP line shows a real remaining figure.
- Derived contributions and derived returns are visibly marked as derived.
- Cash accounts are visible and visibly excluded.
- The reconciliation view shows the ground-truth delta with its explanation.
- Works in dark and light, honours reduced motion, keyboard accessible.
- `bun run check` clean, no tracked file contains a real identifier.

## Deferred

- **Phase 3:** the projection engine port, fitted returns from the stated money-weighted rates, goal tracking, room runway.
- **Owner inputs, both defaulting safely:** purpose tags per account, and real account labels in place of `TFSA d77c`.
- Deleting the old `scripts/` CSV pipeline and `notes/index.html` once this replaces them.
