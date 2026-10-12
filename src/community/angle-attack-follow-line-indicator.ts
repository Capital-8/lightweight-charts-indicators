/**
 * Angle Attack Follow Line Indicator
 *
 * Follow line: when the close is above the upper Bollinger band (SMA +- stdev * deviations), the line moves up to
 * low - ATR (or the low without the ATR filter) and never down; below the lower band it moves down to high + ATR
 * (or the high) and never up; inside the bands it stays. The trend is up after a rise of the line and down after a
 * fall. The pane shows the angle of the line: atan((line - line[Angle Period]) / ATR(Angle ATR Period)) in
 * degrees, as a line and a histogram, blue in an up trend and red otherwise, with four angle levels.
 * A second follow line on a higher timeframe ("Resolution") uses a moving average of the chosen type as the band
 * centre and colours the background (blue up, red down); in the mode "FILTER HIGHER TIME FRAME" the labels need its
 * trend in the same direction. Labels: Buy / Sell on a trend change, "Add" when the angle comes back to 0 after a
 * rise / fall (1, 4 or 7 flat bars), "Red" (reduce) when the angle crosses the levels. Bars are coloured by the
 * trend of the follow line.
 *
 * Conditional ATR: the ATR of the band breaks is computed inside the two `if` blocks of the original, so each of
 * them averages the true range of the bars where its block runs only (one history per block).
 *
 * Higher timeframe: `security(syminfo.tickerid, Resolution, ...)` without lookahead: the bars of that timeframe are
 * built from the chart bars and a chart bar shows the values of the latest completed bar of the timeframe. Its
 * periods follow the exchange calendar of the chart context (time zone and session) when it is given, else the UTC
 * calendar and the bars (see src/anchor-period.ts). A resolution below the chart timeframe (e.g. the default "240"
 * on a daily chart) needs the bars of that lower timeframe, which the chart does not have: the port throws an Error
 * when the higher-timeframe line is used (background on, or the mode "FILTER HIGHER TIME FRAME"). The input "Bar
 * Color?" is not read by the original (the bars are always coloured), nor are the section header inputs.
 *
 * Reference: "Angle Attack Follow Line Indicator" by Dreadblitz
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Dreadblitz
 */

