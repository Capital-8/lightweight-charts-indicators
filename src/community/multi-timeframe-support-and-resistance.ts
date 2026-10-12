/**
 * Multi Timeframe Support and Resistance [ABA Invest]
 *
 * Support and resistance levels from pivots: the last pivot high (resistance) and pivot low (support) with "Pivot"
 * bars on each side, of the wicks (high / low) or of the bodies (close), held until the next pivot. One pair of
 * levels for the chart timeframe and one for each of M5, M15, M30, H1, H4, Daily and Weekly. Each level is drawn
 * "Pivot" + 1 bars back (plot offset) and is hidden on the bar where it changes. An optional adaptive moving average
 * moves towards the close by the square of the share of the last "Line Length" bars that made a new highest high or
 * lowest low.
 *
 * Other timeframes: as `request.security(syminfo.tickerid, tf, ta.pivothigh(...)[1])` without lookahead, the pivot
 * of the previous bar of that timeframe, shown from the chart bar that completes its period. The bars of that
 * timeframe are built from the chart bars (src/anchor-period.ts: the exchange calendar of the chart context, or
 * the UTC calendar and the bars), so its pivots start at the first chart bar. A timeframe equal to the chart
 * timeframe is the chart series. A timeframe below the chart timeframe needs bars that the chart does not have:
 * the port throws an Error when such a level is switched on (the hidden levels of those timeframes are not
 * computed).
 *
 * Reference: "Multi Timeframe Support and Resistance [ABA Invest]" by abainvest
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © ABA Invest
 */

