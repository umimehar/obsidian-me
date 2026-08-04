// Pure engine projecting registered account contributions, government grants,
// room remaining, and value thirty years forward. No DOM, no `node:` imports —
// see docs/superpowers/specs/2026-08-04-registered-projection-design.md.
//
// Money is carried unrounded year to year; only the published TFSA/RRSP
// limits are rounded (that rounding is a real CRA publication rule, not a
// display concern). Every group's indexation compounds an UNROUNDED running
// base — rounding only the figure handed back for the year. Compounding the
// rounded figure is the classic bug here: $7,000 x 1.02 rounds back to
// $7,000, silently pinning the TFSA limit forever.

// Local structural type, kept in sync with `RegisteredRules` in
// `src/analytics.ts` by hand (this file must not import values from there —
// see CLAUDE.md, "src/client/ is browser-only").
export interface RegisteredRules {
  fhsaAnnual: number;
  fhsaLifetime: number;
  respLifetime: number;
  respGrantTarget: number;
  respCatchupTarget: number;
  cesgRate: number;
  cesgAnnualBasic: number;
  cesgAnnualMax: number;
  cesgLifetime: number;
  tfsaRounding: number;
  rrspRounding: number;
}

export interface ProjectionInputs {
  startYear: string;
  years: number;
  returnRate: number;
  indexRate: number;
  opening: Record<string, number>;
  contributedThisYear: Record<string, number>;
  lifetimeContributed: Record<string, number>;
  cesgReceived: number;
  cesgRoomAccrued: number;
  rrspAssessedRemaining: number;
  fhsaCloseYear: string;
  rrspLastYear: string;
  cesgLastYear: string;
  // Unrounded room base per group at startYear (TFSA, RRSP), used to seed
  // indexation going forward. Not derivable from `contributedThisYear`: that
  // field tracks money already contributed, not the published limit itself.
  // FHSA/RESP are absent here because their limits are statutory flats,
  // carried in `rules` instead.
  roomBase: Record<string, number>;
  rules: RegisteredRules;
}

export interface ProjectionYear {
  year: string;
  contributions: Record<string, number>;
  grant: number;
  roomRemaining: Record<string, number>;
  cumulativeIn: number;
  cumulativeGrant: number;
  withdrawn: number;
  value: number;
  notes: string[];
}

interface EngineState {
  tfsaBase: number;
  rrspBase: number;
  fhsaLifetime: number;
  respLifetime: number;
  tfsaValue: number;
  fhsaValue: number;
  rrspValue: number;
  respValue: number;
  fhsaCapNoted: boolean;
  respCapNoted: boolean;
  cesgMaxNoted: boolean;
  fhsaClosed: boolean;
  cesgRoomAccrued: number;
  cesgTotalReceived: number;
}

const at = (record: Record<string, number>, key: string): number => record[key] ?? 0;

const indexedRoom = (base: number, roundingUnit: number): number =>
  Math.round(base / roundingUnit) * roundingUnit;

// The start-year top-up subtracts money already in this calendar year; later
// years subtract nothing extra, since `contribution` already covers the
// whole year's usage.
function annualRoomRemaining(
  granted: number,
  contributedThisYear: number,
  contribution: number,
  isStartYear: boolean,
): number {
  const alreadyIn = isStartYear ? contributedThisYear : 0;
  return Math.max(0, granted - alreadyIn - contribution);
}

function tfsaStep(
  state: EngineState,
  isStartYear: boolean,
  inputs: ProjectionInputs,
): { contribution: number; roomRemaining: number } {
  const granted = indexedRoom(state.tfsaBase, inputs.rules.tfsaRounding);
  const contributedThisYear = at(inputs.contributedThisYear, "TFSA");
  const contribution = isStartYear ? Math.max(0, granted - contributedThisYear) : granted;
  const roomRemaining = annualRoomRemaining(
    granted,
    contributedThisYear,
    contribution,
    isStartYear,
  );
  return { contribution, roomRemaining };
}

function rrspStep(
  state: EngineState,
  isStartYear: boolean,
  year: string,
  inputs: ProjectionInputs,
): { contribution: number; roomRemaining: number } {
  const granted = indexedRoom(state.rrspBase, inputs.rules.rrspRounding);
  const contributedThisYear = at(inputs.contributedThisYear, "RRSP");
  const lastYear = Number(inputs.rrspLastYear);
  const y = Number(year);
  let contribution: number;
  if (isStartYear) contribution = inputs.rrspAssessedRemaining;
  else if (y <= lastYear) contribution = granted;
  else contribution = 0;
  const roomRemaining = annualRoomRemaining(
    granted,
    contributedThisYear,
    contribution,
    isStartYear,
  );
  return { contribution, roomRemaining };
}

