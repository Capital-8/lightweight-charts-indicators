/**
 * AI Trading Assistant v2
 *
 * A VWAP line, a dynamic structure (resistance = highest high and support = lowest low over the lookback) and a volume
 * delta proxy: the EMA of +volume on an up close, -volume on a down close, 0 otherwise. Signals: LONG when the close
 * breaks above the previous resistance with a positive delta and a close above the VWAP; SHORT when the close is
 * below the previous resistance on a down bar with a negative delta and a close below the VWAP; TRAP long when the low
 * pierces the previous support but the close is back above it with a positive delta; TRAP short when the high pierces
 * the previous resistance but the close is back below it with a negative delta. A dot marks a volume spike (volume
 * above the SMA of the volume times a multiplier).
 *
 * Timeframes: Pine `ta.vwap` resets on each new trading day (anchor timeframe.change("1D")). When each bar is one
 * trading day or more, it resets on every bar, so the VWAP is hlc3 of the bar (na when the volume is 0 or na). On
 * intraday bars (barInterval, the most frequent gap between bars, below one day) the reset needs the exchange time
 * zone and the session of the symbol: the port reads them from the optional third argument (see
 * src/chart-context.ts) and sums from the first bar of each trading day (from the first bar on the first day).
 * Without them calculate() throws an Error on intraday bars.
 *
 * Reference: "AI Trading Assistant v2" by Alchemical_Carpenter
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, timeframe, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { barInterval } from '../bar-time';
import type { ChartContext } from '../chart-context';
import { executeScript, timeframe as scriptTimeframe } from 'oakscriptjs/script';

export interface AiTradingAssistantV2Inputs {
  /** Lookback of the structure (highest / lowest) and of the volume SMA */
  lookback: number;
  /** EMA length of the volume delta proxy */
  dLen: number;
  /** Volume spike multiplier */
  vMult: number;
  /** Show the VWAP line */
  showVWAP: boolean;
}

export const defaultInputs: AiTradingAssistantV2Inputs = {
  lookback: 50,
  dLen: 14,
  vMult: 1.5,
  showVWAP: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'lookback', type: 'int', title: 'Structure Lookback', defval: 50, min: 1 },
  { id: 'dLen', type: 'int', title: 'Delta Smoothing', defval: 14, min: 1 },
  { id: 'vMult', type: 'float', title: 'Volume Spike Multiplier', defval: 1.5, min: 0.1 },
  { id: 'showVWAP', type: 'bool', title: 'Show VWAP', defval: true },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'VWAP', color: color.orange, lineWidth: 2 },
  { id: 'plot1', title: 'Resistance', color: '#f23645', lineWidth: 1 },
  { id: 'plot2', title: 'Support', color: '#089981', lineWidth: 1 },
];

