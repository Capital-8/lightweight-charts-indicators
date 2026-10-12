/**
 * Godmode 4.0.2 [Supply/Demand]
 *
 * Supply and demand levels from the "Godmode" oscillator of a benchmark symbol. The source of the benchmark
 * (default CRYPTOCAP:BTC, hlc3, on the chart timeframe) gives the oscillator: the mean of four parts when the
 * benchmark is another symbol (TCI, CSI, MF and Willy), or of three parts when it is the chart symbol (TCI, MF and
 * RSI); "Smoothing" takes its SMA over "Channel Length" bars.
 * - TCI: ema((src - ema(src, n1)) / (0.025 * ema(|src - ema(src, n1)|, n1)), n2) + 50
 * - CSI: mean of rsi(src, n3) and 50 * TTSI + 50, TTSI = 100 * ema(ema(change / mean(src, src[1]), n1), n2) /
 *   ema(ema(|change|, n1), n2)
 * - MF: 100 - 100 / (1 + up / down), sums over n3 bars of the chart volume times the source on rising / falling bars
 * - Willy: 60 * (src - highest(src, n2)) / (highest(src, n2) - lowest(src, n2)) + 80
 * (n1 = Channel Length, n2 = Average Length, n3 = Short length).
 * After "Count" bars in a row above 70 the high and low of the bar give the resistance levels (red / fuchsia); after
 * "Count" bars in a row below 30 the support levels (lime / green); after "Count" bars in a row above 70 or below 30
 * the supply / demand levels (orange / yellow). Each level keeps its last value; a fill joins the two levels of a
 * pair.
 *
 * The benchmark bars come from the chart context (`chart.bars`): without them `calculate` throws a
 * `MissingSymbolDataError`. Each chart bar shows the last benchmark bar that closed at or before it (no lookahead, no
 * gaps). The benchmark is compared with the ticker id of the chart (`chart.tickerid`).
 *
 * Reference: "Godmode 4.0.2" by chrysopoetics
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: Massive thank you to LEGION, LazyBear, xSilas, Ni6HTH4wK, sco77m4r7and, SNOW_CITY, oh92,
 * alexgrover, cI8DH, DonovanWall and shtcoinr for doing the initial builds, building indicators that I incorporated
 * into this script or just generally giving me a hand when needed.
 */

import { ta, math, Series, color, type Bar, type IndicatorResult, type InputConfig, type PlotConfig } from 'oakscriptjs';
import { symbolBarsOf, tickeridOf, type ChartContext, type SymbolRequest } from '../chart-context';
import { chartTimeframe } from '../anchor-period';
import { securityOtherValues } from '../other-symbol';

type SourceName = 'open' | 'high' | 'low' | 'close' | 'hl2' | 'hlc3' | 'ohlc4' | 'volume';

export interface Godmode402Inputs {
  /** Benchmark symbol */
  ben0: string;
  /** Source of the benchmark */
  src0: SourceName;
  /** Channel Length */
  len0: number;
  /** Average Length */
  len1: number;
  /** Short length */
  len2: number;
  /** Bars in a row beyond the level */
  cou0: number;
  /** SMA of the oscillator */
  smo0: boolean;
}

export const defaultInputs: Godmode402Inputs = {
  ben0: 'CRYPTOCAP:BTC',
  src0: 'hlc3',
  len0: 9,
  len1: 26,
  len2: 13,
  cou0: 5,
  smo0: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'ben0', type: 'string', title: 'Benchmark', defval: 'CRYPTOCAP:BTC' },
  { id: 'src0', type: 'source', title: 'Source', defval: 'hlc3' },
  { id: 'len0', type: 'int', title: 'Channel Length', defval: 9 },
  { id: 'len1', type: 'int', title: 'Average Length', defval: 26 },
  { id: 'len2', type: 'int', title: 'Short length', defval: 13 },
  { id: 'cou0', type: 'int', title: 'Count', defval: 5 },
  { id: 'smo0', type: 'bool', title: 'Smoothing', defval: false },
];

/** Plot colours of a Pine version 3 script: transparency 35 */
const V3 = (c: string) => String(color.new(c, 35));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'High Support', color: V3('#00FF00'), lineWidth: 1, style: 'circles' },
  { id: 'plot1', title: 'Low Support', color: V3('#008000'), lineWidth: 1, style: 'circles' },
  { id: 'plot2', title: 'High Resistance', color: V3('#FF0000'), lineWidth: 1, style: 'circles' },
  { id: 'plot3', title: 'Low Resistance', color: V3('#FF00FF'), lineWidth: 1, style: 'circles' },
  { id: 'plot4', title: 'High Supply Above/Demand Below', color: V3('#FF7F00'), lineWidth: 1, style: 'circles' },
  { id: 'plot5', title: 'Low Supply Above/Demand Below', color: V3('#FFFF00'), lineWidth: 1, style: 'circles' },
];

export const metadata = {
  title: 'Godmode 4.0.2',
  shortTitle: 'Godmode Supply/Demand',
  overlay: true,
};

/** Fills of a Pine version 3 script: transparency 90 */
const OLIVE = String(color.new('#808000', 90));
const MAROON = String(color.new('#800000', 90));
const BLUE = String(color.new('#0000FF', 90));

function sourceValue(b: Bar, src: SourceName): number {
  switch (src) {
    case 'open': return b.open;
    case 'high': return b.high;
    case 'low': return b.low;
    case 'close': return b.close;
    case 'hl2': return (b.high + b.low) / 2;
    case 'ohlc4': return (b.open + b.high + b.low + b.close) / 4;
    case 'volume': return b.volume ?? NaN;
    default: return (b.high + b.low + b.close) / 3;
  }
}

