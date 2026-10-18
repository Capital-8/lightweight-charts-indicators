/**
 * Targets For Many Indicators [LuxAlgo]
 *
 * Two independent target setups. Each compares a Source A with a Source B (an external source, a fixed value or one
 * of 44 indicators, with its settings typed as numbers separated by commas, e.g. "10,3" for a Supertrend of ATR
 * length 10 and factor 3). When the condition is met (Source A crosses over / under / crosses / equals Source B), a
 * new target is set at the close plus (long) or minus (short) a distance: a currency amount, a percentage (the
 * original adds the close to it), a number of 50-bar ATRs, a number of ticks or an external value times the input.
 * The target is drawn as a vertical line from the close to the target and a horizontal line that is extended bar by
 * bar until the high (low for a short target; the close without "Evaluate Wicks") goes beyond it; a "Target" label
 * follows the end of the line and takes the full target colour when the target is reached. Options: wait until the
 * current target is reached before a new one, and a new target as soon as one is reached. Candles take the colour of
 * the latest new target until a target is reached. A dashboard counts the targets and the reached ones; invalid
 * settings are listed in it. Optional plots of the two sources (not for the oscillator-type sources).
 * Alerts (alertcondition, `alerts` of the result): 'Target 1 New', 'Target 1 Reached', 'Target 2 New' and 'Target 2
 * Reached', true on the bars on which a target is set / reached.
 *
 * Indicator rules of the original: EMA, DEMA, TEMA, the Keltner channel and MACD use an EMA seeded with the SMA of
 * the bar before; RMA and ATR start with an SMA; RSI and Supertrend use their own running averages; LINREG uses
 * x = 2 .. length + 1. "VWAP" restarts each trading day: on daily and higher bars on every bar (the close); on
 * intraday bars it needs the exchange time zone and session of the chart context (third argument) and throws an Error
 * without them.
 *
 * Chart values read: the symbol tick (`syminfo.mintick`: "Ticks" distance and the label tooltips) and, for the
 * "VWAP" source on intraday bars, the time zone and session.
 *
 * Reference: "Targets For Many Indicators [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import {
  taCore, getSourceSeries, color, str, math, line, label, table, resetDrawings, setDrawingBar, drawingOutputs,
  timeframe,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type Label, type Line, type SourceType,
} from 'oakscriptjs';
import { executeScript, ta as scriptTa, close as scriptClose } from 'oakscriptjs/script';
import type { BarColorData, LabelData, LineDrawingData, TableData } from '../types';
import { chartTimeframe, hasCalendar } from '../anchor-period';
import { mintickOf, type ChartContext } from '../chart-context';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Target 1 New', message: 'Target 1 New' },
  { id: 'alert1', title: 'Target 1 Reached', message: 'Target 1 Reached' },
  { id: 'alert2', title: 'Target 2 New', message: 'Target 2 New' },
  { id: 'alert3', title: 'Target 2 Reached', message: 'Target 2 Reached' },
];

const SOURCES_A = ['External', 'ACCDIST', 'ATR', 'BB Middle', 'BB Upper', 'BB Lower', 'CCI', 'CMO', 'COG', 'DC High',
  'DC Mid', 'DC Low', 'DEMA', 'EMA', 'HMA', 'III', 'KC Middle', 'KC Upper', 'KC Lower', 'LINREG', 'MACD', 'MACD-signal',
  'MACD-histogram', 'MEDIAN', 'MFI', 'MODE', 'MOM', 'NVI', 'OBV', 'PVI', 'PVT', 'RMA', 'ROC', 'RSI', 'SMA', 'STOCH',
  'Supertrend', 'TEMA', 'VWAP', 'VWMA', 'WAD', 'WMA', 'WVAD', '%R'];
const SOURCES_B = ['External', 'Value', ...SOURCES_A.slice(1)];
const CONDITIONS = ['CrossOver', 'CrossUnder', 'Cross', 'Equal'];
const STYLES = ['──', '- - -', '· · ·'];
const DISTANCES = ['Currencies', '%', 'ATR', 'Ticks', 'External Value'];

type Condition = 'CrossOver' | 'CrossUnder' | 'Cross' | 'Equal';
type Distance = 'Currencies' | '%' | 'ATR' | 'Ticks' | 'External Value';

export interface TargetsForManyIndicatorsInputs {
  showLabels: boolean;
  candleColoring: boolean;
  enableTarget1: boolean;
  isLong1: boolean;
  /** Fixed "Source A" text of the condition line (no effect) */
  target1RuleA: string;
  target1Condition: Condition;
  /** Fixed "Source B" text of the condition line (no effect) */
  target1RuleB: string;
  targetSource1A: string;
  targetExternal1A: SourceType;
  targetTiSettings1A: string;
  targetSource1B: string;
  targetExternal1B: SourceType;
  targetTiSettings1B: string;
  targetValue1B: number;
  target1Css: string;
  target1Style: string;
  showSource1: boolean;
  waitTarget1: boolean;
  newTarget1: boolean;
  useWicks1: boolean;
  distTarget1: number;
  distOptions1: Distance;
  externalDist1: SourceType;
  enableTarget2: boolean;
  isLong2: boolean;
  target2RuleA: string;
  target2Condition: Condition;
  target2RuleB: string;
  targetSource2A: string;
  targetExternal2A: SourceType;
  targetTiSettings2A: string;
  targetSource2B: string;
  targetExternal2B: SourceType;
  targetTiSettings2B: string;
  targetValue2B: number;
  target2Css: string;
  target2Style: string;
  showSource2: boolean;
  waitTarget2: boolean;
  newTarget2: boolean;
  useWicks2: boolean;
  distTarget2: number;
  distOptions2: Distance;
  externalDist2: SourceType;
  showDash: boolean;
  dashLoc: 'Top Right' | 'Bottom Right' | 'Bottom Left';
  textSize: 'Tiny' | 'Small' | 'Normal';
}

