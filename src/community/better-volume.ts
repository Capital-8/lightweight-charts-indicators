/**
 * Better Volume Indicator
 *
 * Splits the volume of each bar into a buy part v1 and a sell part v2 from the true range and the open / close, then
 * builds 20 measures (volume, volume times range, volume per range, on one bar and on two bars). A bar is "climax
 * up" (red), "climax down" (white), "churn" (green), "climax churn" (dark magenta) or "low volume" (yellow) when one
 * of these measures is the highest or the lowest of the last `length` bars, else cyan. The volume columns take that
 * colour, with an SMA of the volume; with "enableBarColors" the bars are coloured instead and the two plots are
 * hidden.
 *
 * Version 1 plots have a default transparency of 35: the colours have an alpha of 0.65.
 *
 * Reference: "Better Volume Indicator [LazyBear]" by LazyBear
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BarColorData } from '../types';

export interface BetterVolumeInputs {
  /** Lookback */
  length: number;
  enableBarColors: boolean;
  use2Bars: boolean;
  lowVol: boolean;
  climaxUp: boolean;
  climaxDown: boolean;
  churn: boolean;
  climaxChurn: boolean;
}

export const defaultInputs: BetterVolumeInputs = {
  length: 8,
  enableBarColors: false,
  use2Bars: true,
  lowVol: true,
  climaxUp: true,
  climaxDown: true,
  churn: true,
  climaxChurn: true,
};

// Untitled inputs keep their variable names as titles
export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'Lookback', defval: 8 },
  { id: 'enableBarColors', type: 'bool', title: 'enableBarColors', defval: false },
  { id: 'use2Bars', type: 'bool', title: 'use2Bars', defval: true },
  { id: 'lowVol', type: 'bool', title: 'lowVol', defval: true },
  { id: 'climaxUp', type: 'bool', title: 'climaxUp', defval: true },
  { id: 'climaxDown', type: 'bool', title: 'climaxDown', defval: true },
  { id: 'churn', type: 'bool', title: 'churn', defval: true },
  { id: 'climaxChurn', type: 'bool', title: 'climaxChurn', defval: true },
];

// Colour constants of Pine version 1, with the default plot transparency of that version (35)
const V1 = (hex: string) => String(color.new(hex, 35));
const LOW_VOL_COLOR = V1('#FFFF00'); // yellow
const CLIMAX_UP_COLOR = V1('#FF0000'); // red
const CLIMAX_DOWN_COLOR = V1('#FFFFFF'); // white
const CHURN_COLOR = V1('#008000'); // green
const CLIMAX_CHURN_COLOR = V1('#8B008B');
const DEF_COLOR = V1('#00FFFF');
const ORANGE = V1('#FF7F00');

export const plotConfig: PlotConfig[] = [
  { id: 'vol', title: 'Volume', color: DEF_COLOR, lineWidth: 1, style: 'columns' },
  { id: 'sma', title: 'SMA', color: ORANGE, lineWidth: 2 },
];

export const metadata = {
  title: 'Better Volume Indicator [LazyBear]',
  shortTitle: 'BVI_LB',
  overlay: false,
};