import {
  ta, taCore, math, Series, color, callsite, timeframe, mapToChart,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { BarColorData, BgColorData, MarkerData } from '../types';
import { chartTimeframe, higherTimeframeBars } from '../anchor-period';
import type { ChartContext } from '../chart-context';

type MaType = 'RMA' | 'SMA' | 'EMA' | 'WMA' | 'VWMA' | 'SMMA' | 'KMA' | 'TMA' | 'HullMA' | 'DEMA' | 'TEMA' | 'CTI';
type SourceName = 'open' | 'high' | 'low' | 'close' | 'hl2' | 'hlc3' | 'ohlc4' | 'volume';
const NO_FILTER = 'NO FILTER HIGHER TIME FRAME';
const FILTER = 'FILTER HIGHER TIME FRAME';

export interface AngleAttackFollowLineIndicatorInputs {
  /** Section header (not read by the script) */
  fl: boolean;
  bbPeriod: number;
  bbDeviations: number;
  useAtrFilter: boolean;
  atrPeriod: number;
  /** Section header (not read by the script) */
  flh: boolean;
  /** Background coloured by the higher-timeframe trend */
  aib: boolean;
  maType: MaType;
  /** Resolution of the higher-timeframe follow line */
  res: string;
  len: number;
  bbDeviationsHtf: number;
  atrPeriodHtf: number;
  source: SourceName;
  /** Section header (not read by the script) */
  md: boolean;
  mode: typeof NO_FILTER | typeof FILTER;
  /** Section header (not read by the script) */
  ac: boolean;
  angleLookback: number;
  angleAtrPeriod: number;
  /** Section header (not read by the script) */
  bsa: boolean;
  buy0: boolean;
  sell0: boolean;
  /** Section header (not read by the script) */
  ota: boolean;
  addBuy0: boolean;
  addSell0: boolean;
  addBuy1: boolean;
  addSell1: boolean;
  addBuy2: boolean;
  addSell2: boolean;
  /** Section header (not read by the script) */
  otr: boolean;
  maxLevel1: number;
  maxLevel2: number;
  minLevel1: number;
  minLevel2: number;
  redBuy0: boolean;
  redBuy1: boolean;
  redBuy2: boolean;
  redBuy3: boolean;
  redBuy4: boolean;
  redSell0: boolean;
  redSell1: boolean;
  redSell2: boolean;
  redSell3: boolean;
  redSell4: boolean;
  /** Section header (not read by the script) */
  oth: boolean;
  /** Not read by the script: the bars are always coloured */
  barColor: boolean;
  hideLabels: boolean;
}

export const defaultInputs: AngleAttackFollowLineIndicatorInputs = {
  fl: true,
  bbPeriod: 21,
  bbDeviations: 1.0,
  useAtrFilter: true,
  atrPeriod: 5,
  flh: true,
  aib: true,
  maType: 'SMA',
  res: '240',
  len: 21,
  bbDeviationsHtf: 1.0,
  atrPeriodHtf: 5,
  source: 'close',
  md: true,
  mode: NO_FILTER,
  ac: true,
  angleLookback: 8,
  angleAtrPeriod: 10,
  bsa: true,
  buy0: true,
  sell0: true,
  ota: true,
  addBuy0: true,
  addSell0: true,
  addBuy1: false,
  addSell1: false,
  addBuy2: false,
  addSell2: false,
  otr: true,
  maxLevel1: 40,
  maxLevel2: 65,
  minLevel1: -40,
  minLevel2: -65,
  redBuy0: true,
  redBuy1: true,
  redBuy2: false,
  redBuy3: true,
  redBuy4: false,
  redSell0: true,
  redSell1: true,
  redSell2: false,
  redSell3: true,
  redSell4: false,
  oth: true,
  barColor: true,
  hideLabels: false,
};

const MA_TYPES: MaType[] = ['RMA', 'SMA', 'EMA', 'WMA', 'VWMA', 'SMMA', 'KMA', 'TMA', 'HullMA', 'DEMA', 'TEMA', 'CTI'];

export const inputConfig: InputConfig[] = [
  { id: 'fl', type: 'bool', title: '🔰🔰🔰🔰 FOLLOW LINE CURRENT CHART RESOLUTION 🔰🔰🔰🔰', defval: true },
  { id: 'bbPeriod', type: 'int', title: 'Period', defval: 21, min: 1 },
  { id: 'bbDeviations', type: 'float', title: 'Deviations', defval: 1.0, min: 0.1, step: 0.05 },
  { id: 'useAtrFilter', type: 'bool', title: 'ATR Filter', defval: true },
  { id: 'atrPeriod', type: 'int', title: 'ATR Period', defval: 5, min: 1 },
  { id: 'flh', type: 'bool', title: '🔰🔰🔰🔰🔰 FOLLOW LINE HIGHER TIME FRAME 🔰🔰🔰🔰🔰', defval: true },
  { id: 'aib', type: 'bool', title: 'Activate Indicator Background', defval: true },
  { id: 'maType', type: 'string', title: 'Type Of MA', defval: 'SMA', options: MA_TYPES },
  { id: 'res', type: 'timeframe', title: 'Resolution', defval: '240' },
  { id: 'len', type: 'int', title: 'Period', defval: 21 },
  { id: 'bbDeviationsHtf', type: 'float', title: 'Deviations', defval: 1.0, min: 0.1, step: 0.05 },
  { id: 'atrPeriodHtf', type: 'int', title: 'ATR Period', defval: 5, min: 1 },
  { id: 'source', type: 'source', title: 'Source', defval: 'close' },
  { id: 'md', type: 'bool', title: '🔰🔰🔰🔰🔰🔰🔰🔰🔰🔰🔰 MODE 🔰🔰🔰🔰🔰🔰🔰🔰🔰🔰🔰🔰', defval: true },
  { id: 'mode', type: 'string', title: 'Type Of Mode', defval: NO_FILTER, options: [NO_FILTER, FILTER] },
  { id: 'ac', type: 'bool', title: '🔰🔰🔰🔰🔰🔰🔰🔰 ANGLE CONFIGURATION 🔰🔰🔰🔰🔰🔰🔰', defval: true },
  { id: 'angleLookback', type: 'int', title: 'Angle Period', defval: 8, min: 1 },
  { id: 'angleAtrPeriod', type: 'int', title: 'ATR Period', defval: 10, min: 1 },
  { id: 'bsa', type: 'bool', title: '🔰🔰🔰🔰🔰🔰🔰🔰🔰🔰 BUY/SELL 🔰🔰🔰🔰🔰🔰🔰🔰🔰🔰', defval: true },
  { id: 'buy0', type: 'bool', title: 'Buy Change Follow Line', defval: true },
  { id: 'sell0', type: 'bool', title: 'Sell Change Follow Line', defval: true },
  { id: 'ota', type: 'bool', title: '🔰🔰🔰🔰🔰🔰🔰🔰🔰 OPTIONS TO ADD 🔰🔰🔰🔰🔰🔰🔰🔰', defval: true },
  { id: 'addBuy0', type: 'bool', title: 'Option 1 to Add Buy', defval: true },
  { id: 'addSell0', type: 'bool', title: 'Option 1 to Add Sell', defval: true },
  { id: 'addBuy1', type: 'bool', title: 'Option 2 to Add Buy', defval: false },
  { id: 'addSell1', type: 'bool', title: 'Option 2 to Add Sell', defval: false },
  { id: 'addBuy2', type: 'bool', title: 'Option 3 to Add Buy', defval: false },
  { id: 'addSell2', type: 'bool', title: 'Option 3 to Add Sell', defval: false },
  { id: 'otr', type: 'bool', title: '🔰🔰🔰🔰🔰🔰🔰🔰 OPTIONS TO REDUCE 🔰🔰🔰🔰🔰🔰🔰🔰', defval: true },
  { id: 'maxLevel1', type: 'int', title: 'Max Angle Level 1', defval: 40, min: 1 },
  { id: 'maxLevel2', type: 'int', title: 'Max Angle Level 2', defval: 65, min: 1 },
  { id: 'minLevel1', type: 'int', title: 'Min Angle Level 1', defval: -40, min: -100 },
  { id: 'minLevel2', type: 'int', title: 'Min Angle Level 2', defval: -65, min: -100 },
  { id: 'redBuy0', type: 'bool', title: 'Option 1 to Reduce Buy Max Angle Level 1', defval: true },
  { id: 'redBuy1', type: 'bool', title: 'Option 2 to Reduce Buy Max Angle Level 2', defval: true },
  { id: 'redBuy2', type: 'bool', title: 'Option 3 to Reduce Buy 2 Bars Above Max Angle Level 2', defval: false },
  { id: 'redBuy3', type: 'bool', title: 'Option 4 to Reduce Buy 3 Bars Above Max Angle Level 2', defval: true },
  { id: 'redBuy4', type: 'bool', title: 'Option 5 to Reduce Buy 4 Bars Above Max Angle Level 2', defval: false },
  { id: 'redSell0', type: 'bool', title: 'Option 1 to Reduce Sell Min Angle Level 1', defval: true },
  { id: 'redSell1', type: 'bool', title: 'Option 2 to Reduce Sell Min Angle Level 1', defval: true },
  { id: 'redSell2', type: 'bool', title: 'Option 3 to Reduce Sell 2 bars Below Min Angle Level 2', defval: false },
  { id: 'redSell3', type: 'bool', title: 'Option 4 to Reduce Sell 3 bars Below Min Angle Level 2', defval: true },
  { id: 'redSell4', type: 'bool', title: 'Option 5 to Reduce Sell 4 bars Below Min Angle Level 2', defval: false },
  { id: 'oth', type: 'bool', title: '🔰🔰🔰🔰🔰🔰🔰🔰🔰🔰 OTHERS 🔰🔰🔰🔰🔰🔰🔰🔰🔰🔰🔰', defval: true },
  { id: 'barColor', type: 'bool', title: 'Bar Color?', defval: true },
  { id: 'hideLabels', type: 'bool', title: 'Hide Labels', defval: false },
];

/** Version 4 colours */
const BLUE = '#2196F3';
const RED = '#FF5252';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Angle Follow Line', color: BLUE, lineWidth: 3 },
  { id: 'plot1', title: 'Angle Follow Line Histogram', color: BLUE, lineWidth: 3, style: 'histogram' },
];

