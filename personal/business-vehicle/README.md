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

- [Overview](notes/index.html) — cost per month, what is due next, what needs doing. **Start here.**
- [Lease](notes/lease.html) — term, payments, residual, what Mercedes-Benz Financial requires of the insurance.
- [Insurance](notes/insurance.html) — both terms line by line, the brokers, the open questions.
- [Service](notes/service.html) — every visit, the prepaid plan, what the dealer flagged.
- [Compliance](notes/compliance.html) — business against personal use, mileage, tax questions.
- [Fleet history](notes/fleet-history.html) — every leased vehicle.
- [[tracking]] — deadlines and the running odometer.

## The one thing to know

The Desjardins renewal lands 1 October 2026 at $9,657, up $1,247 on the year. Do not cancel it until a replacement is bound in writing.

Nearly half that increase is one endorsement. The 5 Year New Vehicle Protection went from $303 to $794 because it pays the gap between current value and original price, and that gap widens as the car depreciates. It also does something no broker will match by default: it replaces the car with a new current-year equivalent on a total loss, for 60 months from delivery. Brokers quote OPCF 43R instead, capped at 24 to 30 months. A cheaper quote carrying plain 43R is a downgrade.

## How the data works

`data/vehicle.json` holds every extracted fact and is the only place to edit. The pages are rendered from it:

    cd scripts && bun install && bun run build     # rewrites all six pages in notes/
    bun run check                                  # lint, typecheck, tests

Source documents are committed under `docs/`, split by lease, insurance, service and warranty. They are unmasked. Everything derived from them masks bank, preauthorized debit and finance account numbers to their last four digits.

## Open at the moment

The 2026-27 certificate shows one minor conviction in the past three years. The 2025-26 certificate showed none, and the opening emails to all four brokers said no claims or convictions ever. Pull the abstract from ServiceOntario, then correct the disclosure in writing before anybody binds.

The policy is rated personal use. Business kilometres are blank on both certificates and the payment schedule is marked Personal. If the car is genuinely used for business, that rating is wrong and a claim can be refused.
