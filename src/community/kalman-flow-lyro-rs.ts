/**
 * Kalman Flow | Lyro RS
 *
 * A two-state (level + velocity) constant-velocity Kalman filter of the source, with process noise
 * q = 10^(sensitivity / 2 - 6) and measurement noise r = 1, started at the first source value (velocity 0, P = I).
 * The tracking error is the SMA of |source - level| over `volLen` bars; the bands are level + posMult * error and
 * level - negMult * error. The trend turns up when the close is above the upper band with a positive velocity, and
 * down when the close is below the lower band with a negative velocity; otherwise it holds. The baseline (with a
 * glow), the bands, their fill and the candles take the trend colour (gray before the first trend), and Long / Short
 * labels mark the trend flips.
 * Alerts (alertcondition, `alerts` of the result): 'Bullish Trend Flip', 'Bearish Trend Flip' and 'Any Trend Flip' on
 * the bars of the flips.
 *
 * Reference: "Kalman Flow | Lyro RS" by LyroRS
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LyroRS
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData, PlotCandleData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface KalmanFlowLyroRsInputs {
  /** Price series fed into the Kalman filter */
  src: SourceType;
  /** Filter reaction speed (process noise 10^(sensitivity / 2 - 6)) */
  sensitivity: number;
  /** Upper band multiplier of the tracking error */
  madMultp: number;
  /** Lower band multiplier of the tracking error */
  madMultn: number;
  /** SMA length of the tracking error */
  volLen: number;
  showSignals: boolean;
  showBands: boolean;
  /** Candle colouring (the script draws the candles whatever this setting) */
  candleColor: boolean;
  /** Palette used when the custom palette is off */
  colMode: 'Classic' | 'Mystic' | 'Accented' | 'Royal';
  /** Use the custom up / down colours */
  cpyn: boolean;
  cpUpC: string;
  cpDnC: string;
}

export const defaultInputs: KalmanFlowLyroRsInputs = {
  src: 'close',
  sensitivity: 4,
  madMultp: 1.65,
  madMultn: 1,
  volLen: 50,
  showSignals: true,
  showBands: true,
  candleColor: true,
  colMode: 'Mystic',
  cpyn: true,
  cpUpC: '#00ff00',
  cpDnC: '#ff0000',
};

const SETTINGS = '𝗦𝗘𝗧𝗧𝗜𝗡𝗚𝗦';
const FEATURES = '𝗙𝗘𝗔𝗧𝗨𝗥𝗘𝗦';
const COLOR = '𝗖𝗢𝗟𝗢𝗥';

