/**
 * Open Close Cross Alerts NoRepaint Version
 *
 * Two moving averages of the same type, one of the closes and one of the opens. The "alternate resolution" is
 * simulated by a longer period (MA period * multiplier). The difference of the two longer averages, as a factor of
 * the average of the two shorter ones (50000 * diff / avg), is drawn as an area and a line, green when the close
 * average is above the open average, red otherwise. A circle at the bottom marks each cross of the two averages.
 * Optional divergence channel: 5-bar fractals of the difference factor, offset by a multiple of its 20-bar standard
 * deviation, with regular / hidden divergence labels (fractal against the high / low two bars back).
 *
 * Alerts (alertcondition, `alerts` of the result): "OCC BothCond" (either cross), "OCC LongCond" (close average
 * crossing over the open average) and "OCC ShortCond" (crossing under it).
 *
 * MA types: SMA, EMA, DEMA, TEMA, WMA, VWMA, SMMA, HullMA, ZEMA (zero-lag EMA), SSMA (Ehlers super smoother), TMA.
 *
 * Reference: "Open Close Cross Alerts NoRepaint Version by JustUncleL" by JustUncleL
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: Copyright 2017, 2019 JustUncleL
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type HLineConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

/** The original's alertcondition() calls, in declaration order */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'OCC BothCond', message: 'OCC BothCond' },
  { id: 'alert1', title: 'OCC LongCond', message: 'OCC LongCond' },
  { id: 'alert2', title: 'OCC ShortCond', message: 'OCC ShortCond' },
];

export type OccMaType = 'SMA' | 'EMA' | 'DEMA' | 'TEMA' | 'WMA' | 'VWMA' | 'SMMA' | 'HullMA' | 'ZEMA' | 'SSMA' | 'TMA';

export interface OpenCloseCrossAlertsNRPInputs {
  /** Simulate a higher resolution with a longer MA period */
  useRes: boolean;
  /** Multiplier of the MA period for the alternate resolution */
  intRes: number;
  basisType: OccMaType;
  basisLen: number;
  /** Show the divergence channel (only with regular or hidden divergence on) */
  showDivergence: boolean;
  /** Channel width factor (standard deviations) */
  multi: number;
  showHidden: boolean;
  showRegular: boolean;
}

export const defaultInputs: OpenCloseCrossAlertsNRPInputs = {
  useRes: true,
  intRes: 6,
  basisType: 'ZEMA',
  basisLen: 8,
  showDivergence: false,
  multi: 0.5,
  showHidden: false,
  showRegular: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'useRes', type: 'bool', title: 'Use Alternate Resolution?', defval: true },
  { id: 'intRes', type: 'int', title: 'Multiplier for Alernate Resolution', defval: 6, min: 1 },
  { id: 'basisType', type: 'string', title: 'MA Type: ', defval: 'ZEMA',
    options: ['SMA', 'EMA', 'DEMA', 'TEMA', 'WMA', 'VWMA', 'SMMA', 'HullMA', 'ZEMA', 'SSMA', 'TMA'] },
  { id: 'basisLen', type: 'int', title: 'MA Period', defval: 8, min: 1 },
  { id: 'showDivergence', type: 'bool', title: 'Show Divergence Channel', defval: false },
  { id: 'multi', type: 'float', title: 'Divergence Channel Width Factor (Stddev)', defval: 0.5, min: 0, max: 3 },
  { id: 'showHidden', type: 'bool', title: 'Show Hidden Divergence', defval: false },
  { id: 'showRegular', type: 'bool', title: 'Show Regular Divergence', defval: false },
];

const GREEN = '#4CAF50';
const RED = '#FF5252';
const GRAY = '#787B86';
const MAROON = '#880E4F';
const WHITE = '#FFFFFF';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'OCC Difference Factor', color: String(color.new(GREEN, 80)), lineWidth: 1, style: 'area' },
  { id: 'plot1', title: 'OCC Difference Factor', color: String(color.new(GREEN, 20)), lineWidth: 2 },
  { id: 'plot2', title: 'RSI High', color: GRAY, lineWidth: 1 },
  { id: 'plot3', title: 'RSI Low', color: GRAY, lineWidth: 1 },
  { id: 'plot4', title: 'RSI H F', color: RED, lineWidth: 1, offset: -2 },
  { id: 'plot5', title: 'RSI L F', color: GREEN, lineWidth: 1, offset: -2 },
  { id: 'plot6', title: 'RSI H D', color: GRAY, lineWidth: 3, style: 'circles', offset: -2 },
  { id: 'plot7', title: 'RSI L D', color: GRAY, lineWidth: 3, style: 'circles', offset: -2 },
];

