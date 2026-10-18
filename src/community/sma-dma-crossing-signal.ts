/**
 * SMA DMA Market Signals
 *
 * SMAs of the close with lengths 30, 50, 100 and 200, a fast DMA (SMA 28) and a lagged slow DMA (SMA 28 of 14 bars
 * ago). Signal state on closed bars: a BUY needs `confirmBars` closes above the fast DMA, a last close above the fast
 * DMA + ATR * buffer and a rising fast DMA, plus either a pending bullish DMA crossover (still aligned) or an earlier
 * SELL (recovery, not on a bearish DMA crossover bar). While bullish, a bearish DMA crossover or `confirmBars` closes
 * below the fast DMA with the last close below the fast DMA - ATR * buffer give a SELL.
 * Alerts (alertcondition, `alerts` of the result): 'BUY indication' / 'SELL indication' on the bars of a BUY / SELL
 * signal (also when the labels are hidden).
 *
 * Last bar: the signal state is updated on a closed bar only. The port reads the state of the last bar from the
 * optional third argument (see src/chart-context.ts); without it every bar is taken as closed.
 *
 * Reference: "SMA DMA Market Signals" by tradingqueen18
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface SmaDmaCrossingSignalInputs {
  len30: number;
  len50: number;
  len100: number;
  len200: number;
  /** Fast DMA length */
  fastLen: number;
  /** Slow DMA length */
  slowLen: number;
  /** Slow DMA lag (chart bars) */
  shiftBars: number;
  /** Price confirmation candles */
  confirmBars: number;
  atrLen: number;
  /** Price buffer (ATR multiple) */
  atrBuffer: number;
  showSMAs: boolean;
  showDMAs: boolean;
  showLabels: boolean;
}

export const defaultInputs: SmaDmaCrossingSignalInputs = {
  len30: 30,
  len50: 50,
  len100: 100,
  len200: 200,
  fastLen: 28,
  slowLen: 28,
  shiftBars: 14,
  confirmBars: 2,
  atrLen: 14,
  atrBuffer: 0.25,
  showSMAs: true,
  showDMAs: true,
  showLabels: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'len30', type: 'int', title: 'SMA 30 length', defval: 30, min: 1 },
  { id: 'len50', type: 'int', title: 'SMA 50 length', defval: 50, min: 1 },
  { id: 'len100', type: 'int', title: 'SMA 100 length', defval: 100, min: 1 },
  { id: 'len200', type: 'int', title: 'SMA 200 length', defval: 200, min: 1 },
  { id: 'fastLen', type: 'int', title: 'Fast DMA length', defval: 28, min: 1 },
  { id: 'slowLen', type: 'int', title: 'Slow DMA length', defval: 28, min: 1 },
  { id: 'shiftBars', type: 'int', title: 'Slow DMA lag (chart bars)', defval: 14, min: 0 },
  { id: 'confirmBars', type: 'int', title: 'Price confirmation candles', defval: 2, min: 1 },
  { id: 'atrLen', type: 'int', title: 'ATR length', defval: 14, min: 1 },
  { id: 'atrBuffer', type: 'float', title: 'Price buffer (ATR multiple)', defval: 0.25, min: 0, step: 0.05 },
  { id: 'showSMAs', type: 'bool', title: 'Show SMAs', defval: true },
  { id: 'showDMAs', type: 'bool', title: 'Show DMAs', defval: true },
  { id: 'showLabels', type: 'bool', title: 'Show BUY / SELL labels', defval: true },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'SMA 30', color: color.blue, lineWidth: 1 },
  { id: 'plot1', title: 'SMA 50', color: color.green, lineWidth: 1 },
  { id: 'plot2', title: 'SMA 100', color: color.yellow, lineWidth: 1 },
  { id: 'plot3', title: 'SMA 200', color: color.red, lineWidth: 1 },
  { id: 'plot4', title: 'Fast DMA', color: color.aqua, lineWidth: 1, style: 'circles' },
  { id: 'plot5', title: 'Lagged slow DMA', color: color.fuchsia, lineWidth: 1, style: 'cross' },
];

