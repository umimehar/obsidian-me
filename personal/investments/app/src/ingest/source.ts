import { type Page, findRow } from "./geometry";

export type Template = "BROKERAGE" | "CASH" | "PERFORMANCE";

export interface SourceRef {
  file: string;
  accountNo: string;
  period: string;
  template: Template;
  /** Amended-statement version, 0 when the filename carries no suffix. */
  version: number;
}

/**
 * Filename-derived fields, plus whether the filename actually states a
 * template. It does not, in general: a fresh Wealthsimple download is named
 * `<ACCOUNT>_person-<id>_<YYYY-MM>_v_<n>.pdf`, with no template segment at
 * all, while the bulk export uses `<ACCOUNT>_<YYYY-MM>_<TEMPLATE>.pdf`. When
 * `templateStated` is false, `template` is a placeholder the caller must
 * replace with `detectTemplate` before the value is used for anything --
 * never trust it as-is.
 */
export interface ParsedFilename extends SourceRef {
  templateStated: boolean;
}

const TEMPLATES: readonly Template[] = ["BROKERAGE", "CASH", "PERFORMANCE"];
const CONVENTIONAL = /^([A-Z0-9]+)_(\d{4})-(\d{2})_([A-Z]+)(?:_v_(\d+))?\.pdf$/;
/** A fresh Wealthsimple download: no template segment, but always a version. */
const FRESH_DOWNLOAD = /^([A-Z0-9]+)_person-[A-Za-z0-9]+_(\d{4})-(\d{2})_v_(\d+)\.pdf$/;

function parseConventional(file: string): ParsedFilename | null {
  const m = CONVENTIONAL.exec(file);
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
    templateStated: true,
  };
}

function parseFreshDownload(file: string): ParsedFilename | null {
  const m = FRESH_DOWNLOAD.exec(file);
  if (!m) return null;
  const [, accountNo, year, month, version] = m;
  if (!accountNo || !year || !month || !version) return null;

  const monthNum = Number(month);
  if (monthNum < 1 || monthNum > 12) return null;

  return {
    file,
    accountNo,
    period: `${year}-${month}`,
    template: "BROKERAGE", // placeholder -- this form carries no template segment to read
    version: Number(version),
    templateStated: false,
  };
}

export function parseSourceFilename(file: string): ParsedFilename | null {
  return parseConventional(file) ?? parseFreshDownload(file);
}

/**
 * The template as the document itself states it, never as the filename
 * claims -- the filename is not reliable in general (see `ParsedFilename`),
 * and classifying by filename is the exact failure mode that hid $8,000 of
 * RRSP contributions in the CSV-era pipeline this replaces. A PERFORMANCE
 * statement is the only one carrying money-weighted return rates; a CASH
 * statement calls itself a monthly statement on its first page (checked only
 * there, since later pages carry unrelated running text that can coincide);
 * a BROKERAGE statement names its own account type as managed or order
 * execution only. Returns null when none of the three markers are present,
 * which the caller must treat as a real ingest failure, not a guess.
 */
export function detectTemplate(pages: readonly Page[]): Template | null {
  if (findRow(pages, /Money-weighted Return Rates/i)) return "PERFORMANCE";
  const firstPage = pages[0];
  if (firstPage && findRow([firstPage], /monthly statement/i)) return "CASH";
  if (findRow(pages, /MANAGED ACCOUNT|ORDER EXECUTION ONLY ACCOUNT/i)) return "BROKERAGE";
  return null;
}