/** hline(0, color = color.gray, linestyle = hline.style_dashed) */
export const hlineConfig: HLineConfig[] = [
  { id: 'hline_0', price: 0, color: GRAY, linestyle: 'dashed' },
];

export const metadata = {
  title: 'Open Close Cross Alerts NoRepaint Version by JustUncleL',
  shortTitle: 'OCC Alerts NRP',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

/** A float used as a condition: na and 0 are false */
const truthy = (x: number) => !isNaN(x) && x !== 0;

type Point = { time: number; value: number; color?: string };

export function calculate(
  bars: Bar[],
  inputs: Partial<OpenCloseCrossAlertsNRPInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => (v === null || v === undefined ? NaN : v));
  const S = (a: number[]) => Series.fromArray(bars, a);
  const intRes = cfg.useRes ? cfg.intRes : 1;
  // uDiv := uReg or uHid ? uDiv : false
  const uDiv = cfg.showRegular || cfg.showHidden ? cfg.showDivergence : false;
  const uReg = cfg.showRegular;
  const uHid = cfg.showHidden;

  // variant(type, src, len)
  const variant = (type: OccMaType, srcArr: number[], len: number): number[] => {
    const src = S(srcArr);
    switch (type) {
      case 'EMA': return A(ta.ema(src, len));
      case 'WMA': return A(ta.wma(src, len));
      case 'VWMA': return A(ta.vwma(src, len, S(bars.map((b) => b.volume ?? NaN))));
      case 'SMMA': {
        // v5 := na(v5[1]) ? sma(src, len) : (v5[1] * (len - 1) + src) / len
        const sma = A(ta.sma(src, len));
        const v = new Array<number>(n).fill(NaN);
        for (let i = 0; i < n; i++) {
          const prev = i > 0 ? v[i - 1] : NaN;
          v[i] = isNaN(prev) ? sma[i] : (prev * (len - 1) + srcArr[i]) / len;
        }
        return v;
      }
      case 'DEMA': {
        const v2 = A(ta.ema(src, len));
        const e2 = A(ta.ema(S(v2), len));
        return v2.map((x, i) => 2 * x - e2[i]);
      }
      case 'TEMA': {
        const v2 = A(ta.ema(src, len));
        const e2 = A(ta.ema(S(v2), len));
        const e3 = A(ta.ema(S(e2), len));
        return v2.map((x, i) => 3 * (x - e2[i]) + e3[i]);
      }
      case 'HullMA': {
        const wma2 = A(ta.wma(src, len / 2));
        const wma3 = A(ta.wma(src, len));
        return A(ta.wma(S(wma2.map((x, i) => 2 * x - wma3[i])), Math.round(Math.sqrt(len))));
      }
      case 'SSMA': {
        // Ehlers super smoother
        const a1 = Math.exp((-1.414 * 3.14159) / len);
        const b1 = 2 * a1 * Math.cos((1.414 * 3.14159) / len);
        const c2 = b1;
        const c3 = -a1 * a1;
        const c1 = 1 - c2 - c3;
        const nz = (x: number) => (isNaN(x) ? 0 : x);
        const v = new Array<number>(n).fill(NaN);
        for (let i = 0; i < n; i++) {
          const s1 = i > 0 ? srcArr[i - 1] : NaN;
          const v1 = i > 0 ? v[i - 1] : NaN;
          const v2 = i > 1 ? v[i - 2] : NaN;
          v[i] = (c1 * (srcArr[i] + nz(s1))) / 2 + c2 * nz(v1) + c3 * nz(v2);
        }
        return v;
      }
      case 'ZEMA': {
        // lag = (len - 1) / 2; emaSrc = src + src - src[lag] (a fractional history index is truncated)
        const lag = Math.trunc((len - 1) / 2);
        const emaSrc = srcArr.map((x, i) => (i - lag >= 0 ? x + x - srcArr[i - lag] : NaN));
        return A(ta.ema(S(emaSrc), len));
      }
      case 'TMA': return A(ta.sma(S(A(ta.sma(src, len))), len));
      default: return A(ta.sma(src, len));
    }
  };

  const close = bars.map((b) => b.close);
  const open = bars.map((b) => b.open);
  const closeSeries = variant(cfg.basisType, close, cfg.basisLen);
  const openSeries = variant(cfg.basisType, open, cfg.basisLen);
  const closeOpenAvg = closeSeries.map((x, i) => (x + openSeries[i]) / 2);
  const closeSeriesAlt = variant(cfg.basisType, close, cfg.basisLen * intRes);
  const openSeriesAlt = variant(cfg.basisType, open, cfg.basisLen * intRes);

  const xlong = A(ta.crossover(S(closeSeriesAlt), S(openSeriesAlt)));
  const xshort = A(ta.crossunder(S(closeSeriesAlt), S(openSeriesAlt)));

  // pcd = 50000.0 * diff / closeOpenAvg
  const pcd = closeSeriesAlt.map((x, i) => (50000.0 * (x - openSeriesAlt[i])) / closeOpenAvg[i]);
  const trendColour = (i: number) => (gt(closeSeriesAlt[i], openSeriesAlt[i]) ? GREEN : RED);

  // Divergence channel
  const offset = A(ta.stdev(S(pcd), 20)).map((s) => cfg.multi * s);
  const at = (i: number) => (i >= 0 ? pcd[i] : NaN);
  const topFractal = (i: number) =>
    lt(at(i - 4), at(i - 2)) && lt(at(i - 3), at(i - 2)) && gt(at(i - 2), at(i - 1)) && gt(at(i - 2), at(i));
  const botFractal = (i: number) =>
    gt(at(i - 4), at(i - 2)) && gt(at(i - 3), at(i - 2)) && lt(at(i - 2), at(i - 1)) && lt(at(i - 2), at(i));
  const fractalTop = new Array<number>(n).fill(NaN);
  const fractalBot = new Array<number>(n).fill(NaN);
  const regBear = new Array<boolean>(n).fill(false);
  const hidBear = new Array<boolean>(n).fill(false);
  const regBull = new Array<boolean>(n).fill(false);
  const hidBull = new Array<boolean>(n).fill(false);
  // valuewhen(cond, x, 1): the value of x at the condition bar before the latest one (the latest can be this bar)
  const topVals: number[] = [];
  const topHighs: number[] = [];
  const botVals: number[] = [];
  const botLows: number[] = [];
  for (let i = 0; i < n; i++) {
    // f_fractalize: top fractal ? 1 : bottom fractal ? -1 : 0
    const f = topFractal(i) ? 1 : botFractal(i) ? -1 : 0;
    fractalTop[i] = f > 0 ? at(i - 2) : NaN;
    fractalBot[i] = f < 0 ? at(i - 2) : NaN;
    const high2 = i >= 2 ? bars[i - 2].high : NaN;
    const low2 = i >= 2 ? bars[i - 2].low : NaN;
    if (truthy(fractalTop[i])) {
      topVals.push(at(i - 2));
      topHighs.push(high2);
    }
    if (truthy(fractalBot[i])) {
      botVals.push(at(i - 2));
      botLows.push(low2);
    }
    const highPrev = topVals.length >= 2 ? topVals[topVals.length - 2] : NaN;
    const highPrice = topHighs.length >= 2 ? topHighs[topHighs.length - 2] : NaN;
    const lowPrev = botVals.length >= 2 ? botVals[botVals.length - 2] : NaN;
    const lowPrice = botLows.length >= 2 ? botLows[botLows.length - 2] : NaN;
    const ft = truthy(fractalTop[i]);
    const fb = truthy(fractalBot[i]);
    regBear[i] = ft && gt(high2, highPrice) && lt(at(i - 2), highPrev) && gt(pcd[i], 0);
    hidBear[i] = ft && lt(high2, highPrice) && gt(at(i - 2), highPrev) && gt(pcd[i], 0);
    regBull[i] = fb && lt(low2, lowPrice) && gt(at(i - 2), lowPrev) && lt(pcd[i], 0);
    hidBull[i] = fb && gt(low2, lowPrice) && lt(at(i - 2), lowPrev) && lt(pcd[i], 0);
  }

  const interval = barInterval(bars);
  const t = (i: number) => bars[i].time;
  const P = (f: (i: number) => Point | null): Point[] => {
    const out: Point[] = [];
    for (let i = 0; i < n; i++) {
      const p = f(i);
      if (p) out.push(p);
    }
    return out;
  };
  // offset = -2: the value of bar i is drawn on bar i - 2
  const back2 = (i: number) => (i >= 2 ? barTime(bars, i - 2, interval) : NaN);

  const plots: Record<string, Point[]> = {
    plot0: P((i) => ({ time: t(i), value: pcd[i], color: String(color.new(trendColour(i), 80)) })),
    plot1: P((i) => ({ time: t(i), value: pcd[i], color: String(color.new(trendColour(i), 20)) })),
    plot2: P((i) => ({ time: t(i), value: uDiv ? pcd[i] : NaN, color: GRAY })),
    plot3: P((i) => ({ time: t(i), value: uDiv ? pcd[i] : NaN, color: GRAY })),
    plot4: P((i) => (i < 2 ? null : { time: back2(i), value: uDiv ? fractalTop[i] + offset[i] : NaN, color: RED })),
    plot5: P((i) => (i < 2 ? null : { time: back2(i), value: uDiv ? fractalBot[i] - offset[i] : NaN, color: GREEN })),
    plot6: P((i) => (i < 2 ? null : {
      time: back2(i), value: uDiv ? fractalTop[i] + offset[i] : NaN,
      color: (regBear[i] && uReg) || (hidBear[i] && uHid) ? MAROON : GRAY,
    })),
    plot7: P((i) => (i < 2 ? null : {
      time: back2(i), value: uDiv ? fractalBot[i] - offset[i] : NaN,
      color: (regBull[i] && uReg) || (hidBull[i] && uHid) ? GREEN : GRAY,
    })),
  };

  const markers: MarkerData[] = [];
  for (let i = 0; i < n; i++) {
    // plotshape(alert, "OCC Alert Plot", color = trendColour, style = shape.circle, location = location.bottom, size = size.auto)
    if (xlong[i] || xshort[i]) {
      markers.push({ time: t(i), position: 'bottom', shape: 'circle', color: trendColour(i), size: 'auto', id: 'shape0' });
    }
    if (i < 2) continue;
    // plotshape(cond ? price : na, text, style, location.absolute, color, textcolor = color.white, offset = -2)
    const label = (on: boolean, price: number, text: string, down: boolean, col: string, id: string) => {
      if (!on || isNaN(price)) return;
      markers.push({ time: back2(i), position: down ? 'atPriceTop' : 'atPriceBottom', price,
        shape: down ? 'labelDown' : 'labelUp', color: col, text, textColor: WHITE, id });
    };
    label(regBear[i] && uReg, at(i - 2) + offset[i], 'Regular', true, MAROON, 'shape1');
    label(hidBear[i] && uHid, at(i - 2) + offset[i], 'hidden', true, MAROON, 'shape2');
    label(regBull[i] && uReg, at(i - 2) - offset[i], 'Regular', false, GREEN, 'shape3');
    label(hidBull[i] && uHid, at(i - 2) - offset[i], 'hidden', false, GREEN, 'shape4');
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    hlines: [{ value: 0, options: { color: GRAY, linestyle: 'dashed' } }],
    markers,
    // alert = longCond or shortCond; longCond = xlong; shortCond = xshort
    alerts: alertStates(alertConditions, bars, [
      xlong.map((v, i) => !!v || !!xshort[i]), xlong.map((v) => !!v), xshort.map((v) => !!v),
    ]),
  };
}

export const OpenCloseCrossAlertsNRP = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hlineConfig,
  alertConditions,
};
