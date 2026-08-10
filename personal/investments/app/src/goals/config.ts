import type { GoalScope } from "./scope";

export interface Goal {
  id: string;
  label: string;
  scope: GoalScope;
  target: number;
  by: string;
  /** Where the target and the year came from. Rendered, never decorative. */
  source: string;
}

/**
 * The RESP beneficiary's birth year, mirroring `DEFAULT_RESP_BIRTH_YEAR` in
 * `projection/inputs.ts`. No statement carries a birth year, so this is a
 * documented default rather than a confirmed one -- see that module's
 * comment on `ProjectionOverrides.respBeneficiaryBirthYear`. Not imported
 * from there: it is not exported, and re-deriving the one number this
 * config needs keeps `config.ts` from depending on the projection engine.
 */
const DEFAULT_RESP_BIRTH_YEAR = 2025;

/** CESG stops after the year the beneficiary turns 17, the same rule `inputs.ts` applies to `cesgLastYear`. */
const RESP_CESG_LAST_YEAR = DEFAULT_RESP_BIRTH_YEAR + 17;

/**
 * The goals that ship. Only two: a target this app invents rather than
 * reads is a verdict nobody asked for, so retirement and growth -- whose
 * targets are personal figures nobody has supplied -- stay off this list
 * until the owner supplies one. `house` and `education` are the two
 * purposes whose target and year are both statutory, not personal.
 */
export const GOALS: readonly Goal[] = [
  {
    id: "house",
    label: "House down payment",
    scope: { kind: "purpose", purpose: "house" },
    target: 40000,
    by: "2028",
    source:
      "Target is the FHSA's $40,000 lifetime contribution cap. The 2028 year is the first year the projection's FHSA lifetime room reaches zero, the year contributions stop, not the year the account closes.",
  },
  {
    id: "education",
    label: "Education",
    scope: { kind: "purpose", purpose: "education" },
    target: 50000,
    by: String(RESP_CESG_LAST_YEAR),
    source:
      "Target is the RESP's $50,000 lifetime contribution cap. The 2042 year is cesgLastYear, DEFAULT_RESP_BIRTH_YEAR (2025) plus 17, a documented default rather than a confirmed beneficiary birth year.",
  },
];
