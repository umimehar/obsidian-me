---
title: Lessons
tags: [knowledge, lessons]
created: 2026-07-13
updated: 2026-08-20
status: active
type: permanent
---

# Lessons

Corrections, tool quirks, and recurring debugging patterns captured across sessions. One rule per mistake; absolute directives; lead with why; concrete commands and paths.

**Scope: structural and cross-cutting only.** A lesson tied to one endeavor lives in that endeavor's folder (`personal/<name>/notes/<slug>.md`, or `projects/<name>/lessons.md` for a code project), NOT here.

## Format & supersession

Each entry is `### <short-rule-title> (YYYY-MM-DD)` — the slug is its `(subject, relation)` key for dedup — with a `Why:` (1 to 3 bullets) then an `ALWAYS`/`NEVER` rule carrying the concrete command/path. Never leave two live rules in conflict on the same subject: **update in place** for a refinement (bump the date), or **supersede** a now-wrong rule with a one-line tombstone `> ⊘ Superseded YYYY-MM-DD by [[#<new-slug>]]: <reason>`.

Prose format: one line per paragraph and per list item — never hard-wrap at a fixed column.

## Vault

### config lives only in the dev vault (2026-08-04)

Why:
- Two copies of Claude Code config drift apart, and the copy you are not looking at is the one that goes stale.
- The `config/claude/` and `config/git-hooks/` folders this vault's docs described never existed on disk, so `core.hooksPath` pointed at nothing and the "pre-commit masking guard" was a phantom safety net for three weeks.

NEVER create a `config/` folder in `obsidian-me`. Claude Code config — `CLAUDE.md`, skills, MCP definitions in `mcp/mcp.json`, hooks, statusline — is owned solely by `~/obsidian/obsidian-dev/config/claude/` and symlinked into `~/.claude/` by `bootstrap.sh`. Add a skill or an MCP server there and re-run `python3 mcp/register-mcp.py`; never drop one into `~/.claude/skills/` directly, or the next device will not have it.

### pin mcp<2 for stdio servers that import McpError (2026-08-04)

Why:
- `mcp` 2.0.0 removed `McpError` from `mcp.shared.exceptions`. `mcp-server-reddit` (0.2.1, unmaintained) and `mcp-server-fetch` import it at module load, so an unpinned `uvx` run dies with `ImportError` before the JSON-RPC handshake.
- Claude Code reports that as a bare `Connection closed`, which says nothing about the cause and sends you looking at the wrong layer.

ALWAYS diagnose an MCP `Connection closed` by running the server's command by hand and reading stderr, not by re-registering it. For these two the fix is `uvx --with "mcp<2" <server>`; drop the pin when either package ships a 2.x-compatible release.

## Sensitive data

### never paste a real identifier into a doc as an example (2026-08-05)

Why:
- Masking effort concentrates on the pipeline output, so specs, plans, tests, and shell snippets get written with real values as illustrations and nobody masks them. In one session this leaked, four separate times, into files staged for commit: account numbers in test fixtures, a real filename list in a committed source file, the owner's surname inside a verification `grep`, and a city plus account number in plan prose.
- Every leak passed the leak check, because each check matched one shape of identifier (`(WK|HQ|WZ)[A-Z0-9]{7,}`) while the document carried another (a bare 8-digit number, a name token, a postal code).
- A statement filename IS an account number. So is a fixture list, a test input, and an error message that echoes its input.

NEVER write a real account number, name, address, or filename into any tracked file — including specs, plans, test fixtures, code comments, and example commands. Use synthetic values (`ACCT0001CAD`, `First Last`, `Springfield`) and keep every real value in a gitignored config the code reads at runtime.

ALWAYS make the leak gate match identifier *classes*, not one pattern, and have it read the name list from the gitignored config rather than hardcoding it: bare digit runs (`"[0-9]{7,}"`), postal codes (`[A-Z][0-9][A-Z] ?[0-9][A-Z][0-9]`), the SIN shape, the vendor account-code shape, and every token of every configured name. Run it against the staged diff before commit, not against the pipeline output only.

### verify a claim against the corpus, not against a sample (2026-08-05)

Why:
- Four hand-read statements produced a parser design that failed on roughly half of 220 real files. Wealthsimple renamed the account-type descriptor twice inside one corpus — the same TFSA reads `Tax-Free Savings Account` in 2023, `Self-directed TFSA Account` in 2026-01, and `Order Execution Only TFSA Account` in 2026-06 — and two wordings contain "Cash" while being a TFSA and an FHSA.
- Column x positions drifted between 340 and 362 across years, so any absolute position was wrong somewhere.

