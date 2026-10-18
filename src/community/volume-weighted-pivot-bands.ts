/**
 * Volume-Weighted Pivot Bands
 *
 * A rolling volume-weighted average of hlc3 over `length` bars (running sums of volume and hlc3 * volume, the value
 * of `length` bars back removed), optionally smoothed by an SMA, is the pivot. Five resistance and five support bands
 * are spaced by (highest high - lowest low over `length` bars) * multiplier above and below the pivot. All lines can
 * be shifted by a plot offset.
 *
 * Alerts (alertcondition, `alerts` of the result): the close crossing over R1 .. R5 and under S1 .. S5 (the bands
 * without the plot offset).
 *
 * Reference: "Volume-Weighted Pivot Bands" by LeafAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import { barInterval, barTime } from '../bar-time';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface VolumeWeightedPivotBandsInputs {
  /** Rolling length of the volume-weighted price and of the range */
  length: number;
  /** Multiplier of the R levels */
  multR: number;
  /** Multiplier of the S levels */
  multS: number;
  /** Smooth the pivot with an SMA */
  smoothPivot: boolean;
  /** SMA length of the pivot smoothing */
  pivotSmoothLength: number;
  /** Plot offset of all lines (bars) */
  offsetPivots: number;
}

export const defaultInputs: VolumeWeightedPivotBandsInputs = {
  length: 20,
  multR: 0.25,
  multS: 0.25,
  smoothPivot: true,
  pivotSmoothLength: 20,
  offsetPivots: 0,
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'Rolling Length', defval: 20 },
  { id: 'multR', type: 'float', title: 'Multiplier for R Levels', defval: 0.25 },
  { id: 'multS', type: 'float', title: 'Multiplier for S Levels', defval: 0.25 },
  { id: 'smoothPivot', type: 'bool', title: 'Smooth Pivot?', defval: true },
  { id: 'pivotSmoothLength', type: 'int', title: 'Pivot Smooth Length (SMA)', defval: 20 },
  { id: 'offsetPivots', type: 'int', title: 'Pivot Plot Offset', defval: 0 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'R1', color: color.fuchsia, lineWidth: 2 },
  { id: 'plot1', title: 'R2', color: color.fuchsia, lineWidth: 2 },
  { id: 'plot2', title: 'R3', color: color.fuchsia, lineWidth: 2 },
  { id: 'plot3', title: 'R4', color: color.fuchsia, lineWidth: 2 },
  { id: 'plot4', title: 'R5', color: color.fuchsia, lineWidth: 2 },
  { id: 'plot5', title: 'S1', color: color.lime, lineWidth: 2 },
  { id: 'plot6', title: 'S2', color: color.lime, lineWidth: 2 },
  { id: 'plot7', title: 'S3', color: color.lime, lineWidth: 2 },
  { id: 'plot8', title: 'S4', color: color.lime, lineWidth: 2 },
  { id: 'plot9', title: 'S5', color: color.lime, lineWidth: 2 },
  { id: 'plot10', title: 'VWAP Pivot', color: color.gray, lineWidth: 1, style: 'circles' },
];

export const metadata = {
  title: 'Volume-Weighted Pivot Bands',
  shortTitle: 'Volume-Weighted Pivot Bands',
  overlay: true,
};

/** Pine float `!=`: false within 1e-10 and when a value is na */
const EPS = 1e-10;
const ne = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) > EPS;
const nz = (x: number) => (isNaN(x) ? 0 : x);

export function calculate(
  bars: Bar[],
  inputs: Partial<VolumeWeightedPivotBandsInputs> = {},
): IndicatorResult & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const { length } = cfg;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const vol = (i: number) => {
    const v = bars[i].volume;
    return v === undefined || v === null ? NaN : v;
  };

  // price = (high + low + close) / 3
  const price = bars.map((b) => (b.high + b.low + b.close) / 3);
  const vwapPrice: number[] = new Array(n);
  let volSum = NaN;
  let volPriceSum = NaN;
  for (let i = 0; i < n; i++) {
    const j = i - length;
    const volJ = j >= 0 ? vol(j) : NaN;
    const priceJ = j >= 0 ? price[j] : NaN;
    const oldVolume = isNaN(volJ) ? 0 : volJ;
    const oldVolprice = isNaN(volJ) || isNaN(priceJ) ? 0 : volJ * priceJ;
    // vol_sum := nz(vol_sum[1]) + volume - old_volume
    volSum = nz(volSum) + vol(i) - oldVolume;
    volPriceSum = nz(volPriceSum) + price[i] * vol(i) - oldVolprice;
    vwapPrice[i] = ne(volSum, 0) ? volPriceSum / volSum : NaN;
  }
  const pivot = cfg.smoothPivot ? A(ta.sma(S(vwapPrice), cfg.pivotSmoothLength)) : vwapPrice;

  const hh = A(ta.highest(S(bars.map((b) => b.high)), length));
  const ll = A(ta.lowest(S(bars.map((b) => b.low)), length));

  const r: number[][] = Array.from({ length: 5 }, () => new Array(n));
  const s: number[][] = Array.from({ length: 5 }, () => new Array(n));
  for (let i = 0; i < n; i++) {
    const range = hh[i] - ll[i];
    let rv = pivot[i];
    let sv = pivot[i];
    for (let k = 0; k < 5; k++) {
      rv = rv + range * cfg.multR;
      sv = sv - range * cfg.multS;
      r[k][i] = rv;
      s[k][i] = sv;
    }
  }

  // plot(..., offset = offset_pivots): the value of bar i is drawn on bar i + offset
  const off = cfg.offsetPivots;
  const interval = barInterval(bars);
  const P = (vals: number[], c: string) => {
    const out: { time: number; value: number; color: string }[] = [];
    for (let i = 0; i < n; i++) {
      if (i + off < 0) continue;
      const v = vals[i];
      out.push({ time: barTime(bars, i + off, interval), value: Number.isFinite(v) ? v : NaN, color: c });
    }
    return out;
  };

  const plots: Record<string, { time: number; value: number; color: string }[]> = {};
  for (let k = 0; k < 5; k++) plots[`plot${k}`] = P(r[k], color.fuchsia);
  for (let k = 0; k < 5; k++) plots[`plot${k + 5}`] = P(s[k], color.lime);
  plots.plot10 = P(pivot, color.gray);
  const closes = bars.map((b) => b.close);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    // alertcondition(ta.crossover(close, r1..r5), ...) / alertcondition(ta.crossunder(close, s1..s5), ...)
    alerts: alertStates(alertConditions, bars, [
      ...r.map((band) => crossedOver(closes, band)),
      ...s.map((band) => crossedUnder(closes, band)),
    ]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  ...[1, 2, 3, 4, 5].map((k) => ({ id: `alert${k - 1}`, title: `Cross Above R${k}`, message: `Price crossed above R${k}` })),
  ...[1, 2, 3, 4, 5].map((k) => ({ id: `alert${k + 4}`, title: `Cross Below S${k}`, message: `Price crossed below S${k}` })),
];

export const VolumeWeightedPivotBands = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
