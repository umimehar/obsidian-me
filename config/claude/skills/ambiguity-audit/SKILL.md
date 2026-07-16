---
name: ambiguity-audit
description: >-
  Audit model-facing Markdown instructions for contradictions, undefined precedence, unclear decision boundaries, missing branches, and references that force an AI agent to guess. Run a complete project audit by default, or accept a pull request argument to constrain findings to ambiguity introduced or exposed by that PR. Always compare instructions within the complete effective repository context, including relevant project and user-level skills.
argument-hint: "[project | pr <number-or-url>]"
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash(git diff *)
  - Bash(git merge-base *)
  - Bash(git rev-parse *)
  - Bash(git show *)
  - Bash(git status *)
  - Bash(gh pr diff *)
  - Bash(gh pr view *)
model: opus
user-invocable: true
disable-model-invocation: true
---

# Ambiguity audit

Find instruction conflicts that leave a competent AI agent with two or more defensible actions. Audit model-facing Markdown instructions, not product code, grammar, tone, or general human documentation.

## Select the audit level

Read `$ARGUMENTS`:

- No arguments: Audit the complete current repository state.
- `project`: Audit the complete current repository state explicitly.
- `pr <number-or-url>`: Audit the complete repository state represented by the pull request, but report only ambiguity introduced or exposed by that pull request.

If the user supplies `pr` without an identifier, stop and ask for the pull request number or URL. If the arguments match neither level, stop and show the two valid invocations.

Do not infer PR mode from the current branch, working tree, or presence of a pull request. Do not offer a single-file audit because a file cannot be evaluated reliably outside its effective instruction context.

## Build the effective instruction corpus

Use broad discovery and narrow inclusion. Search the repository root, applicable ancestor scopes, and nested project scopes for these candidate instructions:

- Canonical entrypoints: `CLAUDE.md`, `CLAUDE.local.md`, `AGENTS.md`, `GEMINI.md`, and `.github/copilot-instructions.md`.
- Claude rules and agents: `.claude/rules/**/*.md` and `.claude/agents/**/*.md`.
- Project skills: `.claude/skills/**/SKILL.md` and `.agents/skills/**/SKILL.md`.
- Other declared agent systems: `.agents/agents/**/*.md`, `agents/**/*.md`, `.github/agents/**/*.agent.md`, `.github/instructions/**/*.instructions.md`, `.cursor/rules/**/*.md`, and `.cursor/rules/**/*.mdc`.
- Markdown files directly referenced by an included instruction.

Include a candidate only when at least one condition holds:

1. Its path makes the harness load it as an instruction, skill, rule, or agent definition.
2. An included canonical entrypoint declares it authoritative or required.
3. It contains normative constraints for an agent and an included instruction directly references it.
4. It defines an agent or skill that can operate in the audited repository.

Exclude generated reports, readiness assessments, changelogs, retrospectives, meeting notes, templates, and ordinary human documentation unless an included canonical instruction explicitly makes that file authoritative for agent behaviour. Treat ADRs and historical records as instructions only when the active canonical context declares their decisions current and binding.

Follow direct references one level from each included instruction. Follow deeper references only when they contain a rule needed to resolve a candidate finding. A link alone does not make a document an instruction; apply the inclusion gate before reading it into the audit corpus.

## Build the user execution context

- Include active user-level canonical instructions such as `~/.claude/CLAUDE.md` and `~/.claude/rules/**/*.md` when Claude loaded them for the session.
- Always include this invoked `ambiguity-audit` skill as user execution context so its scope, language, formatting, and output rules are validated during the run. Do not count it as a project instruction.
- Include `~/.claude/skills/**/SKILL.md` when the user invoked the skill, a project instruction references it, or its description governs the audited agent action.
- Include `~/.claude/agents/**/*.md` only when the conversation establishes that the agent is selected, invoked, or referenced for the audited action.
- Include other user-level agent or rules paths only when the conversation or a canonical project instruction establishes that they are active.

Do not claim that a user skill or agent was loaded unless the conversation establishes that fact. Otherwise label it as `discoverable user context`.

Read every included file in full. Before the first finding, report the number of project instructions and relevant user-context skills or agents included. Do not repeat the scope line later.

## Project audit

Treat the current source tree and working tree as the complete repository state. Do not compare it with `main`, another branch, a merge base, or repository history.