export const metadata = {
  title: 'Angle Attack Follow Line Indicator ',
  shortTitle: 'AAFLI',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const eq = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(Math.abs(a - b) > EPS);

/** Source values of a list of bars */
function sourceOf(bars: ReadonlyArray<Bar>, name: SourceName): number[] {
  return bars.map((b) => {
    switch (name) {
      case 'open': return b.open;
      case 'high': return b.high;
      case 'low': return b.low;
      case 'hl2': return (b.high + b.low) / 2;
      case 'hlc3': return (b.high + b.low + b.close) / 3;
      case 'ohlc4': return (b.open + b.high + b.low + b.close) / 4;
      case 'volume': return b.volume ?? NaN;
      default: return b.close;
    }
  });
}

/** ma(smoothing, src, length) of the original, on the bars of the timeframe */
function movingAverage(type: MaType, src: number[], bars: Bar[], length: number): number[] {
  const n = src.length;
  switch (type) {
    case 'RMA': return taCore.rma(src, length);
    case 'SMA': return taCore.sma(src, length);
    case 'EMA': return taCore.ema(src, length);
    case 'WMA': return taCore.wma(src, length);
    case 'VWMA': return taCore.vwma(src, length, bars.map((b) => b.volume ?? NaN));
    case 'SMMA': {
      // smma := na(smma[1]) ? sma(src, len) : (smma[1] * (len - 1) + src) / len
      const sma = taCore.sma(src, length);
      const out: number[] = new Array(n);
      for (let i = 0; i < n; i++) {
        const prev = i > 0 ? out[i - 1] : NaN;
        out[i] = isNaN(prev) ? sma[i] : (prev * (length - 1) + src[i]) / length;
      }
      return out;
    }
    case 'HullMA': {
      const half = taCore.wma(src, length / 2);
      const full = taCore.wma(src, length);
      return taCore.wma(half.map((h, i) => 2 * h - full[i]), Math.round(Math.sqrt(length)));
    }
    case 'KMA': {
      const noise = src.map((x, i) => (i > 0 ? Math.abs(x - src[i - 1]) : NaN));
      const nnoise = math.sum(noise, length) as number[];
      const out: number[] = new Array(n);
      for (let i = 0; i < n; i++) {
        const nsignal = Math.abs(src[i] - (i >= length ? src[i - length] : NaN));
        // iff(nnoise != 0, nsignal / nnoise, 0): na != 0 is false
        const nefratio = !isNaN(nnoise[i]) && Math.abs(nnoise[i]) > EPS ? nsignal / nnoise[i] : 0;
        const nsmooth = Math.pow(nefratio * (0.666 - 0.0645) + 0.0645, 2);
        const prev = i > 0 && !isNaN(out[i - 1]) ? out[i - 1] : 0;
        out[i] = prev + nsmooth * (src[i] - prev);
      }
      return out;
    }
    case 'TMA': {
      const close = bars.map((b) => b.close);
      return taCore.sma(taCore.sma(close, length), length);
    }
    case 'DEMA': {
      const e = taCore.ema(src, length);
      const e2 = taCore.ema(e, length);
      return e.map((v, i) => 2 * v - e2[i]);
    }
    case 'TEMA': {
      const e1 = taCore.ema(src, length);
      const e2 = taCore.ema(e1, length);
      const e3 = taCore.ema(e2, length);
      return e1.map((v, i) => 3 * v - 3 * e2[i] + e3[i]);
    }
    case 'CTI': {
      // cti(sm, src, cd) with cd = 0
      const cd = 0.0;
      const di = (length - 1.0) / 2.0 + 1.0;
      const c1 = 2 / (di + 1.0);
      const c2 = 1 - c1;
      const c3 = 3.0 * (cd * cd + cd * cd * cd);
      const c4 = -3.0 * (2.0 * cd * cd + cd + cd * cd * cd);
      const c5 = 3.0 * cd + 1.0 + cd * cd * cd + 3.0 * cd * cd;
      const z = (v: number) => (isNaN(v) ? 0 : v);
      const out: number[] = new Array(n);
      let i1 = NaN;
      let i2 = NaN;
      let i3 = NaN;
      let i4 = NaN;
      let i5 = NaN;
      let i6 = NaN;
      for (let i = 0; i < n; i++) {
        i1 = c1 * src[i] + c2 * z(i1);
        i2 = c1 * i1 + c2 * z(i2);
        i3 = c1 * i2 + c2 * z(i3);
        i4 = c1 * i3 + c2 * z(i4);
        i5 = c1 * i4 + c2 * z(i5);
        i6 = c1 * i5 + c2 * z(i6);
        out[i] = -cd * cd * cd * i6 + c3 * i5 + c4 * i4 + c5 * i3;
      }
      return out;
    }
    default: return src.slice();
  }
}

/**
 * Follow line and trend of the original: `signal` 1 above the upper band, -1 below the lower band, 0 inside;
 * `up` / `down` give the new level of a band break (na keeps the na level, as the original).
 */
function followLine(
  n: number,
  signal: (i: number) => number,
  up: (i: number) => number,
  down: (i: number) => number,
): { line: number[]; trend: number[] } {
  const line: number[] = new Array(n);
  const trend: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const prev = i > 0 ? line[i - 1] : NaN;
    const s = signal(i);
    let v = 0.0;
    if (s === 1) {
      v = up(i);
      if (lt(v, prev)) v = prev;
    } else if (s === -1) {
      v = down(i);
      if (gt(v, prev)) v = prev;
    } else {
      v = prev;
    }
    line[i] = v;
    let t = i > 0 ? trend[i - 1] : NaN;
    if (gt(v, prev)) t = 1;
    if (lt(v, prev)) t = -1;
    trend[i] = t;
  }
  return { line, trend };
}