ALWAYS enumerate the full value set from every file before writing a mapping table or a format regex — `for f in *.pdf; do ... done | sort -u` costs a minute and is the difference between a table and a guess. When a document's layout is load-bearing, prefer coordinates (`pdftotext -bbox-layout`) over flattened text (`pdftotext -layout`): flattening discards the structure and forces regexes to reconstruct it from whitespace, which breaks on interleaved panels, wrapped labels, and any marginal content.

### a check you have not seen fail is not a check (2026-08-05)

Why:
- Five verification checks in one project were structurally incapable of failing, and every one looked correct in review: `grep -rl … | grep -v sentinel` (filters filenames, never content); a non-global `.exec()` scanning a 1700-word document and seeing only the first match; a reconciliation assertion where `0 + 0 − 0 === 0` passed on completely unparsed input; a postal-code regex that could not match a code split across two tokens; and a grouping-key test whose fixture numbers coincided so it passed whether the key was right or wrong.
- Four of the five were written by the same author as the code they guarded, and three shipped through a passing suite. A green suite is evidence that the code and the test agree, not that either is right.
- The failure is invisible in exactly the situation the check exists for, so it converts a loud error into a silent wrong answer.

ALWAYS demonstrate the failure before trusting a check: break the guarded line, watch the specific test go red, restore it. Do this for every check whose job is catching a defect — leak gates, reconciliation assertions, validation guards — not just for hard logic. Record the mutation and its failure message alongside the test.

NEVER accept "the suite is green" as evidence a guard works, and never write a check whose passing condition is also its degenerate condition (`0 === 0`, an empty match set, a filter over the wrong stream). If a check cannot distinguish "nothing to find" from "nothing looked", it needs a separate assertion that input was actually examined.

When reviewing, ask for a concrete input that trips each check. "I cannot construct one" is the finding.

### git grep silently ignores \b, so a boundary pattern always returns clean (2026-08-06)

Why:
- `git grep -E '\b(WK|HQ)[A-Z0-9]{7,}\b'` returns nothing on a file that plainly contains a match; drop the `\b` and it matches. It does not warn or error — it reports success with zero hits, which reads exactly like "no leak found".
- This was used as a sensitive-data check and passed a real committed account number as clean. Plain `grep -E` on the same content found it immediately.
- It is the same failure shape as a check that cannot fail: the passing condition is indistinguishable from the "nothing was examined" condition.

NEVER use `\b` in a `git grep` pattern. Use `grep -E` over `git show <rev>:<path>` or over `git diff` output, or use explicit character-class boundaries `(^|[^A-Z0-9])…([^A-Z0-9]|$)` which git grep does honour.

ALWAYS prove a search tool can find the thing before trusting it to report absence: run it once against known-present content. A grep that has never returned a hit is not evidence of a clean tree.

## Testing

### key a coarse-form absence assertion to the computed rounding, never to a truncation (2026-08-17)

Why:
- The test written to catch a codebase's most-repeated defect could not catch it. It asserted `not.toMatch(/\$92,547(?!\.)/)` against a rendered `$92,547.67`, but the coarse form of that figure is `$92,548`. Different digits, so no mutation could ever match the pattern. A reviewer proved it by injecting the coarsened figure into the accessible label: all 13 tests stayed green.
- The sibling assertion on `$50,180.10` worked, but only by luck, because `.10` rounds down and `.67` rounds up. Half of all figures are undefended by a truncation-shaped guard, and which half is invisible at the point you write it.
- The founding instance of the defect was itself a round-up: `$241,740` announced beside a rendered `$241,739.67`. So the guard as written would have missed the exact bug it descends from.

NEVER write an absence assertion by chopping digits off the precise string. `"$92,547.67"` does not contain `"$92,548"`, and it DOES contain `"$92,547"`, so a plain `toContain` check on the truncated form fails on correct output while the rounded form goes unguarded.

ALWAYS derive the coarse string in the test from the figure itself, by applying the real coarsening function, so the assertion tracks the value rather than a hand-typed prefix. Verify with a mutation that prints the rounded form and confirm the test reddens.

### mutate the second rendering path, not the shared variable (2026-08-17)

Why:
- An audit reported "6 of 6 rendered figures caught, 0 silent" and was wrong in direction, not in count. Every one of its six mutations changed a shared variable that feeds both the visible text and the accessible label, so each hit both by construction and proved nothing about drift between them.
- The summary assembly, where the label is composed separately, was never mutated. Three drift mutations there each left the whole suite green: a coarsened monthly figure, a wrong target, a cents-stripped total.
- Every precision defect this project has ever shipped lived in that second path. The audit tested the one place the bug has never appeared.

