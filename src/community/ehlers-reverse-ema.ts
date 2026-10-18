/**
 * Ehlers Reverse EMA
 *
 * An EMA of the close (ema = alpha * close + (1 - alpha) * ema[1]) and the Ehlers reverse EMA cascade:
 * re1 = d * ema + ema[1], then re(k+1) = d^(2^k) * re(k) + re(k)[1] for eight stages (d = 1 - alpha).
 * The line is ema - alpha * re8 after 75 bars, green above zero and red otherwise, with an SMA / EMA / WMA / VWMA of
 * it. Optional triangle signals on zero crosses, MA crosses or both.
 *
 * Alerts (alert() calls, `alertCalls` of the result, once per bar) when "Enable Alerts" is on:
 * "Ehlers Reverse EMA: Buy Signal" on a buy signal and "Ehlers Reverse EMA: Sell Signal" on a sell signal (the
 * signals are computed only when "Show Signals" is on, as in the original).
 *
 * Reference: "Ehlers Reverse EMA" by AlgoCollective
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © AlgoCollective
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { AlertCall, MarkerData } from '../types';

/** The original makes alert() calls */
export const hasAlertFunction = true;

export interface EhlersReverseEmaInputs {
  alpha: number;
  /** Max Bars (not used by the computation) */
  maxbars: number;
  showMA: boolean;
  maType: 'SMA' | 'EMA' | 'WMA' | 'VWMA';
  maLength: number;
  showSignals: boolean;
  signalType: 'Zero Cross' | 'MA Cross' | 'Zero & MA Cross';
  plotArrows: boolean;
  /** Enable Alerts: the alert() calls are made (`alertCalls`); no effect on the other outputs */
  alertsOn: boolean;
}

export const defaultInputs: EhlersReverseEmaInputs = {
  alpha: 0.1,
  maxbars: 500,
  showMA: true,
  maType: 'SMA',
  maLength: 14,
  showSignals: false,
  signalType: 'Zero Cross',
  plotArrows: true,
  alertsOn: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'alpha', type: 'float', title: 'Alpha', defval: 0.1, min: 0.01, max: 1.0, step: 0.01, group: 'Main Settings' },
  { id: 'maxbars', type: 'int', title: 'Max Bars', defval: 500, min: 10, group: 'Main Settings' },
  { id: 'showMA', type: 'bool', title: 'Show Moving Average', defval: true, group: 'Moving Average' },
  { id: 'maType', type: 'string', title: 'MA Type', defval: 'SMA', options: ['SMA', 'EMA', 'WMA', 'VWMA'], group: 'Moving Average' },
  { id: 'maLength', type: 'int', title: 'MA Length', defval: 14, min: 1, group: 'Moving Average' },
  { id: 'showSignals', type: 'bool', title: 'Show Signals', defval: false, group: 'Signal Settings' },
  { id: 'signalType', type: 'string', title: 'Signal Type', defval: 'Zero Cross', options: ['Zero Cross', 'MA Cross', 'Zero & MA Cross'], group: 'Signal Settings' },
  { id: 'plotArrows', type: 'bool', title: 'Plot Arrows on Chart', defval: true, group: 'Signal Settings' },
  { id: 'alertsOn', type: 'bool', title: 'Enable Alerts', defval: false, group: 'Signal Settings' },
];

const bullColor = 'rgb(0, 180, 0)';
const bearColor = 'rgb(255, 0, 0)';
const maColor = 'rgb(255, 165, 0)';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Reverse EMA', color: bullColor, lineWidth: 1 },
  { id: 'plot1', title: 'MA', color: maColor, lineWidth: 1 },
];

