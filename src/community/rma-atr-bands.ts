/**
 * RMA ATR Bands
 *
 * An RMA trend line of the source (high by default) with an upper band RMA + ATR * upper multiplier and a lower band
 * RMA - ATR * lower multiplier. A close above the upper band sets the trend up, a close below the lower band sets it
 * down; the line, the bands, their fills and the bars take the trend colour, and LONG / SHORT triangles mark the bars
 * where the trend turns.
 * Alerts (alertcondition, `alerts` of the result): 'RMA ATR Bands Long' / 'RMA ATR Bands Short', true on the bars where
 * the trend turns up / down.
 *
 * Reference: "RMA ATR Bands" by SchizoQuant
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData, BarColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface RMAATRBandsInputs {
  /** Source of the RMA trend line */
  maSrc: SourceType;
  /** RMA length */
  maLength: number;
  /** ATR length */
  atrLength: number;
  /** Upper band: RMA + ATR * upperMult */
  upperMult: number;
  /** Lower band: RMA - ATR * lowerMult */
  lowerMult: number;
  /** Show the ATR bands and their fills */
  showATRBands: boolean;
  /** Colour the bars with the trend colour */
  colorBars: boolean;
  /** Show the LONG / SHORT markers */
  showSignals: boolean;
}

export const defaultInputs: RMAATRBandsInputs = {
  maSrc: 'high',
  maLength: 14,
  atrLength: 13,
  upperMult: 0.4,
  lowerMult: 1.6,
  showATRBands: true,
  colorBars: true,
  showSignals: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'maSrc', type: 'source', title: 'Source', defval: 'high' },
  { id: 'maLength', type: 'int', title: 'Length', defval: 14, min: 1 },
  { id: 'atrLength', type: 'int', title: 'ATR Length', defval: 13, min: 1 },
  { id: 'upperMult', type: 'float', title: 'Upper ATR Multiplier', defval: 0.4, step: 0.1 },
  { id: 'lowerMult', type: 'float', title: 'Lower ATR Multiplier', defval: 1.6, step: 0.1 },
  { id: 'showATRBands', type: 'bool', title: 'Show ATR Bands', defval: true },
  { id: 'colorBars', type: 'bool', title: 'Color Bars', defval: true },
  { id: 'showSignals', type: 'bool', title: 'Show Signals', defval: true },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'MA', color: '#787B86', lineWidth: 2 },
  { id: 'plot1', title: 'Upper ATR Band', color: '#787B86', lineWidth: 1 },
  { id: 'plot2', title: 'Lower ATR Band', color: '#787B86', lineWidth: 1 },
];

export const metadata = {
  title: 'RMA ATR Bands',
  shortTitle: 'RMA ATR Bands',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<RMAATRBandsInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;

  // ma = ta.rma(maSrc, maLength); atr = ta.atr(atrLength)
  const ma = ta.rma(getSourceSeries(bars, cfg.maSrc), cfg.maLength).toArray().map((v) => v ?? NaN);
  const atr = ta.atr(bars, cfg.atrLength).toArray().map((v) => v ?? NaN);

  // longColor = color.rgb(57, 255, 20); shortColor = color.rgb(138, 43, 226)
  const longColor = '#39FF14';
  const shortColor = '#8A2BE2';

  const maPlot: { time: number; value: number; color: string }[] = [];
  const upperPlot: { time: number; value: number; color: string }[] = [];
  const lowerPlot: { time: number; value: number; color: string }[] = [];
  const fillColors: string[] = [];
  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const longFlags: boolean[] = [], shortFlags: boolean[] = [];

  let trend = 0; // var int trend = 0
  let prevTrend = NaN; // trend[1] (na on the first bar)
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const upperLine = ma[i] + atr[i] * cfg.upperMult;
    const lowerLine = ma[i] - atr[i] * cfg.lowerMult;

    // long = close > upperLine; short = close < lowerLine (na compares false)
    if (gt(bars[i].close, upperLine)) trend = 1;
    if (lt(bars[i].close, lowerLine)) trend = -1;

    // longSignal = trend == 1 and trend[1] != 1 (trend[1] na on the first bar: na != 1 is false)
    const longSignal = trend === 1 && !isNaN(prevTrend) && prevTrend !== 1;
    const shortSignal = trend === -1 && !isNaN(prevTrend) && prevTrend !== -1;
    prevTrend = trend;
    longFlags.push(longSignal);
    shortFlags.push(shortSignal);

    const bandColor = trend === 1 ? longColor : trend === -1 ? shortColor : color.gray;
    maPlot.push({ time: t, value: ma[i], color: bandColor });
    upperPlot.push({ time: t, value: cfg.showATRBands ? upperLine : NaN, color: bandColor });
    lowerPlot.push({ time: t, value: cfg.showATRBands ? lowerLine : NaN, color: bandColor });
    fillColors.push(cfg.showATRBands ? String(color.new(bandColor, 88)) : 'transparent');

    // plotshape(showSignals and longSignal, triangleup, belowbar, longColor, size.small, "LONG", textcolor white)
    if (cfg.showSignals && longSignal) {
      markers.push({ time: t, position: 'belowBar', shape: 'triangleUp', color: longColor, text: 'LONG',
        textColor: color.white, size: 'small' });
    }
    if (cfg.showSignals && shortSignal) {
      markers.push({ time: t, position: 'aboveBar', shape: 'triangleDown', color: shortColor, text: 'SHORT',
        textColor: color.white, size: 'small' });
    }
    // barcolor(colorBars ? bandColor : na)
    if (cfg.colorBars) barColors.push({ time: t, color: bandColor });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0: maPlot, plot1: upperPlot, plot2: lowerPlot },
    // fill(maPlot, upperPlot / lowerPlot, color = showATRBands ? color.new(bandColor, 88) : na)
    fills: [
      { plot1: 'plot0', plot2: 'plot1', options: { title: 'Upper Fill' }, colors: fillColors },
      { plot1: 'plot0', plot2: 'plot2', options: { title: 'Lower Fill' }, colors: [...fillColors] },
    ],
    markers,
    barColors,
    // alertcondition(longSignal, "RMA ATR Bands Long") / alertcondition(shortSignal, "RMA ATR Bands Short")
    alerts: alertStates(alertConditions, bars, [longFlags, shortFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'RMA ATR Bands Long', message: 'RMA ATR Bands Long Signal on {{ticker}}' },
  { id: 'alert1', title: 'RMA ATR Bands Short', message: 'RMA ATR Bands Short Signal on {{ticker}}' },
];

export const RMAATRBands = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