ALWAYS mutate each rendering path independently when a figure is rendered twice (visible text, `aria-label`, live region, tooltip). A shared-variable mutation tests that the variable is used; only a per-path mutation tests that the paths agree.

NEVER report a figure audit as complete without stating which paths it mutated. "N of N figures" hides whether N counted variables or renderings.

### git checkout -- is not an undo for a mutation, it is a reset to HEAD (2026-08-19)

Why:
- Mid-audit, an agent applied a real fix on top of an uncommitted state, then ran `git checkout -- <file>` to revert a test mutation. That silently discarded the real fix too, because checkout restores the file to the last COMMIT, not to "how it looked a moment ago". The mutation and the improvement went together.
- It was caught only because the restore was verified by `shasum` against the expected pre-mutation hash rather than by the command's exit code, which was 0 and meaningless.
- The same shape as the mutation traps on this project: a step that reports success while doing something other than what was intended.

ALWAYS commit real work BEFORE starting a mutation audit, so `git checkout -- <file>` has a correct target. If that is not possible, snapshot with the Write tool and restore from that snapshot instead.

NEVER verify a restore by exit code. Compare `shasum` against the known pre-mutation hash, or use `git diff --quiet`. On macOS with `cp` aliased to `cp -i` and zsh `noclobber` set, a failed restore is SILENT: both refuse rather than erroring, so the tree keeps the mutation while the command reports success and later mutations stack on top of it.

### noclobber blocks overwrite, not just creation (2026-08-19)

Why:
- Rewriting a source file with `cat > src/pages/lease.ts <<'EOF'` printed `(eval):1: file exists:` and wrote nothing. The next command in the same call was `bun run typecheck`, which passed, because the OLD file still type checked against the newly widened types. The failure read as success.
- The existing note on `noclobber` covers the append case, `>>` refusing to create a missing file. The overwrite case is the more dangerous one: nothing is missing, so nothing looks wrong, and a stale file survives a rewrite that appeared to happen.

ALWAYS use `cat >| file` when rewriting an existing file from a heredoc on this machine. `>|` overrides `noclobber` explicitly.

NEVER read a passing typecheck or test run as evidence that the preceding write landed. Chain the write and its verification in separate calls, or grep the file for a string only the new version contains.

### a symlinked .mjs never runs its own CLI entrypoint (2026-08-19)

Why:
- `node ~/.claude/skills/obsidian-loop/select-tickets.mjs --device mac-studio` printed nothing at all and exited 0. Not an empty JSON array, no output, no error. It looked like "no claimable tickets" and would have been read that way.
- The script guards its CLI with `if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)`. `~/.claude/skills/` is a symlink into the dev vault, so `process.argv[1]` is the symlink path while `import.meta.url` resolves to the real path. They never match, so `main()` is never called.
- Same shape for every script under `~/.claude/skills/`, because the whole config tree is symlinked out of `obsidian-dev`.

ALWAYS invoke skill scripts through the resolved real path: `node "$(readlink -f ~/.claude/skills/<skill>)/<script>.mjs"`.

NEVER treat empty stdout from one of these scripts as a real empty result. A genuine empty result prints `[]`. No output at all means the entrypoint guard did not fire.

### commit before mutating when other sessions share the branch (2026-08-20)

Why:
- An agent left a test mutation uncommitted in the working tree. A concurrent session on the same branch ran `git add`/`commit` for its own unrelated work, swept the mutation up, and pushed a genuine bug into shared main history: a table row that read wrapper "FHSA", bound "$40,000 lifetime contribution cap", note "The RESP lifetime contribution cap" -- the exact self-contradiction the test being written was meant to catch.
- The restore that should have caught it did not, twice over: `git checkout --` restores to the last COMMIT, which by then already contained the mutation, and the `shasum` baseline it compared against had been captured in a parallel tool call that could race the edit itself.
- Nothing was lost and the final state is correct, but the bug was live in shared history for several commits.

ALWAYS commit real work before starting a mutation audit, and verify each restore against a KNOWN COMMIT SHA (`git diff <sha> -- <file>`), not against a shasum captured earlier in the same session and not against a bare `git checkout` exit code. A shasum baseline is only trustworthy if it was taken before any edit and never re-taken concurrently.

NEVER assume the working tree is yours alone. On a shared branch, `git status` showing your file dirty means any other session's `git add` can capture it. Scope every review range to your own paths (`git diff A B -- <path>`) so a foreign commit cannot silently enter your diff either.
