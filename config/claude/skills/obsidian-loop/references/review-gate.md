# Review gate: human vs agent review

The Finish step (§7 of `SKILL.md`) must resolve one question: does a human review this ticket, or does an agent? This file is the detail behind that decision.

## Resolve who reviews

```
humanReviewRequired = control.md require_review        (global default, currently false)
                      OR ticket human_review_required   (per-ticket, optional, absent == false)
```

OR semantics: either flag `true` forces the human path. A ticket can escalate to human review but cannot downgrade a global human-review policy. The normative definition lives in `knowledge/kanban-usage.md`; if this file ever disagrees, that doc wins.

## Human path

`humanReviewRequired == true`. The default, unchanged: exit to `Review`, stop, wait for the human. Never self-close to `Done`.

## Agent path

`humanReviewRequired == false`. Run a mandatory review before finishing.

1. Pick a specialized reviewer that fits the ticket's work:

   | Ticket work | Reviewer agent |
   |---|---|
   | Auth, authorization, secrets, anything security-sensitive | `security-auditor` |
   | New service, module, public API, cross-cutting refactor | `architect-review` |
   | Schema, migration, query performance | `database-optimizer` |
   | Anything else (general default) | `code-reviewer` |

2. Run it at **opus, high effort**, with a self-contained brief:
   - The ticket Goal and Acceptance criteria (verbatim).
   - The diff under review (`git -C <repo> diff <base>..HEAD` or the staged/committed range).
   - The test, lint, and type-check evidence already pasted into the Worklog.
   - The instruction: return either PASS or a list of concrete findings (file:line, severity, what is wrong, suggested fix).

3. On findings: fix them, then re-run the reviewer. This is a real fix plus a fresh review each time, never a blind retry. Cap at **3 rounds**.

4. On PASS: self-close. `status: done`, card → `## Done` as `- [x]`, activity verb `done`. Record the reviewer verdict and evidence in the Worklog. This is the one place the loop closes a ticket to `Done` without explicit human confirmation, and it is deliberate.

5. Still failing after 3 rounds: escalate. Set the ticket's `human_review_required: true`, take the human path (exit to `Review`), and record the unresolved findings verbatim in the Worklog. No infinite loop; broken work is never silently auto-closed.

## Flagging high-risk work

While executing (§6), set `human_review_required: true` the moment the work looks high-risk: auth/authorization, payments or money movement, data migration, destructive or irreversible operations, deletes, secrets/credentials, or hard-to-reverse external writes. When in doubt, flag it. A human is the safe default.
