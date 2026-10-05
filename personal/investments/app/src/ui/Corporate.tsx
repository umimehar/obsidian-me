import { Flex } from "@radix-ui/themes";
import { CORPORATE_KINDS, accountIdsOfKind } from "../analytics/accountScopes";
import type { AnalyticsOutput } from "../analytics/build";
import { claimableYear } from "../analytics/claimable";
import { passiveIncomeYear, runningCapitalAccounts } from "../analytics/corporatePassiveIncome";
import { withholdingByAccount } from "../analytics/incomeCosts";
import type { TaxTable } from "../tax";
import { taxYear } from "../tax";
import { formatCurrency } from "./format";
import type { YearScope } from "./scope";
import { AccountsSummary } from "./tax/AccountsSummary";
import { TaxHeader } from "./tax/Header";
import { CorporateHistory } from "./tax/History";
import { NeedsAttention } from "./tax/NeedsAttention";
import { CorporateTaxPicture } from "./tax/TaxPicture";
import { attentionItems } from "./tax/summaries";
import { corporateTaxTiles } from "./tax/tiles";
import { Claimable } from "./wrappers/Claimable";
import { T1135Card } from "./wrappers/T1135Card";
import { TaxableHoldings } from "./wrappers/TaxableHoldings";

export interface CorporateProps {
  analytics: AnalyticsOutput;
  year: number;
  scope: YearScope;
  taxTable: TaxTable;
}

/**
 * The corporation's own tax tab -- a separate taxpayer from the owner, same
 * four-question ordering as `NonRegistered`: what to report, what needs
 * action, how the accounts are doing, and the detail behind any number.
 */
export function Corporate({ analytics, year, scope, taxTable }: CorporateProps) {
  const income = analytics.corporateIncome[String(year)];
  const rates = taxYear(taxTable, year);
  const corporateAccounts = analytics.series.filter((a) => CORPORATE_KINDS.has(a.kind));
  const corporateIds = accountIdsOfKind(analytics.series, CORPORATE_KINDS);
  const labelById = new Map(corporateAccounts.map((a) => [a.maskedId, a.label]));
  const foreignTaxByAccount = new Map(
    withholdingByAccount(analytics, year)
      .filter((w) => corporateIds.has(w.maskedId))
      .map((w) => [w.maskedId, w.withholdingTax]),
  );
  const claimable =
    rates === null
      ? null
      : claimableYear(
          analytics,
          year,
          corporateIds,
          rates.corporate.passiveIncomeRate.value,
          true,
          foreignTaxByAccount,
        );
  const foreignProperty = analytics.foreignPropertyCorporate[String(year)];

  const allYears = Object.keys(analytics.corporateIncome)
    .map(Number)
    .sort((a, b) => a - b);
  const passiveYears =
    rates === null
      ? []
      : allYears.map((y) => {
          const yearIncome = analytics.corporateIncome[String(y)];
          return yearIncome ? passiveIncomeYear(y, yearIncome, rates.corporate) : null;
        });
  const validPassiveYears = passiveYears.filter((p): p is NonNullable<typeof p> => p !== null);
  const runningRows = runningCapitalAccounts(validPassiveYears);
  const thisYearPassive = validPassiveYears.find((p) => p.year === year) ?? null;

  const kindById = new Map(analytics.series.map((a) => [a.maskedId, a.kind]));
  const attention = attentionItems({
    superficialLoss: [],
    harvest: [],
    t1135MaxCost: foreignProperty?.maxForeignCost ?? null,
    t1135FilingThreshold: rates?.t1135.filingThreshold ?? null,
    labelById,
    kindById,
    formatCurrency,
  });

  return (
    <Flex direction="column" gap="5">
      <TaxHeader
        title="Corporate"
        year={year}
        scope={scope}
        accountLabels={corporateAccounts.map((a) => a.label)}
        latestPeriod={analytics.corporateHoldings.period}
      />

      {thisYearPassive !== null ? (
        <CorporateTaxPicture
          year={year}
          tiles={corporateTaxTiles(thisYearPassive, claimable)}
          aaii={thisYearPassive.aaii}
          sbdEliminated={thisYearPassive.sbdEliminated}
        />
      ) : null}

      {income === undefined ? (
        <p data-no-income="" style={{ color: "var(--gray-11)" }}>
          No income data for {year}.
        </p>
      ) : rates === null ? (
        <p data-rates-not-entered="" style={{ color: "var(--gray-11)" }}>
          Tax rates for {year} are not entered yet in data/tax.json. Income figures still show;
          AAII, passive-rate and CDA/RDTOH figures do not.
        </p>
      ) : null}

      <NeedsAttention items={attention} year={year} />

      <AccountsSummary accounts={corporateAccounts} holdings={analytics.corporateHoldings} />

      <TaxableHoldings
        holdings={analytics.corporateHoldings}
        accounts={corporateAccounts}
        harvestRates={null}
      />

      {claimable !== null ? <Claimable year={claimable} /> : null}

      {foreignProperty !== undefined && rates !== null ? (
        <T1135Card summary={foreignProperty} thresholds={rates.t1135} />
      ) : null}

      <CorporateHistory rows={runningRows} />
    </Flex>
  );
}

/** The two caveats this tab needs beyond the shared USD book-cost note -- passed to `App`'s `WithSummary` as `extraNotes`, so "About these numbers" renders once at the bottom rather than twice. */
export const CORPORATE_NOTES: readonly string[] = [
  'In Canada, identical property held in more than one of the corporation\'s own non-registered accounts shares one ACB pool across all of them: flagged as "pooled ACB" on its symbol.',
  "AAII, the small business deduction grind, Part IV tax, RDTOH and the capital dividend account are all estimates built from statements, never the T2 filing figures.",
];
