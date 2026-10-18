/**
 * Volumetric Compressed MA
 *
 * The log of the volume is compressed between bands around its weighted moving average (WMA over
 * `Compression Lookback` bars, plus / minus the weighted standard deviation times the thresholds): the compressed
 * volume is exp(clamped log volume) - exp(lower band). The Compressed MA is ma(close * compressed volume) /
 * ma(compressed volume) over `Comperative Lookback` bars; the second line is ma(close) over the compression
 * lookback (the selected MA type for both). The area between the two lines is teal when the Compressed MA is above,
 * maroon otherwise; circles mark their crossings.
 * Alerts (alertcondition, `alerts` of the result): 'Bullish Cross' and 'Bearish Cross' on the bars of the circles.
 *
 * Reference: "Volumetric Compressed MA" by serkany88
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export type VolumetricCompressedMAType = 'RMA' | 'SMA' | 'EMA' | 'WMA';

export interface VolumetricCompressedMAInputs {
  /** Moving average type */
  maType: VolumetricCompressedMAType;
  /** Upward threshold (multiplier of the upper compression band) */
  upThresh: number;
  /** Downward threshold (multiplier of the lower compression band) */
  downThresh: number;
  /** Compression lookback, also the length of the second line */
  lenWindow: number;
  /** Comparative lookback of the Compressed MA */
  lenMl: number;
}

export const defaultInputs: VolumetricCompressedMAInputs = {
  maType: 'RMA',
  upThresh: 2,
  downThresh: -2,
  lenWindow: 81,
  lenMl: 21,
};

export const inputConfig: InputConfig[] = [
  { id: 'maType', type: 'string', title: 'MA Type', defval: 'RMA', options: ['RMA', 'SMA', 'EMA', 'WMA'] },
  { id: 'upThresh', type: 'int', title: 'Upward threshold', defval: 2, min: 1 },
  { id: 'downThresh', type: 'int', title: 'Downward threshold', defval: -2, max: -1 },
  { id: 'lenWindow', type: 'int', title: 'Compression Lookback', defval: 81, min: 2 },
  { id: 'lenMl', type: 'int', title: 'Comperative Lookback', defval: 21, min: 2 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Compressed MA', color: color.white, lineWidth: 2 },
  { id: 'plot1', title: 'VWMA', color: color.blue, lineWidth: 2 },
];

export const metadata = {
  title: 'Volumetric Compressed MA',
  shortTitle: 'VCMA',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<VolumetricCompressedMAInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const ma = (src: number[], len: number): number[] => {
    switch (cfg.maType) {
      case 'RMA': return A(ta.rma(S(src), len));
      case 'SMA': return A(ta.sma(S(src), len));
      case 'EMA': return A(ta.ema(S(src), len));
      case 'WMA': return A(ta.wma(S(src), len));
      default: return new Array(n).fill(NaN);
    }
  };

  // compressor(volume, len_window, up_thresh, down_thresh): thresh_dn_m = up_thresh, thresh_up_m = down_thresh
  const len = cfg.lenWindow;
  const data = bars.map((b) => Math.log(Math.abs(b.volume ?? NaN)));
  const loc = A(ta.wma(S(data), len));
  // wstdev(data, len): wm = ta.wma(data, len) (its own call, the same values as loc)
  const wm = loc;
  const compressed: number[] = new Array(n);
  for (let b = 0; b < n; b++) {
    let sum = 0.0;
    let sumW = 0.0;
    for (let i = 0; i <= len - 1; i++) {
      const w = len - i;
      const x = b - i >= 0 ? data[b - i] : NaN;
      sum = sum + Math.pow(x - wm[b], 2) * w;
      sumW = sumW + w;
    }
    const dev = Math.sqrt(sum / sumW);
    const threshDn = loc[b] + dev * cfg.upThresh;
    const threshUp = loc[b] + dev * cfg.downThresh;
    compressed[b] = Math.exp(Math.min(Math.max(data[b], threshUp), threshDn)) - Math.exp(threshUp);
  }

  // comp_ma = ma(close * compressed_out) / ma(compressed_out); vwma = ma(close, len_window)
  const close = bars.map((b) => b.close);
  const num = ma(bars.map((b, i) => b.close * compressed[i]), cfg.lenMl);
  const den = ma(compressed, cfg.lenMl);
  const compMa = num.map((v, i) => v / den[i]);
  const vwma = ma(close, len);

  const t = (i: number) => bars[i].time;
  const fin = (v: number) => (Number.isFinite(v) ? v : NaN);
  const plot0 = bars.map((_b, i) => ({ time: t(i), value: fin(compMa[i]), color: color.white }));
  const plot1 = bars.map((_b, i) => ({ time: t(i), value: fin(vwma[i]), color: color.blue }));

  // fill(cma, vma, comp_ma > vwma ? color.rgb(0, 137, 123, 70) : color.rgb(136, 14, 79, 70))
  const upFill = String(color.rgb(0, 137, 123, 70));
  const downFill = String(color.rgb(136, 14, 79, 70));
  const fills = [{ plot1: 'plot0', plot2: 'plot1', colors: compMa.map((v, i) => (gt(v, vwma[i]) ? upFill : downFill)) }];

  // ta.crossover / ta.crossunder(comp_ma, vwma): exact comparisons with the last bar where both values were not na
  const markers: MarkerData[] = [];
  const overColor = 'rgb(2, 145, 14)';
  const overFlags = new Array<boolean>(n).fill(false);
  const underFlags = new Array<boolean>(n).fill(false);
  let pa = NaN;
  let pb = NaN;
  for (let i = 0; i < n; i++) {
    const a = compMa[i];
    const b = vwma[i];
    if (isNaN(a) || isNaN(b)) continue;
    const crossOver = a > b && pa <= pb;
    const crossUnder = a < b && pa >= pb;
    pa = a;
    pb = b;
    overFlags[i] = crossOver;
    underFlags[i] = crossUnder;
    // plotshape(rule ? vwma : na, style = shape.circle, location = location.absolute, size = size.small)
    if (!Number.isFinite(b)) continue;
    if (crossOver) {
      markers.push({
        id: 'shape0', time: t(i), position: 'atPriceMiddle', price: b, shape: 'circle', color: overColor, size: 'small',
      });
    }
    if (crossUnder) {
      markers.push({
        id: 'shape1', time: t(i), position: 'atPriceMiddle', price: b, shape: 'circle', color: color.maroon, size: 'small',
      });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1 },
    fills,
    markers,
    // alertcondition(crossover_rule, "Bullish Cross") / alertcondition(crossunder_rule, "Bearish Cross")
    alerts: alertStates(alertConditions, bars, [overFlags, underFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish Cross', message: 'Bullish Crossover Happened' },
  { id: 'alert1', title: 'Bearish Cross', message: 'Bearish Crossunder Happened' },
];

export const VolumetricCompressedMA = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