export const defaultInputs: TargetsForManyIndicatorsInputs = {
  showLabels: true,
  candleColoring: true,
  enableTarget1: true,
  isLong1: true,
  target1RuleA: 'Source A',
  target1Condition: 'CrossOver',
  target1RuleB: 'Source B',
  targetSource1A: 'External',
  targetExternal1A: 'close',
  targetTiSettings1A: '',
  targetSource1B: 'Supertrend',
  targetExternal1B: 'open',
  targetTiSettings1B: '10,3',
  targetValue1B: 0,
  target1Css: '#089981',
  target1Style: '- - -',
  showSource1: false,
  waitTarget1: false,
  newTarget1: false,
  useWicks1: true,
  distTarget1: 3,
  distOptions1: 'ATR',
  externalDist1: 'close',
  enableTarget2: true,
  isLong2: false,
  target2RuleA: 'Source A',
  target2Condition: 'CrossUnder',
  target2RuleB: 'Source B',
  targetSource2A: 'External',
  targetExternal2A: 'close',
  targetTiSettings2A: '',
  targetSource2B: 'Supertrend',
  targetExternal2B: 'open',
  targetTiSettings2B: '10,3',
  targetValue2B: 0,
  target2Css: '#f23645',
  target2Style: '- - -',
  showSource2: false,
  waitTarget2: false,
  newTarget2: false,
  useWicks2: true,
  distTarget2: 3,
  distOptions2: 'ATR',
  externalDist2: 'close',
  showDash: true,
  dashLoc: 'Top Right',
  textSize: 'Normal',
};

