/**
 * Range Breakout [BigBeluga]
 *
 * A price channel that is set again after each breakout. Its width is the 100-bar SMA of the 200-bar ATR times
 * "Channel Width". On bar 301 (and whenever the channel is set again) the center is hl2 and the upper / lower lines
 * are hl2 +- width, with a mid line in each half. The channel is set again when the low crosses over the upper line
 * (bullish break, "⦿" label), the high crosses under the lower line (bearish break), or after 100 bars outside the
 * channel. Inside the channel, "▲" marks a low that crosses over the lower mid line (with the low of 10 bars before
 * above it), "▼" a high that crosses under the upper mid line; optional "X" labels mark a high that falls back under
 * the upper line or a low that comes back over the lower line. With "Filter Signals by Trends", ▲ only shows after a
 * bullish break and ▼ after a bearish one. The two halves have a gradient fill (or a flat fill).
 *
 * The center line has the chart foreground colour (chart context, `foregroundColorOf`). Signals need a closed bar:
 * on an open last bar (chart context `lastBarConfirmed` false) they are not drawn.
 *
 * Reference: "Range Breakout [BigBeluga]" by BigBeluga
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © BigBeluga
 */

import {
  ta, color, callsite, label, resetDrawings, setDrawingBar, drawingOutputs,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { LabelData } from '../types';
import { foregroundColorOf, lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface RangeBreakoutInputs {
  /** Channel Width: multiplier of the ATR average */
  multi: number;
  /** Show X signals */
  showX: boolean;
  /** Filter Signals by Trends */
  filterSig: boolean;
  /** Bullish colour */
  color1: string;
  /** Bearish colour */
  color3: string;
  /** Gradient fill */
  gradient: boolean;
  /** Fill transparency */
  transp: number;
}

export const defaultInputs: RangeBreakoutInputs = {
  multi: 4,
  showX: false,
  filterSig: false,
  color1: '#1dac70',
  color3: '#df3a79',
  gradient: true,
  transp: 80,
};

export const inputConfig: InputConfig[] = [
  { id: 'multi', type: 'float', title: 'Channel Width', defval: 4, step: 0.1 },
  { id: 'showX', type: 'bool', title: 'Show X signals', defval: false },
  {
    id: 'filterSig', type: 'bool', title: 'Filter Signals by Trends', defval: false,
    tooltip: 'If True indicator filters ▲▼ based on channels breakout condition. If channel is bullish with green circle only ▲ displayed if bearish with red only ▼ signals displayed',
  },
  { id: 'color1', type: 'color', title: '', defval: '#1dac70', inline: 'col', group: 'OB/OS' },
  { id: 'color3', type: 'color', title: '', defval: '#df3a79', inline: 'col', group: 'OB/OS' },
  { id: 'gradient', type: 'bool', title: 'Gradient', defval: true, inline: 'll', group: 'OB/OS' },
  { id: 'transp', type: 'int', title: '', defval: 80, inline: 'll', group: 'OB/OS' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Upper', color: '#1dac70', lineWidth: 1, style: 'linebr' },
  { id: 'plot1', title: 'Center', color: '#DBDBDB', lineWidth: 1, style: 'linebr' },
  { id: 'plot2', title: 'Lower', color: '#df3a79', lineWidth: 1, style: 'linebr' },
  { id: 'plot3', title: 'Upper Mid', color: String(color.new('#DBDBDB', 50)), lineWidth: 1, style: 'linebr' },
  { id: 'plot4', title: 'Lower Mid', color: String(color.new('#DBDBDB', 50)), lineWidth: 1, style: 'linebr' },
];

export const metadata = {
  title: 'Range Breakout [BigBeluga]',
  shortTitle: 'Range Breakout [BigBeluga]',
  overlay: true,
};

/** indicator(max_labels_count = 500) */
const MAX_LABELS = 500;

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ne = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) > EPS;

type Point = { time: number; value: number; color?: string };

export function calculate(
  bars: Bar[],
  inputs: Partial<RangeBreakoutInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { labels: LabelData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const color1 = cfg.color1;
  const color3 = cfg.color3;
  const color2 = foregroundColorOf(chart);
  const color2Mid = String(color.new(color2, 50));
  const lastConfirmed = lastBarConfirmedOf(chart);

  // float atr = ta.sma(ta.atr(200), 100) * multi
  const atr = ta.sma(ta.atr(bars, 200), 100).toArray().map((v) => (v ?? NaN) * cfg.multi);

  resetDrawings({ label: MAX_LABELS });

  let value = NaN;
  let valueUpper = NaN;
  let valueLower = NaN;
  let valueUpperMid = NaN;
  let valueLowerMid = NaN;
  let trend = false;
  let count = 0;
  const crossUpperSite = callsite.crossover();
  const crossLowerSite = callsite.crossunder();
  const buySite = callsite.crossover();
  const sellSite = callsite.crossunder();
  const fakeUpSite = callsite.crossunder();
  const fakeDnSite = callsite.crossover();

  const hist = { value: [] as number[], upper: [] as number[], lower: [] as number[], upperMid: [] as number[], lowerMid: [] as number[] };
  const plots: Record<string, Point[]> = { plot0: [], plot1: [], plot2: [], plot3: [], plot4: [] };
  const fill1 = { topValue: [] as number[], bottomValue: [] as number[], topColor: [] as Array<string | null>, bottomColor: [] as Array<string | null> };
  const fill2 = { topValue: [] as number[], bottomValue: [] as number[], topColor: [] as Array<string | null>, bottomColor: [] as Array<string | null> };
  const colorOrNull = (c: string) => (c === 'transparent' ? null : c);

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    const b = bars[i];
    const t = b.time;
    const hl2 = (b.high + b.low) / 2;
    const confirmed = i < n - 1 || lastConfirmed;
    const setChannel = () => {
      value = hl2;
      valueUpper = hl2 + atr[i];
      valueLower = hl2 - atr[i];
      valueUpperMid = (value + valueUpper) / 2;
      valueLowerMid = (value + valueLower) / 2;
    };

    if (i === 301) setChannel();

    // ta.crossover(...) and barstate.isconfirmed: the crossing (left side of the lazy `and`) runs on every bar
    const crossUpper = crossUpperSite(b.low, valueUpper) && confirmed;
    const crossLower = crossLowerSite(b.high, valueLower) && confirmed;

    if (gt(b.low, valueUpper) || lt(b.high, valueLower)) count += 1;

    if (crossUpper || crossLower || count === 100) {
      count = 0;
      setChannel();
    }

    const prevValue = i > 0 ? hist.value[i - 1] : NaN;
    // chage = not (value != value[1]): false only when both are not na and differ
    const chage = !ne(value, prevValue);
    const low10 = i >= 10 ? bars[i - 10].low : NaN;
    const high10 = i >= 10 ? bars[i - 10].high : NaN;
    const buy = buySite(b.low, valueLowerMid) && gt(low10, valueLowerMid) && confirmed && chage;
    const sell = sellSite(b.high, valueUpperMid) && lt(high10, valueUpperMid) && confirmed && chage;
    const fakeoutUp = fakeUpSite(b.high, valueUpper) && confirmed && chage;
    const fakeoutDn = fakeDnSite(b.low, valueLower) && confirmed && chage;

    hist.value.push(value);
    hist.upper.push(valueUpper);
    hist.lower.push(valueLower);
    const upperMid = (valueUpper + value) / 2;
    const lowerMid = (valueLower + value) / 2;
    hist.upperMid.push(upperMid);
    hist.lowerMid.push(lowerMid);

    const prev = (arr: number[]) => (i > 0 ? arr[i - 1] : NaN);
    const upperChanged = ne(valueUpper, prev(hist.upper));
    const show = (v: number, changed: boolean) => (changed || isNaN(v) ? NaN : v);
    plots.plot0.push({ time: t, value: show(valueUpper, upperChanged), color: color1 });
    plots.plot1.push({ time: t, value: i % 2 === 0 ? value : NaN, color: color2 });
    plots.plot2.push({ time: t, value: show(valueLower, ne(valueLower, prev(hist.lower))), color: color3 });
    plots.plot3.push({ time: t, value: show(upperMid, ne(upperMid, prev(hist.upperMid))), color: color2Mid });
    plots.plot4.push({ time: t, value: show(lowerMid, ne(lowerMid, prev(hist.lowerMid))), color: color2Mid });

    // fill(p1, p01, value_upper, value, color.new(changed ? na : color1, transp), color.new(changed ? na : color1, gradient ? 100 : transp))
    const c1 = upperChanged ? null : color1;
    const c3 = upperChanged ? null : color3;
    fill1.topValue.push(valueUpper);
    fill1.bottomValue.push(value);
    fill1.topColor.push(colorOrNull(String(color.new(c1, cfg.transp))));
    fill1.bottomColor.push(colorOrNull(String(color.new(c1, cfg.gradient ? 100 : cfg.transp))));
    // fill(p2, p02, value, value_lower, color.new(changed ? na : color3, gradient ? 100 : transp), color.new(changed ? na : color3, transp))
    fill2.topValue.push(value);
    fill2.bottomValue.push(valueLower);
    fill2.topColor.push(colorOrNull(String(color.new(c3, cfg.gradient ? 100 : cfg.transp))));
    fill2.bottomColor.push(colorOrNull(String(color.new(c3, cfg.transp))));

    if (crossUpper) {
      trend = true;
      label.new(i - 1, prev(hist.upper), '⦿', 'bar_index', 'price', 'transparent', 'label_center', color1, 'large',
        undefined, 'Bullish Break');
    }
    if (crossLower) {
      trend = false;
      label.new(i - 1, prev(hist.lower), '⦿', 'bar_index', 'price', 'transparent', 'label_center', color3, 'large',
        undefined, 'Bearish Break');
    }
    const p = i > 0 ? bars[i - 1] : null;
    if (buy && (cfg.filterSig ? trend : true)) {
      label.new(i - 1, p ? p.low : NaN, '▲', 'bar_index', 'price', 'transparent', 'label_up', color1, 'normal');
    }
    if (sell && (cfg.filterSig ? !trend : true)) {
      label.new(i - 1, p ? p.high : NaN, '▼', 'bar_index', 'price', 'transparent', 'label_down', color3, 'normal');
    }
    if (fakeoutUp && cfg.showX) {
      label.new(i - 1, p ? p.high : NaN, 'X', 'bar_index', 'price', 'transparent', 'label_down', color3, 'normal');
    }
    if (fakeoutDn && cfg.showX) {
      label.new(i - 1, p ? p.low : NaN, 'X', 'bar_index', 'price', 'transparent', 'label_up', color1, 'normal');
    }
  }
  setDrawingBar(null);

  const drawn = drawingOutputs(bars);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    fills: [
      { plot1: 'plot0', plot2: 'plot3', options: { title: 'Upper Fill' }, gradient: fill1 },
      { plot1: 'plot2', plot2: 'plot4', options: { title: 'Lower Fill' }, gradient: fill2 },
    ],
    labels: drawn.labels ?? [],
  };
}

export const RangeBreakout = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
