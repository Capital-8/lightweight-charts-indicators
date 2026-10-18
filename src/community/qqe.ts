/**
 * Quantitative Qualitative Estimation (QQE)
 *
 * FAST = EMA ("Smooth Factor") of the RSI. Its absolute bar-to-bar change is smoothed twice with a Wilder factor
 * (1 / RSI length, each smoothing starting from 0) and multiplied by the QQE factor (4.236 in the original) to give a
 * band above and below FAST. SLOW, the trailing line, starts at 0 and follows the original's rule on each bar: the
 * upper band when it is below the previous SLOW; the lower band when FAST crosses up through the previous SLOW or the
 * lower band is above it; the upper band when FAST crosses down through it; else the previous SLOW. FAST and SLOW
 * cross where the trend turns. With "Highlighter On/Off ?" the area between them is green when FAST is above and red
 * when it is below (default fill transparency 90); with "Show Crossing Signals?" Buy / Sell labels mark the crosses
 * (at SLOW x 0.995 / x 1.005). A circles plot at 50.
 * Alerts (alertcondition, `alerts` of the result): the original's five conditions, crosses of FAST with SLOW (any
 * cross, crossover, crossunder) and with 50.
 *
 * Reference: "Quantitative Qualitative Estimation" (QQE) by KivancOzbilgic
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface QQEInputs {
  rsiLen: number;
  smoothFactor: number;
  qqeFactor: number;
  src: SourceType;
  /** Show Crossing Signals? (Buy / Sell labels) */
  showSignals: boolean;
  /** Highlighter On/Off ? (fill between FAST and SLOW) */
  highlighting: boolean;
}

export const defaultInputs: QQEInputs = {
  rsiLen: 14,
  smoothFactor: 5,
  qqeFactor: 4.236,
  src: 'close',
  showSignals: true,
  highlighting: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'rsiLen', type: 'int', title: 'RSI Length', defval: 14, min: 1 },
  { id: 'smoothFactor', type: 'int', title: 'Smooth Factor', defval: 5, min: 1 },
  { id: 'qqeFactor', type: 'float', title: 'QQE Factor', defval: 4.236, min: 0.01, step: 0.001 },
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
  { id: 'showSignals', type: 'bool', title: 'Show Crossing Signals?', defval: true },
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
  { id: 'plot2', title: 'Plot', color: GRAY, lineWidth: 1, style: 'circles' },
];

export const metadata = {
  title: 'Quantitative Qualitative Estimation',
  shortTitle: 'QQE',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const nz = (v: number) => (isNaN(v) ? 0 : v);

export function calculate(
  bars: Bar[],
  inputs: Partial<QQEInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const { rsiLen, smoothFactor, qqeFactor, src, showSignals, highlighting } = { ...defaultInputs, ...inputs };
  const n = bars.length;

  // RSII = QQEF = ema(rsi(src, length), SSF)
  const fastSeries = ta.ema(ta.rsi(getSourceSeries(bars, src), rsiLen), smoothFactor);
  const fast = fastSeries.toArray().map((v) => v ?? NaN);

  // TR = abs(RSII - RSII[1]); WWMA := wwalpha * TR + (1 - wwalpha) * nz(WWMA[1]);
  // ATRRSI := wwalpha * WWMA + (1 - wwalpha) * nz(ATRRSI[1]); QUP / QDN = QQEF +/- ATRRSI * 4.236
  // QQES := QUP < nz(QQES[1]) ? QUP : QQEF > nz(QQES[1]) and QQEF[1] < nz(QQES[1]) ? QDN : QDN > nz(QQES[1]) ? QDN
  //   : QQEF < nz(QQES[1]) and QQEF[1] > nz(QQES[1]) ? QUP : nz(QQES[1])
  const wwalpha = 1 / rsiLen;
  const slow: number[] = new Array(n);
  let wwma = NaN;
  let atrRsi = NaN;
  for (let i = 0; i < n; i++) {
    const f = fast[i];
    const f1 = i > 0 ? fast[i - 1] : NaN;
    const tr = Math.abs(f - f1);
    wwma = wwalpha * tr + (1 - wwalpha) * nz(wwma);
    atrRsi = wwalpha * wwma + (1 - wwalpha) * nz(atrRsi);
    const qup = f + atrRsi * qqeFactor;
    const qdn = f - atrRsi * qqeFactor;
    const s1 = nz(i > 0 ? slow[i - 1] : NaN);
    slow[i] = lt(qup, s1) ? qup
      : gt(f, s1) && lt(f1, s1) ? qdn
        : gt(qdn, s1) ? qdn
          : lt(f, s1) && gt(f1, s1) ? qup
            : s1;
  }

  // buySignalr = crossover(QQEF, QQES), sellSignallr = crossunder(QQEF, QQES)
  const slowSeries = Series.fromArray(bars, slow);
  const buy = ta.crossover(fastSeries, slowSeries).toArray().map((v) => !!v);
  const sell = ta.crossunder(fastSeries, slowSeries).toArray().map((v) => !!v);

  // fill(QQF, QQS, color = highlighting ? (QQEF > QQES ? color.green : na) : na): default fill transparency 90
  const greenFill = String(color.new(GREEN, 90));
  const redFill = String(color.new(RED, 90));
  const plot0: Array<{ time: number; value: number }> = [];
  const plot1: typeof plot0 = [];
  const plot2: typeof plot0 = [];
  const upFillColors: string[] = [];
  const downFillColors: string[] = [];
  const markers: MarkerData[] = [];
  for (let i = 0; i < n; i++) {
    const time = bars[i].time;
    plot0.push({ time, value: fast[i] });
    plot1.push({ time, value: slow[i] });
    // plot(50, color = color.gray, style = 6): circles
    plot2.push({ time, value: 50 });
    upFillColors.push(highlighting && gt(fast[i], slow[i]) ? greenFill : 'transparent');
    downFillColors.push(highlighting && lt(fast[i], slow[i]) ? redFill : 'transparent');
    // plotshape(buySignalr and showsignals ? QQES * 0.995 : na, "Buy", location.absolute, shape.labelup, size.tiny)
    if (showSignals && buy[i] && !isNaN(slow[i])) {
      markers.push({ id: 'shape0', time, position: 'atPriceBottom', price: slow[i] * 0.995, shape: 'labelUp', color: GREEN,
        text: 'Buy', textColor: WHITE, size: 'tiny' });
    }
    // plotshape(sellSignallr and showsignals ? QQES * 1.005 : na, "Sell", location.absolute, shape.labeldown)
    if (showSignals && sell[i] && !isNaN(slow[i])) {
      markers.push({ id: 'shape1', time, position: 'atPriceTop', price: slow[i] * 1.005, shape: 'labelDown', color: RED,
        text: 'Sell', textColor: WHITE, size: 'tiny' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { 'plot0': plot0, 'plot1': plot1, 'plot2': plot2 },
    fills: [
      { plot1: 'plot0', plot2: 'plot1', options: { title: 'UpTrend Highligter', color: greenFill }, colors: upFillColors },
      { plot1: 'plot0', plot2: 'plot1', options: { title: 'DownTrend Highligter', color: redFill }, colors: downFillColors },
    ],
    markers,
    // alertcondition(cross / crossover / crossunder(QQEF, QQES), crossover / crossunder(QQEF, 50))
    alerts: alertStates(alertConditions, bars, [
      buy.map((v, i) => v || sell[i]), buy, sell, crossedOver(fast, 50), crossedUnder(fast, 50),
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

export const QQE = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
