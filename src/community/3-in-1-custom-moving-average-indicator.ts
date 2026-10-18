/**
 * 3-in-1 Custom Moving Average Indicator
 *
 * Bollinger Bands (basis = SMA / EMA / RMA / WMA / VWMA of the source, bands at +- stdev * multiplier) with a
 * transparent fill, and three moving averages (EMA or SMA) of a second source. MA1 and MA2 are yellow when the close
 * is at or above them, red otherwise; MA3 is black and hidden by default. Each group has its own plot offset.
 * Alert (alertcondition, `alerts` of the result): 'Spike Alert', true on the bars whose |close - open| / open * 100
 * is at least the candle move %.
 *
 * Reference: "3-in-1 Custom Moving Average Indicator" by Mr-Fish
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Mr-Fish
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import { barInterval, barTime } from '../bar-time';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

type BbMaType = 'SMA' | 'EMA' | 'SMMA (RMA)' | 'WMA' | 'VWMA';
type MaType = 'SMA' | 'EMA';

export interface ThreeInOneCustomMovingAverageIndicatorInputs {
  showBB: boolean;
  /** Bollinger Bands length */
  bbLength: number;
  /** Basis moving average type */
  bbType: BbMaType;
  bbSource: SourceType;
  /** Standard deviation multiplier */
  bbMult: number;
  /** Plot offset of the bands */
  bbOffset: number;
  /** Source of the moving averages */
  src: SourceType;
  /** Plot offset of the moving averages */
  offset: number;
  plot1: boolean;
  type1: MaType;
  len1: number;
  plot2: boolean;
  type2: MaType;
  len2: number;
  plot3: boolean;
  type3: MaType;
  len3: number;
  /** Candle move % of the spike alert (the 'Spike Alert' condition only) */
  alertPct: number;
}

export const defaultInputs: ThreeInOneCustomMovingAverageIndicatorInputs = {
  showBB: true,
  bbLength: 26,
  bbType: 'SMA',
  bbSource: 'close',
  bbMult: 2.0,
  bbOffset: 0,
  src: 'close',
  offset: 0,
  plot1: true,
  type1: 'EMA',
  len1: 21,
  plot2: true,
  type2: 'EMA',
  len2: 55,
  plot3: false,
  type3: 'EMA',
  len3: 100,
  alertPct: 2.0,
};

export const inputConfig: InputConfig[] = [
  { id: 'showBB', type: 'bool', title: 'Show Bollinger Bands', defval: true },
  { id: 'bbLength', type: 'int', title: 'Length', defval: 26, min: 1 },
  { id: 'bbType', type: 'string', title: 'Basis MA Type', defval: 'SMA', options: ['SMA', 'EMA', 'SMMA (RMA)', 'WMA', 'VWMA'] },
  { id: 'bbSource', type: 'source', title: 'Source', defval: 'close' },
  { id: 'bbMult', type: 'float', title: 'StdDev', defval: 2.0, min: 0.001, max: 50 },
  { id: 'bbOffset', type: 'int', title: 'Offset', defval: 0, min: -500, max: 500 },
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
  { id: 'offset', type: 'int', title: 'Offset', defval: 0, min: -500, max: 500 },
  { id: 'plot1', type: 'bool', title: 'Plot MA1', defval: true },
  { id: 'type1', type: 'string', title: 'Type', defval: 'EMA', options: ['SMA', 'EMA'] },
  { id: 'len1', type: 'int', title: 'Length', defval: 21, min: 1 },
  { id: 'plot2', type: 'bool', title: 'Plot MA2', defval: true },
  { id: 'type2', type: 'string', title: 'Type', defval: 'EMA', options: ['SMA', 'EMA'] },
  { id: 'len2', type: 'int', title: 'Length', defval: 55, min: 1 },
  { id: 'plot3', type: 'bool', title: 'Plot MA3', defval: false },
  { id: 'type3', type: 'string', title: 'Type', defval: 'EMA', options: ['SMA', 'EMA'] },
  { id: 'len3', type: 'int', title: 'Length', defval: 100, min: 1 },
  { id: 'alertPct', type: 'float', title: 'Candle Move %', defval: 2.0, min: 0.1, max: 5000 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Upper', color: '#858585', lineWidth: 1 },
  { id: 'plot1', title: 'Lower', color: '#858585', lineWidth: 1 },
  { id: 'plot2', title: 'MA1', color: color.yellow, lineWidth: 1 },
  { id: 'plot3', title: 'MA2', color: color.yellow, lineWidth: 1 },
  { id: 'plot4', title: 'MA3', color: color.black, lineWidth: 1 },
];

export const metadata = {
  title: 'Custom MAs V_4.0 ',
  shortTitle: 'MAs_V_4.0',
  overlay: true,
};

/** Pine float comparison a >= b: false when a < b by more than 1e-10 (na compares false) */
const EPS = 1e-10;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);

