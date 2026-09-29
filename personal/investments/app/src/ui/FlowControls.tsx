import { Flex, Select, Text } from "@radix-ui/themes";
import type { GroupBy } from "../analytics/flows/graph";
import { type FlowPeriod, latestMonth, yearPeriod } from "../analytics/flows/period";
import type { FlowsData } from "../analytics/flows/types";
import type { AccountSeries } from "../analytics/types";
import { AccountFilter } from "./AccountFilter";
import { formatPeriodLabel } from "./charts/plot";
import { type FlowPeriodPreset, monthOptions, presetOf, yearOptions } from "./flowPeriods";

export interface FlowControlsProps {
  flows: FlowsData;
  period: FlowPeriod | "all";
  onPeriodChange: (p: FlowPeriod | "all") => void;
  groupBy: GroupBy;
  onGroupByChange: (g: GroupBy) => void;
  accountOptions: readonly AccountSeries[];
  accounts: Set<string>;
  onAccountsChange: (s: Set<string>) => void;
  isDefaultAccounts: boolean;
  onResetAccounts: () => void;
}

const PRESET_LABELS: Record<FlowPeriodPreset, string> = {
  thisMonth: "This month",
  month: "Month",
  year: "Year",
  range: "Custom range",
  allTime: "All time",
};

const PRESET_ORDER: readonly FlowPeriodPreset[] = [
  "thisMonth",
  "month",
  "year",
  "range",
  "allTime",
];

const GROUP_LABELS: Record<GroupBy, string> = {
  accountType: "Account type",
  account: "Account",
  purpose: "Purpose",
  assetClass: "Asset class",
  holding: "Holding",
};

const GROUP_ORDER: readonly GroupBy[] = [
  "accountType",
  "account",
  "purpose",
  "assetClass",
  "holding",
];

/**
 * What the account filter's trigger names when the selection is not every
 * account: the single account's own label, or a plain count. Never
 * "Portfolio" -- this tab has no portfolio total, since it counts
 * registered contributions alongside chequing and the spousal RRSP, which
 * `chartAccounts.ts`'s `chartSubject` (the Portfolio tab's own version of
 * this) excludes.
 */
function accountsSubject(
  accountOptions: readonly AccountSeries[],
  selected: ReadonlySet<string>,
): string {
  const picked = accountOptions.filter((a) => selected.has(a.maskedId));
  const [only] = picked;
  return picked.length === 1 && only !== undefined ? only.label : `${picked.length} accounts`;
}

/** The period a newly chosen preset opens with, before either dependent select is touched. */
function defaultPeriodFor(flows: FlowsData, preset: FlowPeriodPreset): FlowPeriod | "all" {
  const months = monthOptions(flows);
  const years = yearOptions(flows);
  const last = months[months.length - 1] ?? "";
  const first = months[0] ?? "";
  if (preset === "allTime") return "all";
  if (preset === "thisMonth") return latestMonth(flows);
  if (preset === "month") return { from: last, to: last };
  if (preset === "year") return yearPeriod(years[years.length - 1] ?? 0);
  return { from: first, to: last };
}

function PresetSelect({
  flows,
  period,
  onPeriodChange,
}: Pick<FlowControlsProps, "flows" | "period" | "onPeriodChange">) {
  const preset = presetOf(flows, period);
  return (
    <Select.Root
      value={preset}
      onValueChange={(value) => {
        // A lookup against the select's own known values, not a cast: the
        // value Radix hands back is always one of `PRESET_ORDER`'s own
        // strings, but reading it back typed as one is a claim the type
        // checker should verify, not one this component asserts.
        const next = PRESET_ORDER.find((p) => p === value);
        if (next !== undefined) onPeriodChange(defaultPeriodFor(flows, next));
      }}
    >
      <Select.Trigger aria-label="Period" data-flow-period="" />
      <Select.Content>
        {PRESET_ORDER.map((p) => (
          <Select.Item key={p} value={p}>
            {PRESET_LABELS[p]}
          </Select.Item>
        ))}
      </Select.Content>
    </Select.Root>
  );
}

function MonthSelect({
  flows,
  value,
  onChange,
  label,
}: {
  flows: FlowsData;
  value: string;
  onChange: (month: string) => void;
  label: string;
}) {
  return (
    <Select.Root value={value} onValueChange={onChange}>
      <Select.Trigger aria-label={label} />
      <Select.Content>
        {monthOptions(flows).map((m) => (
          <Select.Item key={m} value={m}>
            {formatPeriodLabel(m)}
          </Select.Item>
        ))}
      </Select.Content>
    </Select.Root>
  );
}

/** The month, year or from/to selects a preset needs, or nothing for "This month"/"All time". */
function DependentSelects({
  flows,
  period,
  onPeriodChange,
}: Pick<FlowControlsProps, "flows" | "period" | "onPeriodChange">) {
  const preset = presetOf(flows, period);
  if (preset === "month" && period !== "all") {
    return (
      <MonthSelect
        flows={flows}
        value={period.from}
        label="Month"
        onChange={(m) => onPeriodChange({ from: m, to: m })}
      />
    );
  }
  if (preset === "year" && period !== "all") {
    const years = yearOptions(flows);
    return (
      <Select.Root
        value={period.from.slice(0, 4)}
        onValueChange={(y) => onPeriodChange(yearPeriod(Number(y)))}
      >
        <Select.Trigger aria-label="Year" />
        <Select.Content>
          {years.map((y) => (
            <Select.Item key={y} value={String(y)}>
              {y}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
    );
  }
  if (preset === "range" && period !== "all") {
    return (
      <Flex gap="2" align="center">
        <MonthSelect
          flows={flows}
          value={period.from}
          label="From"
          onChange={(m) => onPeriodChange({ from: m, to: m > period.to ? m : period.to })}
        />
        <Text size="2" color="gray">
          to
        </Text>
        <MonthSelect
          flows={flows}
          value={period.to}
          label="To"
          onChange={(m) => onPeriodChange({ from: m < period.from ? m : period.from, to: m })}
        />
      </Flex>
    );
  }
  return null;
}

/**
 * The Flow tab's own controls: period (replacing the global `YearFilter` on
 * this tab), group by, and the account filter -- listing every account,
 * chequing and the spousal RRSP included, defaulting to all selected.
 */
export function FlowControls(props: FlowControlsProps) {
  const { flows, groupBy, onGroupByChange, accountOptions, accounts, onAccountsChange } = props;
  return (
    <Flex justify="between" align="center" gap="3" wrap="wrap" data-flow-controls="">
      <Flex align="center" gap="3" wrap="wrap">
        <PresetSelect flows={flows} period={props.period} onPeriodChange={props.onPeriodChange} />
        <DependentSelects
          flows={flows}
          period={props.period}
          onPeriodChange={props.onPeriodChange}
        />
      </Flex>
      <Flex align="center" gap="3">
        <Select.Root
          value={groupBy}
          onValueChange={(v) => {
            const next = GROUP_ORDER.find((g) => g === v);
            if (next !== undefined) onGroupByChange(next);
          }}
        >
          <Select.Trigger aria-label="Group by" />
          <Select.Content>
            {GROUP_ORDER.map((g) => (
              <Select.Item key={g} value={g}>
                {GROUP_LABELS[g]}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
        <AccountFilter
          accounts={accountOptions}
          selected={accounts}
          subject={accountsSubject(accountOptions, accounts)}
          isDefault={props.isDefaultAccounts}
          onSelectedChange={onAccountsChange}
          onReset={props.onResetAccounts}
          defaultLabel={(count) => `All ${count} accounts`}
        />
      </Flex>
    </Flex>
  );
}
