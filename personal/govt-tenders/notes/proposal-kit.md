---
title: Proposal Kit
tags: [personal/govt-tenders, reference]
created: 2026-08-10
updated: 2026-08-10
status: active
type: reference
personal: govt-tenders
---

# Proposal Kit

Fill each block once. Every public sector proposal after the first is then assembly plus a fresh technical approach, which is the only section that should be written from scratch each time.

Markdown rather than HTML on purpose: this is copy-paste working material, not a page to read.

---

## Block 1 — Company facts

Asked for verbatim on nearly every submission form.

```
Legal name:
Operating name (if different):
Business number:
Incorporation jurisdiction and date:
Registered address:
Contact for this bid (name, title, email, direct phone):
Signing authority (name, title):
Years in operation:
Number of staff (FTE and contract):
GST/HST number:
```

Keep this current in one place. Retyping it per bid is where transcription errors get in, and a wrong business number on a signature page is a compliance failure.

---

## Block 2 — Insurance and clearances

Attach certificates rather than describing them. Buyers want the PDF.

```
Commercial general liability: $____  insurer ____  expiry ____
Professional liability / errors and omissions: $____  insurer ____  expiry ____
Cyber liability (increasingly asked for on hosting work): $____
WCB / CNESST clearance letter: date obtained ____
```

If a policy is not yet in force, the wording that is normally accepted:

> The Proponent will obtain and maintain commercial general liability coverage of not less than $[amount] and professional liability coverage of not less than $[amount], naming [Buyer] as an additional insured, with certificates provided prior to contract execution.

State it plainly. Do not imply coverage already exists.

---

## Block 3 — References

Three is the usual ask. Each needs a live contact who has agreed in advance to take the call.

```
Client:
Contact name, title, email, phone:
Project:
Dates:
Contract value:
Scope delivered:
Why it is comparable to this tender:  <-- write this line every time
```

That last line is the one evaluators actually use. Draw the parallel yourself rather than leaving them to infer it.

### The NDA permission email

Send this once, to every client whose work you cannot currently name.

> Subject: Permission to name [Project] in a confidential procurement submission
>
> Hi [Name],
>
> I am bidding on a public sector web project and need to list three comparable engagements. I would like to include the work we did on [Project], described at the level of scope and outcome rather than anything commercially sensitive.
>
> Public procurement submissions are held in confidence by the buyer and are not published. What is disclosed is limited to the evaluation committee. I am asking only for this use, not for marketing or my public portfolio.
>
> If you are comfortable, I would also list you as a reference contact, which means one short call from the buyer at most.
>
> A short reply saying yes is all I need. Happy to send the exact wording first if you would rather approve it.

---

## Block 4 — Accessibility

Municipal and academic buyers in BC, Alberta and Ontario all ask. A claim of compliance without a method reads as boilerplate and scores like it.

State which standard (WCAG 2.1 level AA is the usual floor, 2.2 AA increasingly), how conformance is tested (automated pass plus manual keyboard and screen reader testing, naming the tools), when in the build it happens, and what the deliverable is (a conformance report, plus remediation before launch). Name any accessibility legislation binding on that buyer: AODA in Ontario, the Accessible BC Act, the Accessible Canada Act federally.

---

## Block 5 — Hosting and data residency

Wanted whenever hosting is in scope, and disqualifying when the answer is vague.

Name the provider and the specific Canadian region. Say where backups live, since backups leaving the country defeats the requirement. Cover uptime target, monitoring, patching cadence, backup frequency and tested restore time, TLS and certificate management, and who holds the domain and DNS. State the exit plan: what the buyer gets and in what format if they leave. Public buyers care about that more than commercial clients do, because they have to.

---

## Block 6 — Team

One short biography per person actually working on the job. Name, role on this project, years of relevant experience, and two comparable projects.

Never list people who will not touch the work. Some buyers require the named team to be contractually committed, and substituting afterwards can breach the contract.

---

## Block 7 — Approach

The only section written fresh each time, and the one that wins or loses on merit rather than compliance.

Structure that works: restate the problem in the buyer's own words to prove you read the document, describe the phases with deliverables and a decision point at each, name the risks with mitigations (content migration and stakeholder review cycles are the two that actually derail these projects), and set out what you need from them. That last part reads as competence rather than as demands, because buyers have been burned by vendors who discovered dependencies late.

Answer the requirements in the order the RFP lists them. Evaluators score with the document open beside yours, and reordering costs you points you earned.

---

## Block 8 — Pricing

Follow the form given, exactly, even when it is worse than yours. A better format submitted instead of the required one is a compliance failure.

Break out design, development, migration, accessibility work, training, and hosting or support as recurring. Say what is excluded. Note assumptions that would change the price, such as page count or the number of review rounds. If optional items are invited, price them separately rather than folding them into the base, which keeps your headline number competitive.

---

## Compliance pass

Run this last, on every submission, reading only the mandatory requirements list against the document. Do not reread the prose; you will see what you meant rather than what is there.

Every mandatory item addressed and locatable. Required forms used unmodified and signed by the signing authority. Page and format limits respected. Addenda acknowledged, each one, by number. File naming as instructed. Submitted through the named portal, early enough that a slow upload cannot make it late.
