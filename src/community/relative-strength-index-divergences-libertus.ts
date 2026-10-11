/**
 * Relative Strength Index - Divergences - Libertus
 *
 * RSI with labels on divergences and on RSI pivots.
 * - The script keeps a running maximum and minimum of the close and of the RSI. They restart from the current bar
 *   when the RSI is the highest (lowest) of the last "Div lookback period" bars.
 * - Bearish divergence ("BEAR", on the bar before): the price maximum rose on the bar before, the RSI of that bar
 *   was below the RSI maximum and the RSI does not rise now. Bullish divergence ("BULL"): the mirror.
 * - Pivot ("PIVOT", two bars back): the RSI maximum (minimum) is the same as two bars ago and changed on that bar.
 * - One label per bar at most, in this order: BEAR, BULL, pivot high, pivot low. The last 50 labels are kept.
 * - "Hide labels and color background" replaces the labels by background colours on the same bars.
 *
 * Reference: "Relative Strength Index - Divergences - Libertus" by Libertus
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: Copyright by Libertus - 2021
 */

import {
  ta, color, Series, type IndicatorResult, type InputConfig, type PlotConfig, type HLineConfig, type FillConfig, type Bar,
} from 'oakscriptjs';
import type { BgColorData, LabelData } from '../types';

export interface RelativeStrengthIndexDivergencesLibertusInputs {
  /** RSI Length */
  len: number;
  /** Overbought */
  ob: number;
  /** Oversold */
  os: number;
  /** Midline value */
  omid: number;
  /** Hide midline */
  omidh: boolean;
  /** Hide pivots? */
  piv: boolean;
  /** Shorter labels? */
  shrt: boolean;
  /** Hide labels and color background */
  hidel: boolean;
  /** Div lookback period (bars)? */
  xbars: number;
}

export const defaultInputs: RelativeStrengthIndexDivergencesLibertusInputs = {
  len: 14,
  ob: 70,
  os: 30,
  omid: 50,
  omidh: false,
  piv: false,
  shrt: false,
  hidel: false,
  xbars: 90,
};

export const inputConfig: InputConfig[] = [
  { id: 'len', type: 'int', title: 'RSI Length', defval: 14, min: 1 },
  { id: 'ob', type: 'int', title: 'Overbought', defval: 70, min: 0, max: 100 },
  { id: 'os', type: 'int', title: 'Oversold', defval: 30, min: 0, max: 100 },
  { id: 'omid', type: 'int', title: 'Midline value', defval: 50, min: 0, max: 100 },
  { id: 'omidh', type: 'bool', title: 'Hide midline', defval: false },
  { id: 'piv', type: 'bool', title: 'Hide pivots?', defval: false },
  { id: 'shrt', type: 'bool', title: 'Shorter labels?', defval: false },
  { id: 'hidel', type: 'bool', title: 'Hide labels and color background', defval: false },
  { id: 'xbars', type: 'int', title: 'Div lookback period (bars)?', defval: 90, min: 1 },
];

// Colour constants of the Pine version of the script
const RED = '#FF5252';
const BLACK = '#363A45';
const LIME = '#00E676';
const GREEN = '#4CAF50';
const BLUE = '#2196F3';
const WHITE = '#FFFFFF';
const HLINE = '#787B86';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Plot', color: BLACK, lineWidth: 1 },
];

/** hline(ob), hline(os), hline(omid, color = color.new(color.black, 80)) with the default values */
export const hlineConfig: HLineConfig[] = [
  { id: 'hline_ob', price: 70, title: 'Overbought', color: HLINE, linestyle: 'dashed' },
  { id: 'hline_os', price: 30, title: 'Oversold', color: HLINE, linestyle: 'dashed' },
  { id: 'hline_mid', price: 50, title: 'Midline', color: String(color.new(BLACK, 80)), linestyle: 'dashed' },
];

export const fillConfig: FillConfig[] = [
  { id: 'fill_upper', plot1: 'hline_mid', plot2: 'hline_ob', color: String(color.new(LIME, 96)) },
  { id: 'fill_lower', plot1: 'hline_os', plot2: 'hline_mid', color: String(color.new(RED, 96)) },
];

export const metadata = {
  title: 'Relative Strength Index - Divergences - Libertus',
  shortTitle: 'RSI Div - Lib',
  overlay: false,
};

/** Default max_labels_count of the script */
const MAX_LABELS = 50;

/** Pine float comparisons: a > b only when a - b > 1e-10 (a == b within 1e-10); na compares false */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => a - b >= -EPS;
const le = (a: number, b: number) => b - a >= -EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
const ne = (a: number, b: number) => Math.abs(a - b) > EPS;

interface Lb {
  x: number;
  y: number;
  text: string;
  color: string;
  style: 'label_down' | 'label_up';
}