export const metadata = {
  title: 'SMA DMA Market Signals',
  shortTitle: 'DMA Signals',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

export function calculate(
  bars: Bar[],
  inputs: Partial<SmaDmaCrossingSignalInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  // barstate.isconfirmed: every bar is closed, except the last one when the chart context says that it is still open
  const lastBarOpen = !lastBarConfirmedOf(chart);
  const barIsConfirmed = (index: number) => !(lastBarOpen && index === bars.length - 1);
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const close = Series.fromArray(bars, bars.map((b) => b.close));

  const sma30 = A(ta.sma(close, cfg.len30));
  const sma50 = A(ta.sma(close, cfg.len50));
  const sma100 = A(ta.sma(close, cfg.len100));
  const sma200 = A(ta.sma(close, cfg.len200));

  const fast = A(ta.sma(close, cfg.fastLen));
  const slowBase = A(ta.sma(close, cfg.slowLen));
  // slow = slowBase[shiftBars]
  const slow = bars.map((_b, i) => (i - cfg.shiftBars >= 0 ? slowBase[i - cfg.shiftBars] : NaN));
  const atr = A(ta.atr(bars, cfg.atrLen));

  // ta.crossover / ta.crossunder: exact comparisons with the last bar where both values were not na
  const fastS = Series.fromArray(bars, fast);
  const slowS = Series.fromArray(bars, slow);
  const crossUp = ta.crossover(fastS, slowS).toArray();
  const crossDown = ta.crossunder(fastS, slowS).toArray();

  // Signal state (if barstate.isconfirmed: nothing changes on a bar that is still open)
  let bullishIndication = false;
  let hasSellHistory = false;
  let pendingDmaBuy = false;
  let aboveCount = 0;
  let belowCount = 0;
  const buySignal: boolean[] = new Array(n).fill(false);
  const sellSignal: boolean[] = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    if (!barIsConfirmed(i)) continue;
    const c = bars[i].close;
    const f = fast[i];
    const buffer = atr[i] * cfg.atrBuffer;
    const up = !!crossUp[i];
    const down = !!crossDown[i];
    aboveCount = !isNaN(f) && gt(c, f) ? aboveCount + 1 : 0;
    belowCount = !isNaN(f) && lt(c, f) ? belowCount + 1 : 0;

    const fastPrev = i > 0 ? fast[i - 1] : NaN;
    const entryConfirmed = aboveCount >= cfg.confirmBars && gt(c, f + buffer) && gt(f, fastPrev);
    const priceWeakness = belowCount >= cfg.confirmBars && lt(c, f - buffer);

    if (!isNaN(slow[i]) && le(f, slow[i])) pendingDmaBuy = false;

    if (bullishIndication) {
      if (down || priceWeakness) {
        sellSignal[i] = true;
        bullishIndication = false;
        hasSellHistory = true;
        pendingDmaBuy = false;
        aboveCount = 0;
        belowCount = 0;
      }
    } else {
      if (up) pendingDmaBuy = true;
      const dmaSetup = pendingDmaBuy && gt(f, slow[i]);
      const recoverySetup = hasSellHistory && !down;
      if (entryConfirmed && (dmaSetup || recoverySetup)) {
        buySignal[i] = true;
        bullishIndication = true;
        pendingDmaBuy = false;
        aboveCount = 0;
        belowCount = 0;
      }
    }
  }

  const markers: MarkerData[] = [];
  if (cfg.showLabels) {
    for (let i = 0; i < n; i++) {
      // plotshape(showLabels and buySignal, style = shape.labelup, location = location.belowbar, color = color.green,
      //   text = "BUY", textcolor = color.white, size = size.small)
      if (buySignal[i]) {
        markers.push({ time: bars[i].time, position: 'belowBar', shape: 'labelUp', color: color.green, text: 'BUY',
          textColor: color.white, size: 'small' });
      }
      if (sellSignal[i]) {
        markers.push({ time: bars[i].time, position: 'aboveBar', shape: 'labelDown', color: color.red, text: 'SELL',
          textColor: color.white, size: 'small' });
      }
    }
  }

  const line = (on: boolean, v: number[], c: string) =>
    bars.map((b, i) => ({ time: b.time, value: on ? v[i] : NaN, color: c }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: line(cfg.showSMAs, sma30, color.blue),
      plot1: line(cfg.showSMAs, sma50, color.green),
      plot2: line(cfg.showSMAs, sma100, color.yellow),
      plot3: line(cfg.showSMAs, sma200, color.red),
      plot4: line(cfg.showDMAs, fast, color.aqua),
      plot5: line(cfg.showDMAs, slow, color.fuchsia),
    },
    markers,
    // alertcondition(buySignal, "BUY indication") / alertcondition(sellSignal, "SELL indication")
    alerts: alertStates(alertConditions, bars, [buySignal, sellSignal]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  {
    id: 'alert0', title: 'BUY indication',
    message: '{{ticker}} | {{interval}} | BUY indication confirmed at candle close. Review trend/recovery conditions. Close: {{close}}',
  },
  {
    id: 'alert1', title: 'SELL indication',
    message: '{{ticker}} | {{interval}} | SELL indication confirmed at candle close. Review price weakness/trend conditions. Close: {{close}}',
  },
];

export const SmaDmaCrossingSignal = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
