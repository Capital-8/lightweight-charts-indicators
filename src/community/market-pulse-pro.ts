/**
 * Market Pulse-X
 *
 * Three normalised components, each in 0..1: the stochastic momentum index (close relative to the midpoint of the
 * highest high / lowest low, smoothed twice; (smiK + 100) / 200), the stochastic of the RSI over the RSI period, and
 * the position of a smoothed close (signal line) in its range over the signal period. Their mean * 100 is the buy
 * dominance and 100 minus it the sell dominance; both are smoothed over 10 bars and drawn as the bull and bear lines
 * with a 50 level. Smoothing methods: EMA, HMA, zero-lag EMA (ZLA) or a two-pole super smoother (SSE).
 * Alerts (alertcondition, `alerts` of the result): bull line crossing over the bear line, bear over bull, bull line
 * crossing over / under 50.
 *
 * Reference: "Market Pulse-X" by Canhoto-Medium
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export type MarketPulseSmoothing = 'EMA' | 'HMA' | 'ZLA' | 'SSE';

export interface MarketPulseProInputs {
  smiLength: number;
  smiSmoothK: number;
  smiSmoothD: number;
  rsiPeriod: number;
  /** Smoothing length of the close (signal line) and length of its range */
  signalPeriod: number;
  /** Smoothing of the signal line */
  signalSmoothingMethod: MarketPulseSmoothing;
  /** Smoothing of the SMI and of the dominance lines */
  normalSmoothingMethod: MarketPulseSmoothing;
  /** Line width (the plot width of the port stays at the default 4) */
  lineWidth: number;
}

export const defaultInputs: MarketPulseProInputs = {
  smiLength: 21,
  smiSmoothK: 5,
  smiSmoothD: 5,
  rsiPeriod: 14,
  signalPeriod: 20,
  signalSmoothingMethod: 'HMA',
  normalSmoothingMethod: 'HMA',
  lineWidth: 4,
};

