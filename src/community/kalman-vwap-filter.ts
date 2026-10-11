/**
 * Kalman VWAP Filter
 *
 * A Kalman filter of a measurement that blends the price with a VWAP baseline:
 * meas = (1 - vwapWeight) * price + vwapWeight * VWAP. The VWAP is the session VWAP (anchored on each new day;
 * the rolling VWAP when the session VWAP is na) or a rolling VWAP = SMA(price * volume, n) / SMA(volume, n).
 * Filter per bar: p = P + processNoise, K = p / (p + measurementNoise), x = x + K * (meas - x), P = (1 - K) * p,
 * started at the first measurement with P = 1 (started again after an na measurement). The line and the price bars
 * are green while the filter rises and red otherwise.
 * The VWAP day: on intraday bars the port reads the exchange time zone and the session of the symbol from the
 * optional third argument (see src/chart-context.ts) and starts the VWAP with the trading day of the exchange, as
 * the original. Without them the day starts at 00:00 UTC.
 *
 * Reference: "Kalman VWAP Filter [BackQuant]" by BackQuant
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © BackQuant
 */

import { ta, Series, getSourceSeries, color, timeframe, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { BarColorData } from '../types';
import type { ChartContext } from '../chart-context';
import { executeScript, timeframe as scriptTimeframe } from 'oakscriptjs/script';
import { barInterval } from '../bar-time';

export interface KalmanVwapFilterInputs {
  /** Price the filter observes */
  pricesource: SourceType;
  /** Process noise: higher = faster response */
  processNoise: number;
  /** Measurement noise: higher = smoother output */
  measurementNoise: number;
  /** Filter order: number of parallel states (they all get the same update, so the output does not depend on it) */
  filterOrder: number;
  /** 'Session' (daily anchored VWAP) or 'Rolling' (VWAP over vwapLen bars) */
  vwapMode: 'Session' | 'Rolling';
  /** Bars of the rolling VWAP */
  vwapLen: number;
  /** Price of the VWAP */
  vwapPriceSrc: SourceType;
  /** 0 = price only, 1 = VWAP only */
  vwapWeight: number;
  showkalman: boolean;
  paintCandles: boolean;
  longColor: string;
  shortColor: string;
  lineW: number;
  /** Line transparency (0..100) */
  transp: number;
}

export const defaultInputs: KalmanVwapFilterInputs = {
  pricesource: 'close',
  processNoise: 0.01,
  measurementNoise: 3.0,
  filterOrder: 5,
  vwapMode: 'Session',
  vwapLen: 50,
  vwapPriceSrc: 'hlc3',
  vwapWeight: 0.35,
  showkalman: true,
  paintCandles: true,
  longColor: '#33ff00',
  shortColor: '#ff0000',
  lineW: 4,
  transp: 40,
};

export const inputConfig: InputConfig[] = [
  { id: 'pricesource', type: 'source', title: 'Price Source', defval: 'close' },
  { id: 'processNoise', type: 'float', title: 'Process Noise', defval: 0.01, step: 0.01 },
  { id: 'measurementNoise', type: 'float', title: 'Measurement Noise', defval: 3.0 },
  { id: 'filterOrder', type: 'int', title: 'Filter Order', defval: 5, min: 1 },
  { id: 'vwapMode', type: 'string', title: 'VWAP Mode', defval: 'Session', options: ['Session', 'Rolling'] },
  { id: 'vwapLen', type: 'int', title: 'Rolling VWAP Length', defval: 50, min: 2 },
  { id: 'vwapPriceSrc', type: 'source', title: 'VWAP Price', defval: 'hlc3' },
  { id: 'vwapWeight', type: 'float', title: 'VWAP Weight (0..1)', defval: 0.35, min: 0.0, max: 1.0, step: 0.05 },
  { id: 'showkalman', type: 'bool', title: 'Show Filtered Price on chart?', defval: true },
  { id: 'paintCandles', type: 'bool', title: 'Paint candles by trend?', defval: true },
  { id: 'longColor', type: 'color', title: 'Long Color', defval: '#33ff00' },
  { id: 'shortColor', type: 'color', title: 'Short Color', defval: '#ff0000' },
  { id: 'lineW', type: 'int', title: 'Line Width', defval: 4 },
  { id: 'transp', type: 'int', title: 'Line Transparency', defval: 40 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Kalman VWAP', color: String(color.new('#33ff00', 40)), lineWidth: 4 },
];

export const metadata = {
  title: 'Kalman VWAP Filter [BackQuant]',
  shortTitle: 'Kalman VWAP Filter [BackQuant]',
  overlay: true,
};

/** Pine a > b: a - b > 1e-10 (false with na) */
const gt = (a: number, b: number) => a - b > 1e-10;

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
 * Start of a new day (Pine ta.vwap anchor: timeframe.change("1D")); true on the first bar. On intraday bars with the
 * time zone and the session of the chart context: the trading days of the exchange. Else: UTC days.
 */
function newDay(bars: Bar[], chart?: ChartContext): boolean[] {
  const starts = tradingDayStarts(bars, chart);
  return bars.map((b, i) => i === 0 || (starts ? starts[i] : Math.floor(b.time / 86400) !== Math.floor(bars[i - 1].time / 86400)));
}

export function calculate(
  bars: Bar[],
  inputs: Partial<KalmanVwapFilterInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { barColors: BarColorData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const price = A(getSourceSeries(bars, cfg.pricesource));
  const vwapPrice = A(getSourceSeries(bars, cfg.vwapPriceSrc));
  const volume = bars.map((b) => b.volume ?? NaN);

  // sessionVWAP = ta.vwap(hlc3); rollingVWAP = sma(price * volume, len) / sma(volume, len) (x / 0 is +-infinity)
  const sessionVwap = A(ta.vwap(S(bars.map((b) => (b.high + b.low + b.close) / 3)), S(volume), S(newDay(bars, chart).map(Number))));
  const vwN = A(ta.sma(S(vwapPrice.map((p, i) => p * volume[i])), cfg.vwapLen));
  const vwD = A(ta.sma(S(volume), cfg.vwapLen));
  const rollingVwap = vwN.map((v, i) => v / vwD[i]);
  // vwapBase = useSession ? nz(sessionVWAP, rollingVWAP) : rollingVWAP (nz replaces na and +-infinity)
  const vwapBase = bars.map((_, i) => (cfg.vwapMode === 'Session'
    ? (Number.isFinite(sessionVwap[i]) ? sessionVwap[i] : rollingVwap[i]) : rollingVwap[i]));
  const meas = price.map((p, i) => (1.0 - cfg.vwapWeight) * p + cfg.vwapWeight * vwapBase[i]);

  // Kalman filter: the N states of the Pine script start and update the same way, so one state is kept.
  // var stateEstimate = na, errorCovariance = 100; f_init: when the state is na (na() is also true for +-infinity),
  // state = meas and covariance = 1.
  const kalman: number[] = new Array(n);
  let x = NaN;
  let P = 100.0;
  for (let i = 0; i < n; i++) {
    const z = meas[i];
    if (!Number.isFinite(x)) {
      x = z;
      P = 1.0;
    }
    const p = P + cfg.processNoise;
    const kg = p / (p + cfg.measurementNoise);
    x = x + kg * (z - x);
    P = (1 - kg) * p;
    kalman[i] = x;
  }

  // up = kalmanVW > nz(kalmanVW[1], kalmanVW) (nz replaces na and +-infinity; > uses an infinite value)
  const barCol = kalman.map((k, i) => {
    const prev = i > 0 && Number.isFinite(kalman[i - 1]) ? kalman[i - 1] : k;
    return gt(k, prev) ? cfg.longColor : cfg.shortColor;
  });

  const barColors: BarColorData[] = cfg.paintCandles
    ? bars.map((b, i) => ({ time: b.time, color: barCol[i] }))
    : [];

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay, precision: 2 },
    plots: {
      plot0: bars.map((b, i) => ({
        // a plot draws nothing for +-infinity
        time: b.time, value: cfg.showkalman && Number.isFinite(kalman[i]) ? kalman[i] : NaN,
        color: String(color.new(barCol[i], cfg.transp)),
      })),
    },
    barColors,
  };
}

export const KalmanVwapFilter = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