function fhsaStep(
  state: EngineState,
  isStartYear: boolean,
  year: string,
  inputs: ProjectionInputs,
): { contribution: number; roomRemaining: number; note: string | null } {
  const closeYear = Number(inputs.fhsaCloseYear);
  const closed = Number(year) >= closeYear;
  const remainingLifetime = Math.max(0, inputs.rules.fhsaLifetime - state.fhsaLifetime);
  const annualRoom = isStartYear
    ? Math.max(0, inputs.rules.fhsaAnnual - at(inputs.contributedThisYear, "FHSA"))
    : inputs.rules.fhsaAnnual;
  const contribution = closed ? 0 : Math.max(0, Math.min(annualRoom, remainingLifetime));

  const wasUncapped = state.fhsaLifetime < inputs.rules.fhsaLifetime;
  state.fhsaLifetime += contribution;
  const nowCapped = state.fhsaLifetime >= inputs.rules.fhsaLifetime;
  const note = wasUncapped && nowCapped && !state.fhsaCapNoted ? "FHSA lifetime cap reached" : null;
  if (note) state.fhsaCapNoted = true;

  const roomRemaining = closed ? 0 : Math.max(0, inputs.rules.fhsaLifetime - state.fhsaLifetime);
  return { contribution, roomRemaining, note };
}

function respClaimable(
  state: EngineState,
  isStartYear: boolean,
  cesgActive: boolean,
  inputs: ProjectionInputs,
): {
  claimable: number;
  grantRoom: number;
  lifetimeRemaining: number;
  grantReceivedThisYearSoFar: number;
} {
  const grantReceivedThisYearSoFar = isStartYear ? inputs.cesgReceived : 0;
  const lifetimeRemaining = Math.max(0, inputs.rules.cesgLifetime - state.cesgTotalReceived);
  const grantRoom = Math.max(0, state.cesgRoomAccrued - state.cesgTotalReceived);
  const claimable = cesgActive
    ? Math.max(
        0,
        Math.min(
          inputs.rules.cesgAnnualMax - grantReceivedThisYearSoFar,
          grantRoom,
          lifetimeRemaining,
        ),
      )
    : 0;
  return { claimable, grantRoom, lifetimeRemaining, grantReceivedThisYearSoFar };
}

function respStep(
  state: EngineState,
  isStartYear: boolean,
  year: string,
  inputs: ProjectionInputs,
): { contribution: number; grant: number; roomRemaining: number; notes: string[] } {
  const notes: string[] = [];
  const cesgActive = Number(year) <= Number(inputs.cesgLastYear);
  const { claimable, grantRoom, lifetimeRemaining, grantReceivedThisYearSoFar } = respClaimable(
    state,
    isStartYear,
    cesgActive,
    inputs,
  );

  const contributedSoFar = isStartYear ? at(inputs.contributedThisYear, "RESP") : 0;
  const target = Math.min(
    inputs.rules.respCatchupTarget,
    Math.max(claimable / inputs.rules.cesgRate, inputs.rules.respGrantTarget - contributedSoFar),
  );
  const respRoomLeft = Math.max(0, inputs.rules.respLifetime - state.respLifetime);
  const contribution = Math.max(0, Math.min(target, respRoomLeft));

  const grant = cesgActive
    ? Math.max(
        0,
        Math.min(
          inputs.rules.cesgRate * contribution,
          inputs.rules.cesgAnnualMax - grantReceivedThisYearSoFar,
          grantRoom,
          lifetimeRemaining,
        ),
      )
    : 0;

  const wasRespUncapped = state.respLifetime < inputs.rules.respLifetime;
  state.respLifetime += contribution;
  if (wasRespUncapped && state.respLifetime >= inputs.rules.respLifetime && !state.respCapNoted) {
    notes.push("RESP lifetime cap reached");
    state.respCapNoted = true;
  }

  state.cesgTotalReceived += grant;
  state.cesgRoomAccrued += inputs.rules.cesgAnnualBasic;
  if (state.cesgTotalReceived >= inputs.rules.cesgLifetime && !state.cesgMaxNoted) {
    notes.push("CESG lifetime max reached");
    state.cesgMaxNoted = true;
  }

  const roomRemaining = Math.max(0, inputs.rules.respLifetime - state.respLifetime);
  return { contribution, grant, roomRemaining, notes };
}