function targetInputs(k: 1 | 2): InputConfig[] {
  const d = defaultInputs as unknown as Record<string, unknown>;
  const g = `Target ${k}`;
  const gl = `Target ${k} Logic`;
  const def = (id: string) => d[id];
  return [
    { id: `enableTarget${k}`, type: 'bool', title: 'Enable Target', defval: def(`enableTarget${k}`), inline: 'enable', group: g },
    { id: `isLong${k}`, type: 'bool', title: 'Long Position Target', defval: def(`isLong${k}`), inline: 'enable', group: g },
    { id: `target${k}RuleA`, type: 'string', title: 'New Target Condition', defval: 'Source A', options: ['Source A'], inline: `targetRule${k}`, group: g },
    { id: `target${k}Condition`, type: 'string', title: '', defval: def(`target${k}Condition`), options: CONDITIONS, inline: `targetRule${k}`, group: g },
    { id: `target${k}RuleB`, type: 'string', title: '', defval: 'Source B', options: ['Source B'], inline: `targetRule${k}`, group: g },
    { id: `targetSource${k}A`, type: 'string', title: 'Source A', defval: 'External', options: SOURCES_A, inline: 'A', group: g },
    { id: `targetExternal${k}A`, type: 'source', title: 'External', defval: 'close', inline: 'A', group: g },
    { id: `targetTiSettings${k}A`, type: 'string', title: 'Settings', defval: '', inline: 'A', group: g },
    { id: `targetSource${k}B`, type: 'string', title: 'Source B', defval: 'Supertrend', options: SOURCES_B, inline: 'B', group: g },
    { id: `targetExternal${k}B`, type: 'source', title: 'External', defval: 'open', inline: 'B', group: g },
    { id: `targetTiSettings${k}B`, type: 'string', title: 'Settings', defval: '10,3', inline: 'B', group: g },
    { id: `targetValue${k}B`, type: 'int', title: 'Source B Value', defval: 0, inline: 'B_', group: g },
    { id: `target${k}Css`, type: 'color', title: 'Target Color ', defval: def(`target${k}Css`), inline: 'style', group: g },
    { id: `target${k}Style`, type: 'string', title: '    Levels Style', defval: '- - -', options: STYLES, inline: 'style', group: g },
    { id: `showSource${k}`, type: 'bool', title: 'Show Source Values', defval: false, group: g },
    { id: `waitTarget${k}`, type: 'bool', title: 'Wait Until Reached', defval: false, group: gl },
    { id: `newTarget${k}`, type: 'bool', title: 'New Target When Reached', defval: false, group: gl },
    { id: `useWicks${k}`, type: 'bool', title: 'Evaluate Wicks', defval: true, group: gl },
    { id: `distTarget${k}`, type: 'float', title: 'Target Distance From Price', defval: 3, inline: 'dist1', group: gl },
    { id: `distOptions${k}`, type: 'string', title: '', defval: 'ATR', options: DISTANCES, inline: 'dist1', group: gl },
    { id: `externalDist${k}`, type: 'source', title: k === 1 ? 'External Distance Value' : 'External Distance Value   ', defval: 'close', group: gl },
  ];
}

