/**
 * Market Structure Oscillator [LuxAlgo]
 *
 * Three levels of swing points are tracked. A short term swing high is a high that is above the high before it and
 * not below the high after it (swing low: the mirror). An intermediate term swing is a short term swing that is
 * higher (lower) than the short term swings around it, and a long term swing is the same on the intermediate swings.
 * A close above the last swing high of a level that was not crossed yet is a bullish structure break of that level,
 * a close below the last swing low a bearish one.
 * Each level gives an oscillator: the position of the close between the lowest close and the highest close kept
 * since the last change of direction (0 to 100), smoothed by an SMA. The Market Structure Oscillator is the
 * weighted average of the three. The cycle histogram is the oscillator minus its EMA, drawn around 50 as candles.
 * Options: dots on the price chart when the oscillator or the cycle crosses 50, the structure breaks of each level
 * as lines (with "BoS" / "CHoCH" texts) on the price chart, and the oscillator of each level.
 *
 * Drawings are kept up to 500 lines, 500 boxes and 500 labels (the oldest are removed).
 *
 * Reference: "Market Structure Oscillator [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BoxData, LabelData, LineDrawingData, PlotCandleData } from '../types';

type LineStyleName = 'Solid' | 'Dashed' | 'Dotted';
type Toggle = 'Enabled' | 'Disabled';

export interface MarketStructureOscillatorInputs {
  /** Market Structure Oscillator */
  msOscShow: boolean;
  /** Short Term Weight */
  msWeightK1: number;
  /** Intermediate Term Weight */
  msWeightK2: number;
  /** Long Term Weight */
  msWeightK3: number;
  /** Oscillator Smoothing */
  normSmooth: number;
  msBullColor: string;
  msBearColor: string;
  /** Market Structure Oscillator - Crosses (Signals) */
  oscSig: boolean;
  oBullColor: string;
  oBearColor: string;
  /** Cycle Oscillator - Histogram */
  cycleOpt: boolean;
  /** Cycle Signal Length */
  cycSmooth: number;
  cBullColor: string;
  cBearColor: string;
  /** Cycle Oscillator - Crosses (Signals) */
  cycleSig: boolean;
  sBullColor: string;
  sBearColor: string;
  /** Short Term Structures */
  msOnChart1: boolean;
  msOnChartK1: LineStyleName;
  stMSLblK1T: Toggle;
  cBullColorK1: string;
  cBearColorK1: string;
  /** Intermediate Term Structures */
  msOnChart2: boolean;
  msOnChartK2: LineStyleName;
  stMSLblK2T: Toggle;
  cBullColorK2: string;
  cBearColorK2: string;
  /** Long Term Structures */
  msOnChart3: boolean;
  msOnChartK3: LineStyleName;
  stMSLblK3T: Toggle;
  cBullColorK3: string;
  cBearColorK3: string;
  /** Short Term Oscillator */
  msDataK1: boolean;
  msColorK1: string;
  /** Intermediate Term Oscillator */
  msDataK2: boolean;
  msColorK2: string;
  /** Long Term Oscillator */
  msDataK3: boolean;
  msColorK3: string;
}

const HIST_BULL = 'rgba(144, 191, 249, 0.75)';
const HIST_BEAR = 'rgba(255, 204, 128, 0.75)';
const HALF_GRAY = 'rgba(120, 123, 134, 0.5)';

export const defaultInputs: MarketStructureOscillatorInputs = {
  msOscShow: true,
  msWeightK1: 1,
  msWeightK2: 3,
  msWeightK3: 2,
  normSmooth: 4,
  msBullColor: '#3179f5',
  msBearColor: '#ffa726',
  oscSig: false,
  oBullColor: '#3179f5',
  oBearColor: '#ffa726',
  cycleOpt: true,
  cycSmooth: 7,
  cBullColor: HIST_BULL,
  cBearColor: HIST_BEAR,
  cycleSig: false,
  sBullColor: HIST_BULL,
  sBearColor: HIST_BEAR,
  msOnChart1: false,
  msOnChartK1: 'Dotted',
  stMSLblK1T: 'Disabled',
  cBullColorK1: '#089981',
  cBearColorK1: '#f23645',
  msOnChart2: false,
  msOnChartK2: 'Dashed',
  stMSLblK2T: 'Disabled',
  cBullColorK2: '#089981',
  cBearColorK2: '#f23645',
  msOnChart3: false,
  msOnChartK3: 'Solid',
  stMSLblK3T: 'Enabled',
  cBullColorK3: '#089981',
  cBearColorK3: '#f23645',
  msDataK1: false,
  msColorK1: HALF_GRAY,
  msDataK2: false,
  msColorK2: HALF_GRAY,
  msDataK3: false,
  msColorK3: HALF_GRAY,
};