export function calculate(
  bars: Bar[],
  inputs: Partial<RelativeStrengthIndexDivergencesLibertusInputs> = {},
): Omit<IndicatorResult, 'labels' | 'bgColors'> & { labels: LabelData[]; bgColors: BgColorData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const close = new Series(bars, (b) => b.close);
  const rsiSeries = ta.rsi(close, cfg.len);
  const rsi = rsiSeries.toArray().map((v) => v ?? NaN);
  // hb = abs(highestbars(rsi, xbars)), lb = abs(lowestbars(rsi, xbars))
  const hb = ta.highestbars(rsiSeries, cfg.xbars).toArray().map((v) => Math.abs(v ?? NaN));
  const lb = ta.lowestbars(rsiSeries, cfg.xbars).toArray().map((v) => Math.abs(v ?? NaN));

  const max: number[] = new Array(n).fill(NaN);
  const maxRsi: number[] = new Array(n).fill(NaN);
  const min: number[] = new Array(n).fill(NaN);
  const minRsi: number[] = new Array(n).fill(NaN);
  const at = (a: number[], i: number) => (i >= 0 ? a[i] : NaN);

  const labels: Lb[] = [];
  const bgColors: BgColorData[] = [];
  const divBg: Array<string | null> = new Array(n).fill(null);
  const pivBg: Array<string | null> = new Array(n).fill(null);
  const bearBg = String(color.new(RED, 50));
  const bullBg = String(color.new(GREEN, 50));
  const pivotBg = String(color.new(BLUE, 50));

  for (let i = 0; i < n; i++) {
    const c = bars[i].close;
    const r = rsi[i];
    // If the bar with the highest / lowest RSI is the current bar, use its value
    max[i] = hb[i] === 0 ? c : isNaN(at(max, i - 1)) ? c : max[i - 1];
    maxRsi[i] = hb[i] === 0 ? r : isNaN(at(maxRsi, i - 1)) ? r : maxRsi[i - 1];
    min[i] = lb[i] === 0 ? c : isNaN(at(min, i - 1)) ? c : min[i - 1];
    minRsi[i] = lb[i] === 0 ? r : isNaN(at(minRsi, i - 1)) ? r : minRsi[i - 1];
    if (gt(c, max[i])) max[i] = c;
    if (gt(r, maxRsi[i])) maxRsi[i] = r;
    if (lt(c, min[i])) min[i] = c;
    if (lt(r, minRsi[i])) minRsi[i] = r;

    // Pivot: the extreme is the same as 2 bars ago and it changed on that bar
    const pivoth = eq(maxRsi[i], at(maxRsi, i - 2)) && ne(at(maxRsi, i - 2), at(maxRsi, i - 3));
    const pivotl = eq(minRsi[i], at(minRsi, i - 2)) && ne(at(minRsi, i - 2), at(minRsi, i - 3));

    // Divergences, with a delay of one bar
    const r1 = at(rsi, i - 1);
    const divbear = gt(at(max, i - 1), at(max, i - 2)) && lt(r1, maxRsi[i]) && le(r, r1);
    const divbull = lt(at(min, i - 1), at(min, i - 2)) && gt(r1, minRsi[i]) && ge(r, r1);

    let l: Lb | null = null;
    if (divbear) l = { x: i - 1, y: r1 + 1, text: 'BEAR', color: RED, style: 'label_down' };
    else if (divbull) l = { x: i - 1, y: r1 - 1, text: 'BULL', color: GREEN, style: 'label_up' };
    else if (pivoth) l = { x: i - 2, y: maxRsi[i] + 1, text: 'PIVOT', color: BLUE, style: 'label_down' };
    else if (pivotl) l = { x: i - 2, y: minRsi[i] - 1, text: 'PIVOT', color: BLUE, style: 'label_up' };
    if (l) {
      // Shorter labels: label.set_text(l, na)
      if (cfg.shrt) l.text = '';
      // Hides pivots or labels: label.delete(l)
      const deleted = (cfg.piv && (pivoth || pivotl)) || cfg.hidel;
      if (!deleted) {
        labels.push(l);
        // above max + 5 labels the oldest are deleted until max remain
        if (labels.length > MAX_LABELS + 5) labels.splice(0, labels.length - MAX_LABELS);
      }
    }

    if (cfg.hidel) {
      divBg[i] = divbear ? bearBg : divbull ? bullBg : null;
      pivBg[i] = cfg.piv ? null : pivoth || pivotl ? pivotBg : null;
    }
  }

  // bgcolor(..., offset = -1) and bgcolor(..., offset = -2): the colour of bar i is drawn 1 / 2 bars back
  for (let i = 0; i < n; i++) {
    const d = i + 1 < n ? divBg[i + 1] : null;
    if (d) bgColors.push({ time: bars[i].time, color: d });
    const p = i + 2 < n ? pivBg[i + 2] : null;
    if (p) bgColors.push({ time: bars[i].time, color: p });
  }

  const midColor = String(color.new(BLACK, cfg.omidh ? 100 : 80));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({
        time: b.time,
        value: rsi[i],
        color: gt(rsi[i], cfg.ob) || lt(rsi[i], cfg.os) ? RED : BLACK,
      })),
    },
    hlines: [
      { value: cfg.ob, options: { color: HLINE, linestyle: 'dashed' } },
      { value: cfg.os, options: { color: HLINE, linestyle: 'dashed' } },
      { value: cfg.omid, options: { color: midColor, linestyle: 'dashed' } },
    ],
    fills: [
      { plot1: 'hline_mid', plot2: 'hline_ob', colors: new Array<string>(n).fill(String(color.new(LIME, 96))) },
      { plot1: 'hline_os', plot2: 'hline_mid', colors: new Array<string>(n).fill(String(color.new(RED, 96))) },
    ],
    bgColors,
    // a label on a bar before the first bar, or with an na price, is not drawn
    labels: labels.filter((l) => l.x >= 0 && !isNaN(l.y)).map((l) => ({
      time: bars[l.x].time, price: l.y, text: l.text, color: l.color, textColor: WHITE, style: l.style, size: 'small',
    })),
  };
}

export const RelativeStrengthIndexDivergencesLibertus = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hlineConfig,
  fillConfig,
};
