import { Button, DropdownMenu } from "@radix-ui/themes";
import type { AccountSeries } from "../analytics/types";

export interface AccountFilterProps {
  accounts: readonly AccountSeries[];
  selected: ReadonlySet<string>;
  /** One account's label or "N accounts": the same words the chart's title uses. */
  subject: string;
  /** True when the selection is exactly the portfolio total's accounts. */
  isDefault: boolean;
  onSelectedChange: (selected: Set<string>) => void;
  onReset: () => void;
  /**
   * The trigger's label when every account is selected: "Portfolio" on the
   * tabs that have a portfolio total to name themselves after. The Flow tab
   * has no such total -- it counts registered contributions alongside
   * chequing and the spousal RRSP -- so it passes "All accounts" instead,
   * never "Portfolio".
   */
  defaultLabel?: string;
}

/**
 * Narrows the main chart to any set of accounts. Every tick is the chart's
 * state, not a separate draft of it: the list and the line always agree.
 * The headline total and the tabs stay on the portfolio.
 */
export function AccountFilter({
  accounts,
  selected,
  subject,
  isDefault,
  onSelectedChange,
  onReset,
  defaultLabel = "Portfolio",
}: AccountFilterProps) {
  const label = isDefault ? `${defaultLabel} (${selected.size} accounts)` : subject;

  function toggle(id: string, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    onSelectedChange(next);
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        <Button
          size="1"
          variant="soft"
          color="gray"
          aria-label={`Accounts: ${label}`}
          data-account-filter=""
        >
          {label}
          <DropdownMenu.TriggerIcon />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content size="1">
        {accounts.map((a) => {
          const checked = selected.has(a.maskedId);
          return (
            <DropdownMenu.CheckboxItem
              key={a.maskedId}
              checked={checked}
              // The last ticked account stays ticked, so the chart is never empty.
              disabled={checked && selected.size === 1}
              onCheckedChange={(next) => toggle(a.maskedId, next === true)}
              // Keeps the menu open, so several accounts can be ticked in one go.
              onSelect={(event) => event.preventDefault()}
            >
              {a.label}
              {a.inTotals ? null : " (not in total)"}
            </DropdownMenu.CheckboxItem>
          );
        })}
        <DropdownMenu.Separator />
        <DropdownMenu.Item disabled={isDefault} onSelect={onReset}>
          Reset to portfolio
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