Report every confirmed ambiguity within the effective instruction corpus, regardless of when or where it was introduced.

## Pull request audit

Treat the pull request head as the complete repository state. Read the full effective instruction corpus at the PR head, including unchanged instructions. Never use the base branch as the governing instruction corpus.

Use the PR diff only to establish causality. A finding is in scope when at least one changed or deleted PR instruction causes or exposes the ambiguity. Valid cases include:

- a changed or added instruction conflicts with an unchanged existing instruction;
- a changed instruction removes or weakens precedence, a threshold, a default, or a required branch;
- deleting or renaming an instruction creates a dangling reference or removes the rule that previously resolved competing interpretations; or
- two changed instructions conflict with each other.

Unchanged instructions may provide decisive evidence and must be cited when they form the other side of the ambiguity.

Do not report:

- ambiguity entirely between unchanged instructions;
- pre-existing ambiguity that the PR neither changes nor exposes;
- unrelated ambiguity elsewhere in a file merely because the PR touched that file; or
- project-wide findings without a causal changed or deleted PR instruction.

When the PR head is not the current checkout, read files from the PR head commit without changing the user's working tree. If the complete PR-head corpus is unavailable, stop and request access instead of substituting base-branch content.

## Detect and validate

Keep a private ranked candidate list. Retain a candidate only when you can state at least two concrete interpretations that lead to different agent actions.

Check for:

1. Contradictory directives that cannot both be followed.
2. Overlapping directives with no stated precedence.
3. Undefined thresholds or quantifiers that control an action.
4. References with more than one possible target or no existing target.
5. Missing defaults or branches that require the agent to invent behaviour.
6. Duplicated instruction sources that already disagree or create competing canonical homes.

Do not report style preferences, harmless reinforcement, intentional discretion, hypothetical future drift, or ambiguity settled by nearby or higher-precedence context.

Assign one severity:

- 🔴 `High`: likely or frequent divergence, collision between mandatory instructions, or security-sensitive, destructive, irreversible, or externally visible consequences.
- 🟡 `Medium`: meaningful divergence that surrounding context resolves only some of the time.
- 🟢 `Low`: localized but genuine divergence with limited impact and one concrete fix. Do not use Low for style, harmless redundancy, or speculative risk.

Rank findings by severity, then frequency and breadth of likely divergence. Do not manufacture lower-severity findings to fill the report.

## Present the findings

Return all confirmed findings in one report, capped at 10 findings. Include the scope, context counts, total finding count, and severity counts before the findings.

If more than 10 findings are confirmed, show the 10 highest-ranked findings and add this alert immediately after the summary:

```markdown
❗ Showing 10 of <total> confirmed findings. Reply `more` to receive the next batch of up to 10.
```

When the user replies `more`, continue from the private ranked list without repeating earlier findings or rerunning the audit. Repeat the overflow alert while undisplayed findings remain.

Place one horizontal rule before the first finding, between findings, and after the final finding so every boundary is visually explicit. Do not emit consecutive horizontal rules. Use this structure:

```markdown
Scope: <project | PR identifier> · Context: <project instruction count and user-context count>
Findings: 🔴 <high count> · 🟡 <medium count> · 🟢 <low count> · Total: <total>

---

## <🔴 | 🟡 | 🟢> <number>. <short title>

**Competing readings:** <reading A> vs. <reading B>.

**Why it matters:** <one sentence describing the divergent agent behaviour>.

**Evidence:**

- `<path>:<line>`: <short evidence>
- `<path>:<line>`: <short evidence>

**Fix:** <one concrete change that removes the choice>.

---
```

For a PR finding, mark each evidence item as `PR change`, `PR deletion`, or `existing context`. At least one item must be a causal `PR change` or `PR deletion`.

If no confirmed finding exists, return the scope and counts followed by one sentence stating that the effective instruction corpus contains no confirmed ambiguity.

Do not narrate model selection, corpus construction, file-reading progress, advisor availability, rejected candidates, or internal ranking. Do not add a recap after the findings unless the user asks for one.

## Language and formatting

For a project audit, write in the dominant language of the effective instruction corpus. For a PR audit, write in the language of the causal changed instruction. If there is no dominant language, use the language of the user's request.

Translate every report label and explanatory sentence into the selected output language. Apply the effective context's global output constraints. Keep every prose paragraph and list item on one physical line. Preserve evidence text in its source language when translating it would obscure the conflict.