export const metadata = {
  title: 'Ehlers Reverse EMA',
  shortTitle: 'Ehlers Reverse EMA',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

export function calculate(
  bars: Bar[],
  inputs: Partial<EhlersReverseEmaInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; alertCalls: AlertCall[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const { alpha } = cfg;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const delta = 1 - alpha;
  const warmupPeriod = 75;
  // math.pow(delta, 2^k) of the stages 2..8
  const pows = [2, 4, 8, 16, 32, 64, 128].map((e) => Math.pow(delta, e));

  const reverseEma: number[] = new Array(n).fill(NaN);
  let emaPrev = NaN; // ema[1]: na on the first bar
  const re1 = new Array(8).fill(0); // re1_1 .. re8_1 (var float = 0.0)
  for (let i = 0; i < n; i++) {
    const close = bars[i].close;
    // ema := alpha * close + delta * nz(ema[1], close)
    const ema = alpha * close + delta * (isNaN(emaPrev) ? close : emaPrev);
    // re1_0 := delta * ema + nz(ema[1], ema)
    const re0 = new Array(8);
    re0[0] = delta * ema + (isNaN(emaPrev) ? ema : emaPrev);
    for (let k = 1; k < 8; k++) re0[k] = pows[k - 1] * re0[k - 1] + re1[k - 1];
    for (let k = 0; k < 8; k++) re1[k] = re0[k];
    if (i > warmupPeriod) reverseEma[i] = ema - alpha * re0[7];
    emaPrev = ema;
  }

  const reS = S(reverseEma);
  let maS: Series;
  switch (cfg.maType) {
    case 'EMA': maS = ta.ema(reS, cfg.maLength); break;
    case 'WMA': maS = ta.wma(reS, cfg.maLength); break;
    case 'VWMA': maS = ta.vwma(reS, cfg.maLength, S(bars.map((b) => b.volume ?? NaN))); break;
    default: maS = ta.sma(reS, cfg.maLength);
  }
  const maValue = A(maS);

  const markers: MarkerData[] = [];
  const alertCalls: AlertCall[] = [];
  const plot0: { time: number; value: number; color: string }[] = [];
  const plot1: { time: number; value: number }[] = [];
  for (let i = 0; i < n; i++) {
    const re = reverseEma[i];
    const rePrev = i > 0 ? reverseEma[i - 1] : NaN;
    const maPrev = i > 0 ? maValue[i - 1] : NaN;
    let buySignal = false;
    let sellSignal = false;
    if (cfg.showSignals && i > warmupPeriod + 5) {
      if (cfg.signalType === 'Zero Cross') {
        buySignal = gt(re, 0) && le(rePrev, 0);
        sellSignal = lt(re, 0) && ge(rePrev, 0);
      } else if (cfg.signalType === 'MA Cross') {
        buySignal = gt(re, maValue[i]) && le(rePrev, maPrev);
        sellSignal = lt(re, maValue[i]) && ge(rePrev, maPrev);
      } else if (cfg.signalType === 'Zero & MA Cross') {
        buySignal = gt(re, 0) && gt(re, maValue[i]) && (le(rePrev, 0) || le(rePrev, maPrev));
        sellSignal = lt(re, 0) && lt(re, maValue[i]) && (ge(rePrev, 0) || ge(rePrev, maPrev));
      }
    }
    const t = bars[i].time;
    // if alertsOn: if buySignal alert("Ehlers Reverse EMA: Buy Signal", alert.freq_once_per_bar) / same for sell
    if (cfg.alertsOn) {
      if (buySignal) alertCalls.push({ time: t, message: 'Ehlers Reverse EMA: Buy Signal', freq: 'once_per_bar' });
      if (sellSignal) alertCalls.push({ time: t, message: 'Ehlers Reverse EMA: Sell Signal', freq: 'once_per_bar' });
    }
    plot0.push({ time: t, value: re, color: gt(re, 0) ? bullColor : bearColor });
    plot1.push({ time: t, value: cfg.showMA ? maValue[i] : NaN });
    // plotshape(buySignal and plotArrows ? reverseEma : na, location.absolute, shape.triangleup, size.small)
    if (buySignal && cfg.plotArrows && !isNaN(re)) {
      markers.push({ time: t, position: 'atPriceMiddle', price: re, shape: 'triangleUp', color: bullColor, size: 'small' });
    }
    if (sellSignal && cfg.plotArrows && !isNaN(re)) {
      markers.push({ time: t, position: 'atPriceMiddle', price: re, shape: 'triangleDown', color: bearColor, size: 'small' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1 },
    hlines: [{ value: 0, options: { title: 'Zero Line', color: String(color.new(color.gray, 0)), linestyle: 'solid' } }],
    markers,
    alertCalls,
  };
}

export const EhlersReverseEma = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hasAlertFunction,
};