import {
  ta, Series, timeframe, mapToChart,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import { chartTimeframe, higherTimeframeBars } from '../anchor-period';
import type { ChartContext } from '../chart-context';
import { barInterval, barTime } from '../bar-time';

export interface MultiTimeframeSupportAndResistanceInputs {
  /** Pivot bars on each side */
  bars: number;
  /** Pivots of the wicks (high / low) or of the bodies (close) */
  tipe: 'Wick' | 'Body';
  show_c: boolean;
  show_5m: boolean;
  show_15m: boolean;
  show_30m: boolean;
  show_1h: boolean;
  show_4h: boolean;
  show_d: boolean;
  show_w: boolean;
  /** Show the adaptive moving average */
  plot_ama: boolean;
  ama_length: number;
}

export const defaultInputs: MultiTimeframeSupportAndResistanceInputs = {
  bars: 15,
  tipe: 'Body',
  show_c: true,
  show_5m: false,
  show_15m: false,
  show_30m: false,
  show_1h: false,
  show_4h: false,
  show_d: false,
  show_w: false,
  plot_ama: false,
  ama_length: 15,
};

const TF = 'Timeframes';

export const inputConfig: InputConfig[] = [
  { id: 'bars', type: 'int', title: 'Pivot', defval: 15 },
  { id: 'tipe', type: 'string', title: 'Type', defval: 'Body', options: ['Wick', 'Body'] },
  { id: 'show_c', type: 'bool', title: 'Current Timeframe', defval: true, group: TF },
  { id: 'show_5m', type: 'bool', title: 'M5', defval: false, group: TF },
  { id: 'show_15m', type: 'bool', title: 'M15', defval: false, group: TF },
  { id: 'show_30m', type: 'bool', title: 'M30', defval: false, group: TF },
  { id: 'show_1h', type: 'bool', title: 'H1', defval: false, group: TF },
  { id: 'show_4h', type: 'bool', title: 'H4', defval: false, group: TF },
  { id: 'show_d', type: 'bool', title: 'Daily', defval: false, group: TF },
  { id: 'show_w', type: 'bool', title: 'Weekly', defval: false, group: TF },
  { id: 'plot_ama', type: 'bool', title: 'Adaptive Moving Average', defval: false },
  { id: 'ama_length', type: 'int', title: 'Line Length', defval: 15 },
];

type ShowKey = 'show_5m' | 'show_15m' | 'show_30m' | 'show_1h' | 'show_4h' | 'show_d' | 'show_w' | 'show_c';

/** The level pairs in the plot order: timeframe ('' = chart), show input, title suffix, resistance / support colours */
const LEVELS: Array<{ tf: string; show: ShowKey; name: string; res: string; sup: string }> = [
  { tf: '5', show: 'show_5m', name: 'M5', res: '#00aeff', sup: '#ffbf00' },
  { tf: '15', show: 'show_15m', name: 'M15', res: '#00aeffdd', sup: '#ffbf00dd' },
  { tf: '30', show: 'show_30m', name: 'M30', res: '#00aeffbb', sup: '#ffbf00bb' },
  { tf: '60', show: 'show_1h', name: 'H1', res: '#00aeff90', sup: '#ffbf0090' },
  { tf: '240', show: 'show_4h', name: 'H4', res: '#00aeff70', sup: '#ffbf0070' },
  { tf: 'D', show: 'show_d', name: 'Daily', res: '#00aeff50', sup: '#ffbf0050' },
  { tf: 'W', show: 'show_w', name: 'Weekly', res: '#00aeff30', sup: '#ffbf0030' },
  { tf: '', show: 'show_c', name: 'Current Timeframe', res: '#ff0040', sup: '#6aff00' },
];

const AMA_COLOR = '#ffffff';

export const plotConfig: PlotConfig[] = [
  ...LEVELS.flatMap((l, k): PlotConfig[] => [
    { id: `plot${2 * k}`, title: `Resistance ${l.name}`, color: l.res, lineWidth: 2 },
    { id: `plot${2 * k + 1}`, title: `Support ${l.name}`, color: l.sup, lineWidth: 2 },
  ]),
  { id: 'plot16', title: 'Adaptive Moving Average', color: AMA_COLOR, lineWidth: 2 },
];

export const metadata = {
  title: 'Multi Timeframe Support and Resistance [ABA Invest]',
  shortTitle: 'MTF SnR [ABA Invest]',
  overlay: true,
};

type Point = { time: number; value: number; color?: string };

/** fixnan(): the last non-na value */
function fixnan(values: number[]): number[] {
  let last = NaN;
  return values.map((v) => (isNaN(v) ? last : (last = v)));
}

export function calculate(
  bars: Bar[],
  inputs: Partial<MultiTimeframeSupportAndResistanceInputs> = {},
  chart?: ChartContext,
): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const len = cfg.bars;
  const wick = cfg.tipe === 'Wick';
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const chartTf = chartTimeframe(bars, chart);

  /**
   * fixnan(request.security(syminfo.tickerid, tf, ta.pivothigh(src, bars, bars)[1])) and the pivot low, on the chart
   * bars; null when the timeframe is below the chart timeframe
   */
  const levels = (tf: string): { high: number[]; low: number[] } | null => {
    const pivots = (src: Bar[]) => {
      const hi = A(ta.pivothigh(new Series(src, (b) => (wick ? b.high : b.close)), len, len));
      const lo = A(ta.pivotlow(new Series(src, (b) => (wick ? b.low : b.close)), len, len));
      // [1]: the pivot found on the bar before
      return { hi: hi.map((_v, k) => (k > 0 ? hi[k - 1] : NaN)), lo: lo.map((_v, k) => (k > 0 ? lo[k - 1] : NaN)) };
    };
    if (tf === '' || chartTf === '' || timeframe.in_seconds(tf) === timeframe.in_seconds(chartTf)) {
      const { hi, lo } = pivots(bars);
      return { high: fixnan(hi), low: fixnan(lo) };
    }
    if (timeframe.in_seconds(tf) < timeframe.in_seconds(chartTf)) return null;
    // completed bars of the timeframe, shown from the chart bar that completes their period (no lookahead, no gaps)
    const { htf, group, latest } = higherTimeframeBars(bars, tf, chart);
    const { hi, lo } = pivots(htf);
    return {
      high: fixnan(mapToChart(hi, group, latest, false, false)),
      low: fixnan(mapToChart(lo, group, latest, false, false)),
    };
  };

  // plot(..., offset = -bars - 1): the value of bar i is drawn on bar i - bars - 1
  const shift = len + 1;
  const interval = barInterval(bars);
  const level = (values: number[] | null, show: boolean, col: string): Point[] => {
    const out: Point[] = [];
    for (let i = shift; i < n; i++) {
      // color = ta.change(level) ? na : col (a change of na or 0 keeps the colour)
      const change = values ? values[i] - values[i - 1] : NaN;
      out.push({
        time: barTime(bars, i - shift, interval),
        value: show && values ? values[i] : NaN,
        color: !isNaN(change) && change !== 0 ? 'transparent' : col,
      });
    }
    return out;
  };

  const plots: Record<string, Point[]> = {};
  LEVELS.forEach((l, k) => {
    const show = cfg[l.show];
    const tfName = l.tf === '' ? chartTf : l.tf;
    const lv = levels(l.tf);
    if (show && !lv) {
      throw new Error(`Multi Timeframe Support and Resistance: the ${l.name} levels need the bars of the timeframe "${tfName}", `
        + `which is lower than the chart timeframe "${chartTf}": the chart bars do not have that data`);
    }
    plots[`plot${2 * k}`] = level(lv?.high ?? null, show, l.res);
    plots[`plot${2 * k + 1}`] = level(lv?.low ?? null, show, l.sup);
  });

  // Adaptive moving average
  const L = cfg.ama_length;
  const signOf = (v: number) => (isNaN(v) ? NaN : Math.sign(v));
  const highest = A(ta.highest(new Series(bars, (b) => b.high), L));
  const lowest = A(ta.lowest(new Series(bars, (b) => b.low), L));
  // hh or ll ? 1 : 0, with hh = max(sign(change(highest)), 0) and ll = max(sign(-change(lowest)), 0) (na is false)
  const newExtreme = bars.map((_b, i) => {
    const hh = Math.max(signOf(i > 0 ? highest[i] - highest[i - 1] : NaN), 0);
    const ll = Math.max(signOf(i > 0 ? (lowest[i] - lowest[i - 1]) * -1 : NaN), 0);
    return (!isNaN(hh) && hh !== 0) || (!isNaN(ll) && ll !== 0) ? 1 : 0;
  });
  const share = A(ta.sma(Series.fromArray(bars, newExtreme), L));
  const ama = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const tc = share[i] ** 2;
    const prev = i > 0 ? ama[i - 1] : NaN;
    const v = prev + tc * (bars[i].close - prev);
    ama[i] = isNaN(v) ? bars[i].close : v;
  }
  plots.plot16 = bars.map((b, i) => ({ time: b.time, value: cfg.plot_ama ? ama[i] : NaN, color: AMA_COLOR }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
  };
}

export const MultiTimeframeSupportAndResistance = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
