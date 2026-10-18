/**
 * Cycle & Flow Indicator - D_Quant
 *
 * Three votes of +1 / -1 (or 0): a Schaff Trend Cycle direction (MACD of EMAs, two stochastic + EMA passes; +1 above
 * 25, -1 below 75 while falling, the second rule wins), the Parabolic SAR side of the close and the sign of an SMA of
 * the Ease of Movement. Their average above the bullish threshold gives a bullish state, below the bearish threshold
 * a bearish state, else neutral. A Hull MA of the close is the baseline, coloured by the state, with a cloud to the
 * close; the HMA + ATR band shows in the bullish state, the HMA - ATR band in the bearish state. Candles take the
 * state colour.
 * Alerts (alertcondition, `alerts` of the result): 'CFA Bullish Cycle' / 'CFA Bearish Cycle', true on the bars where
 * the state (-1 / 0 / 1) crosses above / below 0.
 *
 * Reference: "Cycle & Flow Indicator - D_Quant" by D_QUANT
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © D_QUANT
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { PlotCandleData } from '../types';
import {
  alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState,
} from '../alert-states';

export interface CycleFlowIndicatorDQuantInputs {
  /** STC stochastic / EMA length */
  stcLength: number;
  /** STC MACD fast EMA length */
  stcFast: number;
  /** STC MACD slow EMA length */
  stcSlow: number;
  /** Parabolic SAR start */
  psarStart: number;
  /** Parabolic SAR increment */
  psarInc: number;
  /** Parabolic SAR maximum */
  psarMax: number;
  /** Ease of Movement SMA length */
  eomLength: number;
  /** Ease of Movement volume divisor */
  eomDiv: number;
  /** Bullish threshold of the average vote */
  treshBull: number;
  /** Bearish threshold of the average vote */
  treshBear: number;
}

export const defaultInputs: CycleFlowIndicatorDQuantInputs = {
  stcLength: 10,
  stcFast: 23,
  stcSlow: 50,
  psarStart: 0.02,
  psarInc: 0.02,
  psarMax: 0.2,
  eomLength: 14,
  eomDiv: 100000000,
  treshBull: 0.2,
  treshBear: -0.2,
};

export const inputConfig: InputConfig[] = [
  { id: 'stcLength', type: 'int', title: 'Length', defval: 10, min: 1 },
  { id: 'stcFast', type: 'int', title: 'Fast Length', defval: 23, min: 1 },
  { id: 'stcSlow', type: 'int', title: 'Slow Length', defval: 50, min: 1 },
  { id: 'psarStart', type: 'float', title: 'Start', defval: 0.02, step: 0.001 },
  { id: 'psarInc', type: 'float', title: 'Increment', defval: 0.02, step: 0.001 },
  { id: 'psarMax', type: 'float', title: 'Maximum', defval: 0.2, step: 0.01 },
  { id: 'eomLength', type: 'int', title: 'Length', defval: 14, min: 1 },
  { id: 'eomDiv', type: 'int', title: 'Divisor', defval: 100000000 },
  { id: 'treshBull', type: 'float', title: 'Bullish Threshold', defval: 0.2, step: 0.1 },
  { id: 'treshBear', type: 'float', title: 'Bearish Threshold', defval: -0.2, step: 0.1 },
];

const COL_BULL = '#089981';
const COL_BEAR = '#f23645';
const COL_NEUT = String(color.new(color.gray, 50));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Baseline', color: COL_BULL, lineWidth: 2 },
  { id: 'plot1', title: 'Ghost Source', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot2', title: 'Upper Volatility', color: COL_BULL, lineWidth: 1, style: 'linebr' },
  { id: 'plot3', title: 'Lower Volatility', color: COL_BEAR, lineWidth: 1, style: 'linebr' },
];

