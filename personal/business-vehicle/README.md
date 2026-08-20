---
title: Business Vehicle
tags: [personal/business-vehicle]
created: 2026-08-19
updated: 2026-08-19
status: active
type: personal
personal: business-vehicle
---

# Business Vehicle

Everything about the 2026 Mercedes-Benz GLC 43 AMG leased in 15248132 Canada Inc.'s name. Contracts, insurance, service, tax position, and whatever is leased next.

## Pages

- [Overview](notes/index.html). Cost per month, what is due next, what needs doing. **Start here.**
- [Lease](notes/lease.html). Term, payments, residual, what Mercedes-Benz Financial requires of the insurance.
- [Insurance](notes/insurance.html). Both terms line by line, the brokers, the open questions.
- [Service](notes/service.html). Every visit, the prepaid plan, what the dealer flagged.
- [Compliance](notes/compliance.html). Business against personal use, mileage, tax questions.
- [Was it a good deal](notes/deal.html). The lease measured against what comparable cars actually sell for, what to do at maturity, and what to negotiate differently next time.
- [Fleet history](notes/fleet-history.html). Every leased vehicle.
- [[tracking]]. Deadlines and the running odometer.

## The one thing to know

Page 7 of the lease carries a signed corporate declaration: the vehicle will be used primarily for business or commercial purposes. The preauthorized payment authorisation on the same page is ticked business. Both insurance certificates rate the car as personal use, with the business kilometre field blank.

One of those is wrong. An insurer that decides the declared use was misstated can refuse a claim outright rather than adjust the premium, and the same wording makes the $349 Platinum Security agreement void by its own section 3.4, which excludes any vehicle used for business purposes. Settle the real percentage before the renewal binds on 1 October.

The second thing: the Desjardins renewal is $9,657, up $1,247. Nearly half of that is one endorsement, the 5 Year New Vehicle Protection going from $303 to $794. It replaces the car with a new current year equivalent on a total loss, for 60 months from delivery. Brokers quote OPCF 43R instead, a depreciation waiver usually capped at 24 to 30 months. A cheaper quote carrying plain 43R is a downgrade. Gap coverage is not the reason to keep it, because section 13 of the lease already provides gap protection.

Do not cancel Desjardins until a replacement is bound in writing.

On the deal itself: sound lease structure, thin discount. The 58% residual is generous enough that the guaranteed $58,580 buyout will sit above what the car is worth in September 2028, so walk away at maturity rather than buying it. Three year old GLC 43s ask $54,495 to $59,995 today.

## How the data works

`data/vehicle.json` holds every extracted fact and is the only place to edit. The pages are rendered from it:

    cd scripts && bun install && bun run build     # rewrites all six pages in notes/
    bun run check                                  # lint, typecheck, tests

Source documents are committed under `docs/`, split by lease, insurance, service and warranty. They are unmasked. Everything derived from them masks bank, preauthorized debit and finance account numbers to their last four digits.

## Open at the moment

Nine findings came out of reading the contracts against each other. Two are rated high, and both trace back to the same declared use conflict. The [overview page](notes/index.html) lists them all with what to do about each.

The rest, briefly. A minor conviction appeared on the 2026-27 certificate that was not on the 2025-26 one, and the opening emails to all four brokers said no convictions ever. The lease permits a deductible up to about $5,223, not the $2,500 the Agreement to Furnish Insurance implies, so there is room to price collision and comprehensive higher than the $1,000 they sit at now. Front tyres read 4 mm against a 3.2 mm lease return threshold. Two documents disagree about whether the warranty ends in September 2028 or September 2029, which matters because the steering clock spring noise is unrepaired and being monitored. And no certificate names Mercedes-Benz Financial in the loss payee box, which section 12 of the lease requires.