const G1 = 'Market Structure Oscillator';
const G2 = 'Cycle Oscillator';
const G3 = 'Market Structures on Chart';
const G4 = 'Oscillator Components';
const STYLES = ['Solid', 'Dashed', 'Dotted'];
const TOGGLE = ['Enabled', 'Disabled'];

export const inputConfig: InputConfig[] = [
  { id: 'msOscShow', type: 'bool', title: 'Market Structure Oscillator', defval: true, group: G1 },
  { id: 'msWeightK1', type: 'float', title: '  Short Term Weight', defval: 1, min: 0, step: 0.1, group: G1 },
  { id: 'msWeightK2', type: 'float', title: '  Intermediate Term Weight', defval: 3, min: 0, step: 0.1, group: G1 },
  { id: 'msWeightK3', type: 'float', title: '  Long Term Weight', defval: 2, min: 0, step: 0.1, group: G1 },
  { id: 'normSmooth', type: 'int', title: '  Oscillator Smoothing', defval: 4, min: 1, group: G1 },
  { id: 'msBullColor', type: 'color', title: '  Gradient Colors: Bullish', defval: '#3179f5', inline: 'MS', group: G1 },
  { id: 'msBearColor', type: 'color', title: 'Bearish', defval: '#ffa726', inline: 'MS', group: G1 },
  { id: 'oscSig', type: 'bool', title: 'Market Structure Oscillator - Crosses (Signals)', defval: false, group: G1 },
  { id: 'oBullColor', type: 'color', title: '  Signal Colors: Bullish', defval: '#3179f5', inline: 'SIG', group: G1 },
  { id: 'oBearColor', type: 'color', title: 'Bearish', defval: '#ffa726', inline: 'SIG', group: G1 },
  { id: 'cycleOpt', type: 'bool', title: 'Cycle Oscillator - Histogram', defval: true, group: G2 },
  { id: 'cycSmooth', type: 'int', title: '  Cycle Signal Length', defval: 7, min: 1, group: G2 },
  { id: 'cBullColor', type: 'color', title: '  Histogram Colors: Bullish', defval: HIST_BULL, inline: 'CYC', group: G2 },
  { id: 'cBearColor', type: 'color', title: 'Bearish', defval: HIST_BEAR, inline: 'CYC', group: G2 },
  { id: 'cycleSig', type: 'bool', title: 'Cycle Oscillator - Crosses (Signals)', defval: false, group: G2 },
  { id: 'sBullColor', type: 'color', title: '  Signal Colors: Bullish', defval: HIST_BULL, inline: 'SIG', group: G2 },
  { id: 'sBearColor', type: 'color', title: 'Bearish', defval: HIST_BEAR, inline: 'SIG', group: G2 },
  { id: 'msOnChart1', type: 'bool', title: 'Short Term Structures', defval: false, group: G3 },
  { id: 'msOnChartK1', type: 'string', title: '  Line', defval: 'Dotted', options: STYLES, inline: 'K1', group: G3 },
  { id: 'stMSLblK1T', type: 'string', title: 'Labels', defval: 'Disabled', options: TOGGLE, inline: 'K1', group: G3 },
  { id: 'cBullColorK1', type: 'color', title: '  Colors: Bullish', defval: '#089981', inline: 'K1c', group: G3 },
  { id: 'cBearColorK1', type: 'color', title: 'Bearish', defval: '#f23645', inline: 'K1c', group: G3 },
  { id: 'msOnChart2', type: 'bool', title: 'Intermediate Term Structures', defval: false, group: G3 },
  { id: 'msOnChartK2', type: 'string', title: '  Line', defval: 'Dashed', options: STYLES, inline: 'K2', group: G3 },
  { id: 'stMSLblK2T', type: 'string', title: 'Labels', defval: 'Disabled', options: TOGGLE, inline: 'K2', group: G3 },
  { id: 'cBullColorK2', type: 'color', title: '  Colors: Bullish', defval: '#089981', inline: 'K2c', group: G3 },
  { id: 'cBearColorK2', type: 'color', title: 'Bearish', defval: '#f23645', inline: 'K2c', group: G3 },
  { id: 'msOnChart3', type: 'bool', title: 'Long Term Structures', defval: false, group: G3 },
  { id: 'msOnChartK3', type: 'string', title: '  Line', defval: 'Solid', options: STYLES, inline: 'K3', group: G3 },
  { id: 'stMSLblK3T', type: 'string', title: 'Labels', defval: 'Enabled', options: TOGGLE, inline: 'K3', group: G3 },
  { id: 'cBullColorK3', type: 'color', title: '  Colors: Bullish', defval: '#089981', inline: 'K3c', group: G3 },
  { id: 'cBearColorK3', type: 'color', title: 'Bearish', defval: '#f23645', inline: 'K3c', group: G3 },
  { id: 'msDataK1', type: 'bool', title: 'Short Term Oscillator', defval: false, inline: 'k1w', group: G4 },
  { id: 'msColorK1', type: 'color', title: '', defval: HALF_GRAY, inline: 'k1w', group: G4 },
  { id: 'msDataK2', type: 'bool', title: 'Intermediate Term Oscillator', defval: false, inline: 'k2w', group: G4 },
  { id: 'msColorK2', type: 'color', title: '', defval: HALF_GRAY, inline: 'k2w', group: G4 },
  { id: 'msDataK3', type: 'bool', title: 'Long Term Oscillator', defval: false, inline: 'k3w', group: G4 },
  { id: 'msColorK3', type: 'color', title: '', defval: HALF_GRAY, inline: 'k3w', group: G4 },
];

