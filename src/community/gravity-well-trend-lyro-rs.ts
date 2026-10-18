/**
 * Gravity Well Trend | Lyro RS
 *
 * The centre is the volume-weighted mean of the source over `length` bars (SMA(src * volume) / SMA(volume)); the
 * distance is (src - centre) / ATR. Bands sit at +-bandMult ATR and +-bandMult / 2 ATR around the centre. The trend
 * flips by mode: 'Trend' when the distance passes +-mult with the centre rising / falling, 'Midline' with the source
 * above / below the centre, 'Bands' when the source crosses above the lowest band (long) or below the highest band
 * (short). The trend colours the centre glow; the centre line and the candles take a gradient from the faded to the
 * full trend colour by |distance| / bandMult. Gradient fills between the bands, labels on the flips.
 * Alerts (alertcondition, `alerts` of the result): 'Bullish Signal', 'Bearish Signal' and 'Any Signal', on the flips.
 *
 * Reference: "Gravity Well Trend | Lyro RS" by LyroRS
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LyroRS
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData, PlotCandleData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export type GravityWellSignalMode = 'Trend' | 'Midline' | 'Bands';
export type GravityWellPalette = 'Classic' | 'Mystic' | 'Accented' | 'Royal';

export interface GravityWellTrendInputs {
  /** Source */
  src: SourceType;
  /** Signal mode */
  sigMode: GravityWellSignalMode;
  /** Window of the volume-weighted centre */
  length: number;
  /** Escape distance in ATR units ('Trend' mode) */
  mult: number;
  /** Width of the outer bands in ATR units (the inner bands are at half) */
  bandMult: number;
  /** ATR length */
  atrLen: number;
  /** Show the flip labels */
  showSignals: boolean;
  /** Show the bands */
  showBands: boolean;
  /** Colour the candles */
  candleColor: boolean;
  /** Colour palette */
  colMode: GravityWellPalette;
  /** Use the custom colours */
  useCustomPalette: boolean;
  customUp: string;
  customDown: string;
}

export const defaultInputs: GravityWellTrendInputs = {
  src: 'close',
  sigMode: 'Trend',
  length: 50,
  mult: 2.0,
  bandMult: 3.0,
  atrLen: 14,
  showSignals: true,
  showBands: true,
  candleColor: true,
  colMode: 'Mystic',
  useCustomPalette: false,
  customUp: '#00ff00',
  customDown: '#ff0000',
};

const SETTINGS = 'SETTINGS';
const FEATURES = 'FEATURES';
const COLOR = 'COLOR';

export const inputConfig: InputConfig[] = [
  { id: 'src', type: 'source', title: 'Source', defval: 'close', group: SETTINGS },
  { id: 'sigMode', type: 'string', title: 'Signal Mode', defval: 'Trend', options: ['Trend', 'Midline', 'Bands'], group: SETTINGS },
  { id: 'length', type: 'int', title: 'Length', defval: 50, min: 5, group: SETTINGS },
  { id: 'mult', type: 'float', title: 'Escape Distance', defval: 2.0, min: 0.5, max: 5, step: 0.25, group: SETTINGS },
  { id: 'bandMult', type: 'float', title: 'Band Width', defval: 3.0, min: 0.5, max: 10, step: 0.25, group: SETTINGS },
  { id: 'atrLen', type: 'int', title: 'ATR Length', defval: 14, min: 1, group: SETTINGS },
  { id: 'showSignals', type: 'bool', title: 'Show Signals', defval: true, group: FEATURES },
  { id: 'showBands', type: 'bool', title: 'Show Bands', defval: true, group: FEATURES },
  { id: 'candleColor', type: 'bool', title: 'Candle Coloring', defval: true, group: FEATURES },
  { id: 'colMode', type: 'string', title: 'Custom Color Palette', defval: 'Mystic', options: ['Classic', 'Mystic', 'Accented', 'Royal'], group: COLOR, display: 'none' },
  { id: 'useCustomPalette', type: 'bool', title: 'Use Custom Palette', defval: false, group: COLOR, display: 'none' },
  { id: 'customUp', type: 'color', title: 'Custom Up', defval: '#00ff00', group: COLOR, display: 'none' },
  { id: 'customDown', type: 'color', title: 'Custom Down', defval: '#ff0000', group: COLOR, display: 'none' },
];

