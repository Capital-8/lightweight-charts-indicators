/**
 * RCYC - Bullish Bearish Indicator
 *
 * A KDJ oscillator: K = 100 * (close - lowest low) / (highest high - lowest low) over `length` bars (50 when the
 * range is 0 or na), pK = RMA(K, signal), pD = RMA(pK, signal), J = 3 * pK - 2 * pD. A crossover of J above the
 * midline sets the bullish state, a crossunder the bearish state. The price candles are redrawn in the state colour:
 * red on the bullish cross bar, then navy; yellow on the bearish cross bar, then aqua; gray while neutral. The
 * initial state is an input; 'Auto' takes the side of J on the first bar where J is known.
 * Alerts (alertcondition, `alerts` of the result): 'Red Candle Alert' (J crosses over the midline) and 'Yellow
 * Candle Alert' (J crosses under the midline).
 *
 * Reference: "RCYC - Bullish Bearish Indicator" by bizarro29
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { PlotCandleData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface RcycBullishBearishIndicatorInputs {
  /** KDJ length (highest high / lowest low window) */
  length: number;
  /** RMA length of pK and pD */
  signal: number;
  /** Midline level of the J crosses */
  midline: number;
  /** State before the first cross */
  initialStateInput: 'Bullish' | 'Bearish' | 'Neutral' | 'Auto';
}

export const defaultInputs: RcycBullishBearishIndicatorInputs = {
  length: 9,
  signal: 3,
  midline: 50.0,
  initialStateInput: 'Auto',
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'KDJ Length', defval: 9, min: 1 },
  { id: 'signal', type: 'int', title: 'Signal Smoothing', defval: 3, min: 1 },
  { id: 'midline', type: 'float', title: 'Midline Level', defval: 50.0, step: 0.1 },
  { id: 'initialStateInput', type: 'string', title: 'Initial State', defval: 'Auto', options: ['Bullish', 'Bearish', 'Neutral', 'Auto'] },
];

/** No plot(): the output is the plotcandle of the price in the state colour */
export const plotConfig: PlotConfig[] = [];

/** plotcandle(open, high, low, close, color = candleColor, wickcolor = candleColor, bordercolor = borderColor) */
export const plotCandleConfig = [{ id: 'candles', title: 'Candles' }];

export const metadata = {
  title: 'RCYC - Bullish Bearish Indicator',
  shortTitle: 'RCYC - Bullish Bearish Indicator',
  overlay: true,
};

/** Pine float comparisons: a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const ne = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);

export function calculate(
  bars: Bar[],
  inputs: Partial<RcycBullishBearishIndicatorInputs> = {},
): Omit<IndicatorResult, 'markers'> & { plotCandles: Record<string, PlotCandleData[]> } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  const hi = A(ta.highest(new Series(bars, (b) => b.high), cfg.length));
  const lo = A(ta.lowest(new Series(bars, (b) => b.low), cfg.length));
  // k = range_ != 0 ? 100 * ((close - lo) / range_) : 50 (an na range gives 50: na != 0 is false)
  const k = bars.map((b, i) => {
    const range = hi[i] - lo[i];
    return ne(range, 0) ? 100 * ((b.close - lo[i]) / range) : 50;
  });
  const pKs = ta.rma(S(k), cfg.signal);
  const pK = A(pKs);
  const pD = A(ta.rma(pKs, cfg.signal));
  const j = pK.map((v, i) => 3 * v - 2 * pD[i]);
  const js = S(j);
  // ta.crossover / ta.crossunder: exact comparisons, with the last bar where both values were not na
  const crossOver = A(ta.crossover(js, cfg.midline));
  const crossUnder = A(ta.crossunder(js, cfg.midline));

  const candles: PlotCandleData[] = [];
  let colorState = NaN; // var int colorState = na
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    if (i === 0) {
      // barstate.isfirst: Bullish 1, Bearish 2, Neutral / Auto 0
      colorState = cfg.initialStateInput === 'Bullish' ? 1 : cfg.initialStateInput === 'Bearish' ? 2 : 0;
    }
    if (cfg.initialStateInput === 'Auto' && colorState === 0 && !isNaN(j[i])) {
      colorState = ge(j[i], cfg.midline) ? 1 : 2;
    }
    const up = !!crossOver[i];
    const down = !!crossUnder[i];
    if (up) colorState = 1;
    else if (down) colorState = 2;

    const col = colorState === 1 ? (up ? color.red : color.navy)
      : colorState === 2 ? (down ? color.yellow : color.aqua)
        : color.gray;
    candles.push({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close, color: col, wickColor: col, borderColor: col });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    plotCandles: { candles },
    // alertcondition(crossOverMid, "Red Candle Alert") / alertcondition(crossUnderMid, "Yellow Candle Alert")
    alerts: alertStates(alertConditions, bars, [bars.map((_, i) => !!crossOver[i]), bars.map((_, i) => !!crossUnder[i])]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Red Candle Alert', message: 'Red Candle Signal: J Value has crossed above the selected midline.' },
  { id: 'alert1', title: 'Yellow Candle Alert', message: 'Yellow Candle Signal: J Value has crossed below the selected midline.' },
];

export const RcycBullishBearishIndicator = { calculate, metadata, defaultInputs, inputConfig, plotConfig, plotCandleConfig, alertConditions };
