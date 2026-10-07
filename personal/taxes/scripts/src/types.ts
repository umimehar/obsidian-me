/** The taxes datastore. Every JSON file under data/ is described here; pages render only from these. */

export type Scope = "corporate" | "personal" | "both";
export type DocScope = Scope;

/** ISO date, or a coarser YYYY-MM / YYYY when the day is not known. */
export type IsoDate = string;

/** A path relative to the evidence root, "session:<uuid>", "memory:<file>" or "vault:<path>". */
export type SourceRef = string;

export interface Meta {
  readonly as_of: IsoDate;
  /** The overview page's opening: one headline sentence, then a few labelled points. */
  readonly standing: {
    readonly headline: string;
    readonly points: readonly { readonly label: string; readonly text: string }[];
  };
  /** Up to two short tiles beside the computed "next deadline" tile on the overview. */
  readonly glance?: readonly GlanceTile[];
  readonly evidence_root: string;
  readonly corporation: {
    readonly legal_name: string;
    readonly operating_name: string;
    readonly bn: string;
    readonly hst_account: string;
    readonly payroll_account: string | null;
    readonly incorporated: IsoDate;
    readonly address: string;
    readonly province: string;
    readonly type: string;
    readonly year_end: string;
    readonly hst_period: string;
  };
  readonly person: {
    readonly name: string;
    readonly sin: string;
    readonly role: string;
  };
}

export interface GlanceTile {
  readonly label: string;
  readonly value: string;
  readonly note: string;
  readonly href?: string;
}

export type TimelineCategory =
  | "filing"
  | "payment"
  | "refund"
  | "decision"
  | "document"
  | "correspondence"
  | "discovery"
  | "correction"
  | "deadline"
  | "engagement"
  | "payroll"
  | "session"
  | "other";

export interface TimelineEvent {
  readonly id: string;
  readonly date: IsoDate;
  readonly scope: Scope;
  readonly category: TimelineCategory;
  readonly title: string;
  readonly detail: string;
  readonly amount?: number;
  readonly sources: readonly SourceRef[];
}

export interface Decision {
  readonly id: string;
  readonly date: IsoDate;
  readonly scope: Scope;
  readonly subject: string;
  readonly title: string;
  readonly decision: string;
  readonly rationale: string;
  readonly status: "active" | "superseded";
  readonly superseded_by?: string;
  readonly sources: readonly SourceRef[];
}

export type FilingKind =
  | "T2"
  | "HST"
  | "T1"
  | "T4"
  | "T4A"
  | "T5"
  | "payroll"
  | "instalments"
  | "other";

export type FilingStatus =
  | "filed"
  | "assessed"
  | "prepared"
  | "in-progress"
  | "upcoming"
  | "not-required";

export interface FilingLine {
  readonly label: string;
  readonly value: number;
}

export interface Filing {
  readonly id: string;
  readonly kind: FilingKind;
  readonly scope: Scope;
  readonly title: string;
  readonly period_start: IsoDate;
  readonly period_end: IsoDate;
  readonly due?: IsoDate;
  readonly payment_due?: IsoDate;
  readonly filed_on?: IsoDate;
  readonly filed_by?: string;
  readonly confirmation?: string;
  readonly status: FilingStatus;
  readonly result?: { readonly kind: "refund" | "owing" | "nil"; readonly amount: number };
  readonly plain: string;
  readonly lines: readonly FilingLine[];
  readonly notes: readonly string[];
  readonly sources: readonly SourceRef[];
}

export interface Figure {
  readonly label: string;
  readonly value: number;
  readonly basis: string;
  readonly note?: string;
  readonly sources: readonly SourceRef[];
}

export interface FigureGroup {
  readonly title: string;
  readonly scope: Scope;
  readonly note?: string;
  readonly figures: readonly Figure[];
}

/** One calendar year. Corporate and personal years both run January to December. */
export interface YearRecord {
  readonly year: number;
  readonly status: "closed" | "open" | "partial";
  readonly summary: string;
  readonly corporate_story: readonly string[];
  readonly personal_story: readonly string[];
  readonly groups: readonly FigureGroup[];
}

export type ItemStatus = "open" | "waiting" | "done" | "superseded";

export interface OpenItem {
  readonly id: string;
  readonly title: string;
  readonly owner: string;
  readonly scope: Scope;
  readonly due?: IsoDate;
  readonly status: ItemStatus;
  readonly detail: string;
  readonly closed_on?: IsoDate;
  readonly sources: readonly SourceRef[];
}

export interface Entity {
  readonly id: string;
  readonly name: string;
  readonly group:
    | "self"
    | "accountant"
    | "client"
    | "employee"
    | "contractor"
    | "government"
    | "bank"
    | "vendor";
  readonly role: string;
  readonly scope: Scope;
  readonly period?: string;
  readonly detail: string;
  readonly sources: readonly SourceRef[];
}

export interface GlossaryTerm {
  readonly term: string;
  readonly plain: string;
}

export type DocCategory =
  | "t2"
  | "t1"
  | "hst-return"
  | "slip"
  | "payroll"
  | "accountant"
  | "resolution"
  | "vehicle"
  | "bank-statement"
  | "card-statement"
  | "invoice"
  | "receipt"
  | "workbook"
  | "report"
  | "package"
  | "workspace"
  | "other";

export interface DocRecord {
  readonly path: string;
  readonly bytes: number;
  readonly modified: IsoDate;
  readonly sha256: string;
  readonly category: DocCategory;
  readonly scope: DocScope;
  readonly year: number | null;
  readonly month: string | null;
  readonly bundle: string | null;
  readonly duplicate_of: string | null;
}

export interface Catalog {
  readonly generated: IsoDate;
  readonly root: string;
  readonly ignored: number;
  readonly files: readonly DocRecord[];
}

export interface TaxData {
  readonly meta: Meta;
  readonly timeline: readonly TimelineEvent[];
  readonly decisions: readonly Decision[];
  readonly filings: readonly Filing[];
  readonly years: readonly YearRecord[];
  readonly openItems: readonly OpenItem[];
  readonly entities: readonly Entity[];
  readonly glossary: readonly GlossaryTerm[];
  readonly catalog: Catalog;
}
