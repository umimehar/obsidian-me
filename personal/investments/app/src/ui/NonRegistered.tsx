import { Flex } from "@radix-ui/themes";
import { PERSONAL_NONREG_KINDS, accountIdsOfKind } from "../analytics/accountScopes";
import type { AnalyticsOutput } from "../analytics/build";
import { claimableYear } from "../analytics/claimable";
import { withholdingByAccount } from "../analytics/incomeCosts";
import type { TaxTable } from "../tax";
import { taxYear } from "../tax";
import { formatCurrency } from "./format";
import type { YearScope } from "./scope";
import { AccountsSummary } from "./tax/AccountsSummary";
import { TaxHeader } from "./tax/Header";
import { PersonalHistory } from "./tax/History";
import { NeedsAttention } from "./tax/NeedsAttention";
import { RealizedGains } from "./tax/RealizedGains";
import { PersonalTaxPicture } from "./tax/TaxPicture";
import { attentionItems, harvestCandidates, salesByAccount, salesByMonth } from "./tax/summaries";
import { estimatedPersonalTax, personalTaxTiles } from "./tax/tiles";
import { Claimable } from "./wrappers/Claimable";
import { SuperficialLossWatch } from "./wrappers/SuperficialLossWatch";
import { T1135Card } from "./wrappers/T1135Card";
import { TaxableHoldings } from "./wrappers/TaxableHoldings";

export interface NonRegisteredProps {
  analytics: AnalyticsOutput;
  year: number;
  scope: YearScope;
  taxTable: TaxTable;
}

/** Everything `NonRegistered` needs to render, assembled once so the component itself stays a plain layout. */
function buildNonRegisteredView(analytics: AnalyticsOutput, year: number, taxTable: TaxTable) {
  const income = analytics.income[String(year)];
  const rates = taxYear(taxTable, year);
  const personalAccounts = analytics.series.filter((a) => PERSONAL_NONREG_KINDS.has(a.kind));
  const personalIds = accountIdsOfKind(analytics.series, PERSONAL_NONREG_KINDS);
  const labelById = new Map(personalAccounts.map((a) => [a.maskedId, a.label]));
  // Every account, not just the personal non-registered scope: a
  // superficial loss's replacement buy can land in a TFSA or RRSP, which
  // `labelById` above does not cover.
  const allLabelById = new Map(analytics.series.map((a) => [a.maskedId, a.label]));
  const allKindById = new Map(analytics.series.map((a) => [a.maskedId, a.kind]));
  const foreignTaxByAccount = new Map(
    withholdingByAccount(analytics, year)
      .filter((w) => personalIds.has(w.maskedId))
      .map((w) => [w.maskedId, w.withholdingTax]),
  );
  const claimable =
    rates === null
      ? null
      : claimableYear(
          analytics,
          year,
          personalIds,
          rates.personal.marginalRate.value,
          false,
          foreignTaxByAccount,
        );
  const superficialLoss = analytics.superficialLoss[String(year)] ?? [];
  const foreignProperty = analytics.foreignPropertyPersonal[String(year)];
  const harvestRates =
    rates === null
      ? null
      : {
          inclusion: rates.personal.capitalGainsInclusion.value,
          rate: rates.personal.marginalRate.value,
        };
  const harvest = harvestCandidates(analytics.personalHoldings, harvestRates);
  const attention = attentionItems({
    superficialLoss,
    harvest,
    t1135MaxCost: foreignProperty?.maxForeignCost ?? null,
    t1135FilingThreshold: rates?.t1135.filingThreshold ?? null,
    labelById: allLabelById,
    kindById: allKindById,
    formatCurrency,
  });

  return {
    income,
    rates,
    personalAccounts,
    labelById,
    claimable,
    superficialLoss,
    foreignProperty,
    harvestRates,
    attention,
  };
}

/**
 * The personal non-registered (and Crypto) tax tab, ordered around the four
 * questions the owner opens it to answer: what to report and roughly owe,
 * what needs action, how the accounts are doing, and the detail behind any
 * number -- see `redesign-spec.md`.
 */
export function NonRegistered({ analytics, year, scope, taxTable }: NonRegisteredProps) {
  const {
    income,
    rates,
    personalAccounts,
    labelById,
    claimable,
    superficialLoss,
    foreignProperty,
    harvestRates,
    attention,
  } = buildNonRegisteredView(analytics, year, taxTable);

  return (
    <Flex direction="column" gap="5">
      <TaxHeader
        title="Non-registered"
        year={year}
        scope={scope}
        accountLabels={personalAccounts.map((a) => a.label)}
        latestPeriod={analytics.personalHoldings.period}
      />

      {income !== undefined ? (
        <PersonalTaxPicture
          year={year}
          tiles={personalTaxTiles(
            income,
            rates?.personal.capitalGainsInclusion.value ?? 0.5,
            claimable,
          )}
          estimatedTax={rates === null ? 0 : estimatedPersonalTax(income, rates.personal)}
          marginalRatePercent={rates === null ? 0 : rates.personal.marginalRate.value * 100}
        />
      ) : null}

      {rates === null ? (
        <p data-rates-not-entered="" style={{ color: "var(--gray-11)" }}>
          Tax rates for {year} are not entered yet in data/tax.json. Realized gains and income
          figures below still show; the estimated tax and tax-value-if-harvested figures do not.
        </p>
      ) : null}

      <NeedsAttention items={attention} year={year} />

      <AccountsSummary accounts={personalAccounts} holdings={analytics.personalHoldings} />

      <TaxableHoldings
        holdings={analytics.personalHoldings}
        accounts={personalAccounts}
        harvestRates={harvestRates}
      />

      {income !== undefined ? (
        <RealizedGains
          year={year}
          sales={income.sales}
          byAccount={salesByAccount(income.sales, labelById)}
          byMonth={salesByMonth(income.sales)}
        />
      ) : null}

      <SuperficialLossWatch candidates={superficialLoss} />

      {claimable !== null ? <Claimable year={claimable} /> : null}

      {foreignProperty !== undefined && rates !== null ? (
        <T1135Card summary={foreignProperty} thresholds={rates.t1135} />
      ) : null}

      <PersonalHistory
        income={analytics.income}
        inclusion={rates?.personal.capitalGainsInclusion.value ?? 0.5}
      />
    </Flex>
  );
}

/** The two caveats this tab needs beyond the shared USD book-cost note -- passed to `App`'s `WithSummary` as `extraNotes`, so "About these numbers" renders once at the bottom rather than twice. */
export const NON_REGISTERED_NOTES: readonly string[] = [
  'In Canada, identical property held in more than one of your non-registered accounts shares one ACB pool across all of them: flagged as "pooled ACB" on its symbol. This project does not recompute ACB beyond the realized-gain ledger it already keeps.',
  "Every figure on this tab is an estimate for planning, never a filing number. Confirm against your actual T3, T5 and T5008 slips before filing.",
];
