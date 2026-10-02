import raw from "@data/tax.json";

/** A rate or dollar value the owner must be able to trace back to a source and the date it was checked. */
export interface SourcedValue {
  value: number;
  source: string;
}

export interface PersonalTaxYear {
  province: string;
  marginalRate: SourcedValue;
  capitalGainsInclusion: SourcedValue;
  eligibleDividendGrossUp: SourcedValue;
  federalEligibleDtcRate: SourcedValue;
  ontarioEligibleDtcRate: SourcedValue;
}

export interface AaiiThresholds {
  lower: number;
  upper: number;
  gradePerDollar: number;
  source: string;
}

export interface CorporateTaxYear {
  /** `MM-DD` the corporation's fiscal year ends on every year -- `"12-31"` by default, but a data field so a different year end works without a code change. */
  fiscalYearEnd: string;
  passiveIncomeRate: SourcedValue;
  partIVRate: SourcedValue;
  aaiiThresholds: AaiiThresholds;
  nerdtohRate: SourcedValue;
  dividendRefundRate: SourcedValue;
}

export interface T1135Thresholds {
  filingThreshold: number;
  detailedThreshold: number;
  source: string;
}

export interface TaxYear {
  personal: PersonalTaxYear;
  corporate: CorporateTaxYear;
  t1135: T1135Thresholds;
}

/** Keyed on the calendar/fiscal year as a string (`"2026"`). A year absent here means rates are not entered yet -- see `loadTaxYear`. */
export type TaxTable = Record<string, TaxYear>;

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`tax.json: ${field} must be a finite number`);
  }
  return value;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`tax.json: ${field} must be a non-empty string`);
  }
  return value;
}

function requireRange(value: number, field: string, min: number, max: number): number {
  if (value < min || value > max) {
    throw new Error(`tax.json: ${field} must be between ${min} and ${max}`);
  }
  return value;
}

/** A sourced rate/value: `{ value, source }`, value bounded to a plausibility range so a typo (e.g. `4.826` for `0.4826`) fails loudly. */
function parseSourcedValue(value: unknown, field: string, min: number, max: number): SourcedValue {
  if (typeof value !== "object" || value === null) {
    throw new Error(`tax.json: ${field} must be an object`);
  }
  const v = value as Record<string, unknown>;
  return {
    value: requireRange(requireNumber(v.value, `${field}.value`), `${field}.value`, min, max),
    source: requireString(v.source, `${field}.source`),
  };
}

const FISCAL_YEAR_END = /^\d{2}-\d{2}$/;

function parsePersonal(value: unknown): PersonalTaxYear {
  if (typeof value !== "object" || value === null) {
    throw new Error("tax.json: personal must be an object");
  }
  const p = value as Record<string, unknown>;
  return {
    province: requireString(p.province, "personal.province"),
    marginalRate: parseSourcedValue(p.marginalRate, "personal.marginalRate", 0, 1),
    capitalGainsInclusion: parseSourcedValue(
      p.capitalGainsInclusion,
      "personal.capitalGainsInclusion",
      0,
      1,
    ),
    eligibleDividendGrossUp: parseSourcedValue(
      p.eligibleDividendGrossUp,
      "personal.eligibleDividendGrossUp",
      0,
      1,
    ),
    federalEligibleDtcRate: parseSourcedValue(
      p.federalEligibleDtcRate,
      "personal.federalEligibleDtcRate",
      0,
      1,
    ),
    ontarioEligibleDtcRate: parseSourcedValue(
      p.ontarioEligibleDtcRate,
      "personal.ontarioEligibleDtcRate",
      0,
      1,
    ),
  };
}

