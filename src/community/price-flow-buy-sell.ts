/**
 * Price Flow - Buy Sell
 *
 * A Gaussian kernel endpoint estimate of the source: y = sum(w_i * src[i]) / sum(w_i), i = 0..lookback,
 * w_i = exp(-i^2 / (2 * h^2)), with the bandwidth h = base bandwidth * clamp(ATR(20) / SMA(ATR(20), 100), 0.5, 2)
 * when the adaptive volatility is on. Inner and outer envelopes at the mean absolute error (SMA over the lookback)
 * times the inner / outer multipliers. The line colour is a gradient of the EMA(5) of the velocity (y - y[1]),
 * saturated at 2 standard deviations (20) of the velocity. BUY / SELL labels on a first rejection of an envelope
 * (outer when trending, inner when ranging) with a weakening move (velocity and acceleration of opposite signs),
 * optionally alternating. Alerts (alertcondition, `alerts` of the result): 'BUY Alert' and 'SELL Alert', true on the
 * bars of a BUY / SELL signal (whatever the label input).
 *
 * Reference: "Price Flow - Buy Sell" by IVTrader1990
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import {
  ta, Series, getSourceSeries, color, math,
  type IndicatorResult, type InputConfig, type PlotConfig, type FillConfig, type Bar, type SourceType,
} from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface PriceFlowBuySellInputs {
  /** Base bandwidth (h) of the Gaussian kernel */
  hVal: number;
  /** Lookback window of the kernel regression and of the MAE */
  lookback: number;
  /** Bandwidth expands with the volatility */
  useVol: boolean;
  /** Inner band multiplier */
  multIn: number;
  /** Outer band multiplier */
  multOut: number;
  src: SourceType;
  /** Range filter: inner band signals need a weakening move */
  filterRng: boolean;
  showBuySell: boolean;
  /** A BUY must be followed by a SELL before another BUY, and the reverse */
  strictAlternation: boolean;
  colBull: string;
  colBear: string;
  colNeut: string;
}

export const defaultInputs: PriceFlowBuySellInputs = {
  hVal: 8.0,
  lookback: 50,
  useVol: true,
  multIn: 1.5,
  multOut: 2.8,
  src: 'hlc3',
  filterRng: true,
  showBuySell: true,
  strictAlternation: false,
  colBull: '#00ffaa',
  colBear: '#ff0044',
  colNeut: '#434651',
};

const GRP_KERNEL = 'Kernel Physics';
const GRP_ENV = 'Envelope Statistics';
const GRP_RISK = 'Risk Management';
const GRP_SIG = 'Buy / Sell Signals';
const GRP_VIS = 'Visuals';

export const inputConfig: InputConfig[] = [
  { id: 'hVal', type: 'float', title: 'Base Bandwidth (h)', defval: 8.0, min: 1.0, group: GRP_KERNEL,
    tooltip: 'Defaults to 8.0 for signal stability (noise reduction).' },
  { id: 'lookback', type: 'int', title: 'Lookback Window', defval: 50, min: 10, max: 500, group: GRP_KERNEL,
    tooltip: 'Number of historical bars used for kernel regression at each point.' },
  { id: 'useVol', type: 'bool', title: 'Enable Adaptive Volatility', defval: true, group: GRP_KERNEL,
    tooltip: 'If enabled, bandwidth expands during high volatility to reduce noise.' },
  { id: 'multIn', type: 'float', title: 'Inner Band Multiplier (Balanced)', defval: 1.5, step: 0.1, group: GRP_ENV },
  { id: 'multOut', type: 'float', title: 'Outer Band Multiplier (Precision)', defval: 2.8, step: 0.1, group: GRP_ENV },
  { id: 'src', type: 'source', title: 'Source Price', defval: 'hlc3', group: GRP_ENV },
  { id: 'filterRng', type: 'bool', title: 'Range Filter', defval: true, group: GRP_RISK,
    tooltip: 'If enabled, signals in the Ranging Zone (Inner Band) only appear when momentum weakens. Helps prevent catching falling knives during breakouts.' },
  { id: 'showBuySell', type: 'bool', title: 'Show Buy / Sell Labels', defval: true, group: GRP_SIG },
  { id: 'strictAlternation', type: 'bool', title: 'Strict Buy/Sell Alternation', defval: false, group: GRP_SIG,
    tooltip: 'When enabled, a BUY must be followed by a SELL before another BUY can appear, and vice versa.' },
  { id: 'colBull', type: 'color', title: 'Bullish', defval: '#00ffaa', group: GRP_VIS },
  { id: 'colBear', type: 'color', title: 'Bearish', defval: '#ff0044', group: GRP_VIS },
  { id: 'colNeut', type: 'color', title: 'Neutral/Grey', defval: '#434651', group: GRP_VIS },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Fair Value Core', color: '#434651', lineWidth: 2 },
  { id: 'plot1', title: 'Fair Value Glow 1', color: String(color.new('#434651', 50)), lineWidth: 4 },
  { id: 'plot2', title: 'Fair Value Glow 2', color: String(color.new('#434651', 80)), lineWidth: 8 },
  { id: 'plot3', title: 'Fair Value (fill)', color: '#2962FF', lineWidth: 1, display: 'none' },
  { id: 'plot4', title: 'Upper Inner', color: String(color.new('#434651', 80)), lineWidth: 1 },
  { id: 'plot5', title: 'Lower Inner', color: String(color.new('#434651', 80)), lineWidth: 1 },
  { id: 'plot6', title: 'Upper Outer', color: String(color.new('#434651', 60)), lineWidth: 1 },
  { id: 'plot7', title: 'Lower Outer', color: String(color.new('#434651', 60)), lineWidth: 1 },
];