const MID_COLOR = String(color.new('#787b86', 50));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'OSC Top', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot1', title: 'Overbought Level', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot2', title: 'Equilibrium Level', color: MID_COLOR, lineWidth: 1 },
  { id: 'plot3', title: 'Oversold Level', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot4', title: 'OSC Bottom', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot5', title: 'Market Structure Oscillator', color: '#3179f5', lineWidth: 1 },
  { id: 'plot6', title: 'Short Term Oscillator', color: HALF_GRAY, lineWidth: 1 },
  { id: 'plot7', title: 'Intermediate Term Oscillator', color: HALF_GRAY, lineWidth: 1 },
  { id: 'plot8', title: 'Long Term Oscillator', color: HALF_GRAY, lineWidth: 1 },
];

export const metadata = {
  title: 'Market Structure Oscillator [LuxAlgo]',
  shortTitle: 'LuxAlgo - Market Structure Oscillator',
  overlay: false,
};

/** indicator(max_lines_count = 500, max_boxes_count = 500, max_labels_count = 500) */
const MAX_OBJECTS = 500;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const ge = (a: number, b: number) => a - b >= -EPS;

/** The last three swing points of one kind (SWINGS of the script) */
interface Swings {
  lastPrice: number;
  midPrice: number;
  prevPrice: number;
  lastIndex: number;
  midIndex: number;
  prevIndex: number;
  isCrossed: boolean;
}

const newSwings = (): Swings => ({
  lastPrice: NaN, midPrice: NaN, prevPrice: NaN, lastIndex: NaN, midIndex: NaN, prevIndex: NaN, isCrossed: false,
});

function updatePattern(s: Swings, price: number, index: number): void {
  s.isCrossed = false;
  s.prevPrice = s.midPrice;
  s.midPrice = s.lastPrice;
  s.lastPrice = price;
  s.prevIndex = s.midIndex;
  s.midIndex = s.lastIndex;
  s.lastIndex = index;
}

/** queryPatterns: the middle of three points is a swing high (or a swing low) */
function queryPatterns(lastPrice: number, midPrice: number, prevPrice: number, isSwingHigh: boolean): boolean {
  return isSwingHigh ? gt(midPrice, prevPrice) && ge(midPrice, lastPrice) : gt(prevPrice, midPrice) && ge(lastPrice, midPrice);
}

