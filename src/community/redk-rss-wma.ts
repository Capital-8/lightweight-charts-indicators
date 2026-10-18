/**
 * RedK Slow_Smooth WMA (RSS_WMA)
 *
 * As the original: a triple-pass WMA. The "Combined Smoothness" length L is split over the three passes:
 * w2 = round(L / 3), w1 = round((L - w2) / 2), w3 = int((L - w2) / 2); LL = WMA(WMA(WMA(source, w1), w2), w3)
 * (the source itself for L <= 2). The line is green while it rises (LL > LL[1]), red otherwise; the plain WMA of the
 * source over L is a hidden plot. With "Up/Dn Swing Signal?" on: a triangle "Signal Locator %" of LL above the line
 * on a swing down (shape0), below it on a swing up (shape1).
 * Alerts (alertcondition, `alerts` of the result): 'RSS_WMA Swing Up' (the line rises, did not rise on the bar
 * before), 'RSS_WMA Swing Down' (the line does not rise, rose on the bar before) and 'RSS_WMA Swing' (either).
 *
 * Reference: "RedK RSS_WMA" by RedKTrader
 */

import { taCore, getSourceSeries, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface RedKRSSWMAInputs {
  src: SourceType;
  /** Combined Smoothness */
  length: number;
  showSig: boolean;
  sigMulti: number;
}

export const defaultInputs: RedKRSSWMAInputs = {
  src: 'close',
  length: 15,
  showSig: false,
  sigMulti: 1.0,
};

export const inputConfig: InputConfig[] = [
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
  { id: 'length', type: 'int', title: 'Combined Smoothness', defval: 15, min: 1 },
  { id: 'showSig', type: 'bool', title: 'Up/Dn Swing Signal?', defval: false },
  { id: 'sigMulti', type: 'float', title: 'Signal Locator %', defval: 1.0, step: 0.2, min: 0, max: 20 },
];

const C_UP = '#33ff00';
const C_DN = '#ff1111';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'SS_WMA Line', color: '#2196F3', lineWidth: 3 },
  { id: 'plot1', title: 'WMA', color: '#9C27B0', lineWidth: 1, display: 'none' },
];

export const metadata = {
  title: 'RedK RSS_WMA',
  shortTitle: 'RSS',
  overlay: true,
};

/** Pine round(): half away from zero */
const pineRound = (v: number) => Math.sign(v) * Math.round(Math.abs(v));

/** f_LazyLine(_data, _length) of the original */
export function lazyLine(data: number[], length: number): number[] {
  if (length <= 2) return data.slice();
  const w2 = pineRound(length / 3);
  const w1 = pineRound((length - w2) / 2);
  const w3 = Math.trunc((length - w2) / 2);
  return taCore.wma(taCore.wma(taCore.wma(data, w1), w2), w3);
}

export function calculate(bars: Bar[], inputs: Partial<RedKRSSWMAInputs> = {}): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const { src, length, showSig, sigMulti } = { ...defaultInputs, ...inputs };
  const price = getSourceSeries(bars, src).toArray().map((v) => v ?? NaN);
  const ll = lazyLine(price, length);
  const wma = taCore.wma(price, length);

  // uptrend = LL > LL[1] (na compares false)
  const uptrend = ll.map((v, i) => i > 0 && v > ll[i - 1]);
  const swingUp = uptrend.map((u, i) => u && !(i > 0 && uptrend[i - 1]));
  const swingDn = uptrend.map((u, i) => i > 0 && uptrend[i - 1] && !u);

  const plot0 = ll.map((v, i) => ({ time: bars[i].time, value: Number.isFinite(v) ? v : NaN, color: uptrend[i] ? C_UP : C_DN }));
  const plot1 = wma.map((v, i) => ({ time: bars[i].time, value: Number.isFinite(v) ? v : NaN }));

  // plotshape(SignalOn and SwingDn ? LL + d : na) / (SignalOn and SwingUp ? LL - d : na), d = SigMulti / 100 * LL
  const markers: MarkerData[] = [];
  if (showSig) {
    for (let i = 0; i < bars.length; i++) {
      const d = sigMulti / 100 * ll[i];
      if (swingDn[i] && Number.isFinite(ll[i] + d)) {
        markers.push({ id: 'shape0', time: bars[i].time, position: 'atPriceMiddle', price: ll[i] + d, shape: 'triangleDown', color: C_DN, size: 'small' });
      }
      if (swingUp[i] && Number.isFinite(ll[i] - d)) {
        markers.push({ id: 'shape1', time: bars[i].time, position: 'atPriceMiddle', price: ll[i] - d, shape: 'triangleUp', color: C_UP, size: 'small' });
      }
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { 'plot0': plot0, 'plot1': plot1 },
    markers,
    alerts: alertStates(alertConditions, bars, [swingUp, swingDn, swingUp.map((f, i) => f || swingDn[i])]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'RSS_WMA Swing Up', message: 'RSS_WMA Swing Up Detected!' },
  { id: 'alert1', title: 'RSS_WMA Swing Down', message: 'RSS_WMA Swing Down Detected!' },
  { id: 'alert2', title: 'RSS_WMA Swing', message: 'RSS_WMA Up/Down Swing Detected!' },
];

export const RedKRSSWMA = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