export const fillConfig: FillConfig[] = [
  { id: 'fill0', plot1: 'plot3', plot2: 'plot4', title: 'Bull Zone' },
  { id: 'fill1', plot1: 'plot3', plot2: 'plot5', title: 'Bear Zone' },
  { id: 'fill2', plot1: 'plot4', plot2: 'plot6', title: 'Bull Extreme' },
  { id: 'fill3', plot1: 'plot5', plot2: 'plot7', title: 'Bear Extreme' },
];

export const metadata = {
  title: 'Price Flow - Buy Sell',
  shortTitle: 'Price Flow - Buy Sell',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false); a == b within 1e-10 */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<PriceFlowBuySellInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const src = A(getSourceSeries(bars, cfg.src));

  // Volatility adjustment
  const volRaw = A(ta.atr(bars, 20));
  const volBase = A(ta.sma(S(volRaw), 100));

  // Kernel regression loop (var float y_hat = 0.0, assigned on every bar)
  const yHat: number[] = new Array(n);
  for (let k = 0; k < n; k++) {
    const volRatio = cfg.useVol ? volRaw[k] / (eq(volBase[k], 0) ? 1 : volBase[k]) : 1.0;
    // math.min / math.max with na give na
    const volMod = Math.max(0.5, Math.min(volRatio, 2.0));
    const hEff = cfg.hVal * volMod;
    let num = 0.0;
    let den = 0.0;
    for (let i = 0; i <= cfg.lookback; i++) {
      const dist = i;
      const w = math.exp(-math.pow(dist, 2) / (2 * math.pow(hEff, 2))) as number;
      num = num + w * (k - i >= 0 ? src[k - i] : NaN);
      den = den + w;
    }
    yHat[k] = num / den;
  }

  // Statistical bounds (MAE)
  const mae = A(ta.sma(S(src.map((s, i) => Math.abs(s - yHat[i]))), cfg.lookback));
  const upperIn = yHat.map((y, i) => y + mae[i] * cfg.multIn);
  const lowerIn = yHat.map((y, i) => y - mae[i] * cfg.multIn);
  const upperOut = yHat.map((y, i) => y + mae[i] * cfg.multOut);
  const lowerOut = yHat.map((y, i) => y - mae[i] * cfg.multOut);

  // Velocity and acceleration
  const velocity = yHat.map((y, i) => (i > 0 ? y - yHat[i - 1] : NaN));
  const accel = velocity.map((v, i) => (i > 0 ? v - velocity[i - 1] : NaN));
  const velVis = A(ta.ema(S(velocity), 5));
  const velStdev = A(ta.stdev(S(velocity), 20));

  const dynCol: string[] = new Array(n);
  const markers: MarkerData[] = [];
  const buyFlags: boolean[] = new Array(n).fill(false);
  const sellFlags: boolean[] = new Array(n).fill(false);
  let prevSellOut = false;
  let prevBuyOut = false;
  let prevSellIn = false;
  let prevBuyIn = false;
  let lastSignal = 0; // var int last_signal = 0
  for (let i = 0; i < n; i++) {
    const vel = velocity[i];
    const isTrending = gt(Math.abs(vel), velStdev[i] * 0.5);
    const velMax = velStdev[i] * 2.0;
    dynCol[i] = gt(velVis[i], 0)
      ? color.from_gradient(velVis[i], 0, velMax, cfg.colNeut, cfg.colBull)
      : color.from_gradient(velVis[i], -velMax, 0, cfg.colBear, cfg.colNeut);

    const bullWeaken = gt(vel, 0) && lt(accel[i], 0);
    const bearWeaken = lt(vel, 0) && gt(accel[i], 0);
    const { high, low, close, open } = bars[i];
    const sellRejOut = gt(high, upperOut[i]) && lt(close, upperOut[i]) && lt(close, open);
    const buyRejOut = lt(low, lowerOut[i]) && gt(close, lowerOut[i]) && gt(close, open);
    const sellRejIn = gt(high, upperIn[i]) && lt(close, upperIn[i]) && lt(close, open);
    const buyRejIn = lt(low, lowerIn[i]) && gt(close, lowerIn[i]) && gt(close, open);
    const newSellOut = sellRejOut && !prevSellOut;
    const newBuyOut = buyRejOut && !prevBuyOut;
    const newSellIn = sellRejIn && !prevSellIn;
    const newBuyIn = buyRejIn && !prevBuyIn;
    prevSellOut = sellRejOut;
    prevBuyOut = buyRejOut;
    prevSellIn = sellRejIn;
    prevBuyIn = buyRejIn;

    let signalShort: boolean;
    let signalLong: boolean;
    if (isTrending) {
      signalShort = newSellOut && bullWeaken;
      signalLong = newBuyOut && bearWeaken;
    } else if (cfg.filterRng) {
      signalShort = newSellIn && bullWeaken;
      signalLong = newBuyIn && bearWeaken;
    } else {
      signalShort = newSellIn;
      signalLong = newBuyIn;
    }

    const buySignal = signalLong && (!cfg.strictAlternation || lastSignal !== 1);
    const sellSignal = signalShort && (!cfg.strictAlternation || lastSignal !== -1);
    buyFlags[i] = buySignal;
    sellFlags[i] = sellSignal;
    if (buySignal) lastSignal = 1;
    else if (sellSignal) lastSignal = -1;

    // plotshape(show_buy_sell and buy_signal, 'BUY', shape.labelup, location.belowbar, col_bull, 'BUY', black, small)
    if (cfg.showBuySell && buySignal) {
      markers.push({ time: bars[i].time, position: 'belowBar', shape: 'labelUp', color: cfg.colBull, text: 'BUY',
        textColor: color.black, size: 'small' });
    }
    // plotshape(show_buy_sell and sell_signal, 'SELL', shape.labeldown, location.abovebar, col_bear, 'SELL', white, small)
    if (cfg.showBuySell && sellSignal) {
      markers.push({ time: bars[i].time, position: 'aboveBar', shape: 'labelDown', color: cfg.colBear, text: 'SELL',
        textColor: color.white, size: 'small' });
    }
  }

  const tr = (k: number) => dynCol.map((c) => String(color.new(c, k)));
  const c50 = tr(50);
  const c60 = tr(60);
  const c80 = tr(80);
  const c90 = tr(90);
  const P = (v: number[], col?: string[]) =>
    bars.map((b, i) => (col ? { time: b.time, value: v[i], color: col[i] } : { time: b.time, value: v[i] }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: P(yHat, dynCol),
      plot1: P(yHat, c50),
      plot2: P(yHat, c80),
      plot3: P(yHat),
      plot4: P(upperIn, c80),
      plot5: P(lowerIn, c80),
      plot6: P(upperOut, c60),
      plot7: P(lowerOut, c60),
    },
    fills: [
      { plot1: 'plot3', plot2: 'plot4', options: { title: 'Bull Zone' }, colors: c90 },
      { plot1: 'plot3', plot2: 'plot5', options: { title: 'Bear Zone' }, colors: c90 },
      { plot1: 'plot4', plot2: 'plot6', options: { title: 'Bull Extreme' }, colors: c80 },
      { plot1: 'plot5', plot2: 'plot7', options: { title: 'Bear Extreme' }, colors: c80 },
    ],
    markers,
    // alertcondition(buy_signal, 'BUY Alert') / alertcondition(sell_signal, 'SELL Alert')
    alerts: alertStates(alertConditions, bars, [buyFlags, sellFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'BUY Alert', message: 'BUY signal on {{ticker}} at {{close}}' },
  { id: 'alert1', title: 'SELL Alert', message: 'SELL signal on {{ticker}} at {{close}}' },
];

export const PriceFlowBuySell = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  fillConfig,
  alertConditions,
};
