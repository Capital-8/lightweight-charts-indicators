/**
 * Luminous Mean Reversion Channels
 *
 * A volatility-stepped mean level: it starts at the source and moves by one step (ATR(length) * mult) only when the
 * source is more than one step away from it. When the mean level changes, half the step is kept as the channel
 * half width; the bands are the mean level +/- 2 * that width. Gradient fills between each band and the mean level.
 * BUY when the source crosses over the lower band, SELL when it crosses under the upper band.
 * Alerts (alertcondition, `alerts` of the result): 'Bullish Mean Reversion' (BUY) and 'Bearish Mean Reversion' (SELL).
 *
 * Reference: "Luminous Mean Reversion Channels [Pineify]" by Pineify
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Pineify
 */

import { ta, color, getSourceSeries, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface LuminousMeanReversionChannelsInputs {
  /** ATR length of the step */
  length: number;
  /** ATR multiplier of the step */
  mult: number;
  /** Source of the mean level and of the signals */
  src: SourceType;
}

export const defaultInputs: LuminousMeanReversionChannelsInputs = {
  length: 200,
  mult: 6.0,
  src: 'close',
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'Volatility Length', defval: 200, min: 2 },
  { id: 'mult', type: 'float', title: 'Channel Width Factor', defval: 6.0, min: 0, step: 0.5 },
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
];

const RED = '#f23645';
const GREEN = '#089981';
const MID = String(color.new('#787b86', 50));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Overbought Band', color: RED, lineWidth: 2 },
  { id: 'plot1', title: 'Mean Reversion Level', color: MID, lineWidth: 1 },
  { id: 'plot2', title: 'Oversold Band', color: GREEN, lineWidth: 2 },
];

export const metadata = {
  title: 'Luminous Mean Reversion Channels [Pineify]',
  shortTitle: 'Luminous MRC [Pineify]',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
/** Pine a != b: false when a value is na */
const ne = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<LuminousMeanReversionChannelsInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const src = getSourceSeries(bars, cfg.src).toArray().map((v) => v ?? NaN);
  const atr = ta.atr(bars, cfg.length).toArray().map((v) => v ?? NaN);

  const avg: number[] = new Array(n);
  const upper: number[] = new Array(n);
  const lower: number[] = new Array(n);
  let avgLine = NaN; // var float avg_line = src (first bar)
  let holdAtr = 0.0; // var float hold_atr = 0.0
  for (let i = 0; i < n; i++) {
    if (i === 0) avgLine = src[0];
    const prev = i > 0 ? avg[i - 1] : NaN;
    // atr_val = nz(ta.atr(length)) * mult
    const atrVal = (isNaN(atr[i]) ? 0 : atr[i]) * cfg.mult;
    // avg_line := src - avg_line > atr_val ? avg_line + atr_val : avg_line - src > atr_val ? avg_line - atr_val : avg_line
    avgLine = gt(src[i] - avgLine, atrVal) ? avgLine + atrVal : gt(avgLine - src[i], atrVal) ? avgLine - atrVal : avgLine;
    // hold_atr := avg_line != avg_line[1] ? atr_val / 2 : hold_atr
    if (ne(avgLine, prev)) holdAtr = atrVal / 2;
    avg[i] = avgLine;
    upper[i] = avgLine + holdAtr * 2;
    lower[i] = avgLine - holdAtr * 2;
  }

  const markers: MarkerData[] = [];
  const buyFlags: boolean[] = new Array(n).fill(false), sellFlags: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    // buy_signal = ta.crossover(src, lower_band); sell_signal = ta.crossunder(src, upper_band): exact comparisons
    buyFlags[i] = src[i] > lower[i] && src[i - 1] <= lower[i - 1];
    sellFlags[i] = src[i] < upper[i] && src[i - 1] >= upper[i - 1];
    if (buyFlags[i]) {
      markers.push({ time: bars[i].time, position: 'belowBar', shape: 'labelUp', color: GREEN, text: 'BUY',
        textColor: color.white, size: 'small' });
    }
    if (sellFlags[i]) {
      markers.push({ time: bars[i].time, position: 'aboveBar', shape: 'labelDown', color: RED, text: 'SELL',
        textColor: color.white, size: 'small' });
    }
  }

  const t = (i: number) => bars[i].time;
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((_b, i) => ({ time: t(i), value: upper[i], color: RED })),
      plot1: bars.map((_b, i) => ({ time: t(i), value: avg[i], color: MID })),
      plot2: bars.map((_b, i) => ({ time: t(i), value: lower[i], color: GREEN })),
    },
    fills: [
      // fill(up_plot, mid_plot, top_color = color.new(#f23645, 85), bottom_color = color.new(#f23645, 100)):
      // the gradient goes from the upper band (top) to the mean level (bottom)
      {
        plot1: 'plot0', plot2: 'plot1', options: { title: 'Bearish Reversal Aura' },
        gradient: { topValue: upper.slice(), bottomValue: avg.slice(),
          topColor: new Array(n).fill(String(color.new(RED, 85))), bottomColor: new Array(n).fill(String(color.new(RED, 100))) },
      },
      // fill(dn_plot, mid_plot, top_color = color.new(#089981, 100), bottom_color = color.new(#089981, 85)):
      // the gradient goes from the mean level (top) to the lower band (bottom)
      {
        plot1: 'plot2', plot2: 'plot1', options: { title: 'Bullish Reversal Aura' },
        gradient: { topValue: avg.slice(), bottomValue: lower.slice(),
          topColor: new Array(n).fill(String(color.new(GREEN, 100))), bottomColor: new Array(n).fill(String(color.new(GREEN, 85))) },
      },
    ],
    markers,
    // alertcondition(buy_signal, ...) / alertcondition(sell_signal, ...)
    alerts: alertStates(alertConditions, bars, [buyFlags, sellFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish Mean Reversion', message: 'Price crossed back above the lower mean reversion band.' },
  { id: 'alert1', title: 'Bearish Mean Reversion', message: 'Price crossed back below the upper mean reversion band.' },
];

export const LuminousMeanReversionChannels = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
