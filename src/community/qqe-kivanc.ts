/**
 * Quantitative Qualitative Estimation (QQE)
 *
 * FAST = EMA of the RSI. Its absolute bar-to-bar change is smoothed twice with a Wilder factor (1 / RSI length)
 * and multiplied by 4.236 to give a band above and below FAST. SLOW is a trailing line that follows the lower band
 * while FAST is above it and the upper band while FAST is below it. The area between FAST and SLOW is green when
 * FAST is above and red when it is below; Buy / Sell labels mark the crosses of FAST and SLOW.
 * Alerts (alertcondition, `alerts` of the result): the original's five conditions, crosses of FAST with SLOW (any
 * cross, crossover, crossunder) and with 50.
 *
 * Reference: "Quantitative Qualitative Estimation" (QQE) by KivancOzbilgic
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © KivancOzbilgic
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface QqeKivancInputs {
  src: SourceType;
  /** RSI length */
  length: number;
  /** EMA length of the RSI smoothing */
  SSF: number;
  /** Show the Buy / Sell labels on the crosses */
  showsignals: boolean;
  /** Fill the area between FAST and SLOW */
  highlighting: boolean;
}

export const defaultInputs: QqeKivancInputs = {
  src: 'close',
  length: 14,
  SSF: 5,
  showsignals: true,
  highlighting: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'src', type: 'source', title: 'src', defval: 'close' },
  { id: 'length', type: 'int', title: 'RSI Length', defval: 14, min: 1 },
  { id: 'SSF', type: 'int', title: 'SF RSI SMoothing Factor', defval: 5, min: 1 },
  { id: 'showsignals', type: 'bool', title: 'Show Crossing Signals?', defval: true },
  { id: 'highlighting', type: 'bool', title: 'Highlighter On/Off ?', defval: true },
];

// Colour constants of Pine version 4
const MAROON = '#880E4F';
const BLUE = '#2196F3';
const GRAY = '#787B86';
const GREEN = '#4CAF50';
const RED = '#FF5252';
const WHITE = '#FFFFFF';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'FAST', color: MAROON, lineWidth: 2 },
  { id: 'plot1', title: 'SLOW', color: BLUE, lineWidth: 1 },
  { id: 'plot2', title: 'Mid Line', color: GRAY, lineWidth: 1, style: 'circles' },
];

export const metadata = {
  title: 'Quantitative Qualitative Estimation',
  shortTitle: 'QQE',
  overlay: false,
  precision: 4,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const nz = (v: number) => (isNaN(v) ? 0 : v);

export function calculate(
  bars: Bar[],
  inputs: Partial<QqeKivancInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  // QQEF = ema(rsi(src, length), SSF) (RSII is the same series)
  const fastSeries = ta.ema(ta.rsi(getSourceSeries(bars, cfg.src), cfg.length), cfg.SSF);
  const fast = fastSeries.toArray().map((v) => v ?? NaN);

  const wwalpha = 1 / cfg.length;
  const slow: number[] = new Array(n);
  let wwma = NaN;
  let atrRsi = NaN;
  for (let i = 0; i < n; i++) {
    const f = fast[i];
    const f1 = i > 0 ? fast[i - 1] : NaN;
    const tr = Math.abs(f - f1);
    wwma = wwalpha * tr + (1 - wwalpha) * nz(wwma);
    atrRsi = wwalpha * wwma + (1 - wwalpha) * nz(atrRsi);
    const qup = f + atrRsi * 4.236;
    const qdn = f - atrRsi * 4.236;
    const s1 = nz(i > 0 ? slow[i - 1] : NaN);
    slow[i] = lt(qup, s1) ? qup
      : gt(f, s1) && lt(f1, s1) ? qdn
        : gt(qdn, s1) ? qdn
          : lt(f, s1) && gt(f1, s1) ? qup
            : s1;
  }

  const slowSeries = Series.fromArray(bars, slow);
  const buy = ta.crossover(fastSeries, slowSeries).toArray();
  const sell = ta.crossunder(fastSeries, slowSeries).toArray();

  // fill(QQF, QQS, color = ...): default fill transparency 90
  const greenFill = String(color.new(GREEN, 90));
  const redFill = String(color.new(RED, 90));
  const plot0: Array<{ time: number; value: number }> = [];
  const plot1: typeof plot0 = [];
  const plot2: typeof plot0 = [];
  const longFill: string[] = [];
  const shortFill: string[] = [];
  const markers: MarkerData[] = [];
  for (let i = 0; i < n; i++) {
    const time = bars[i].time;
    plot0.push({ time, value: fast[i] });
    plot1.push({ time, value: slow[i] });
    plot2.push({ time, value: 50 });
    longFill.push(cfg.highlighting && gt(fast[i], slow[i]) ? greenFill : 'transparent');
    shortFill.push(cfg.highlighting && lt(fast[i], slow[i]) ? redFill : 'transparent');
    // plotshape(buySignalr and showsignals ? QQES * 0.995 : na, location.absolute, shape.labelup, size.tiny)
    if (cfg.showsignals && buy[i] && !isNaN(slow[i])) {
      markers.push({ time, position: 'atPriceBottom', price: slow[i] * 0.995, shape: 'labelUp', color: GREEN,
        text: 'Buy', textColor: WHITE, size: 'tiny' });
    }
    if (cfg.showsignals && sell[i] && !isNaN(slow[i])) {
      markers.push({ time, position: 'atPriceTop', price: slow[i] * 1.005, shape: 'labelDown', color: RED,
        text: 'Sell', textColor: WHITE, size: 'tiny' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay, precision: metadata.precision },
    plots: { plot0, plot1, plot2 },
    fills: [
      { plot1: 'plot0', plot2: 'plot1', options: { title: 'UpTrend Highligter' }, colors: longFill },
      { plot1: 'plot0', plot2: 'plot1', options: { title: 'DownTrend Highligter' }, colors: shortFill },
    ],
    markers,
    // alertcondition(cross / crossover / crossunder(QQEF, QQES), crossover / crossunder(QQEF, 50))
    alerts: alertStates(alertConditions, bars, [
      buy.map((v, i) => !!v || !!sell[i]), buy.map((v) => !!v), sell.map((v) => !!v),
      crossedOver(fast, 50), crossedUnder(fast, 50),
    ]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Cross Alert', message: 'QQE Crossing Signal!' },
  { id: 'alert1', title: 'Crossover Alarm', message: 'QQE BUY SIGNAL!' },
  { id: 'alert2', title: 'Crossunder Alarm', message: 'QQE SELL SIGNAL!' },
  { id: 'alert3', title: 'Cross 50 Up Alert', message: 'QQE FAST Crossing 50 UP!' },
  { id: 'alert4', title: 'Cross 50 Down Alert', message: 'QQE FAST Crossing 50 DOWN!' },
];

export const QqeKivanc = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