/** Pine float comparisons within 1e-10 (na and +-infinity compare false for ==) */
const EPS = 1e-10;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
const gt = (a: number, b: number) => a - b > EPS;
const ge = (a: number, b: number) => a - b >= -EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<BetterVolumeInputs> = {},
): IndicatorResult & { barColors: BarColorData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const len = cfg.length;
  const use2 = cfg.use2Bars;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (values: number[]) => Series.fromArray(bars, values);

  // range = tr (na on the first bar)
  const range = A(ta.tr(bars, false));
  const vol = bars.map((b) => b.volume ?? NaN);
  const hh2 = A(ta.highest(S(bars.map((b) => b.high)), 2));
  const ll2 = A(ta.lowest(S(bars.map((b) => b.low)), 2));

  const v1: number[] = new Array(n);
  const v2: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const r = range[i];
    const v = vol[i];
    const { open, close } = bars[i];
    // Operator precedence of the original kept as written (plain divisions: x / 0 is +-infinity, 0 / 0 na)
    v1[i] = ge(close, open)
      ? v * (r / ((2 + (r * r) / 10) * r + (open - close)))
      : v * (((r + close - open) / (2 + (r * r) / 10)) * r + (close - open));
    v2[i] = v - v1[i];
  }
  const p = (arr: number[], i: number) => (i > 0 ? arr[i - 1] : NaN);
  const v3 = v1.map((x, i) => x + v2[i]);
  const v4 = v1.map((x, i) => x * range[i]);
  const v5 = v1.map((x, i) => (x - v2[i]) * range[i]);
  const v6 = v2.map((x, i) => x * range[i]);
  const v7 = v2.map((x, i) => (x - v1[i]) * range[i]);
  // range != 0 is false when range is na
  const nz0 = (i: number) => !Number.isNaN(range[i]) && range[i] !== 0;
  const v8 = v1.map((x, i) => (nz0(i) ? x / range[i] : 1));
  const v9 = v1.map((x, i) => (nz0(i) ? (x - v2[i]) / range[i] : 1));
  const v10 = v2.map((x, i) => (nz0(i) ? x / range[i] : 1));
  const v11 = v2.map((x, i) => (nz0(i) ? (x - v1[i]) / range[i] : 1));
  const v12 = v3.map((x, i) => (nz0(i) ? x / range[i] : 1));
  const v13 = v3.map((x, i) => (use2 ? x + p(v3, i) : 1));
  const r2 = (i: number) => hh2[i] - ll2[i];
  const v14 = v1.map((x, i) => (use2 ? (x + p(v1, i)) * r2(i) : 1));
  const v15 = v1.map((x, i) => (use2 ? (x + p(v1, i) - v2[i] - p(v2, i)) * r2(i) : 1));
  const v16 = v2.map((x, i) => (use2 ? (x + p(v2, i)) * r2(i) : 1));
  const v17 = v2.map((x, i) => (use2 ? (x + p(v2, i) - v1[i] - p(v1, i)) * r2(i) : 1));
  // highest(high, 2) != lowest(low, 2): false when one of them is na
  const two = (i: number) => use2 && !Number.isNaN(hh2[i]) && !Number.isNaN(ll2[i]) && !eq(hh2[i], ll2[i]);
  const v18 = v1.map((x, i) => (two(i) ? (x + p(v1, i)) / r2(i) : 1));
  const v19 = v1.map((x, i) => (two(i) ? (x + p(v1, i) - v2[i] - p(v2, i)) / r2(i) : 1));
  const v20 = v2.map((x, i) => (two(i) ? (x + p(v2, i)) / r2(i) : 1));
  const v21 = v2.map((x, i) => (two(i) ? (x + p(v2, i) - v1[i] - p(v1, i)) / r2(i) : 1));
  const v22 = v13.map((x, i) => (two(i) ? x / r2(i) : 1));

  const hi = (arr: number[]) => A(ta.highest(S(arr), len));
  const lo = (arr: number[]) => A(ta.lowest(S(arr), len));
  const l3 = lo(v3);
  const h4 = hi(v4);
  const h5 = hi(v5);
  const h6 = hi(v6);
  const h7 = hi(v7);
  const l8 = lo(v8);
  const l9 = lo(v9);
  const l10 = lo(v10);
  const l11 = lo(v11);
  const h12 = hi(v12);
  const l13 = lo(v13);
  const h14 = hi(v14);
  const h15 = hi(v15);
  const l16 = lo(v16);
  const l17 = lo(v17);
  const l18 = lo(v18);
  const l19 = lo(v19);
  const l20 = lo(v20);
  const l21 = lo(v21);
  const l22 = lo(v22);
  const sma = A(ta.sma(S(vol), len));

  const vColor: string[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const { open, close } = bars[i];
    const up = gt(close, open);
    const dn = gt(open, close);
    const up1 = i > 0 && gt(bars[i - 1].close, bars[i - 1].open);
    const dn1 = i > 0 && gt(bars[i - 1].open, bars[i - 1].close);
    const c1 = eq(v3[i], l3[i]);
    const c2 = eq(v4[i], h4[i]) && up;
    const c3 = eq(v5[i], h5[i]) && up;
    const c4 = eq(v6[i], h6[i]) && dn;
    const c5 = eq(v7[i], h7[i]) && dn;
    const c6 = eq(v8[i], l8[i]) && dn;
    const c7 = eq(v9[i], l9[i]) && dn;
    const c8 = eq(v10[i], l10[i]) && up;
    const c9 = eq(v11[i], l11[i]) && up;
    const c10 = eq(v12[i], h12[i]);
    const c11 = use2 && eq(v13[i], l13[i]) && up && up1;
    const c12 = use2 && eq(v14[i], h14[i]) && up && up1;
    const c13 = use2 && eq(v15[i], h15[i]) && up && dn1;
    const c14 = use2 && eq(v16[i], l16[i]) && dn && dn1;
    const c15 = use2 && eq(v17[i], l17[i]) && dn && dn1;
    const c16 = use2 && eq(v18[i], l18[i]) && dn && dn1;
    const c17 = use2 && eq(v19[i], l19[i]) && up && dn1;
    const c18 = use2 && eq(v20[i], l20[i]) && up && up1;
    const c19 = use2 && eq(v21[i], l21[i]) && up && up1;
    const c20 = use2 && eq(v22[i], l22[i]);

    // (churn and c10 or c20) is ((churn and c10) or c20)
    const c0 = cfg.climaxUp && (c2 || c3 || c8 || c9 || c12 || c13 || c18 || c19)
      ? CLIMAX_UP_COLOR
      : cfg.climaxDown && (c4 || c5 || c6 || c7 || c14 || c15 || c16 || c17)
        ? CLIMAX_DOWN_COLOR
        : (cfg.churn && c10) || c20 ? CHURN_COLOR : DEF_COLOR;
    vColor[i] = cfg.climaxChurn && (c10 || c20) && (c2 || c3 || c4 || c5 || c6 || c7 || c8 || c9)
      ? CLIMAX_CHURN_COLOR
      : cfg.lowVol && (c1 || c11) ? LOW_VOL_COLOR : c0;
  }

  const show = !cfg.enableBarColors;
  const volPlot = bars.map((b, i) => ({ time: b.time, value: show ? vol[i] : NaN, color: vColor[i] }));
  const smaPlot = bars.map((b, i) => ({ time: b.time, value: show ? sma[i] : NaN }));
  const barColors: BarColorData[] = cfg.enableBarColors ? bars.map((b, i) => ({ time: b.time, color: vColor[i] })) : [];

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { vol: volPlot, sma: smaPlot },
    barColors,
  };
}

export const BetterVolume = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