export const inputConfig: InputConfig[] = [
  { id: 'showLabels', type: 'bool', title: 'Show Target Labels', defval: true, inline: 'style' },
  { id: 'candleColoring', type: 'bool', title: 'Candle Coloring', defval: true, inline: 'style' },
  ...targetInputs(1),
  ...targetInputs(2),
  { id: 'showDash', type: 'bool', title: 'Show Dashboard', defval: true, group: 'Dashboard' },
  { id: 'dashLoc', type: 'string', title: 'Location', defval: 'Top Right', options: ['Top Right', 'Bottom Right', 'Bottom Left'], group: 'Dashboard' },
  { id: 'textSize', type: 'string', title: 'Size', defval: 'Normal', options: ['Tiny', 'Small', 'Normal'], group: 'Dashboard' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Target 1, source A', color: '#089981', lineWidth: 1 },
  { id: 'plot1', title: 'Target 1, source B', color: '#2157f3', lineWidth: 1 },
  { id: 'plot2', title: 'Target 2, source A', color: '#ffe400', lineWidth: 1 },
  { id: 'plot3', title: 'Target 2, source B', color: '#ff1100', lineWidth: 1 },
];

export const metadata = {
  title: 'Targets For Many Indicators [LuxAlgo]',
  shortTitle: 'LuxAlgo - Targets For Many Indicators',
  overlay: true,
};

/** indicator(max_lines_count = 500, max_labels_count = 500) */
const MAX_OBJECTS = 500;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
const nz = (v: number, r = 0) => (Number.isNaN(v) ? r : v);

const NO_VISUALS = ['ACCDIST', 'ATR', 'CCI', 'CMO', 'COG', 'III', 'MACD', 'MACD-signal', 'MACD-histogram', 'MFI', 'MOM',
  'NVI', 'OBV', 'PVI', 'PVT', 'ROC', 'RSI', 'STOCH', 'WAD', 'WVAD', '%R'];
const ONE_VALUE = ['ATR', 'CCI', 'CMO', 'COG', 'DC High', 'DC Mid', 'DC Low', 'DEMA', 'EMA', 'HMA', 'MEDIAN', 'MFI', 'MODE',
  'MOM', 'RMA', 'ROC', 'RSI', 'SMA', 'STOCH', 'TEMA', 'VWMA', 'WMA', '%R'];
const TWO_VALUES: Record<string, string> = {
  'BB Middle': 'Length, Mult', 'BB Upper': 'Length, Mult', 'BB Lower': 'Length, Mult', 'KC Middle': 'Length, Mult',
  'KC Upper': 'Length, Mult', 'KC Lower': 'Length, Mult', LINREG: 'Length, Offset', Supertrend: 'ATR Length, Factor',
};
const THREE_VALUES = ['MACD', 'MACD-signal', 'MACD-histogram'];

/** str.tonumber: na (NaN) when the text is not a number */
const toNumber = (s: string) => {
  const v = str.tonumber(s);
  return v === null || v === undefined ? NaN : v;
};
/** getSetting(): int(str.tonumber(...)) */
const toInt = (s: string) => Math.trunc(toNumber(s));

/**
 * The `var` settings array of one source: str.split(settings, ','), then the elements '', ' ', '  ' and '   ' are
 * removed (first call of value())
 */
function parseSettings(text: string): string[] {
  return text.split(',').filter((s) => !(s === '' || s === ' ' || s === '  ' || s === '   '));
}

/** The error text of value() ('' when the settings are valid; na string = '') */
function settingsError(choice: string, setting: string[]): string {
  if (setting.some((s) => Number.isNaN(toNumber(s) / 1))) return 'Please, use numbers';
  const notInt = (k: number) => toInt(setting[k]) - toNumber(setting[k]) !== 0;
  if (ONE_VALUE.includes(choice)) {
    if (setting.length !== 1) return str.format('Please enter 1 value for {0}: {1}', choice, 'Length');
    return notInt(0) ? str.format('{0} ({1}) -> Length must be an Integer value', choice, 'Length') : '';
  }
  if (choice in TWO_VALUES) {
    if (setting.length !== 2) return str.format('Please enter 2 values for {0}: {1}', choice, TWO_VALUES[choice]);
    return notInt(0) ? str.format('{0} ({1}) -> Length must be an Integer value', choice, TWO_VALUES[choice]) : '';
  }
  if (THREE_VALUES.includes(choice)) {
    if (setting.length !== 3) {
      return str.format('Please enter 3 values for {0}: {1}', choice, 'Short, Long & Signal EMA Length');
    }
    return notInt(0) || notInt(1) || notInt(2) ? 'Each Number must be an Integer value' : '';
  }
  return '';
}

/** method ema(len, source): alpha * source + (1 - alpha) * nz(ema[1], sma(source, len)[1]) */
function emaM(len: number, src: number[]): number[] {
  const alpha = 2 / (len + 1);
  const sma = taCore.sma(src, len);
  const out = new Array<number>(src.length).fill(NaN);
  for (let i = 0; i < src.length; i++) {
    const prev = i > 0 ? (Number.isNaN(out[i - 1]) ? nz(sma[i - 1], NaN) : out[i - 1]) : NaN;
    out[i] = alpha * src[i] + (1 - alpha) * prev;
  }
  return out;
}

/**
 * method rma(len, source): na(sum[1]) ? ta.sma(source, len) : alpha * source + (1 - alpha) * nz(sum[1]). The sma
 * branch runs from bar 0 until the sma has a value (the sources, close and the true range with na handled, are never
 * na), so its history is that of every bar.
 */
function rmaM(len: number, src: number[]): number[] {
  const alpha = 1 / len;
  const sma = taCore.sma(src, len);
  const out = new Array<number>(src.length).fill(NaN);
  for (let i = 0; i < src.length; i++) {
    const prev = i > 0 ? out[i - 1] : NaN;
    out[i] = Number.isNaN(prev) ? sma[i] : alpha * src[i] + (1 - alpha) * nz(prev);
  }
  return out;
}

interface Ctx {
  bars: Bar[];
  close: number[];
  high: number[];
  low: number[];
  volume: number[];
  chart?: ChartContext;
}

/** value(choice, setting, targetExternal, targetValue): the source values of every bar (na with a settings error) */
function sourceValues(choice: string, setting: string[], txt: string, external: number[], targetValue: number, c: Ctx): number[] {
  const { bars, close, high, low, volume } = c;
  const n = bars.length;
  const na = () => new Array<number>(n).fill(NaN);
  if (txt !== '') return na();
  const len = setting.length > 0 ? toInt(setting[0]) : NaN;
  const f1 = setting.length > 1 ? toNumber(setting[1]) : NaN;
  switch (choice) {
    case 'ACCDIST': return taCore.accdist(high, low, close, volume);
    case 'ATR': return rmaM(len, taCore.tr(true, high, low, close));
    case 'BB Middle': return taCore.sma(close, len);
    case 'BB Upper':
    case 'BB Lower': {
      const mid = taCore.sma(close, len);
      const sd = taCore.stdev(close, len);
      return mid.map((m, i) => (choice === 'BB Upper' ? m + f1 * sd[i] : m - f1 * sd[i]));
    }
    case 'CCI': return taCore.cci(close, len);
    case 'CMO': return taCore.cmo(close, len);
    case 'COG': return taCore.cog(close, len);
    case 'DC High': return taCore.highest(high, len);
    case 'DC Mid': {
      const h = taCore.highest(high, len);
      const l = taCore.lowest(low, len);
      return h.map((v, i) => (v + l[i]) / 2);
    }
    case 'DC Low': return taCore.lowest(low, len);
    case 'DEMA': {
      const e1 = emaM(len, close);
      const e2 = emaM(len, e1);
      return e1.map((v, i) => 2 * v - e2[i]);
    }
    case 'EMA': return emaM(len, close);
    case 'External': return external;
    case 'HMA': {
      const half = taCore.wma(close, Math.floor(len / 2));
      const full = taCore.wma(close, len);
      return taCore.wma(half.map((v, i) => 2 * v - full[i]), Math.floor(Math.sqrt(len)));
    }
    case 'III': return taCore.iii(high, low, close, volume);
    case 'KC Middle':
    case 'KC Upper':
    case 'KC Lower': {
      const mid = emaM(len, close);
      if (choice === 'KC Middle') return mid;
      const range = emaM(len, taCore.tr(false, high, low, close));
      return mid.map((m, i) => (choice === 'KC Upper' ? m + range[i] * f1 : m - range[i] * f1));
    }
    case 'LINREG': {
      const off = Math.trunc(f1);
      const sma = taCore.sma(close, len);
      return close.map((_, b) => {
        let sX = 0;
        let sY = 0;
        let sXSqr = 0;
        let sXY = 0;
        // for i = 1 to len (counts down when len < 1)
        const stepI = len >= 1 ? 1 : -1;
        for (let i = 1; stepI > 0 ? i <= len : i >= len; i += stepI) {
          const k = b - (len - i);
          const val = k >= 0 && k < n ? close[k] : NaN;
          const per = i + 1;
          sX += per;
          sY += val;
          sXSqr += math.pow(per, 2) as number;
          sXY += val * per;
        }
        const slope = (sXY * len - sX * sY) / (sXSqr * len - (math.pow(sX, 2) as number));
        const intcp = sma[b] - (slope * sX) / len + slope;
        return intcp + slope * (len - off);
      });
    }
    case 'MACD':
    case 'MACD-signal':
    case 'MACD-histogram': {
      const shortEMA = emaM(toInt(setting[0]), close);
      const longEMA = emaM(toInt(setting[1]), close);
      const macd = shortEMA.map((v, i) => v - longEMA[i]);
      if (choice === 'MACD') return macd;
      const signal = emaM(toInt(setting[2]), macd);
      return choice === 'MACD-signal' ? signal : macd.map((v, i) => v - signal[i]);
    }
    case 'MEDIAN': return taCore.median(close, len);
    case 'MFI': return taCore.mfi(close, len, volume);
    case 'MODE': return taCore.mode(close, len);
    case 'MOM': return taCore.mom(close, len);
    case 'NVI': return taCore.nvi(close, volume);
    case 'OBV': return taCore.obv(close, volume);
    case 'PVI': return taCore.pvi(close, volume);
    case 'PVT': return taCore.pvt(close, volume);
    case 'SMA': return taCore.sma(close, len);
    case 'RMA': return rmaM(len, close);
    case 'ROC': return taCore.roc(close, len);
    case 'RSI': {
      // var num = 0., var den = 0., d = nz(close - close[1])
      let num = 0;
      let den = 0;
      return close.map((v, i) => {
        const d = i > 0 ? nz(v - close[i - 1]) : 0;
        num += (Math.max(d, 0) - num) / len;
        den += (Math.abs(d) - den) / len;
        return (num / den) * 100;
      });
    }
    case 'STOCH': return taCore.stoch(close, high, low, len);
    case 'Supertrend': {
      const tr = taCore.tr(false, high, low, close);
      let atr = 0;
      let upper = NaN;
      let lower = NaN;
      let trend = NaN;
      return close.map((cl, i) => {
        atr += (nz(tr[i]) - atr) / len;
        const hl2 = (high[i] + low[i]) / 2;
        const up = hl2 + atr * f1;
        const dn = hl2 - atr * f1;
        const prevClose = i > 0 ? close[i - 1] : NaN;
        upper = lt(prevClose, upper) ? Math.min(up, upper) : up;
        lower = gt(prevClose, lower) ? Math.max(dn, lower) : dn;
        trend = gt(cl, upper) ? 1 : lt(cl, lower) ? 0 : trend;
        return trend === 1 ? lower : upper;
      });
    }
    case 'TEMA': {
      const e1 = emaM(len, close);
      const e2 = emaM(len, e1);
      const e3 = emaM(len, e2);
      return e1.map((v, i) => 3 * v - 3 * e2[i] + e3[i]);
    }
    case 'Value': return new Array<number>(n).fill(targetValue);
    case 'VWAP': {
      // ta.vwap(close), default anchor: each trading day of the exchange on intraday bars, every bar on daily and
      // higher bars (script API; one bar alone is its own anchor)
      const tf = chartTimeframe(bars, c.chart) || '1D';
      if (timeframe.info(tf).isintraday && !hasCalendar(c.chart)) {
        throw new Error(
          'Targets For Many Indicators: the source "VWAP" works on daily and higher timeframes only without a chart '
          + 'context: on intraday bars ta.vwap resets on each trading day, which needs the exchange time zone and session.',
        );
      }
      let vwap: number[] = [];
      executeScript(() => {
        vwap = scriptTa.vwap(scriptClose).toArray().map((v) => v ?? NaN);
      }, bars, {}, { ...c.chart, timeframe: tf });
      return vwap;
    }
    case 'VWMA': return taCore.vwma(close, len, volume);
    case 'WAD': return taCore.wad(high, low, close);
    case 'WMA': return taCore.wma(close, len);
    case 'WVAD': return taCore.wvad(bars.map((b) => b.open), high, low, close, volume);
    case '%R': return taCore.wpr(high, low, close, len);
    default: return na();
  }
}

interface Target {
  value: number;
  reached: boolean;
  active: boolean;
  v?: Line;
  h?: Line;
  lbl?: Label;
}

const lineStyle = (s: string): 'solid' | 'dashed' | 'dotted' => (s === '- - -' ? 'dashed' : s === '· · ·' ? 'dotted' : 'solid');

export function calculate(
  bars: Bar[],
  inputs: Partial<TargetsForManyIndicatorsInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'lines' | 'labels' | 'tables' | 'barColors'> & {
  lines: LineDrawingData[]; labels: LabelData[]; tables: TableData[]; barColors: BarColorData[];
} & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const mintick = mintickOf(chart);
  const src = (s: SourceType) => getSourceSeries(bars, s).toArray().map((v) => v ?? NaN);
  const c: Ctx = {
    bars, chart,
    close: bars.map((b) => b.close),
    high: bars.map((b) => b.high),
    low: bars.map((b) => b.low),
    volume: bars.map((b) => b.volume ?? NaN),
  };
  // ta.atr(50) of the "ATR" distance
  const atr = taCore.atr(50, c.high, c.low, c.close);

  /** One target setup: sources, condition and distance of every bar */
  const setup = (k: 1 | 2) => {
    const g = cfg as unknown as Record<string, unknown>;
    const choiceA = String(g[`targetSource${k}A`]);
    const choiceB = String(g[`targetSource${k}B`]);
    const settingA = parseSettings(String(g[`targetTiSettings${k}A`]));
    const settingB = parseSettings(String(g[`targetTiSettings${k}B`]));
    const txtA = settingsError(choiceA, settingA);
    const txtB = settingsError(choiceB, settingB);
    const a = sourceValues(choiceA, settingA, txtA, src(g[`targetExternal${k}A`] as SourceType), NaN, c);
    const b = sourceValues(choiceB, settingB, txtB, src(g[`targetExternal${k}B`] as SourceType), Number(g[`targetValue${k}B`]), c);
    const condition = g[`target${k}Condition`] as Condition;
    const cond = condition === 'CrossOver' ? taCore.crossover(a, b)
      : condition === 'CrossUnder' ? taCore.crossunder(a, b)
        : condition === 'Cross' ? taCore.cross(a, b)
          : a.map((v, i) => eq(v, b[i]));
    const distTarget = Number(g[`distTarget${k}`]);
    const option = g[`distOptions${k}`] as Distance;
    const extDist = option === 'External Value' ? src(g[`externalDist${k}`] as SourceType) : [];
    const dist = c.close.map((cl, i) => (option === 'Currencies' ? distTarget
      : option === '%' ? cl + (distTarget / 100) * cl
        : option === 'ATR' ? nz(atr[i]) * distTarget
          : option === 'Ticks' ? mintick * distTarget
            : extDist[i] * distTarget));
    const noVisuals = NO_VISUALS.includes(choiceA) || NO_VISUALS.includes(choiceB);
    return {
      a, b, cond, dist, txtA, txtB, noVisuals,
      enable: Boolean(g[`enableTarget${k}`]),
      isLong: Boolean(g[`isLong${k}`]),
      useWicks: Boolean(g[`useWicks${k}`]),
      wait: Boolean(g[`waitTarget${k}`]),
      newTarget: Boolean(g[`newTarget${k}`]),
      showSource: Boolean(g[`showSource${k}`]),
      css: String(g[`target${k}Css`]),
      style: lineStyle(String(g[`target${k}Style`])),
      // var target = target.new(reached = true, active = false)
      obj: { value: NaN, reached: true, active: false } as Target,
      count: 0,
      countReached: 0,
      // isNewTarget<k> / isTgReached<k> of every bar
      isNew: new Array<boolean>(n).fill(false),
      isReached: new Array<boolean>(n).fill(false),
    };
  };
  const t1 = setup(1);
  const t2 = setup(2);

  resetDrawings({ line: MAX_OBJECTS, label: MAX_OBJECTS });
  const tableSize = cfg.textSize === 'Tiny' ? 'tiny' : cfg.textSize === 'Small' ? 'small' : 'normal';
  const position = cfg.dashLoc === 'Bottom Left' ? 'bottom_left' : cfg.dashLoc === 'Top Right' ? 'top_right' : 'bottom_right';
  const barColors: BarColorData[] = [];
  const WHITE = '#FFFFFF';
  let css: string | null = null; // var color css = na
  let tb: ReturnType<typeof table.new> | undefined;

  try {
    for (let i = 0; i < n; i++) {
      setDrawingBar(i, i === n - 1);
      const bar = bars[i];
      if (i === 0) {
        // var tb = table.new(...)
        tb = table.new(position, 3, 8, '#1e222d', '#373a46', 1, '#373a46', 1);
      }
      for (const t of [t1, t2]) {
        const o = t.obj;
        if (o.active && o.reached === false) {
          if (o.h) line.set_x2(o.h, i);
          if (o.lbl) label.set_x(o.lbl, i);
        }
        const price = t.isLong ? (t.useWicks ? bar.high : bar.close) : (t.useWicks ? bar.low : bar.close);
        if ((t.isLong ? gt(price, o.value) : lt(price, o.value)) && o.active) {
          o.reached = true;
          o.active = false;
          t.countReached += 1;
          t.isReached[i] = true;
          css = null;
          if (o.lbl) label.set_color(o.lbl, t.css);
        }
        if (t.enable && ((t.cond[i] && (t.wait ? t.obj.reached : true)) || (t.newTarget && t.obj.reached))) {
          const targetValue = bar.close + (t.isLong ? t.dist[i] : -t.dist[i]);
          if (t.newTarget && t.obj.reached && cfg.showLabels && t.obj.lbl) label.delete(t.obj.lbl);
          const created: Target = { value: targetValue, reached: false, active: true };
          t.obj = created;
          if (cfg.showLabels) {
            created.lbl = label.new(i, targetValue, 'Target', 'bar_index', 'price', String(color.new(t.css, 50)),
              'label_left', WHITE, 'tiny', undefined, str.tostring(targetValue, 'mintick', mintick, chart?.pricescale));
          }
          css = t.css;
          // set_target(): vertical line from the close, horizontal line at the target
          created.v = line.new(i, bar.close, i, targetValue, 'bar_index', undefined, t.css, t.style);
          created.h = line.new(i, targetValue, i, targetValue, 'bar_index', undefined, t.css, t.style);
          t.count += 1;
          t.isNew[i] = true;
        }
      }
      if (cfg.candleColoring && css !== null) barColors.push({ time: bar.time, color: css });

      if (cfg.showDash && tb) {
        if (i === 0) {
          const cell = (col: number, row: number, text: string) => table.cell(tb!, col, row, text, undefined, undefined,
            WHITE, undefined, undefined, tableSize);
          if (t1.enable || t2.enable) {
            cell(0, 0, '');
            cell(1, 0, 'Count');
            cell(2, 0, 'Target\nReached');
            cell(0, 3, 'Total');
          }
          if (t1.enable) cell(0, 1, 'Target 1');
          if (t2.enable) cell(0, 2, 'Target 2');
          const errors: Array<[boolean, string, number, string]> = [
            [t1.enable, t1.txtA, 4, 'Target 1, Source A: {0}\n'], [t1.enable, t1.txtB, 5, 'Target 1, Source B: {0}\n'],
            [t2.enable, t2.txtA, 6, 'Target 2, Source A: {0}\n'], [t2.enable, t2.txtB, 7, 'Target 2, Source B: {0}\n'],
          ];
          for (const [on, txt, row, fmt] of errors) {
            if (on && txt !== '') {
              table.merge_cells(tb, 0, row, 2, row);
              // default text size: auto
              table.cell(tb, 0, row, str.format(fmt, txt), undefined, undefined, '#FF0000', 'left', undefined, 'auto');
            }
          }
        }
        if (i === n - 1) {
          const totT = t1.count + t2.count;
          const totR = t1.countReached + t2.countReached;
          const rate = (r: number, t: number) => str.format('{0} ({1}%)', r, math.round((100 / t) * r, 1));
          const cell = (col: number, row: number, text: string) => table.cell(tb!, col, row, text, undefined, undefined,
            WHITE, undefined, undefined, tableSize);
          if (t1.enable) {
            cell(1, 1, str.tostring(t1.count));
            cell(2, 1, rate(t1.countReached, t1.count));
          }
          if (t2.enable) {
            cell(1, 2, str.tostring(t2.count));
            cell(2, 2, rate(t2.countReached, t2.count));
          }
          if (t1.enable || t2.enable) {
            cell(1, 3, str.tostring(totT));
            cell(2, 3, rate(totR, totT));
          }
        }
      }
    }
  } finally {
    setDrawingBar(null);
  }
  const drawn = drawingOutputs(bars);
  resetDrawings();

  const plotOf = (t: typeof t1, values: number[]) => bars.map((b, i) => ({
    time: b.time,
    value: t.showSource && t.enable && !t.noVisuals && Number.isFinite(values[i]) ? values[i] : NaN,
  }));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0: plotOf(t1, t1.a), plot1: plotOf(t1, t1.b), plot2: plotOf(t2, t2.a), plot3: plotOf(t2, t2.b) },
    barColors,
    lines: drawn.lines ?? [],
    labels: drawn.labels ?? [],
    tables: drawn.tables ?? [],
    alerts: alertStates(alertConditions, bars, [t1.isNew, t1.isReached, t2.isNew, t2.isReached]),
  };
}

export const TargetsForManyIndicators = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