export const inputConfig: InputConfig[] = [
  { id: 'smiLength', type: 'int', title: 'SMI Period', defval: 21 },
  { id: 'smiSmoothK', type: 'int', title: 'SMI Smooth K', defval: 5 },
  { id: 'smiSmoothD', type: 'int', title: 'SMI Smooth D', defval: 5 },
  { id: 'rsiPeriod', type: 'int', title: 'RSI Period', defval: 14 },
  { id: 'signalPeriod', type: 'int', title: 'Signal Period', defval: 20 },
  { id: 'signalSmoothingMethod', type: 'string', title: 'Signal Line Smoothing', defval: 'HMA', options: ['EMA', 'HMA', 'ZLA', 'SSE'] },
  { id: 'normalSmoothingMethod', type: 'string', title: 'SMI-RSI Smoothing', defval: 'HMA', options: ['EMA', 'HMA', 'ZLA', 'SSE'] },
  { id: 'lineWidth', type: 'int', title: 'Line Width', defval: 4, min: 1, max: 4 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Bull Herd', color: color.lime, lineWidth: 4 },
  { id: 'plot1', title: 'Bear Winter', color: color.fuchsia, lineWidth: 4 },
];

export const metadata = {
  title: 'Market Pulse-X',
  shortTitle: 'Pulse-X',
  overlay: false,
};

/** Pine a == b: within 1e-10 (false with na) */
const eq = (a: number, b: number) => Math.abs(a - b) <= 1e-10;

export function calculate(
  bars: Bar[],
  inputs: Partial<MarketPulseProInputs> = {},
): IndicatorResult & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  // f_smooth(src, length, method): one call site per use (each keeps its own history)
  const smooth = (src: number[], length: number, method: MarketPulseSmoothing): number[] => {
    switch (method) {
      case 'HMA':
        return A(ta.hma(S(src), length));
      case 'ZLA': {
        // lag = math.floor((length - 1) / 2); ta.ema(src + (src - src[lag]), length)
        const lag = Math.floor((length - 1) / 2);
        const input = src.map((v, i) => (i - lag >= 0 ? v + (v - src[i - lag]) : NaN));
        return A(ta.ema(S(input), length));
      }
      case 'SSE': {
        const a1 = Math.exp((-1.414 * Math.PI) / length);
        const b1 = 2 * a1 * Math.cos((1.414 * Math.PI) / length);
        const c2 = b1;
        const c3 = -a1 * a1;
        const c1 = 1 - c2 - c3;
        const nz = (v: number) => (Number.isFinite(v) ? v : 0);
        const ss: number[] = new Array(n);
        for (let i = 0; i < n; i++) {
          // ss := c1 * (src + nz(src[1])) / 2 + c2 * nz(ss[1]) + c3 * nz(ss[2])
          const src1 = i >= 1 ? src[i - 1] : NaN;
          const ss1 = i >= 1 ? ss[i - 1] : NaN;
          const ss2 = i >= 2 ? ss[i - 2] : NaN;
          ss[i] = (c1 * (src[i] + nz(src1))) / 2 + c2 * nz(ss1) + c3 * nz(ss2);
        }
        return ss;
      }
      default:
        return A(ta.ema(S(src), length));
    }
  };

  // SMI
  const hh = A(ta.highest(S(bars.map((b) => b.high)), cfg.smiLength));
  const ll = A(ta.lowest(S(bars.map((b) => b.low)), cfg.smiLength));
  const smiInput = bars.map((b, i) => {
    const midpoint = (hh[i] + ll[i]) / 2;
    const rangel = hh[i] - ll[i];
    return ((b.close - midpoint) / (eq(rangel, 0) ? 1 : rangel / 2)) * 100;
  });
  const smiK = smooth(smiInput, cfg.smiSmoothK, cfg.normalSmoothingMethod);
  // smiD = f_smooth(smiK, smiSmoothD, ...) is not used by any output of the Pine script (input kept)

  // Stoch RSI
  const rsi = A(ta.rsi(S(bars.map((b) => b.close)), cfg.rsiPeriod));
  const rsiHi = A(ta.highest(S(rsi), cfg.rsiPeriod));
  const rsiLo = A(ta.lowest(S(rsi), cfg.rsiPeriod));
  const stochRSI = rsi.map((v, i) => {
    const r = rsiHi[i] - rsiLo[i];
    return ((v - rsiLo[i]) / (eq(r, 0) ? 1 : r)) * 100;
  });

  // Signal line
  const signal = smooth(bars.map((b) => b.close), cfg.signalPeriod, cfg.signalSmoothingMethod);
  const sigHi = A(ta.highest(S(signal), cfg.signalPeriod));
  const sigLo = A(ta.lowest(S(signal), cfg.signalPeriod));

  const buyDominance = bars.map((_b, i) => {
    const normSmiK = (smiK[i] + 100) / 200;
    const normStochRSI = stochRSI[i] / 100;
    const sigRange = sigHi[i] - sigLo[i];
    const normSignal = (signal[i] - sigLo[i]) / (eq(sigRange, 0) ? 1 : sigRange);
    return ((normSmiK + normStochRSI + normSignal) / 3) * 100;
  });
  const sellDominance = buyDominance.map((v) => 100 - v);
  const smoothBuy = smooth(buyDominance, 10, cfg.normalSmoothingMethod);
  const smoothSell = smooth(sellDominance, 10, cfg.normalSmoothingMethod);

  const fin = (v: number) => (Number.isFinite(v) ? v : NaN);
  // bullCrossOverBear, bearCrossOverBull, buyCross50Up, buyCross50Down
  const buyLine = smoothBuy.map(fin);
  const sellLine = smoothSell.map(fin);
  const flags = [
    crossedOver(buyLine, sellLine), crossedOver(sellLine, buyLine), crossedOver(buyLine, 50), crossedUnder(buyLine, 50),
  ];
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: fin(smoothBuy[i]), color: color.lime })),
      plot1: bars.map((b, i) => ({ time: b.time, value: fin(smoothSell[i]), color: color.fuchsia })),
    },
    hlines: [{ value: 50, options: { title: '50%', color: color.gray, linestyle: 'dashed' } }],
    alerts: alertStates(alertConditions, bars, flags),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bull 🟢 crossed X 🡅 Bear 🔴', message: 'Pulse-X: Bull 🟢 crossed above Bear 🔴' },
  { id: 'alert1', title: 'Bear 🟠 crossed X 🡅 Bull 🔵', message: 'Pulse-X: Bear 🟠 crossed above Bull 🔵' },
  { id: 'alert2', title: 'Bull Line rose 🡅 level 50', message: 'Pulse-X: Bull Line rose 🡅 level 50' },
  { id: 'alert3', title: 'Bear Line fell 🡇 level 50', message: 'Pulse-X: Bear Line fell 🡇 level 50' },
];

export const MarketPulsePro = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
