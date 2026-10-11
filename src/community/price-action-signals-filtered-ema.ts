/**
 * Price Action Signals Filtered +EMA
 *
 * A pivot low (left / right bars) confirmed by `confirmationCandles` rising closes (each close above the close before
 * it) while the close is above the EMA gives a bullish signal; a pivot high confirmed by falling closes while the
 * close is below the EMA gives a bearish signal. A signal is shown only when the same side is not already active:
 * a bullish setup makes the bullish side active and ends the bearish side, and the other way round.
 *
 * Last bar: a pivot is processed on a closed bar only. The port reads the state of the last bar from the optional
 * third argument (see src/chart-context.ts); without it every bar is taken as closed.
 *
 * Reference: "Price Action Signals Filtered +EMA" by Aleksin_Aleksandar
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

export type PriceActionBullShape = 'Circle' | 'Triangle Up' | 'Arrow Up';
export type PriceActionBearShape = 'Circle' | 'Triangle Down' | 'Arrow Down';

export interface PriceActionSignalsFilteredEmaInputs {
  /** Pivot left bars */
  leftPivot: number;
  /** Pivot right bars */
  rightPivot: number;
  /** Number of confirmation candles (1..5) */
  confirmationCandles: number;
  /** EMA length of the trend filter */
  emaLength: number;
  bullColor: string;
  bearColor: string;
  bullShape: PriceActionBullShape;
  bearShape: PriceActionBearShape;
}

const BULL_COLOR = String(color.rgb(12, 250, 20));
const BEAR_COLOR = String(color.rgb(247, 2, 2));
const EMA_COLOR = String(color.rgb(0, 86, 247));

export const defaultInputs: PriceActionSignalsFilteredEmaInputs = {
  leftPivot: 2,
  rightPivot: 2,
  confirmationCandles: 2,
  emaLength: 20,
  bullColor: BULL_COLOR,
  bearColor: BEAR_COLOR,
  bullShape: 'Triangle Up',
  bearShape: 'Triangle Down',
};

export const inputConfig: InputConfig[] = [
  { id: 'leftPivot', type: 'int', title: 'Pivot Left', defval: 2, min: 1 },
  { id: 'rightPivot', type: 'int', title: 'Pivot Right', defval: 2, min: 1 },
  { id: 'confirmationCandles', type: 'int', title: 'Number of Confirmation Candles', defval: 2, min: 1, max: 5 },
  { id: 'emaLength', type: 'int', title: 'EMA Length (Trend Filter)', defval: 20, min: 1 },
  { id: 'bullColor', type: 'color', title: 'Bullish Signal Color', defval: BULL_COLOR },
  { id: 'bearColor', type: 'color', title: 'Bearish Signal Color', defval: BEAR_COLOR },
  { id: 'bullShape', type: 'string', title: 'Bullish Shape', defval: 'Triangle Up', options: ['Circle', 'Triangle Up', 'Arrow Up'] },
  { id: 'bearShape', type: 'string', title: 'Bearish Shape', defval: 'Triangle Down', options: ['Circle', 'Triangle Down', 'Arrow Down'] },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'EMA Trend Filter', color: EMA_COLOR, lineWidth: 1 },
];

export const metadata = {
  title: 'Price Action Signals Filtered +EMA',
  shortTitle: 'Price Action Signals Filtered +EMA',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

const BULL_SHAPES: Record<string, MarkerData['shape']> = { Circle: 'circle', 'Triangle Up': 'triangleUp', 'Arrow Up': 'arrowUp' };
const BEAR_SHAPES: Record<string, MarkerData['shape']> = { Circle: 'circle', 'Triangle Down': 'triangleDown', 'Arrow Down': 'arrowDown' };

export function calculate(
  bars: Bar[],
  inputs: Partial<PriceActionSignalsFilteredEmaInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } {
  // barstate.isconfirmed: every bar is closed, except the last one when the chart context says that it is still open
  const lastBarOpen = !lastBarConfirmedOf(chart);
  const barIsConfirmed = (index: number) => !(lastBarOpen && index === bars.length - 1);
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const close = bars.map((b) => b.close);

  const pivotLow = A(ta.pivotlow(Series.fromArray(bars, bars.map((b) => b.low)), cfg.leftPivot, cfg.rightPivot));
  const pivotHigh = A(ta.pivothigh(Series.fromArray(bars, bars.map((b) => b.high)), cfg.leftPivot, cfg.rightPivot));
  const ema = A(ta.ema(Series.fromArray(bars, close), cfg.emaLength));

  const bullShape = BULL_SHAPES[cfg.bullShape];
  const bearShape = BEAR_SHAPES[cfg.bearShape];
  const closeAt = (i: number) => (i >= 0 ? close[i] : NaN);

  const markers: MarkerData[] = [];
  let bullishActive = false; // var bool bullishActive = false
  let bearishActive = false; // var bool bearishActive = false
  for (let i = 0; i < n; i++) {
    const isBullishTrend = gt(close[i], ema[i]);
    const isBearishTrend = lt(close[i], ema[i]);
    let bullishConfirmed = false;
    let bearishConfirmed = false;
    // if newLow and barstate.isconfirmed
    if (!isNaN(pivotLow[i]) && barIsConfirmed(i)) {
      let tempBull = true;
      // for k = 0 to confirmationCandles - 1: if close[k] <= close[k + 1] -> false (na compares false)
      for (let k = 0; k <= cfg.confirmationCandles - 1; k++) {
        if (le(closeAt(i - k), closeAt(i - k - 1))) tempBull = false;
      }
      if (tempBull && isBullishTrend) {
        if (!bullishActive) {
          bullishConfirmed = true;
          bullishActive = true;
        }
        bearishActive = false;
      }
    }
    if (!isNaN(pivotHigh[i]) && barIsConfirmed(i)) {
      let tempBear = true;
      for (let k = 0; k <= cfg.confirmationCandles - 1; k++) {
        if (ge(closeAt(i - k), closeAt(i - k - 1))) tempBear = false;
      }
      if (tempBear && isBearishTrend) {
        if (!bearishActive) {
          bearishConfirmed = true;
          bearishActive = true;
        }
        bullishActive = false;
      }
    }
    // plotshape(bullishConfirmed_Filtered, location.belowbar, color = bullColor, style = bullShapeType, size.small)
    if (bullishConfirmed && bullShape) {
      markers.push({ time: bars[i].time, position: 'belowBar', shape: bullShape, color: cfg.bullColor, size: 'small' });
    }
    // plotshape(bearishConfirmed_Filtered, location.abovebar, color = bearColor, style = bearShapeType, size.small)
    if (bearishConfirmed && bearShape) {
      markers.push({ time: bars[i].time, position: 'aboveBar', shape: bearShape, color: cfg.bearColor, size: 'small' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: ema[i], color: EMA_COLOR })),
    },
    markers,
  };
}

export const PriceActionSignalsFilteredEma = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
