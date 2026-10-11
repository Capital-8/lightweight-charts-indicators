/**
 * Q Impulse Entry
 *
 * Impulse bands: SMA of the high / low over the impulse window, plus / minus the SMA(10) of the ATR(10) times the
 * ATR multiplier. A close crossing above the upper band turns the impulse trend on, a close crossing below the lower
 * band turns it off. A buy signal is the bar where the trend turns on, with an Elder impulse "green" bar (close above
 * the EMA(13) and a positive MACD(12, 26, 9) histogram) and ADX(14, 14) above 20, at least 30 bars after the last
 * signal and not after another buy; a sell signal is the mirror. The close of the last signal is drawn as dots.
 *
 * Last bar: the impulse trend changes on a closed bar only. The port reads the state of the last bar from the
 * optional third argument (see src/chart-context.ts); without it every bar is taken as closed.
 *
 * Reference: "Q Impulse Entry" by Quantora
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Quantora
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface QImpulseEntryInputs {
  /** SMA length of the high / low bands */
  impulseWindow: number;
  /** ATR multiplier of the band offset */
  atrMultiplier: number;
}

export const defaultInputs: QImpulseEntryInputs = {
  impulseWindow: 20,
  atrMultiplier: 1,
};

export const inputConfig: InputConfig[] = [
  { id: 'impulseWindow', type: 'int', title: 'Impulse Window', defval: 20 },
  { id: 'atrMultiplier', type: 'float', title: 'ATR Multiplier', defval: 1, step: 0.1 },
];

const BUY_COLOR = String(color.new(color.aqua, 0));
const SELL_COLOR = String(color.new(color.orange, 0));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Entry Price', color: BUY_COLOR, lineWidth: 1, style: 'circles' },
  { id: 'plot1', title: 'Elder EMA', color: color.gray, lineWidth: 1 },
  { id: 'plot2', title: 'Impulse High', color: BUY_COLOR, lineWidth: 1 },
  { id: 'plot3', title: 'Impulse Low', color: SELL_COLOR, lineWidth: 1 },
];

export const metadata = {
  title: 'Q Impulse Entry',
  shortTitle: 'Q Impulse Entry',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<QImpulseEntryInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } {
  // barstate.isconfirmed: every bar is closed, except the last one when the chart context says that it is still open
  const lastBarOpen = !lastBarConfirmedOf(chart);
  const barIsConfirmed = (index: number) => !(lastBarOpen && index === bars.length - 1);
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const atrLength = 10;
  const emaLength = 13;
  const adxThreshold = 20;
  const minBarsBetweenSignals = 30;

  // atrRange = ta.sma(ta.atr(atrLength), atrLength) * atrMultiplier
  const atrRange = A(ta.sma(ta.atr(bars, atrLength), atrLength)).map((v) => v * cfg.atrMultiplier);
  const smaHigh = A(ta.sma(S(bars.map((b) => b.high)), cfg.impulseWindow));
  const smaLow = A(ta.sma(S(bars.map((b) => b.low)), cfg.impulseWindow));
  const impulseHigh = smaHigh.map((v, i) => v + atrRange[i]);
  const impulseLow = smaLow.map((v, i) => v - atrRange[i]);
  const closeS = S(bars.map((b) => b.close));
  // ta.crossover / ta.crossunder: exact comparisons
  const isCrossUp = A(ta.crossover(closeS, S(impulseHigh)));
  const isCrossDown = A(ta.crossunder(closeS, S(impulseLow)));

  const ema = A(ta.ema(closeS, emaLength));
  const [macdLine, macdSignalLine] = ta.macd(closeS, 12, 26, 9).map(A);
  const adx = A(ta.dmi(bars, 14, 14)[2]);

  let impulseTrend = false;
  let prevTrend = false;
  let barsSinceSignal = 9999;
  let lastSignal = 0;
  let entryPrice = NaN;
  let entryColor: string | undefined;
  const plot0: { time: number; value: number; color?: string }[] = [];
  const markers: MarkerData[] = [];
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    // if isCrossUp and barstate.isconfirmed ... else if isCrossDown and barstate.isconfirmed ...
    if (isCrossUp[i] && barIsConfirmed(i)) impulseTrend = true;
    else if (isCrossDown[i] && barIsConfirmed(i)) impulseTrend = false;
    const changed = impulseTrend !== prevTrend; // ta.change(impulseTrend)
    prevTrend = impulseTrend;
    const rawBuySignal = changed && impulseTrend;
    const rawSellSignal = changed && !impulseTrend;

    const hist = macdLine[i] - macdSignalLine[i];
    const isImpulseGreen = gt(b.close, ema[i]) && gt(hist, 0);
    const isImpulseRed = lt(b.close, ema[i]) && lt(hist, 0);
    const adxValid = gt(adx[i], adxThreshold);

    barsSinceSignal += 1;
    const buySignal = rawBuySignal && barsSinceSignal >= minBarsBetweenSignals && lastSignal !== 1 && isImpulseGreen && adxValid;
    const sellSignal = rawSellSignal && barsSinceSignal >= minBarsBetweenSignals && lastSignal !== -1 && isImpulseRed && adxValid;
    if (buySignal) {
      lastSignal = 1;
      barsSinceSignal = 0;
    } else if (sellSignal) {
      lastSignal = -1;
      barsSinceSignal = 0;
    }
    if (buySignal) {
      entryPrice = b.close;
      entryColor = BUY_COLOR;
    } else if (sellSignal) {
      entryPrice = b.close;
      entryColor = SELL_COLOR;
    }
    plot0.push(entryColor ? { time: b.time, value: entryPrice, color: entryColor } : { time: b.time, value: entryPrice });

    if (buySignal) {
      markers.push({ time: b.time, position: 'belowBar', shape: 'labelUp', color: BUY_COLOR, text: '⇑', textColor: color.black, size: 'normal' });
    }
    if (sellSignal) {
      markers.push({ time: b.time, position: 'aboveBar', shape: 'labelDown', color: SELL_COLOR, text: '⇓', textColor: color.white, size: 'normal' });
    }
  }

  const P = (vals: number[], c: string) => bars.map((b, i) => ({ time: b.time, value: vals[i], color: c }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0,
      plot1: P(ema, color.gray),
      plot2: P(impulseHigh, BUY_COLOR),
      plot3: P(impulseLow, SELL_COLOR),
    },
    markers,
  };
}

export const QImpulseEntry = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