/** normalize() of the script without its SMA: one state per call */
function normalizer(): (close: number, buy: boolean, sell: boolean) => number {
  let os = 0;
  let prevOs = NaN;
  let max = NaN;
  let min = NaN;
  return (close, buy, sell) => {
    os = buy ? 1 : sell ? -1 : os;
    // math.max / math.min give na while max / min are na
    max = os > prevOs ? close : os < prevOs ? max : Number.isNaN(max) ? NaN : Math.max(close, max);
    min = os < prevOs ? close : os > prevOs ? min : Number.isNaN(min) ? NaN : Math.min(close, min);
    prevOs = os;
    return (close - min) / (max - min);
  };
}

/** The drawing count limit of Pine: above max + 5 objects of one kind the oldest are deleted until max remain */
function register<T>(list: T[], obj: T): void {
  list.push(obj);
  if (list.length > MAX_OBJECTS + 5) list.splice(0, list.length - MAX_OBJECTS);
}

export function calculate(bars: Bar[], inputs: Partial<MarketStructureOscillatorInputs> = {}): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const lineStyle = (s: LineStyleName) => (s === 'Dotted' ? 'dotted' : s === 'Dashed' ? 'dashed' : 'solid');

  const stLow = newSwings();
  const stHigh = newSwings();
  const itLow = newSwings();
  const itHigh = newSwings();
  const ltLow = newSwings();
  const ltHigh = newSwings();
  const msType = [0, 0, 0];

  const levels = [
    { on: cfg.msOnChart1, high: stHigh, low: stLow, style: lineStyle(cfg.msOnChartK1), labels: cfg.stMSLblK1T === 'Enabled', bull: cfg.cBullColorK1, bear: cfg.cBearColorK1 },
    { on: cfg.msOnChart2, high: itHigh, low: itLow, style: lineStyle(cfg.msOnChartK2), labels: cfg.stMSLblK2T === 'Enabled', bull: cfg.cBullColorK2, bear: cfg.cBearColorK2 },
    { on: cfg.msOnChart3, high: ltHigh, low: ltLow, style: lineStyle(cfg.msOnChartK3), labels: cfg.stMSLblK3T === 'Enabled', bull: cfg.cBullColorK3, bear: cfg.cBearColorK3 },
  ] as const;

  const lines: LineDrawingData[] = [];
  const boxes: BoxData[] = [];
  const labels: LabelData[] = [];

  const norm = [normalizer(), normalizer(), normalizer()];
  const raw: number[][] = [[], [], []];
  // cSwingHigh[1] / cSwingLow[1] of the two marketStructure() calls
  const prevSwing = [{ high: false, low: false }, { high: false, low: false }];

  /** marketStructure(): swings of a level from the swings of the level below; returns [bull, bear] */
  const marketStructure = (site: number, hHigh: Swings, hLow: Swings, lHigh: Swings, lLow: Swings, close: number, first: boolean) => {
    let bull = false;
    let bear = false;
    const cHigh = queryPatterns(lHigh.lastPrice, lHigh.midPrice, lHigh.prevPrice, true);
    // cSwingHigh != cSwingHigh[1]: na on the first bar
    if (cHigh && !first && cHigh !== prevSwing[site].high) {
      updatePattern(hHigh, lHigh.midPrice, lHigh.midIndex);
      hHigh.isCrossed = false;
    }
    if (gt(close, hHigh.lastPrice) && !hHigh.isCrossed) {
      hHigh.isCrossed = true;
      bull = true;
    }
    const cLow = queryPatterns(lLow.lastPrice, lLow.midPrice, lLow.prevPrice, false);
    if (cLow && !first && cLow !== prevSwing[site].low) {
      updatePattern(hLow, lLow.midPrice, lLow.midIndex);
      hLow.isCrossed = false;
    }
    if (gt(hLow.lastPrice, close) && !hLow.isCrossed) {
      hLow.isCrossed = true;
      bear = true;
    }
    prevSwing[site] = { high: cHigh, low: cLow };
    return [bull, bear] as const;
  };

  for (let i = 0; i < n; i++) {
    const bar = bars[i];
    const close = bar.close;

    // Market structures on the chart: they read the swings as they were after the bar before
    levels.forEach((lv, k) => {
      if (!lv.on) return;
      if (gt(close, lv.high.lastPrice) && !lv.high.isCrossed) {
        const x1 = bars[lv.high.lastIndex].time;
        const y = lv.high.lastPrice;
        register(lines, { time1: x1, price1: y, time2: bar.time, price2: y, color: lv.bull, style: lv.style, width: 1, forceOverlay: true });
        if (lv.labels) {
          register(boxes, {
            time1: x1, price1: y, time2: bar.time, price2: y, borderColor: 'transparent', text: msType[k] < 0 ? 'CHoCH' : 'BoS',
            textColor: lv.bull, textSize: 'tiny', textHAlign: 'left', textVAlign: 'bottom', forceOverlay: true,
          });
          msType[k] = 1;
        }
      }
      if (gt(lv.low.lastPrice, close) && !lv.low.isCrossed) {
        const x1 = bars[lv.low.lastIndex].time;
        const y = lv.low.lastPrice;
        register(lines, { time1: x1, price1: y, time2: bar.time, price2: y, color: lv.bear, style: lv.style, width: 1, forceOverlay: true });
        if (lv.labels) {
          register(boxes, {
            time1: x1, price1: y, time2: bar.time, price2: y, borderColor: 'transparent', text: msType[k] > 0 ? 'CHoCH' : 'BoS',
            textColor: lv.bear, textSize: 'tiny', textHAlign: 'left', textVAlign: 'top', forceOverlay: true,
          });
          msType[k] = -1;
        }
      }
    });

    // shortMarketStructure()
    let bull = false;
    let bear = false;
    if (i >= 2 && queryPatterns(bar.high, bars[i - 1].high, bars[i - 2].high, true)) {
      updatePattern(stHigh, bars[i - 1].high, i - 1);
      stHigh.isCrossed = false;
    }
    if (gt(close, stHigh.lastPrice) && !stHigh.isCrossed) {
      stHigh.isCrossed = true;
      bull = true;
    }
    if (i >= 2 && queryPatterns(bar.low, bars[i - 1].low, bars[i - 2].low, false)) {
      stLow.isCrossed = false;
      updatePattern(stLow, bars[i - 1].low, i - 1);
    }
    if (gt(stLow.lastPrice, close) && !stLow.isCrossed) {
      stLow.isCrossed = true;
      bear = true;
    }
    raw[0].push(norm[0](close, bull, bear));

    const [bull2, bear2] = marketStructure(0, itHigh, itLow, stHigh, stLow, close, i === 0);
    raw[1].push(norm[1](close, bull2, bear2));
    const [bull3, bear3] = marketStructure(1, ltHigh, ltLow, itHigh, itLow, close, i === 0);
    raw[2].push(norm[2](close, bull3, bear3));
  }

  // ta.sma((bar.close - min) / (max - min), smooth) * 100
  const st = raw.map((r) => A(ta.sma(S(r), cfg.normSmooth)).map((v) => v * 100));
  const weights = [cfg.msWeightK1, cfg.msWeightK2, cfg.msWeightK3];
  const msOSC = bars.map((_, i) => {
    let num = 0;
    let den = 0;
    for (let k = 0; k < 3; k++) {
      const v = st[k][i];
      // nz() and na() take an infinite value as na
      const isNa = !Number.isFinite(v);
      num += weights[k] * (isNa ? 0 : v);
      den += weights[k] * (isNa ? 0 : 1);
    }
    return num / den;
  });

  // cycleFast = cycleOpt ? msOSC - ta.ema(msOSC, cyc_Smooth) + 50 : 50
  const ema = cfg.cycleOpt ? A(ta.ema(S(msOSC), cfg.cycSmooth)) : [];
  const cycleFast = msOSC.map((v, i) => (cfg.cycleOpt ? v - ema[i] + 50 : 50));

  // Signals: a dot on the price chart when the oscillator (or the cycle) crosses 50
  const signals = (on: boolean, values: number[], bullColor: string, bearColor: string, i: number) => {
    if (!on || i === 0) return;
    const change = Math.sign(values[i] - 50) - Math.sign(values[i - 1] - 50);
    if (change > 0) {
      register(labels, { time: bars[i].time, price: bars[i].low, text: '⦁', color: 'transparent', textColor: bullColor, style: 'label_up', forceOverlay: true });
    }
    if (change < 0) {
      register(labels, { time: bars[i].time, price: bars[i].high, text: '⦁', color: 'transparent', textColor: bearColor, style: 'label_down', forceOverlay: true });
    }
  };

  const anyOsc = cfg.msOscShow || cfg.msDataK1 || cfg.msDataK2 || cfg.msDataK3;
  const level = (value: number) => bars.map((b) => ({ time: b.time, value: anyOsc ? value : NaN }));
  const component = (on: boolean, values: number[], col: string) =>
    bars.map((b, i) => ({ time: b.time, value: on && Number.isFinite(values[i]) ? values[i] : NaN, color: col }));
  const candles: PlotCandleData[] = [];
  const oscPlot: Array<{ time: number; value: number; color?: string }> = [];

  for (let i = 0; i < n; i++) {
    const v = msOSC[i];
    const shown = cfg.msOscShow && Number.isFinite(v);
    const col = color.from_gradient(v, 0, 100, cfg.msBearColor, cfg.msBullColor);
    oscPlot.push({ time: bars[i].time, value: shown ? v : NaN, ...(col ? { color: String(col) } : {}) });
    signals(cfg.oscSig, msOSC, cfg.oBullColor, cfg.oBearColor, i);
    // plotcandle(50., 50., 50., cycleFast, ...): no candle while the value is na
    const c = cycleFast[i];
    if (Number.isFinite(c)) {
      const body = gt(c, 50) ? cfg.cBullColor : cfg.cBearColor;
      candles.push({
        time: bars[i].time, open: 50, high: 50, low: 50, close: c, color: body, borderColor: cfg.cycleOpt ? body : '#787B86',
        wickColor: '#737375',
      });
    }
    signals(cfg.cycleSig, cycleFast, cfg.sBullColor, cfg.sBearColor, i);
  }

  const constant = <T>(v: T) => new Array<T>(n).fill(v);
  const bull0 = String(color.new(cfg.msBullColor, 0));
  const bull73 = String(color.new(cfg.msBullColor, 73));
  const bull100 = String(color.new(cfg.msBullColor, 100));
  const bear0 = String(color.new(cfg.msBearColor, 0));
  const bear73 = String(color.new(cfg.msBearColor, 73));
  const bear100 = String(color.new(cfg.msBearColor, 100));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: level(100),
      plot1: level(85),
      plot2: level(50).map((p) => ({ ...p, color: MID_COLOR })),
      plot3: level(15),
      plot4: level(0),
      plot5: oscPlot,
      plot6: component(cfg.msDataK1, st[0], cfg.msColorK1),
      plot7: component(cfg.msDataK2, st[1], cfg.msColorK2),
      plot8: component(cfg.msDataK3, st[2], cfg.msColorK3),
    },
    fills: [
      // Overbought Fill
      { plot1: 'plot0', plot2: 'plot1', gradient: { topValue: constant(100), bottomValue: constant(85), topColor: constant(bear100), bottomColor: constant(bear73) } },
      // Oversold Fill
      { plot1: 'plot3', plot2: 'plot4', gradient: { topValue: constant(15), bottomValue: constant(0), topColor: constant(bull73), bottomColor: constant(bull100) } },
      // Bullish Gradient Fill
      { plot1: 'plot5', plot2: 'plot2', gradient: { topValue: constant(100), bottomValue: constant(cfg.cycleOpt ? 60 : 50), topColor: constant(bull0), bottomColor: constant(bull100) } },
      // Bearish Gradient Fill
      { plot1: 'plot5', plot2: 'plot2', gradient: { topValue: constant(cfg.cycleOpt ? 40 : 50), bottomValue: constant(0), topColor: constant(bear100), bottomColor: constant(bear0) } },
    ],
    plotCandles: { cycleHistogram: candles },
    lines,
    boxes,
    labels,
  };
}

export const MarketStructureOscillator = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