export function calculate(
  bars: Bar[],
  inputs: Partial<AngleAttackFollowLineIndicatorInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers' | 'barColors' | 'bgColors'> & {
  markers: MarkerData[]; barColors: BarColorData[]; bgColors: BgColorData[];
} {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const close = bars.map((b) => b.close);
  const filterMode = cfg.mode === FILTER;
  const noFilterMode = cfg.mode === NO_FILTER;

  // FOLLOW LINE (chart timeframe)
  const basis = A(ta.sma(S(close), cfg.bbPeriod));
  const dev = A(ta.stdev(S(close), cfg.bbPeriod));
  const bbSignal = close.map((c, i) => {
    const upper = basis[i] + dev[i] * cfg.bbDeviations;
    const lower = basis[i] - dev[i] * cfg.bbDeviations;
    return gt(c, upper) ? 1 : lt(c, lower) ? -1 : 0;
  });
  // atr(ATRperiod) inside `if BBSignal == 1` / `if BBSignal == -1`: one history per block (the bars where it runs)
  const tr = bars.map((b, i) => (i === 0 ? b.high - b.low
    : Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close))));
  const atrWhen = (sig: number) => callsite.whenCalled(
    bbSignal.map((s) => cfg.useAtrFilter && s === sig), (x) => taCore.rma(x, cfg.atrPeriod), tr,
  ) as number[];
  const atrUp = atrWhen(1);
  const atrDown = atrWhen(-1);
  const fl = followLine(
    n,
    (i) => bbSignal[i],
    (i) => (cfg.useAtrFilter ? bars[i].low - atrUp[i] : bars[i].low),
    (i) => (cfg.useAtrFilter ? bars[i].high + atrDown[i] : bars[i].high),
  );
  const trendLine = fl.line;
  const iTrend = fl.trend;

  // FOLLOW LINE HIGHER TIME FRAME (only read by the background and the "FILTER HIGHER TIME FRAME" mode)
  let iTrendHtf: number[] = new Array(n).fill(NaN);
  if (cfg.aib || filterMode) {
    const chartTf = chartTimeframe(bars, chart);
    let htf: Bar[] = bars;
    let toChart = (values: number[]) => values;
    if (cfg.res.trim() !== '' && chartTf !== '' && timeframe.in_seconds(cfg.res) !== timeframe.in_seconds(chartTf)) {
      if (timeframe.in_seconds(cfg.res) < timeframe.in_seconds(chartTf)) {
        throw new Error(`Angle Attack Follow Line Indicator: the resolution "${cfg.res}" is lower than the chart timeframe "${chartTf}": the chart bars do not have that data (switch off the background, or choose a resolution equal to or above the chart timeframe)`);
      }
      // security(syminfo.tickerid, RES, ...) without lookahead: the latest completed bar of the timeframe
      const sec = higherTimeframeBars(bars, cfg.res, chart);
      htf = sec.htf;
      toChart = (values) => mapToChart(values, sec.group, sec.latest, false, false);
    }
    const maMtf = toChart(movingAverage(cfg.maType, sourceOf(htf, cfg.source), htf, cfg.len));
    const closeH = toChart(htf.map((b) => b.close));
    const lowH = toChart(htf.map((b) => b.low));
    const highH = toChart(htf.map((b) => b.high));
    const atrH = toChart(A(ta.atr(htf, cfg.atrPeriodHtf)));
    const devH = A(ta.stdev(S(closeH), cfg.len));
    const flH = followLine(
      n,
      (i) => {
        const upper = maMtf[i] + devH[i] * cfg.bbDeviationsHtf;
        const lower = maMtf[i] - devH[i] * cfg.bbDeviationsHtf;
        return gt(closeH[i], upper) ? 1 : lt(closeH[i], lower) ? -1 : 0;
      },
      (i) => lowH[i] - atrH[i],
      (i) => highH[i] + atrH[i],
    );
    iTrendHtf = flH.trend;
  }

  // ANGLE FL
  const rad2degree = 180 / 3.14159265359;
  const atrAngle = A(ta.atr(bars, cfg.angleAtrPeriod));
  const lb = cfg.angleLookback;
  const angle = trendLine.map((v, i) => rad2degree * Math.atan((v - (i >= lb ? trendLine[i - lb] : NaN)) / atrAngle[i]));
  const ang = (i: number, k: number) => (i - k >= 0 ? angle[i - k] : NaN);

  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const bgColors: BgColorData[] = [];
  const plot0: Array<{ time: number; value: number; color: string }> = [];
  const plot1: Array<{ time: number; value: number; color: string }> = [];
  const bgBlue = String(color.new(BLUE, 70));
  const bgRed = String(color.new(RED, 70));
  const { maxLevel1: max1, maxLevel2: max2, minLevel1: min1, minLevel2: min2 } = cfg;

  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const a = angle[i];
    const trend = iTrend[i];
    const prevTrend = i > 0 ? iTrend[i - 1] : NaN;
    const htfUp = eq(iTrendHtf[i], 1);
    const htfDown = eq(iTrendHtf[i], -1);
    const up = gt(trend, 0);
    const down = lt(trend, 0);
    /** the angle k bars back is 0 for k = 0 .. m - 1 and the angle m bars back is above (dir 1) / below (-1) 0 */
    const flatAfter = (m: number, dir: number) => {
      const first = ang(i, m);
      if (!(dir > 0 ? gt(first, 0) : lt(first, 0))) return false;
      for (let k = 0; k < m; k++) if (!eq(ang(i, k), 0)) return false;
      return true;
    };
    /** angle m bars back on one side of the level and the angles of the last m bars beyond it */
    const beyond = (m: number, level: number, dir: number) => {
      const first = ang(i, m);
      if (!(dir > 0 ? lt(first, level) : gt(first, level))) return false;
      for (let k = 0; k < m; k++) if (!(dir > 0 ? gt(ang(i, k), level) : lt(ang(i, k), level))) return false;
      return true;
    };

    // BUY / SELL
    const change = (dir: number) => (dir > 0 ? lt(prevTrend, 0) && gt(trend, 0) : gt(prevTrend, 0) && lt(trend, 0));
    const buy0 = change(1) && cfg.buy0 && noFilterMode;
    const sell0 = change(-1) && cfg.sell0 && noFilterMode;
    const buy0A = change(1) && cfg.buy0 && filterMode && htfUp;
    const sell0A = change(-1) && cfg.sell0 && filterMode && htfDown;

    // ADD
    const addBuy1 = flatAfter(2, 1) && up && cfg.addBuy0 && noFilterMode;
    const addSell1 = flatAfter(2, -1) && down && cfg.addSell0 && noFilterMode;
    const addBuy2 = flatAfter(5, 1) && up && cfg.addBuy1 && noFilterMode;
    const addSell2 = flatAfter(5, -1) && down && cfg.addSell1 && noFilterMode;
    const addBuy3 = flatAfter(8, 1) && up && cfg.addBuy2 && noFilterMode;
    const addSell3 = flatAfter(8, -1) && down && cfg.addSell2 && noFilterMode;
    const addBuy1A = flatAfter(2, 1) && up && cfg.addBuy0 && filterMode && htfUp;
    const addSell1A = flatAfter(2, -1) && down && cfg.addSell0 && filterMode && htfDown;
    // the options 2 and 3 of the filter mode do not test the chart trend (as the original)
    const addBuy2A = flatAfter(5, 1) && filterMode && htfUp && cfg.addBuy1;
    const addSell2A = flatAfter(5, -1) && filterMode && htfDown && cfg.addSell1;
    const addBuy3A = flatAfter(8, 1) && filterMode && htfUp && cfg.addBuy2;
    const addSell3A = flatAfter(8, -1) && filterMode && htfDown && cfg.addSell2;

    // REDUCE (the "_A" versions add the higher-timeframe trend)
    const modeOk = (dir: number) => noFilterMode || (filterMode && (dir > 0 ? htfUp : htfDown));
    const reduBuy = [
      beyond(1, max1, 1) && cfg.redBuy0,
      beyond(1, max2, 1) && cfg.redBuy1,
      beyond(2, max2, 1) && cfg.redBuy2,
      beyond(3, max2, 1) && cfg.redBuy3,
      beyond(4, max2, 1) && cfg.redBuy4,
    ].map((c) => c && modeOk(1));
    const reduSell = [
      beyond(1, min1, -1) && cfg.redSell0,
      beyond(1, min2, -1) && cfg.redSell1,
      beyond(2, min2, -1) && cfg.redSell2,
      beyond(3, min2, -1) && cfg.redSell3,
      beyond(4, min2, -1) && cfg.redSell4,
    ].map((c) => c && modeOk(-1));

    // PLOTS
    const lineColor = up ? BLUE : RED;
    const value = Number.isFinite(a) ? a : NaN;
    plot0.push({ time: t, value, color: lineColor });
    plot1.push({ time: t, value, color: lineColor });

    if (!cfg.hideLabels) {
      const mark = (id: string, price: number, sell: boolean, col: string, text: string) => {
        if (!Number.isFinite(price)) return;
        markers.push({
          time: t, position: sell ? 'atPriceTop' : 'atPriceBottom', price, shape: sell ? 'labelDown' : 'labelUp',
          color: col, text, textColor: '#FFFFFF', size: 'tiny', id,
        });
      };
      if (sell0 || sell0A) mark('Sell', 5, true, RED, 'Sell');
      if (buy0 || buy0A) mark('Buy', -5, false, BLUE, 'Buy');
      if (addSell1 || addSell1A || addSell2 || addSell3 || addSell2A || addSell3A) mark('Add Sell 1', a + 5, true, RED, 'Add');
      if (addBuy1 || addBuy1A || addBuy2 || addBuy3 || addBuy2A || addBuy3A) mark('Add Buy 1', a - 5, false, BLUE, 'Add');
      reduBuy.forEach((c, k) => {
        if (c) mark(`Reduce Buy ${k + 1}`, a + 5, true, BLUE, 'Red');
      });
      reduSell.forEach((c, k) => {
        if (c) mark(`Reduce Sell ${k + 1}`, a - 5, false, RED, 'Red');
      });
    }

    // bgcolor(iTrend_ > 0 and AIB ? color.blue : iTrend_ < 0 and AIB ? color.red : na, transp = 70)
    if (cfg.aib && gt(iTrendHtf[i], 0)) bgColors.push({ time: t, color: bgBlue });
    else if (cfg.aib && lt(iTrendHtf[i], 0)) bgColors.push({ time: t, color: bgRed });
    barColors.push({ time: t, color: lineColor });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1 },
    hlines: [
      { value: max1, options: { title: 'Max Angle Level 1', color: BLUE, linestyle: 'dotted', linewidth: 1 } },
      { value: max2, options: { title: 'Max Angle Level 2', color: BLUE, linestyle: 'dotted', linewidth: 1 } },
      { value: min1, options: { title: 'Min Angle Level 1', color: RED, linestyle: 'dotted', linewidth: 1 } },
      { value: min2, options: { title: 'Min Angle Level 2', color: RED, linestyle: 'dotted', linewidth: 1 } },
    ],
    markers,
    barColors,
    bgColors,
  };
}

export const AngleAttackFollowLineIndicator = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
