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
  chart: {
    result:
      | readonly [
          {
            timestamp: readonly number[];
            indicators: { adjclose: readonly [{ adjclose: readonly (number | null)[] }] };
          },
        ]
      | null;
    error: unknown;
  };
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

async function fetchChart(): Promise<ChartResult> {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${SYMBOL}?interval=1d&range=10y`;
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) {
    throw new Error(`${url}: HTTP ${response.status}`);
  }
  return (await response.json()) as ChartResult;
}

export async function fetchBenchmark(): Promise<BenchmarkData> {
  const chart = await fetchChart();
  const result = chart.chart.result?.[0];
  if (!result) {
    throw new Error(`no chart result for ${SYMBOL}`);
  }
  const closes = monthlyClosesFromDaily(result.timestamp, result.indicators.adjclose[0].adjclose);
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