const UP_DEF = '#30FDCF';
const DN_DEF = '#E117B7';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Center [Outer Glow]', color: String(color.new(UP_DEF, 90)), lineWidth: 10 },
  { id: 'plot1', title: 'Center [Glow]', color: String(color.new(UP_DEF, 78)), lineWidth: 5 },
  { id: 'plot2', title: 'Gravity Center', color: UP_DEF, lineWidth: 2 },
  { id: 'plot3', title: 'Highest Band', color: String(color.new(DN_DEF, 35)), lineWidth: 1 },
  { id: 'plot4', title: 'Upper Band', color: String(color.new(DN_DEF, 65)), lineWidth: 1 },
  { id: 'plot5', title: 'Lower Band', color: String(color.new(UP_DEF, 65)), lineWidth: 1 },
  { id: 'plot6', title: 'Lowest Band', color: String(color.new(UP_DEF, 35)), lineWidth: 1 },
];

export const metadata = {
  title: 'Gravity Well Trend | Lyro RS',
  shortTitle: 'Gravity Well | Lyro RS',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<GravityWellTrendInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; plotCandles: Record<string, PlotCandleData[]> }
  & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  // Palette
  let upC = cfg.colMode === 'Classic' ? '#00E676' : cfg.colMode === 'Mystic' ? '#30FDCF'
    : cfg.colMode === 'Accented' ? '#9618F7' : '#FFC107';
  let dnC = cfg.colMode === 'Classic' ? '#880E4F' : cfg.colMode === 'Mystic' ? '#E117B7'
    : cfg.colMode === 'Accented' ? '#FF0078' : '#673AB7';
  if (cfg.useCustomPalette) {
    upC = cfg.customUp;
    dnC = cfg.customDown;
  }

  // Gravity engine
  const src = A(getSourceSeries(bars, cfg.src));
  const vol = bars.map((b) => b.volume ?? NaN);
  const num = A(ta.sma(S(src.map((s, i) => s * vol[i])), cfg.length));
  const den = A(ta.sma(S(vol), cfg.length));
  // center = ta.sma(src * volume, length) / ta.sma(volume, length): a plain division (x / 0 is +-infinity)
  const center = num.map((v, i) => v / den[i]);
  const atr = A(ta.atr(bars, cfg.atrLen));
  const dist = src.map((s, i) => (s - center[i]) / atr[i]);
  const bandHi = center.map((c, i) => c + cfg.bandMult * atr[i]);
  const bandHiM = center.map((c, i) => c + cfg.bandMult * 0.5 * atr[i]);
  const bandLoM = center.map((c, i) => c - cfg.bandMult * 0.5 * atr[i]);
  const bandLo = center.map((c, i) => c - cfg.bandMult * atr[i]);

  // Trend engine
  const trendArr: number[] = new Array(n);
  let trend = 0; // var int trend = 0
  // ta.crossover(src, bandLo) / ta.crossunder(src, bandHi) run on every bar: compared with the last bar where both
  // values were not na (a tie there counts); exact comparisons (no tolerance)
  let pSrcLo = NaN;
  let pLo = NaN;
  let pSrcHi = NaN;
  let pHi = NaN;
  for (let i = 0; i < n; i++) {
    const s = src[i];
    const reclaimUp = s > bandLo[i] && pSrcLo <= pLo;
    const reclaimDn = s < bandHi[i] && pSrcHi >= pHi;
    if (!isNaN(s) && !isNaN(bandLo[i])) {
      pSrcLo = s;
      pLo = bandLo[i];
    }
    if (!isNaN(s) && !isNaN(bandHi[i])) {
      pSrcHi = s;
      pHi = bandHi[i];
    }
    const prevCenter = i > 0 ? center[i - 1] : NaN;
    if (cfg.sigMode === 'Trend') {
      if (gt(dist[i], cfg.mult) && gt(center[i], prevCenter)) trend = 1;
      else if (lt(dist[i], -cfg.mult) && lt(center[i], prevCenter)) trend = -1;
    } else if (cfg.sigMode === 'Midline') {
      trend = gt(s, center[i]) ? 1 : lt(s, center[i]) ? -1 : trend;
    } else if (reclaimUp) {
      trend = 1;
    } else if (reclaimDn) {
      trend = -1;
    }
    trendArr[i] = trend;
  }

  // Visuals
  const trendCol = trendArr.map((tr) => (tr === 1 ? upC : tr === -1 ? dnC : color.gray));
  const gradCol = trendCol.map((c, i) => {
    // strength = math.min(math.abs(dist) / bandMult, 1.0); color.from_gradient(strength, 0, 1, color.new(trendCol, 65), trendCol)
    const strength = Math.min(Math.abs(dist[i]) / cfg.bandMult, 1.0);
    return String(color.from_gradient(strength, 0, 1, color.new(c, 65), c));
  });
  const fin = (v: number) => (Number.isFinite(v) ? v : NaN);
  const t = (i: number) => bars[i].time;
  const band = (arr: number[], col: string) => bars.map((_b, i) => ({
    time: t(i), value: cfg.showBands ? fin(arr[i]) : NaN, color: col,
  }));
  const plots = {
    // plot(center, 'Center [Outer Glow]', color.new(trendCol, 90), linewidth = 10, editable = false)
    plot0: bars.map((_b, i) => ({ time: t(i), value: fin(center[i]), color: String(color.new(trendCol[i], 90)) })),
    // plot(center, 'Center [Glow]', color.new(trendCol, 78), linewidth = 5, editable = false)
    plot1: bars.map((_b, i) => ({ time: t(i), value: fin(center[i]), color: String(color.new(trendCol[i], 78)) })),
    // plot(center, 'Gravity Center', gradCol, linewidth = 2)
    plot2: bars.map((_b, i) => ({ time: t(i), value: fin(center[i]), color: gradCol[i] })),
    plot3: band(bandHi, String(color.new(dnC, 35))),
    plot4: band(bandHiM, String(color.new(dnC, 65))),
    plot5: band(bandLoM, String(color.new(upC, 65))),
    plot6: band(bandLo, String(color.new(upC, 35))),
  };

  // fill(p1, p2, top_value, bottom_value, top_color, bottom_color)
  const grad = (p1: string, p2: string, top: number[], bottom: number[], topCol: string, bottomCol: string, title: string) => ({
    plot1: p1, plot2: p2, options: { title },
    gradient: {
      topValue: top.map(fin), bottomValue: bottom.map(fin),
      topColor: new Array<string | null>(n).fill(topCol), bottomColor: new Array<string | null>(n).fill(bottomCol),
    },
  });
  const fills = [
    grad('plot3', 'plot4', bandHi, bandHiM, String(color.new(dnC, 58)), String(color.new(dnC, 91)), 'Upper Outer Zone'),
    grad('plot4', 'plot2', bandHiM, center, String(color.new(dnC, 91)), String(color.new(dnC, 99)), 'Upper Inner Zone'),
    grad('plot2', 'plot5', center, bandLoM, String(color.new(upC, 99)), String(color.new(upC, 91)), 'Lower Inner Zone'),
    grad('plot5', 'plot6', bandLoM, bandLo, String(color.new(upC, 91)), String(color.new(upC, 58)), 'Lower Outer Zone'),
  ];

  const markers: MarkerData[] = [];
  const candles: PlotCandleData[] = [];
  const upFlags: boolean[] = [];
  const downFlags: boolean[] = [];
  for (let i = 0; i < n; i++) {
    // flipUp = trend == 1 and trend[1] != 1 (trend[1] is na on the first bar: na != 1 is false)
    const flipUp = i > 0 && trendArr[i] === 1 && trendArr[i - 1] !== 1;
    const flipDown = i > 0 && trendArr[i] === -1 && trendArr[i - 1] !== -1;
    upFlags.push(flipUp);
    downFlags.push(flipDown);
    if (cfg.showSignals && flipUp) {
      markers.push({ time: t(i), position: 'belowBar', shape: 'labelUp', color: upC, text: '𝓛𝓸𝓷𝓰', textColor: '#000000', size: 'small' });
    }
    if (cfg.showSignals && flipDown) {
      markers.push({ time: t(i), position: 'aboveBar', shape: 'labelDown', color: dnC, text: '𝓢𝓱𝓸𝓻𝓽', textColor: '#000000', size: 'small' });
    }
    // plotcandle(open, high, low, close, 'Candle Plot', candleColor ? gradCol : na, candleColor ? gradCol : na,
    //   bordercolor = candleColor ? gradCol : na, display = display.pane, force_overlay = true)
    const c = cfg.candleColor ? gradCol[i] : 'transparent';
    const b = bars[i];
    candles.push({ time: t(i), open: b.open, high: b.high, low: b.low, close: b.close,
      color: c, wickColor: c, borderColor: c, forceOverlay: true });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    fills,
    markers,
    plotCandles: { candlePlot: candles },
    // alertcondition(flipUp) / alertcondition(flipDown) / alertcondition(flipUp or flipDown)
    alerts: alertStates(alertConditions, bars, [upFlags, downFlags, upFlags.map((f, i) => f || downFlags[i])]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish Signal', message: 'Gravity Well | Lyro RS: Bullish signal on {{ticker}} ({{interval}})' },
  { id: 'alert1', title: 'Bearish Signal', message: 'Gravity Well | Lyro RS: Bearish signal on {{ticker}} ({{interval}})' },
  { id: 'alert2', title: 'Any Signal', message: 'Gravity Well | Lyro RS: Signal flip on {{ticker}} ({{interval}})' },
];

export const GravityWellTrend = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