type Point = { time: number; value: number; color?: string };

export function calculate(
  bars: Bar[],
  inputs: Partial<ThreeInOneCustomMovingAverageIndicatorInputs> = {},
): IndicatorResult & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const nan = () => new Array<number>(n).fill(NaN);

  // Bollinger Bands (calculated only when enabled)
  let upper = nan();
  let lower = nan();
  if (cfg.showBB) {
    const bbSrc = getSourceSeries(bars, cfg.bbSource);
    let basisS: Series;
    switch (cfg.bbType) {
      case 'EMA': basisS = ta.ema(bbSrc, cfg.bbLength); break;
      case 'SMMA (RMA)': basisS = ta.rma(bbSrc, cfg.bbLength); break;
      case 'WMA': basisS = ta.wma(bbSrc, cfg.bbLength); break;
      case 'VWMA': basisS = ta.vwma(bbSrc, cfg.bbLength, Series.fromArray(bars, bars.map((b) => b.volume ?? NaN))); break;
      default: basisS = ta.sma(bbSrc, cfg.bbLength); break;
    }
    const basis = A(basisS);
    const sd = A(ta.stdev(bbSrc, cfg.bbLength));
    upper = basis.map((b, i) => b + sd[i] * cfg.bbMult);
    lower = basis.map((b, i) => b - sd[i] * cfg.bbMult);
  }

  // Moving averages: type == "EMA" ? ta.ema(src, len) : ta.sma(src, len)
  const src = getSourceSeries(bars, cfg.src);
  const ma = (type: MaType, len: number) => A(type === 'EMA' ? ta.ema(src, len) : ta.sma(src, len));
  const ma1 = ma(cfg.type1, cfg.len1);
  const ma2 = ma(cfg.type2, cfg.len2);
  const ma3 = ma(cfg.type3, cfg.len3);
  const col1 = ma1.map((m, i) => (ge(bars[i].close, m) ? color.yellow : color.red));
  const col2 = ma2.map((m, i) => (ge(bars[i].close, m) ? color.yellow : color.red));

  // movePct = math.abs(close - open) / open * 100; spike = movePct >= alertPct
  const spike = bars.map((b) => ge(Math.abs(b.close - b.open) / b.open * 100, cfg.alertPct));

  const interval = barInterval(bars);
  // plot(..., offset = k): the value (and colour) of bar i is drawn on bar i + k
  const shifted = (show: boolean, values: number[], colorAt: (i: number) => string, k: number): Point[] => {
    const out: Point[] = [];
    for (let i = 0; i < n; i++) {
      if (i + k < 0) continue;
      out.push({ time: barTime(bars, i + k, interval), value: show ? values[i] : NaN, color: colorAt(i) });
    }
    return out;
  };

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: shifted(cfg.showBB, upper, () => '#858585', cfg.bbOffset),
      plot1: shifted(cfg.showBB, lower, () => '#858585', cfg.bbOffset),
      plot2: shifted(cfg.plot1, ma1, (i) => col1[i], cfg.offset),
      plot3: shifted(cfg.plot2, ma2, (i) => col2[i], cfg.offset),
      plot4: shifted(cfg.plot3, ma3, () => color.black, cfg.offset),
    },
    // fill(bbUpper, bbLower, color = color.new(#858585, 100)): fully transparent
    fills: [{ plot1: 'plot0', plot2: 'plot1', options: { color: String(color.new('#858585', 100)) } }],
    alerts: alertStates(alertConditions, bars, [spike]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Spike Alert', message: 'Price moved {{close}} from open by threshold %' },
];

export const ThreeInOneCustomMovingAverageIndicator = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