function parseAaiiThresholds(value: unknown): AaiiThresholds {
  if (typeof value !== "object" || value === null) {
    throw new Error("tax.json: corporate.aaiiThresholds must be an object");
  }
  const a = value as Record<string, unknown>;
  const lower = requireNumber(a.lower, "corporate.aaiiThresholds.lower");
  const upper = requireNumber(a.upper, "corporate.aaiiThresholds.upper");
  if (upper <= lower) {
    throw new Error("tax.json: corporate.aaiiThresholds.upper must exceed .lower");
  }
  return {
    lower,
    upper,
    gradePerDollar: requireNumber(a.gradePerDollar, "corporate.aaiiThresholds.gradePerDollar"),
    source: requireString(a.source, "corporate.aaiiThresholds.source"),
  };
}

function parseCorporate(value: unknown): CorporateTaxYear {
  if (typeof value !== "object" || value === null) {
    throw new Error("tax.json: corporate must be an object");
  }
  const c = value as Record<string, unknown>;
  const fiscalYearEnd = requireString(c.fiscalYearEnd, "corporate.fiscalYearEnd");
  if (!FISCAL_YEAR_END.test(fiscalYearEnd)) {
    throw new Error("tax.json: corporate.fiscalYearEnd must be MM-DD");
  }
  return {
    fiscalYearEnd,
    passiveIncomeRate: parseSourcedValue(c.passiveIncomeRate, "corporate.passiveIncomeRate", 0, 1),
    partIVRate: parseSourcedValue(c.partIVRate, "corporate.partIVRate", 0, 1),
    aaiiThresholds: parseAaiiThresholds(c.aaiiThresholds),
    nerdtohRate: parseSourcedValue(c.nerdtohRate, "corporate.nerdtohRate", 0, 1),
    dividendRefundRate: parseSourcedValue(
      c.dividendRefundRate,
      "corporate.dividendRefundRate",
      0,
      1,
    ),
  };
}

function parseT1135(value: unknown): T1135Thresholds {
  if (typeof value !== "object" || value === null) {
    throw new Error("tax.json: t1135 must be an object");
  }
  const t = value as Record<string, unknown>;
  const filingThreshold = requireNumber(t.filingThreshold, "t1135.filingThreshold");
  const detailedThreshold = requireNumber(t.detailedThreshold, "t1135.detailedThreshold");
  if (detailedThreshold <= filingThreshold) {
    throw new Error("tax.json: t1135.detailedThreshold must exceed .filingThreshold");
  }
  return { filingThreshold, detailedThreshold, source: requireString(t.source, "t1135.source") };
}

function parseTaxYear(value: unknown, year: string): TaxYear {
  if (typeof value !== "object" || value === null) {
    throw new Error(`tax.json: ${year} must be an object`);
  }
  const y = value as Record<string, unknown>;
  return {
    personal: parsePersonal(y.personal),
    corporate: parseCorporate(y.corporate),
    t1135: parseT1135(y.t1135),
  };
}

/**
 * Parses `tax.json` into a `TaxTable`, throwing on the first field that
 * fails its shape or range check -- the same discipline `plan.ts` applies
 * to `plan.json`. A hand-edited rate that lands as a fraction of itself
 * (`4.826` for `0.4826`) must fail the build rather than silently halve
 * every tax figure on screen.
 */
export function parseTaxTable(value: unknown): TaxTable {
  if (typeof value !== "object" || value === null) {
    throw new Error("tax.json: must be an object");
  }
  const table: TaxTable = {};
  for (const [year, entry] of Object.entries(value as Record<string, unknown>)) {
    table[year] = parseTaxYear(entry, year);
  }
  return table;
}

/** The committed tax table, parsed once per call. */
export function loadTaxTable(): TaxTable {
  return parseTaxTable(raw);
}

/**
 * One year's rates, or `null` when `tax.json` carries no entry for it.
 * Callers must render "rates for `year` are not entered yet" rather than
 * fall back to another year's rates -- falling back would silently apply
 * last year's marginal rate to this year's income.
 */
export function taxYear(table: TaxTable, year: number): TaxYear | null {
  return table[String(year)] ?? null;
}
