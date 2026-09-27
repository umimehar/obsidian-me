import { join } from "node:path";

/** The committed benchmark data `simulateBenchmark` reads. */
export interface BenchmarkData {
  symbol: string;
  fetched: string;
  /** `YYYY-MM` -> that month's last trading day close, adjusted for distributions. */
  closes: Record<string, number>;
}

const SYMBOL = "XEQT.TO";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/120.0.0.0 Safari/537.36";
const DATA_DIR = join(import.meta.dir, "..", "..", "..", "data");

interface ChartResult {
  timestamp: readonly number[];
  adjcloses: readonly (number | null)[];
}

/** `YYYY-MM` for a chart timestamp, in UTC so the month never drifts with the machine's own timezone. */
function periodOf(timestampSeconds: number): string {
  const date = new Date(timestampSeconds * 1000);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/**
 * Each month's LAST trading day close, from a daily series. Yahoo's own
 * monthly bars (`interval=1mo`) are dated to the first of the month rather
 * than the day actually traded, which reads as the wrong day if taken at
 * face value -- fetching daily bars and taking each month's last one avoids
 * that misreading entirely.
 */
export function monthlyClosesFromDaily(
  timestamps: readonly number[],
  adjcloses: readonly (number | null)[],
): Record<string, number> {
  const closes: Record<string, number> = {};
  for (let i = 0; i < timestamps.length; i++) {
    const close = adjcloses[i];
    const timestamp = timestamps[i];
    if (close === null || close === undefined || timestamp === undefined) continue;
    const period = periodOf(timestamp);
    // Timestamps arrive oldest first, so the last write for a period is that
    // period's last trading day.
    closes[period] = close;
  }
  return closes;
}

/**
 * The current calendar month, in UTC -- a fetch taken mid-month can only
 * ever see an intraday price for it, never a true month-end close, so
 * `fetchBenchmark` drops it rather than committing a close that looks like
 * a month end and is not one.
 */
function currentPeriod(): string {
  return periodOf(Date.now() / 1000);
}

/**
 * Validates the shape `monthlyClosesFromDaily` needs out of Yahoo's own
 * response, rather than casting it: a field renamed or missing upstream
 * throws a clear message here instead of surfacing later as a wrong or
 * silently absent close.
 */
export function parseChartResult(raw: unknown): ChartResult {
  const root = raw as { chart?: { result?: unknown } } | null;
  const result = root?.chart?.result;
  const first = Array.isArray(result) ? result[0] : undefined;
  if (first === undefined || first === null) {
    throw new Error(`${SYMBOL}: chart response carried no result`);
  }
  const timestamp = (first as { timestamp?: unknown }).timestamp;
  const adjcloses = (first as { indicators?: { adjclose?: unknown } }).indicators?.adjclose;
  const series = Array.isArray(adjcloses) ? adjcloses[0]?.adjclose : undefined;
  if (!Array.isArray(timestamp) || !Array.isArray(series)) {
    throw new Error(`${SYMBOL}: chart response is missing timestamp or adjclose`);
  }
  if (timestamp.length !== series.length) {
    throw new Error(
      `${SYMBOL}: timestamp and adjclose lengths disagree (${timestamp.length} vs ${series.length})`,
    );
  }
  return { timestamp, adjcloses: series };
}

async function fetchChart(): Promise<ChartResult> {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${SYMBOL}?interval=1d&range=10y`;
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) {
    throw new Error(`${url}: HTTP ${response.status}`);
  }
  return parseChartResult(await response.json());
}

export async function fetchBenchmark(): Promise<BenchmarkData> {
  const chart = await fetchChart();
  const closes = monthlyClosesFromDaily(chart.timestamp, chart.adjcloses);
  delete closes[currentPeriod()];
  if (Object.keys(closes).length === 0) {
    throw new Error(`${SYMBOL}: chart returned no usable closes`);
  }
  return { symbol: SYMBOL, fetched: new Date().toISOString(), closes };
}

if (import.meta.main) {
  const data = await fetchBenchmark();
  await Bun.write(join(DATA_DIR, "benchmark.json"), `${JSON.stringify(data, null, 2)}\n`);
  const periods = Object.keys(data.closes).sort();
  console.log(
    `wrote benchmark.json: ${periods.length} months, ${periods[0]} to ${periods[periods.length - 1]}`,
  );
}