export const metadata = {
  title: 'AI Trading Assistant v2',
  shortTitle: 'AI Assistant v2',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

const DAY_SECONDS = 86400;

/**
 * First bar of each trading day of the exchange on intraday bars (Pine timeframe.change("1D")), found by the library
 * from the time zone and the session of the chart context. Null when the context does not give both, or when the bars
 * are not intraday.
 */
function tradingDayStarts(bars: Bar[], chart?: ChartContext): boolean[] | null {
  const interval = barInterval(bars);
  if (chart?.timezone === undefined || chart.session === undefined || !(interval > 0 && interval < 86400)) return null;
  let change: Array<number | null> = [];
  const context = { ...chart, timeframe: chart.timeframe ?? timeframe.from_seconds(interval) };
  executeScript(() => { change = scriptTimeframe.change('1D').toArray(); }, bars, {}, context);
  return change.map((v) => v === 1);
}

/**
 * ta.vwap (hlc3) on intraday bars: sum(hlc3 * volume) / sum(volume) since the first bar of the trading day (since the
 * first bar on the first day)
 */
function intradayVwap(bars: Bar[], dayStarts: boolean[]): number[] {
  const hlc3 = Series.fromArray(bars, bars.map((b) => (b.high + b.low + b.close) / 3));
  const volume = Series.fromArray(bars, bars.map((b) => b.volume ?? NaN));
  const anchor = Series.fromArray(bars, dayStarts.map((v, i) => Number(i === 0 || v)));
  return ta.vwap(hlc3, volume, anchor).toArray().map((v) => v ?? NaN);
}

export function calculate(
  bars: Bar[],
  inputs: Partial<AiTradingAssistantV2Inputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;

  const interval = barInterval(bars);
  const dayStarts = tradingDayStarts(bars, chart);
  if (interval > 0 && interval < DAY_SECONDS && dayStarts === null) {
    throw new Error(
      'AI Trading Assistant v2 supports daily and higher timeframes only: on intraday bars ta.vwap resets '
      + 'on each trading day, which needs the exchange time zone and session.',
    );
  }

  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const vol = bars.map((b) => b.volume ?? NaN);

  // vVal = ta.vwap (hlc3, anchor timeframe.change("1D")). Intraday bars: the sums restart on each trading day of the
  // exchange. Daily or higher bars: a new anchor on every bar, so sum(hlc3 * volume) / sum(volume) over the bar
  // alone (0 / 0 = na when the volume is 0, na when it is na)
  const vwap = dayStarts ? intradayVwap(bars, dayStarts)
    : bars.map((b, i) => (((b.high + b.low + b.close) / 3) * vol[i]) / vol[i]);

  // deltaVal = close > close[1] ? volume : close < close[1] ? -volume : 0; sDelta = ta.ema(deltaVal, dLen)
  const deltaVal = bars.map((b, i) => {
    const prev = i > 0 ? bars[i - 1].close : NaN;
    return gt(b.close, prev) ? vol[i] : lt(b.close, prev) ? -vol[i] : 0;
  });
  const sDelta = A(ta.ema(S(deltaVal), cfg.dLen));
  const volSma = A(ta.sma(S(vol), cfg.lookback));
  const res = A(ta.highest(S(bars.map((b) => b.high)), cfg.lookback));
  const sup = A(ta.lowest(S(bars.map((b) => b.low)), cfg.lookback));

  const markers: MarkerData[] = [];
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const t = b.time;
    const res1 = i > 0 ? res[i - 1] : NaN;
    const sup1 = i > 0 ? sup[i - 1] : NaN;
    // isSpike = volume > ta.sma(volume, lookback) * vMult
    if (gt(vol[i], volSma[i] * cfg.vMult)) {
      markers.push({ time: t, position: 'belowBar', shape: 'circle', color: '#e1b311', size: 'tiny' });
    }
    const isL = gt(b.close, res1) && gt(sDelta[i], 0) && gt(b.close, vwap[i]);
    const isS = lt(b.close, res1) && lt(b.close, b.open) && lt(sDelta[i], 0) && lt(b.close, vwap[i]);
    const isTL = lt(b.low, sup1) && gt(b.close, sup1) && gt(sDelta[i], 0);
    const isTS = gt(b.high, res1) && lt(b.close, res1) && lt(sDelta[i], 0);
    if (isL) {
      markers.push({ time: t, position: 'belowBar', shape: 'labelUp', color: '#089981', text: 'LONG', textColor: color.white });
    }
    if (isS) {
      markers.push({ time: t, position: 'aboveBar', shape: 'labelDown', color: '#f23645', text: 'SHORT', textColor: color.white });
    }
    if (isTL) {
      markers.push({ time: t, position: 'belowBar', shape: 'labelUp', color: '#5b9cf6', text: 'TRAP', textColor: color.white });
    }
    if (isTS) {
      markers.push({ time: t, position: 'aboveBar', shape: 'labelDown', color: color.orange, text: 'TRAP', textColor: color.white });
    }
  }

  const P = (vals: number[], c: string) => bars.map((b, i) => ({
    time: b.time, value: Number.isFinite(vals[i]) ? vals[i] : NaN, color: c,
  }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: P(cfg.showVWAP ? vwap : vwap.map(() => NaN), color.orange),
      plot1: P(res, '#f23645'),
      plot2: P(sup, '#089981'),
    },
    markers,
  };
}

export const AiTradingAssistantV2 = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