function advanceValues(
  state: EngineState,
  returnRate: number,
  contributions: Record<string, number>,
  grant: number,
): void {
  state.tfsaValue = state.tfsaValue * (1 + returnRate) + at(contributions, "TFSA");
  state.fhsaValue = state.fhsaValue * (1 + returnRate) + at(contributions, "FHSA");
  state.rrspValue = state.rrspValue * (1 + returnRate) + at(contributions, "RRSP");
  state.respValue = state.respValue * (1 + returnRate) + at(contributions, "RESP") + grant;
}

function applyFhsaClosure(state: EngineState, year: string, closeYear: string): number {
  if (state.fhsaClosed || Number(year) < Number(closeYear)) return 0;
  const withdrawn = state.fhsaValue;
  state.fhsaValue = 0;
  state.fhsaClosed = true;
  return withdrawn;
}

function buildYear(
  state: EngineState,
  year: string,
  isStartYear: boolean,
  inputs: ProjectionInputs,
  prevCumulativeIn: number,
  prevCumulativeGrant: number,
): ProjectionYear {
  const tfsa = tfsaStep(state, isStartYear, inputs);
  const fhsa = fhsaStep(state, isStartYear, year, inputs);
  const rrsp = rrspStep(state, isStartYear, year, inputs);
  const resp = respStep(state, isStartYear, year, inputs);

  const contributions = {
    TFSA: tfsa.contribution,
    FHSA: fhsa.contribution,
    RRSP: rrsp.contribution,
    RESP: resp.contribution,
  };
  const grant = resp.grant;

  advanceValues(state, inputs.returnRate, contributions, grant);
  const withdrawn = applyFhsaClosure(state, year, inputs.fhsaCloseYear);

  const notes = [...(fhsa.note ? [fhsa.note] : [])];
  if (withdrawn > 0) notes.push("FHSA closed, withdrawn for home");
  notes.push(...resp.notes);

  const contributedIn =
    tfsa.contribution + fhsa.contribution + rrsp.contribution + resp.contribution;

  return {
    year,
    contributions,
    grant,
    roomRemaining: {
      TFSA: tfsa.roomRemaining,
      FHSA: fhsa.roomRemaining,
      RRSP: rrsp.roomRemaining,
      RESP: resp.roomRemaining,
    },
    cumulativeIn: prevCumulativeIn + contributedIn,
    cumulativeGrant: prevCumulativeGrant + grant,
    withdrawn,
    value: state.tfsaValue + state.fhsaValue + state.rrspValue + state.respValue,
    notes,
  };
}

function initialState(inputs: ProjectionInputs): EngineState {
  return {
    tfsaBase: at(inputs.roomBase, "TFSA"),
    rrspBase: at(inputs.roomBase, "RRSP"),
    fhsaLifetime: at(inputs.lifetimeContributed, "FHSA"),
    respLifetime: at(inputs.lifetimeContributed, "RESP"),
    tfsaValue: at(inputs.opening, "TFSA"),
    fhsaValue: at(inputs.opening, "FHSA"),
    rrspValue: at(inputs.opening, "RRSP"),
    respValue: at(inputs.opening, "RESP"),
    fhsaCapNoted: false,
    respCapNoted: false,
    cesgMaxNoted: false,
    fhsaClosed: false,
    cesgRoomAccrued: inputs.cesgRoomAccrued,
    cesgTotalReceived: inputs.cesgReceived,
  };
}

export function projectYears(inputs: ProjectionInputs): ProjectionYear[] {
  const rowCount = Math.max(1, inputs.years + 1);
  const startYear = Number(inputs.startYear);
  const state = initialState(inputs);

  const rows: ProjectionYear[] = [];
  let cumulativeIn = 0;
  let cumulativeGrant = 0;

  for (let i = 0; i < rowCount; i++) {
    const year = String(startYear + i);
    const row = buildYear(state, year, i === 0, inputs, cumulativeIn, cumulativeGrant);
    cumulativeIn = row.cumulativeIn;
    cumulativeGrant = row.cumulativeGrant;
    rows.push(row);
    state.tfsaBase *= 1 + inputs.indexRate;
    state.rrspBase *= 1 + inputs.indexRate;
  }

  return rows;
}
