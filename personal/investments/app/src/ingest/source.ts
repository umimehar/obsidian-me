export type Template = "BROKERAGE" | "CASH" | "PERFORMANCE";

export interface SourceRef {
  file: string;
  accountNo: string;
  period: string;
  template: Template;
  /** Amended-statement version, 0 when the filename carries no suffix. */
  version: number;
}

const TEMPLATES: readonly Template[] = ["BROKERAGE", "CASH", "PERFORMANCE"];
const FILENAME = /^([A-Z0-9]+)_(\d{4})-(\d{2})_([A-Z]+)(?:_v_(\d+))?\.pdf$/;

export function parseSourceFilename(file: string): SourceRef | null {
  const m = FILENAME.exec(file);
  if (!m) return null;
  const [, accountNo, year, month, rawTemplate, version] = m;
  if (!accountNo || !year || !month || !rawTemplate) return null;

  const monthNum = Number(month);
  if (monthNum < 1 || monthNum > 12) return null;

  const template = TEMPLATES.find((t) => t === rawTemplate);
  if (!template) return null;

  return {
    file,
    accountNo,
    period: `${year}-${month}`,
    template,
    version: version === undefined ? 0 : Number(version),
  };
}