export const metadata = {
  title: 'Cycle & Flow Indicator - D_Quant',
  shortTitle: '|C|F|A|',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, `x != 0` false within 1e-10 or with na */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ne0 = (x: number) => !Number.isNaN(x) && Number.isFinite(x) ? Math.abs(x) > EPS : false;

export function calculate(
  bars: Bar[],
  inputs: Partial<CycleFlowIndicatorDQuantInputs> = {},
): IndicatorResult & { plotCandles: Record<string, PlotCandleData[]> } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const close = bars.map((b) => b.close);

  // math_stoch(src, len): max - min != 0 ? 100 * (src - min) / (max - min) : 0.0
  const stoch = (src: number[], len: number) => {
    const lo = A(ta.lowest(S(src), len));
    const hi = A(ta.highest(S(src), len));
    return src.map((v, i) => (ne0(hi[i] - lo[i]) ? (100 * (v - lo[i])) / (hi[i] - lo[i]) : 0.0));
  };

  // calc_stc
  const emaFast = A(ta.ema(S(close), cfg.stcFast));
  const emaSlow = A(ta.ema(S(close), cfg.stcSlow));
  const macd = close.map((_c, i) => emaFast[i] - emaSlow[i]);
  const k1 = stoch(macd, 14);
  const d1 = A(ta.ema(S(k1), cfg.stcLength));
  const k2 = stoch(d1, cfg.stcLength);
  const stc = A(ta.ema(S(k2), cfg.stcLength));

  // calc_psar: close > ta.sar(start, inc, max) ? 1 : -1
  const sar = A(ta.sar(bars, cfg.psarStart, cfg.psarInc, cfg.psarMax));

  // calc_eom
  const rawEom = bars.map((b, i) => {
    const dist = i > 0 ? (b.high + b.low) / 2 - (bars[i - 1].high + bars[i - 1].low) / 2 : NaN;
    const range = b.high - b.low;
    const boxRatio = ne0(range) ? b.volume! / cfg.eomDiv / range : 0.0;
    return ne0(boxRatio) ? dist / boxRatio : 0.0;
  });
  const smoothEom = A(ta.sma(S(rawEom), cfg.eomLength));

  const state: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    let dir = 0;
    if (gt(stc[i], 25)) dir = 1;
    if (lt(stc[i], 75) && lt(stc[i], i > 0 ? stc[i - 1] : NaN)) dir = -1;
    const sigPsar = gt(close[i], sar[i]) ? 1 : -1;
    const sigEom = gt(smoothEom[i], 0) ? 1 : -1;
    // the three votes are never na: score_cnt is 3
    const avg = (0.0 + dir + sigPsar + sigEom) / 3;
    state[i] = gt(avg, cfg.treshBull) ? 1 : lt(avg, cfg.treshBear) ? -1 : 0;
  }
  const colTrend = state.map((s) => (s === 1 ? COL_BULL : s === -1 ? COL_BEAR : COL_NEUT));

  const baseMean = A(ta.hma(S(close), 20));
  const atr = A(ta.atr(bars, 14));

  const candles: PlotCandleData[] = bars.map((b, i) => ({
    time: b.time, open: b.open, high: b.high, low: b.low, close: b.close,
    color: colTrend[i], wickColor: colTrend[i], borderColor: colTrend[i], forceOverlay: true,
  }));

  const cloudBull = String(color.new(COL_BULL, 60));
  const cloudBear = String(color.new(COL_BEAR, 60));
  const cloudNeut = String(color.new(color.gray, 90));
  const extBull = String(color.new(COL_BULL, 85));
  const extBear = String(color.new(COL_BEAR, 85));
  const fin = (v: number) => (Number.isFinite(v) ? v : NaN);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      // plot(base_mean, "Baseline", color = col_trend, linewidth = 2)
      plot0: bars.map((b, i) => ({ time: b.time, value: fin(baseMean[i]), color: colTrend[i] })),
      // plot(close, "Ghost Source", color = na, display = display.none)
      plot1: bars.map((b) => ({ time: b.time, value: b.close, color: 'transparent' })),
      // plot(trend_state == 1 ? band_top : na, "Upper Volatility", col_bull, style = plot.style_linebr)
      plot2: bars.map((b, i) => ({ time: b.time, value: state[i] === 1 ? fin(baseMean[i] + atr[i]) : NaN, color: COL_BULL })),
      // plot(trend_state == -1 ? band_bot : na, "Lower Volatility", col_bear, style = plot.style_linebr)
      plot3: bars.map((b, i) => ({ time: b.time, value: state[i] === -1 ? fin(baseMean[i] - atr[i]) : NaN, color: COL_BEAR })),
    },
    fills: [
      { plot1: 'plot0', plot2: 'plot1', options: { title: 'Momentum Cloud' },
        colors: state.map((s) => (s === 1 ? cloudBull : s === -1 ? cloudBear : cloudNeut)) },
      { plot1: 'plot0', plot2: 'plot2', options: { title: 'Bullish Extension', color: extBull }, colors: bars.map(() => extBull) },
      { plot1: 'plot0', plot2: 'plot3', options: { title: 'Bearish Extension', color: extBear }, colors: bars.map(() => extBear) },
    ],
    plotCandles: { quantCandles: candles },
    // tx_bull = ta.crossover(trend_state, 0) / tx_bear = ta.crossunder(trend_state, 0)
    alerts: alertStates(alertConditions, bars, [crossedOver(state, 0), crossedUnder(state, 0)]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'CFA Bullish Cycle', message: 'Cycle Flow: Bullish Trend Started' },
  { id: 'alert1', title: 'CFA Bearish Cycle', message: 'Cycle Flow: Bearish Trend Started' },
];

export const CycleFlowIndicatorDQuant = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