export const inputConfig: InputConfig[] = [
  { id: 'src', type: 'source', title: '𝗦𝗼𝘂𝗿𝗰𝗲', defval: 'close', group: SETTINGS },
  { id: 'sensitivity', type: 'float', title: '𝗦𝗲𝗻𝘀𝗶𝘁𝗶𝘃𝗶𝘁𝘆', defval: 4, min: 1, max: 10, step: 0.5, group: SETTINGS },
  { id: 'madMultp', type: 'float', title: '+ 𝗠𝘂𝗹𝘁𝗶𝗽𝗹𝗶𝗲𝗿', defval: 1.65, min: 0.5, max: 5, step: 0.1, group: SETTINGS },
  { id: 'madMultn', type: 'float', title: '- 𝗠𝘂𝗹𝘁𝗶𝗽𝗹𝗶𝗲𝗿', defval: 1, min: 0.5, max: 5, step: 0.1, group: SETTINGS },
  { id: 'volLen', type: 'int', title: '𝗡𝗼𝗶𝘀𝗲 𝗟𝗲𝗻𝗴𝘁𝗵', defval: 50, min: 5, max: 500, group: SETTINGS },
  { id: 'showSignals', type: 'bool', title: '𝗦𝗵𝗼𝘄 𝗦𝗶𝗴𝗻𝗮𝗹𝘀', defval: true, group: FEATURES },
  { id: 'showBands', type: 'bool', title: '𝗦𝗵𝗼𝘄 𝗕𝗮𝗻𝗱𝘀', defval: true, group: FEATURES },
  { id: 'candleColor', type: 'bool', title: '𝗖𝗮𝗻𝗱𝗹𝗲 𝗖𝗼𝗹𝗼𝗿𝗶𝗻𝗴', defval: true, group: FEATURES },
  { id: 'colMode', type: 'string', title: 'Custom Color Palette', defval: 'Mystic', options: ['Classic', 'Mystic', 'Accented', 'Royal'], group: COLOR, inline: 'drop', display: 'none' },
  { id: 'cpyn', type: 'bool', title: 'Use Custom Palette', defval: true, group: COLOR, display: 'none' },
  { id: 'cpUpC', type: 'color', title: 'Custom Up', defval: '#00ff00', group: COLOR, inline: 'Custom Palette', display: 'none' },
  { id: 'cpDnC', type: 'color', title: 'Custom Down', defval: '#ff0000', group: COLOR, inline: 'Custom Palette', display: 'none' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Kalman Baseline [Glow]', color: String(color.new(color.gray, 80)), lineWidth: 6 },
  { id: 'plot1', title: 'Kalman Baseline', color: color.gray, lineWidth: 2 },
  { id: 'plot2', title: 'Upper Band', color: String(color.new(color.gray, 70)), lineWidth: 1 },
  { id: 'plot3', title: 'Lower Band', color: String(color.new(color.gray, 70)), lineWidth: 1 },
];

export const metadata = {
  title: 'Kalman Flow | Lyro RS',
  shortTitle: 'Kalman Flow | Lyro RS',
  overlay: true,
};

/** Pine a > b: a - b > 1e-10 (false with na) */
const gt = (a: number, b: number) => a - b > 1e-10;
const lt = (a: number, b: number) => b - a > 1e-10;

const PALETTES: Record<KalmanFlowLyroRsInputs['colMode'], [string, string]> = {
  Classic: ['#00E676', '#880E4F'],
  Mystic: ['#30FDCF', '#E117B7'],
  Accented: ['#9618F7', '#FF0078'],
  Royal: ['#FFC107', '#673AB7'],
};

export function calculate(
  bars: Bar[],
  inputs: Partial<KalmanFlowLyroRsInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; plotCandles: Record<string, PlotCandleData[]> }
  & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const src = getSourceSeries(bars, cfg.src).toArray().map((v) => v ?? NaN);
  const [upC, dnC] = cfg.cpyn ? [cfg.cpUpC, cfg.cpDnC] : (PALETTES[cfg.colMode]);

  // Two-state Kalman filter (level, velocity)
  const q = Math.pow(10, cfg.sensitivity / 2 - 6);
  const r = 1.0;
  const level: number[] = new Array(n);
  const veloc: number[] = new Array(n);
  let kfLevel = NaN;
  let kfVeloc = 0.0;
  let p11 = 1.0;
  let p12 = 0.0;
  let p21 = 0.0;
  let p22 = 1.0;
  for (let i = 0; i < n; i++) {
    if (isNaN(kfLevel)) {
      kfLevel = src[i];
    } else {
      const predLevel = kfLevel + kfVeloc;
      const predVeloc = kfVeloc;
      const p11p = p11 + p12 + p21 + p22 + q;
      const p12p = p12 + p22;
      const p21p = p21 + p22;
      const p22p = p22 + q;
      const s = p11p + r;
      const k1 = p11p / s;
      const k2 = p21p / s;
      const innov = src[i] - predLevel;
      kfLevel = predLevel + k1 * innov;
      kfVeloc = predVeloc + k2 * innov;
      p11 = (1 - k1) * p11p;
      p12 = (1 - k1) * p12p;
      p21 = p21p - k2 * p11p;
      p22 = p22p - k2 * p12p;
    }
    level[i] = kfLevel;
    veloc[i] = kfVeloc;
  }

  // Trend engine
  const trackErr = ta.sma(Series.fromArray(bars, src.map((s, i) => Math.abs(s - level[i]))), cfg.volLen)
    .toArray().map((v) => v ?? NaN);
  const upper = level.map((l, i) => l + cfg.madMultp * trackErr[i]);
  const lower = level.map((l, i) => l - cfg.madMultn * trackErr[i]);
  const trend: number[] = new Array(n);
  let tr = 0; // var int trend = 0
  for (let i = 0; i < n; i++) {
    if (gt(bars[i].close, upper[i]) && gt(veloc[i], 0)) tr = 1;
    else if (lt(bars[i].close, lower[i]) && lt(veloc[i], 0)) tr = -1;
    trend[i] = tr;
  }

  const trendCol = trend.map((t) => (t === 1 ? upC : t === -1 ? dnC : color.gray));
  const markers: MarkerData[] = [];
  const candles: PlotCandleData[] = [];
  // flipUp = trend == 1 and trend[1] != 1 (trend[1] is na on the first bar: the comparison is false)
  const flipUp = trend.map((t, i) => i > 0 && t === 1 && trend[i - 1] !== 1);
  const flipDown = trend.map((t, i) => i > 0 && t === -1 && trend[i - 1] !== -1);
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    if (cfg.showSignals && flipUp[i]) {
      markers.push({ time: b.time, position: 'belowBar', shape: 'labelUp', color: upC, text: '𝓛𝓸𝓷𝓰',
        textColor: '#000000', size: 'small' });
    }
    if (cfg.showSignals && flipDown[i]) {
      markers.push({ time: b.time, position: 'aboveBar', shape: 'labelDown', color: dnC, text: '𝓢𝓱𝓸𝓻𝓽',
        textColor: '#000000', size: 'small' });
    }
    // plotcandle(open, high, low, close, "Candle Plot", trendCol, trendCol, bordercolor = trendCol)
    candles.push({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close,
      color: trendCol[i], wickColor: trendCol[i], borderColor: trendCol[i] });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: level[i], color: String(color.new(trendCol[i], 80)) })),
      plot1: bars.map((b, i) => ({ time: b.time, value: level[i], color: trendCol[i] })),
      plot2: bars.map((b, i) => ({ time: b.time, value: cfg.showBands ? upper[i] : NaN, color: String(color.new(trendCol[i], 70)) })),
      plot3: bars.map((b, i) => ({ time: b.time, value: cfg.showBands ? lower[i] : NaN, color: String(color.new(trendCol[i], 70)) })),
    },
    // fill(pUp, pDn, color = showBands ? color.new(trendCol, 92) : na, title = "Band Fill")
    fills: [{
      plot1: 'plot2',
      plot2: 'plot3',
      options: { title: 'Band Fill' },
      colors: trendCol.map((c) => (cfg.showBands ? String(color.new(c, 92)) : 'transparent')),
    }],
    markers,
    plotCandles: { candlePlot: candles },
    // alertcondition(flipUp), alertcondition(flipDown), alertcondition(flipUp or flipDown)
    alerts: alertStates(alertConditions, bars, [flipUp, flipDown, flipUp.map((f, i) => f || flipDown[i])]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish Trend Flip', message: 'Kalman Flow | Lyro RS: Bullish trend flip on {{ticker}} ({{interval}})' },
  { id: 'alert1', title: 'Bearish Trend Flip', message: 'Kalman Flow | Lyro RS: Bearish trend flip on {{ticker}} ({{interval}})' },
  { id: 'alert2', title: 'Any Trend Flip', message: 'Kalman Flow | Lyro RS: Trend flip on {{ticker}} ({{interval}})' },
];

export const KalmanFlowLyroRs = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