/** Bars of other symbols the indicator needs: the benchmark on the chart timeframe, unless it is the chart symbol. */
export function requiredSymbols(inputs: Partial<Godmode402Inputs> = {}, chart?: ChartContext): SymbolRequest[] {
  const cfg = { ...defaultInputs, ...inputs };
  return cfg.ben0 !== tickeridOf(chart) ? [{ symbol: cfg.ben0, timeframe: chartTimeframe([], chart) }] : [];
}

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const ge = (a: number, b: number) => b - a <= EPS;
const le = (a: number, b: number) => a - b <= EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;

export function calculate(bars: Bar[], inputs: Partial<Godmode402Inputs> = {}, chart?: ChartContext): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const len0 = Math.trunc(cfg.len0);
  const len1 = Math.trunc(cfg.len1);
  const len2 = Math.trunc(cfg.len2);
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  // src1 = ben0 != tickerid ? security(ben0, period, src0) : security(tickerid, period, src0)
  const other = cfg.ben0 !== tickeridOf(chart);
  let src: number[];
  if (other) {
    const tf = chartTimeframe(bars, chart);
    const [benchBars] = symbolBarsOf([{ symbol: cfg.ben0, timeframe: tf }], chart);
    src = securityOtherValues(bars, benchBars, '', (b) => b.map((x) => sourceValue(x, cfg.src0)), { symbol: cfg.ben0 }, chart);
  } else {
    src = bars.map((b) => sourceValue(b, cfg.src0));
  }
  const prev = src.map((_, i) => (i > 0 ? src[i - 1] : NaN));
  const change = src.map((v, i) => v - prev[i]);

  const tci = (): number[] => {
    const e = A(ta.ema(S(src), len0));
    const dev = A(ta.ema(S(src.map((v, i) => Math.abs(v - e[i]))), len0));
    return A(ta.ema(S(src.map((v, i) => (v - e[i]) / (0.025 * dev[i]))), len1)).map((v) => v + 50);
  };
  const mf = (): number[] => {
    const volume = bars.map((b) => b.volume ?? NaN);
    const up = A(math.sum(S(src.map((v, i) => volume[i] * (le(change[i], 0) ? 0 : v))), len2) as Series);
    const down = A(math.sum(S(src.map((v, i) => volume[i] * (ge(change[i], 0) ? 0 : v))), len2) as Series);
    // rsi(x, y) with two series: y == 0 ? 100 : x == 0 ? 0 : 100 - 100 / (1 + x / y) (== within 1e-10, as ta.rsi; the library has no two-series form: oakScriptJS #180)
    return up.map((u, i) => (eq(down[i], 0) ? 100 : eq(u, 0) ? 0 : 100 - 100 / (1 + u / down[i])));
  };
  const rsi = () => A(ta.rsi(S(src), len2));

  let wt0: number[];
  if (other) {
    // godmode(src1) = avg(tci, csi, mf, willy)
    const t = tci();
    // csi = avg(rsi(src, len2), ttsi(src, len0, len1) * 50 + 50)
    const r = rsi();
    const pc = change.map((c, i) => c / ((src[i] + prev[i]) / 2));
    const ma1 = A(ta.ema(ta.ema(S(pc), len0), len1));
    const ma3 = A(ta.ema(ta.ema(S(change.map(Math.abs)), len0), len1));
    const csi = r.map((v, i) => (v + (100 * (ma1[i] / ma3[i]) * 50 + 50)) / 2);
    const m = mf();
    // willy = 60 * (src - highest(src, len1)) / (highest(src, len1) - lowest(src, len1)) + 80
    const hi = A(ta.highest(S(src), len1));
    const lo = A(ta.lowest(S(src), len1));
    const willy = src.map((v, i) => (60 * (v - hi[i])) / (hi[i] - lo[i]) + 80);
    wt0 = t.map((v, i) => (v + csi[i] + m[i] + willy[i]) / 4);
  } else {
    // tradition(src1) = avg(tci, mf, rsi(src, len2))
    const t = tci();
    const m = mf();
    const r = rsi();
    wt0 = t.map((v, i) => (v + m[i] + r[i]) / 3);
  }
  const swt0 = A(ta.sma(S(wt0), len0));
  const gm = cfg.smo0 ? swt0 : wt0;

  // counts of bars in a row above 70 (gr), below 30 (gs), or either (gsdx); after cou0 bars, the bar's high and low
  // (fixnan: the last value is kept)
  const levels = (inZone: (g: number) => boolean) => {
    const hi: number[] = new Array(n);
    const lo: number[] = new Array(n);
    let count = 0;
    let h = NaN;
    let l = NaN;
    for (let i = 0; i < n; i++) {
      count = inZone(gm[i]) ? count + 1 : 0;
      if (count >= cfg.cou0) {
        h = bars[i].high;
        l = bars[i].low;
      }
      hi[i] = h;
      lo[i] = l;
    }
    return [hi, lo];
  };
  const [grh, grl] = levels((g) => gt(g, 70));
  const [gsh, gsl] = levels((g) => gt(30, g));
  const [gsdh, gsdl] = levels((g) => gt(g, 70) || gt(30, g));

  const plot = (v: number[]) => bars.map((b, i) => ({ time: b.time, value: v[i] }));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: plot(gsh),
      plot1: plot(gsl),
      plot2: plot(grh),
      plot3: plot(grl),
      plot4: plot(gsdh),
      plot5: plot(gsdl),
    },
    fills: [
      { plot1: 'plot0', plot2: 'plot1', options: { color: OLIVE } },
      { plot1: 'plot2', plot2: 'plot3', options: { color: MAROON } },
      { plot1: 'plot4', plot2: 'plot5', options: { color: BLUE } },
    ],
  };
}

export const Godmode402 = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  requiredSymbols,
};
