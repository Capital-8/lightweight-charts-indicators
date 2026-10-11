/**
 * Signal Forge [LuxAlgo]
 *
 * Combines up to eleven classic indicators into one long / short signal and backtests it on the chart bars.
 * Each indicator gives a bullish and a bearish state: SMA crossover (fast above / below slow), RSI (above / below a
 * level), MACD (line above / below signal), Supertrend direction, Stochastic %K (above / below 50), Bollinger Bands
 * (close above / below the middle band), EMA crossover, Awesome Oscillator (above / below 0), Parabolic SAR (close
 * above / below), CCI (above / below a level) and ADX (above the threshold with +DI above / below -DI).
 * The long condition is that all enabled indicators are bullish ("Require All") or that any of them is; the short
 * condition is the same with the bearish states.
 *
 * A trade opens on the bar where its condition becomes true and closes on the opposite condition, or at an optional
 * stop loss, take profit or trailing stop placed at a multiple of the ATR from the entry close. The same trade model
 * runs for each indicator alone, which gives its standalone win rate.
 *
 * Drawings: at each entry a vertical line from the bar low (long) or high (short) to an orb "Orb Distance" ATR away
 * (three circles of decreasing size) and a label with the win rate so far; a cross where a trade closes without an
 * immediate reversal; the stop loss, take profit and trailing stop of the open trade, with a gradient fill between
 * the trailing stop and the close; and two tables on the last bar: the state, standalone win rate and enabled flag
 * of each indicator with the current signal, and the backtest results (trades, wins, losses, win rate, profit
 * factor, sum of the returns in %). At most 500 lines and 500 labels are kept.
 *
 * The label text colour is the chart foreground colour (chart context; #DBDBDB without one). The circle widths
 * follow "Orb Base Size" in the original; the plot configuration has the widths of the default size.
 *
 * Reference: "Signal Forge [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import { ta, str, color, math, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { LabelData, LineDrawingData, MarkerData, PineSize, TableCellData, TableData, TableMergeData, TablePosition } from '../types';
import { foregroundColorOf, type ChartContext } from '../chart-context';

type Corner = 'Top Right' | 'Bottom Right' | 'Bottom Left';

export interface SignalForgeInputs {
  /** All enabled indicators must agree (true) or any of them is enough (false) */
  requireAll: boolean;
  atrLen: number;
  enableTp: boolean;
  tpMult: number;
  enableSl: boolean;
  slMult: number;
  enableTs: boolean;
  tsMult: number;
  /** Distance of the entry orb from the bar, in ATR */
  orbDist: number;
  orbSize: number;
  enableSma: boolean;
  smaFastLen: number;
  smaSlowLen: number;
  enableRsi: boolean;
  rsiLen: number;
  rsiLongLevel: number;
  rsiShortLevel: number;
  enableMacd: boolean;
  macdFastLen: number;
  macdSlowLen: number;
  macdSignalLen: number;
  enableSt: boolean;
  stFactor: number;
  stLen: number;
  enableStoch: boolean;
  stochK: number;
  stochD: number;
  stochSmooth: number;
  enableBb: boolean;
  bbLen: number;
  bbMult: number;
  enableEma: boolean;
  emaFastLen: number;
  emaSlowLen: number;
  enableAo: boolean;
  enableSar: boolean;
  sarStart: number;
  sarInc: number;
  sarMax: number;
  enableCci: boolean;
  cciLen: number;
  cciLongLevel: number;
  cciShortLevel: number;
  enableAdx: boolean;
  adxLen: number;
  diLen: number;
  adxThreshold: number;
  dashboard: boolean;
  dashboardPosition: Corner;
  perfDashboardPosition: Corner;
  dashboardSize: 'Tiny' | 'Small' | 'Normal' | 'Large' | 'Huge';
}

export const defaultInputs: SignalForgeInputs = {
  requireAll: true,
  atrLen: 14,
  enableTp: false,
  tpMult: 2.0,
  enableSl: false,
  slMult: 1.5,
  enableTs: false,
  tsMult: 1.0,
  orbDist: 1.5,
  orbSize: 10,
  enableSma: true,
  smaFastLen: 10,
  smaSlowLen: 20,
  enableRsi: false,
  rsiLen: 14,
  rsiLongLevel: 50,
  rsiShortLevel: 50,
  enableMacd: false,
  macdFastLen: 12,
  macdSlowLen: 26,
  macdSignalLen: 9,
  enableSt: false,
  stFactor: 3.0,
  stLen: 10,
  enableStoch: false,
  stochK: 14,
  stochD: 3,
  stochSmooth: 3,
  enableBb: false,
  bbLen: 20,
  bbMult: 2.0,
  enableEma: false,
  emaFastLen: 10,
  emaSlowLen: 20,
  enableAo: false,
  enableSar: false,
  sarStart: 0.02,
  sarInc: 0.02,
  sarMax: 0.2,
  enableCci: false,
  cciLen: 20,
  cciLongLevel: 0,
  cciShortLevel: 0,
  enableAdx: false,
  adxLen: 14,
  diLen: 14,
  adxThreshold: 20,
  dashboard: true,
  dashboardPosition: 'Top Right',
  perfDashboardPosition: 'Bottom Right',
  dashboardSize: 'Normal',
};

const G_LOGIC = 'Signal Logic';
const G_RISK = 'Risk Management (ATR)';
const G_VISUALS = 'Visuals';
const G_SMA = 'SMA Crossover';
const G_RSI = 'RSI Filter';
const G_MACD = 'MACD Crossover';
const G_ST = 'Supertrend';
const G_STOCH = 'Stochastic';
const G_BB = 'Bollinger Bands';
const G_EMA = 'EMA Crossover';
const G_AO = 'Awesome Oscillator';
const G_SAR = 'Parabolic SAR';
const G_CCI = 'CCI Filter';
const G_ADX = 'ADX Filter';
const G_DASH = 'Dashboard';
const CORNERS = ['Top Right', 'Bottom Right', 'Bottom Left'];

export const inputConfig: InputConfig[] = [
  {
    id: 'requireAll', type: 'bool', title: 'Require All Enabled Indicators to Align', defval: true, group: G_LOGIC,
    tooltip: 'If enabled, ALL checked indicators must agree to generate a signal. If disabled, ANY checked indicator can generate a signal.',
  },
  { id: 'atrLen', type: 'int', title: 'ATR Length', defval: 14, group: G_RISK },
  { id: 'enableTp', type: 'bool', title: 'Take Profit', defval: false, inline: 'tp', group: G_RISK },
  { id: 'tpMult', type: 'float', title: 'Multiplier', defval: 2.0, step: 0.1, inline: 'tp', group: G_RISK },
  { id: 'enableSl', type: 'bool', title: 'Stop Loss', defval: false, inline: 'sl', group: G_RISK },
  { id: 'slMult', type: 'float', title: 'Multiplier', defval: 1.5, step: 0.1, inline: 'sl', group: G_RISK },
  { id: 'enableTs', type: 'bool', title: 'Trailing Stop', defval: false, inline: 'ts', group: G_RISK },
  { id: 'tsMult', type: 'float', title: 'Multiplier', defval: 1.0, step: 0.1, inline: 'ts', group: G_RISK },
  { id: 'orbDist', type: 'float', title: 'Orb Distance (ATR)', defval: 1.5, step: 0.1, group: G_VISUALS },
  { id: 'orbSize', type: 'int', title: 'Orb Base Size', defval: 10, min: 3, max: 20, group: G_VISUALS },
  { id: 'enableSma', type: 'bool', title: 'Enable SMA Crossover', defval: true, group: G_SMA },
  { id: 'smaFastLen', type: 'int', title: 'Fast Length', defval: 10, min: 1, group: G_SMA },
  { id: 'smaSlowLen', type: 'int', title: 'Slow Length', defval: 20, min: 1, group: G_SMA },
  { id: 'enableRsi', type: 'bool', title: 'Enable RSI Filter', defval: false, group: G_RSI },
  { id: 'rsiLen', type: 'int', title: 'RSI Length', defval: 14, min: 1, group: G_RSI },
  { id: 'rsiLongLevel', type: 'float', title: 'Long Above', defval: 50, group: G_RSI },
  { id: 'rsiShortLevel', type: 'float', title: 'Short Below', defval: 50, group: G_RSI },
  { id: 'enableMacd', type: 'bool', title: 'Enable MACD Crossover', defval: false, group: G_MACD },
  { id: 'macdFastLen', type: 'int', title: 'Fast Length', defval: 12, min: 1, group: G_MACD },
  { id: 'macdSlowLen', type: 'int', title: 'Slow Length', defval: 26, min: 1, group: G_MACD },
  { id: 'macdSignalLen', type: 'int', title: 'Signal Length', defval: 9, min: 1, group: G_MACD },
  { id: 'enableSt', type: 'bool', title: 'Enable Supertrend', defval: false, group: G_ST },
  { id: 'stFactor', type: 'float', title: 'Factor', defval: 3.0, min: 0.1, step: 0.1, group: G_ST },
  { id: 'stLen', type: 'int', title: 'Length', defval: 10, min: 1, group: G_ST },
  { id: 'enableStoch', type: 'bool', title: 'Enable Stochastic', defval: false, group: G_STOCH },
  { id: 'stochK', type: 'int', title: 'K Length', defval: 14, min: 1, group: G_STOCH },
  { id: 'stochD', type: 'int', title: 'D Length', defval: 3, min: 1, group: G_STOCH },
  { id: 'stochSmooth', type: 'int', title: 'Smooth', defval: 3, min: 1, group: G_STOCH },
  {
    id: 'enableBb', type: 'bool', title: 'Enable BB Trend', defval: false, group: G_BB,
    tooltip: 'Looks for price trading in the upper/lower half of the bands.',
  },
  { id: 'bbLen', type: 'int', title: 'Length', defval: 20, min: 1, group: G_BB },
  { id: 'bbMult', type: 'float', title: 'Multiplier', defval: 2.0, min: 0.1, step: 0.1, group: G_BB },
  { id: 'enableEma', type: 'bool', title: 'Enable EMA Crossover', defval: false, group: G_EMA },
  { id: 'emaFastLen', type: 'int', title: 'Fast Length', defval: 10, min: 1, group: G_EMA },
  { id: 'emaSlowLen', type: 'int', title: 'Slow Length', defval: 20, min: 1, group: G_EMA },
  { id: 'enableAo', type: 'bool', title: 'Enable AO', defval: false, group: G_AO },
  { id: 'enableSar', type: 'bool', title: 'Enable Parabolic SAR', defval: false, group: G_SAR },
  { id: 'sarStart', type: 'float', title: 'Start', defval: 0.02, step: 0.01, group: G_SAR },
  { id: 'sarInc', type: 'float', title: 'Increment', defval: 0.02, step: 0.01, group: G_SAR },
  { id: 'sarMax', type: 'float', title: 'Max Value', defval: 0.2, step: 0.1, group: G_SAR },
  { id: 'enableCci', type: 'bool', title: 'Enable CCI Filter', defval: false, group: G_CCI },
  { id: 'cciLen', type: 'int', title: 'Length', defval: 20, min: 1, group: G_CCI },
  { id: 'cciLongLevel', type: 'float', title: 'Long Above', defval: 0, group: G_CCI },
  { id: 'cciShortLevel', type: 'float', title: 'Short Below', defval: 0, group: G_CCI },
  { id: 'enableAdx', type: 'bool', title: 'Enable ADX Filter', defval: false, group: G_ADX },
  { id: 'adxLen', type: 'int', title: 'ADX Smoothing', defval: 14, min: 1, group: G_ADX },
  { id: 'diLen', type: 'int', title: 'DI Length', defval: 14, min: 1, group: G_ADX },
  { id: 'adxThreshold', type: 'float', title: 'ADX Threshold', defval: 20, group: G_ADX },
  { id: 'dashboard', type: 'bool', title: 'Dashboards', defval: true, group: G_DASH, tooltip: 'Enable or disable the dashboards.' },
  { id: 'dashboardPosition', type: 'string', title: 'Indicator Dashboard Position', defval: 'Top Right', options: CORNERS, group: G_DASH },
  { id: 'perfDashboardPosition', type: 'string', title: 'Performance Dashboard Position', defval: 'Bottom Right', options: CORNERS, group: G_DASH },
  {
    id: 'dashboardSize', type: 'string', title: 'Size', defval: 'Normal', options: ['Tiny', 'Small', 'Normal', 'Large', 'Huge'], group: G_DASH,
    tooltip: 'Select the dashboard size.',
  },
];

const GREEN = '#089981';
const RED = '#f23645';
const BLUE = '#2962ff';
const C = (c: string, transp: number) => String(color.new(c, transp));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Long Glow 1', color: C(GREEN, 80), lineWidth: 10, style: 'circles' },
  { id: 'plot1', title: 'Long Glow 2', color: C(GREEN, 50), lineWidth: 7, style: 'circles' },
  { id: 'plot2', title: 'Long Glow 3', color: C(GREEN, 0), lineWidth: 4, style: 'circles' },
  { id: 'plot3', title: 'Short Glow 1', color: C(RED, 80), lineWidth: 10, style: 'circles' },
  { id: 'plot4', title: 'Short Glow 2', color: C(RED, 50), lineWidth: 7, style: 'circles' },
  { id: 'plot5', title: 'Short Glow 3', color: C(RED, 0), lineWidth: 4, style: 'circles' },
  { id: 'plot6', title: 'Stop Loss', color: C(RED, 0), lineWidth: 1, style: 'linebr' },
  { id: 'plot7', title: 'Take Profit', color: C(GREEN, 0), lineWidth: 1, style: 'linebr' },
  { id: 'plot8', title: 'Trailing Stop', color: C(BLUE, 0), lineWidth: 2, style: 'linebr' },
  { id: 'plot9', title: 'Price for TS', color: '#2962FF', lineWidth: 1, display: 'none' },
];

export const metadata = {
  title: 'Signal Forge [LuxAlgo]',
  shortTitle: 'LuxAlgo - Signal Forge',
  overlay: true,
};

/** indicator(max_labels_count = 500, max_lines_count = 500) */
const MAX_OBJECTS = 500;

// Dashboard colours
const DATA = '#DBDBDB';
const HEADERS = '#808080';
const BACKGROUND = '#161616';
const BORDERS = '#2E2E2E';
const ROW_DIVIDER = '━━━━━━━━━━━━━━';

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !Number.isNaN(a) && !Number.isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !Number.isNaN(a) && !Number.isNaN(b) && !(a - b > EPS);

const cornerOf = (s: string): TablePosition => (s === 'Bottom Right' ? 'bottom_right' : s === 'Bottom Left' ? 'bottom_left' : 'top_right');

/** One trade model: the combined signal or one indicator alone */
interface Model {
  state: number;
  entry: number;
  sl: number;
  tp: number;
  ts: number;
  total: number;
  wins: number;
}

const newModel = (): Model => ({ state: 0, entry: NaN, sl: NaN, tp: NaN, ts: NaN, total: 0, wins: 0 });

interface Ln {
  x: number;
  y1: number;
  y2: number;
  color: string;
  width: number;
}
interface Lb {
  x: number;
  y: number;
  text: string;
  style: 'label_up' | 'label_down';
}

export function calculate(
  bars: Bar[],
  inputs: Partial<SignalForgeInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { markers: MarkerData[]; lines: LineDrawingData[]; labels: LabelData[]; tables: TableData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const fgColor = foregroundColorOf(chart);

  const closeS = new Series(bars, (b) => b.close);
  const highS = new Series(bars, (b) => b.high);
  const lowS = new Series(bars, (b) => b.low);
  const hl2S = new Series(bars, (b) => (b.high + b.low) / 2);

  // ── Indicators ──
  const smaFast = A(ta.sma(closeS, cfg.smaFastLen));
  const smaSlow = A(ta.sma(closeS, cfg.smaSlowLen));
  const rsi = A(ta.rsi(closeS, cfg.rsiLen));
  const [macdS, signalS] = ta.macd(closeS, cfg.macdFastLen, cfg.macdSlowLen, cfg.macdSignalLen);
  const macdLine = A(macdS);
  const signalLine = A(signalS);
  const stDir = A(ta.supertrend(bars, cfg.stFactor, cfg.stLen)[1]);
  const k = A(ta.sma(ta.stoch(closeS, highS, lowS, cfg.stochK), cfg.stochSmooth));
  const bbMiddle = A(ta.bb(closeS, cfg.bbLen, cfg.bbMult)[0]);
  const emaFast = A(ta.ema(closeS, cfg.emaFastLen));
  const emaSlow = A(ta.ema(closeS, cfg.emaSlowLen));
  const ao = A(ta.sma(hl2S, 5).sub(ta.sma(hl2S, 34)));
  const sar = A(ta.sar(bars, cfg.sarStart, cfg.sarInc, cfg.sarMax));
  const cci = A(ta.cci(closeS, cfg.cciLen));
  const [diPlusS, diMinusS, adxS] = ta.dmi(bars, cfg.diLen, cfg.adxLen);
  const diPlus = A(diPlusS);
  const diMinus = A(diMinusS);
  const adx = A(adxS);
  const atr = A(ta.atr(bars, cfg.atrLen));

  const enabled = [
    cfg.enableSma, cfg.enableRsi, cfg.enableMacd, cfg.enableSt, cfg.enableStoch, cfg.enableBb,
    cfg.enableEma, cfg.enableAo, cfg.enableSar, cfg.enableCci, cfg.enableAdx,
  ];
  const anyEnabled = enabled.some((e) => e);

  /** Exit test of an open trade: stop loss, take profit, trailing stop, then the opposite state. Returns the exit price, na when the trade stays open. */
  const exitPrice = (m: Model, side: number, i: number, opposite: boolean): number => {
    const { high, low, close } = bars[i];
    if (side === 1) {
      if (cfg.enableSl && le(low, m.sl)) return m.sl;
      if (cfg.enableTp && ge(high, m.tp)) return m.tp;
      if (cfg.enableTs && le(low, m.ts)) return m.ts;
      return opposite ? close : NaN;
    }
    if (cfg.enableSl && ge(high, m.sl)) return m.sl;
    if (cfg.enableTp && le(low, m.tp)) return m.tp;
    if (cfg.enableTs && ge(high, m.ts)) return m.ts;
    return opposite ? close : NaN;
  };
  const enter = (m: Model, side: number, i: number): void => {
    const c = bars[i].close;
    m.state = side;
    m.entry = c;
    if (cfg.enableSl) m.sl = c - side * (atr[i] * cfg.slMult);
    if (cfg.enableTp) m.tp = c + side * (atr[i] * cfg.tpMult);
    if (cfg.enableTs) m.ts = c - side * (atr[i] * cfg.tsMult);
  };
  /** Pine math.max / math.min: na when a value is na */
  const trail = (m: Model, side: number, i: number): void => {
    const c = bars[i].close;
    m.ts = side === 1 ? Math.max(m.ts, c - atr[i] * cfg.tsMult) : Math.min(m.ts, c + atr[i] * cfg.tsMult);
  };

  // ── Outputs ──
  const nanArr = () => new Array<number>(n).fill(NaN);
  const longGlow = nanArr();
  const shortGlow = nanArr();
  const slPlot = nanArr();
  const tpPlot = nanArr();
  const slColor: Array<string | null> = new Array(n).fill(null);
  const tpColor: Array<string | null> = new Array(n).fill(null);
  const tsPlot = nanArr();
  const pricePlot = nanArr();
  const tsTopVal = nanArr();
  const tsBotVal = nanArr();
  const tsTopCol: Array<string | null> = new Array(n).fill(null);
  const tsBotCol: Array<string | null> = new Array(n).fill(null);
  const markers: MarkerData[] = [];
  const lineList: Ln[] = [];
  const labelList: Lb[] = [];
  /** When a creation brings the count above max + 5, the oldest are deleted until max remain */
  const limit = <T>(list: T[]): void => {
    if (list.length > MAX_OBJECTS + 5) list.splice(0, list.length - MAX_OBJECTS);
  };

  const SL_COLOR = C(RED, 0);
  const TP_COLOR = C(GREEN, 0);
  const TS_SHOWN = C(BLUE, 70);
  const TS_HIDDEN = C(BLUE, 100);
  const LONG_LINE = [C(GREEN, 80), C(GREEN, 40)];
  const SHORT_LINE = [C(RED, 80), C(RED, 40)];

  const ind: Model[] = Array.from({ length: 11 }, newModel);
  const prevBull: boolean[] = new Array(11).fill(false);
  const prevBear: boolean[] = new Array(11).fill(false);
  const main = newModel();
  let netProfitPct = 0.0;
  let grossProfit = 0.0;
  let grossLoss = 0.0;
  let prevLong = false;
  let prevShort = false;
  let bullArr: boolean[] = new Array(11).fill(false);
  let bearArr: boolean[] = new Array(11).fill(false);
  let longCond = false;
  let shortCond = false;

  for (let i = 0; i < n; i++) {
    const { high, low, close } = bars[i];
    bullArr = [
      gt(smaFast[i], smaSlow[i]), gt(rsi[i], cfg.rsiLongLevel), gt(macdLine[i], signalLine[i]), Math.abs(stDir[i] + 1) <= EPS,
      gt(k[i], 50), gt(close, bbMiddle[i]), gt(emaFast[i], emaSlow[i]), gt(ao[i], 0), gt(close, sar[i]),
      gt(cci[i], cfg.cciLongLevel), gt(adx[i], cfg.adxThreshold) && gt(diPlus[i], diMinus[i]),
    ];
    bearArr = [
      lt(smaFast[i], smaSlow[i]), lt(rsi[i], cfg.rsiShortLevel), lt(macdLine[i], signalLine[i]), Math.abs(stDir[i] - 1) <= EPS,
      lt(k[i], 50), lt(close, bbMiddle[i]), lt(emaFast[i], emaSlow[i]), lt(ao[i], 0), lt(close, sar[i]),
      lt(cci[i], cfg.cciShortLevel), gt(adx[i], cfg.adxThreshold) && gt(diMinus[i], diPlus[i]),
    ];

    // Standalone performance of each indicator
    for (let j = 0; j < 11; j++) {
      const m = ind[j];
      const bull = bullArr[j];
      const bear = bearArr[j];
      let state = m.state;
      if (state !== 0) {
        const price = exitPrice(m, state, i, state === 1 ? bear : bull);
        if (!Number.isNaN(price)) {
          const ret = (state * (price - m.entry) / m.entry) * 100;
          m.total += 1;
          if (gt(ret, 0)) m.wins += 1;
          m.state = 0;
          m.sl = NaN;
          m.tp = NaN;
          m.ts = NaN;
          state = 0;
        }
      }
      const enterLong = bull && !prevBull[j] && state !== 1;
      const enterShort = bear && !prevBear[j] && state !== -1;
      if (enterLong) enter(m, 1, i);
      if (enterShort) enter(m, -1, i);
      if (state === 1 && !enterLong && cfg.enableTs) trail(m, 1, i);
      if (state === -1 && !enterShort && cfg.enableTs) trail(m, -1, i);
      prevBull[j] = bull;
      prevBear[j] = bear;
    }

    // Combined signal
    if (!anyEnabled) {
      longCond = false;
      shortCond = false;
    } else if (cfg.requireAll) {
      longCond = enabled.every((e, j) => !e || bullArr[j]);
      shortCond = enabled.every((e, j) => !e || bearArr[j]);
    } else {
      longCond = enabled.some((e, j) => e && bullArr[j]);
      shortCond = enabled.some((e, j) => e && bearArr[j]);
    }

    // 1-2. Exits
    let exitLong = false;
    let exitShort = false;
    if (main.state !== 0) {
      const side = main.state;
      const price = exitPrice(main, side, i, side === 1 ? shortCond : longCond);
      if (!Number.isNaN(price)) {
        const tradeRet = (side * (price - main.entry) / main.entry) * 100;
        netProfitPct += tradeRet;
        main.total += 1;
        if (gt(tradeRet, 0)) {
          main.wins += 1;
          grossProfit += tradeRet;
        } else {
          grossLoss += Math.abs(tradeRet);
        }
        main.state = 0;
        main.sl = NaN;
        main.tp = NaN;
        main.ts = NaN;
        if (side === 1) exitLong = true;
        else exitShort = true;
      }
    }

    // 3. Entries
    const enterLong = longCond && !prevLong && main.state !== 1;
    const enterShort = shortCond && !prevShort && main.state !== -1;
    if (enterLong) enter(main, 1, i);
    if (enterShort) enter(main, -1, i);

    // 4. Trailing stop of an ongoing trade
    if (main.state === 1 && !enterLong && cfg.enableTs) trail(main, 1, i);
    if (main.state === -1 && !enterShort && cfg.enableTs) trail(main, -1, i);

    // 5. Visuals
    const longGlowY = enterLong ? low - atr[i] * cfg.orbDist : NaN;
    const shortGlowY = enterShort ? high + atr[i] * cfg.orbDist : NaN;
    longGlow[i] = longGlowY;
    shortGlow[i] = shortGlowY;
    const currentWR = main.total > 0 ? (main.wins / main.total) * 100 : 0;
    const wrText = str.tostring(currentWR, '#.#') + '%';
    if (enterLong) {
      lineList.push({ x: i, y1: low, y2: longGlowY, color: LONG_LINE[0], width: 2 });
      limit(lineList);
      lineList.push({ x: i, y1: low, y2: longGlowY, color: LONG_LINE[1], width: 1 });
      limit(lineList);
      labelList.push({ x: i, y: longGlowY, text: wrText, style: 'label_up' });
      limit(labelList);
    }
    if (enterShort) {
      lineList.push({ x: i, y1: high, y2: shortGlowY, color: SHORT_LINE[0], width: 2 });
      limit(lineList);
      lineList.push({ x: i, y1: high, y2: shortGlowY, color: SHORT_LINE[1], width: 1 });
      limit(lineList);
      labelList.push({ x: i, y: shortGlowY, text: wrText, style: 'label_down' });
      limit(labelList);
    }

    if (exitLong && !enterShort) markers.push({ time: bars[i].time, position: 'aboveBar', shape: 'xcross', color: RED, size: 'tiny' });
    if (exitShort && !enterLong) markers.push({ time: bars[i].time, position: 'belowBar', shape: 'xcross', color: GREEN, size: 'tiny' });

    const inTrade = main.state !== 0;
    const entering = enterLong || enterShort;
    if (inTrade && cfg.enableSl) {
      slPlot[i] = main.sl;
      slColor[i] = entering ? null : SL_COLOR;
    }
    if (inTrade && cfg.enableTp) {
      tpPlot[i] = main.tp;
      tpColor[i] = entering ? null : TP_COLOR;
    }
    if (inTrade && cfg.enableTs && !entering) {
      tsPlot[i] = main.ts;
      pricePlot[i] = close;
    }
    if (main.state === 1) {
      tsTopVal[i] = close;
      tsBotVal[i] = main.ts;
      tsTopCol[i] = TS_SHOWN;
      tsBotCol[i] = TS_HIDDEN;
    } else if (main.state === -1) {
      tsTopVal[i] = main.ts;
      tsBotVal[i] = close;
      tsTopCol[i] = TS_HIDDEN;
      tsBotCol[i] = TS_SHOWN;
    }

    prevLong = longCond;
    prevShort = shortCond;
  }

  // ── Dashboards (tables of the last bar) ──
  const sizeOf: Record<string, PineSize> = { Tiny: 'tiny', Small: 'small', Normal: 'normal', Large: 'large', Huge: 'huge' };
  const textSize = sizeOf[cfg.dashboardSize];
  const tableOf = (position: string, columns: number, rows: number): TableData & { merges: TableMergeData[] } => ({
    position: cornerOf(position), columns, rows, cells: [], merges: [],
    bgColor: BACKGROUND, borderWidth: 0, frameColor: BORDERS, frameWidth: 1, forceOverlay: true,
  });
  const tAble = tableOf(cfg.dashboardPosition, 4, 30);
  const tPerf = tableOf(cfg.perfDashboardPosition, 6, 10);

  if (cfg.dashboard && n > 0) {
    const cell = (
      t: TableData, column: number, row: number, text: string, textColor: string,
      textHAlign: TableCellData['textHAlign'], bgColor?: string, height = 0,
    ): void => {
      t.cells.push({ column, row, text, textColor, textSize, textHAlign, ...(bgColor ? { bgColor } : {}), height });
    };
    const divider = (t: TableData & { merges: TableMergeData[] }, row: number, lastColumn: number): void => {
      t.merges.push({ startColumn: 0, startRow: row, endColumn: lastColumn, endRow: row });
      cell(t, 0, row, ROW_DIVIDER, BORDERS, 'center', undefined, 0.5);
    };
    const gradStart = String(color.rgb(18, 20, 26));
    const gradEnd = String(color.rgb(32, 36, 48));
    const perfBg = (c: number, maxC: number, isHeader: boolean): string => {
      const baseCol = color.from_gradient(c, 0, maxC, gradStart, gradEnd);
      return isHeader ? C(baseCol, 30) : String(baseCol);
    };
    const titleBg = String(color.rgb(12, 14, 18));
    /** Blocks of the win rate and its text */
    const hist = (win: number, total: number): [string, string] => {
      const wr = total > 0 ? (win / total) * 100 : 0;
      const blocks = Math.max(0, Math.min(10, Math.trunc(math.round(wr / 10))));
      let s = '';
      for (let b = 1; b <= 10; b++) s += b <= blocks ? '█' : '░';
      const colorHist = ge(wr, 50) ? GREEN : total === 0 ? DATA : RED;
      return [s + '  ' + str.tostring(wr, '#.#') + '%', colorHist];
    };

    const winRate = main.total > 0 ? (main.wins / main.total) * 100 : 0;
    const profitFactor = gt(grossLoss, 0) ? grossProfit / grossLoss : gt(grossProfit, 0) ? 999 : 0;

    // Indicator dashboard
    let r = 0;
    tAble.merges.push({ startColumn: 0, startRow: r, endColumn: 3, endRow: r });
    cell(tAble, 0, r, 'Indicator Dashboard', DATA, 'center', titleBg);
    r += 1;
    divider(tAble, r, 3);
    r += 1;
    cell(tAble, 0, r, 'Indicator', HEADERS, 'left', perfBg(0, 3, true));
    cell(tAble, 1, r, 'Status', HEADERS, 'center', perfBg(1, 3, true));
    cell(tAble, 2, r, 'Standalone WR', HEADERS, 'left', perfBg(2, 3, true));
    cell(tAble, 3, r, 'Enabled', HEADERS, 'right', perfBg(3, 3, true));
    r += 1;
    divider(tAble, r, 3);
    r += 1;
    const names = ['SMA Cross', 'RSI', 'MACD', 'Supertrend', 'Stochastic', 'Bollinger', 'EMA Cross', 'AO', 'SAR', 'CCI', 'ADX Filter'];
    for (let j = 0; j < 11; j++) {
      const bull = bullArr[j];
      const bear = bearArr[j];
      const [histText, histCol] = hist(ind[j].wins, ind[j].total);
      cell(tAble, 0, r, names[j], DATA, 'left', perfBg(0, 3, false));
      cell(tAble, 1, r, bull ? 'Bullish' : bear ? 'Bearish' : 'Neutral', bull ? GREEN : bear ? RED : HEADERS, 'center', perfBg(1, 3, false));
      cell(tAble, 2, r, histText, histCol, 'left', perfBg(2, 3, false));
      cell(tAble, 3, r, enabled[j] ? '✓' : '✗', enabled[j] ? GREEN : RED, 'right', perfBg(3, 3, false));
      r += 1;
      divider(tAble, r, 3);
      r += 1;
    }
    tAble.merges.push({ startColumn: 0, startRow: r, endColumn: 2, endRow: r });
    cell(tAble, 0, r, 'Current Signal', HEADERS, 'left', perfBg(0, 3, false));
    cell(tAble, 3, r, longCond ? 'LONG' : shortCond ? 'SHORT' : 'NEUTRAL', longCond ? GREEN : shortCond ? RED : HEADERS, 'right', perfBg(3, 3, false));

    // Performance dashboard
    let pR = 0;
    tPerf.merges.push({ startColumn: 0, startRow: pR, endColumn: 5, endRow: pR });
    cell(tPerf, 0, pR, 'Backtest Results [LuxAlgo]', DATA, 'center', titleBg);
    pR += 1;
    divider(tPerf, pR, 5);
    pR += 1;
    ['Total Trades', 'Wins', 'Losses', 'Winrate', 'PF', 'PNL %'].forEach((title, c) => {
      cell(tPerf, c, pR, title, HEADERS, 'center', perfBg(c, 5, true));
    });
    pR += 1;
    divider(tPerf, pR, 5);
    pR += 1;
    const lossTrades = main.total - main.wins;
    cell(tPerf, 0, pR, str.tostring(main.total), DATA, 'center', perfBg(0, 5, false));
    cell(tPerf, 1, pR, str.tostring(main.wins), DATA, 'center', perfBg(1, 5, false));
    cell(tPerf, 2, pR, str.tostring(lossTrades), DATA, 'center', perfBg(2, 5, false));
    cell(tPerf, 3, pR, str.tostring(winRate, '#.##') + ' %', ge(winRate, 50) ? GREEN : main.total === 0 ? DATA : RED, 'center', perfBg(3, 5, false));
    cell(
      tPerf, 4, pR, profitFactor === 999 ? 'MAX' : str.tostring(profitFactor, '#.##'),
      gt(profitFactor, 1) ? GREEN : Math.abs(profitFactor) <= EPS ? DATA : RED, 'center', perfBg(4, 5, false),
    );
    cell(
      tPerf, 5, pR, str.tostring(netProfitPct, '#.##') + ' %',
      gt(netProfitPct, 0) ? GREEN : lt(netProfitPct, 0) ? RED : DATA, 'center', perfBg(5, 5, false),
    );
  }

  // ── Output ──
  const T = (arr: number[]) => arr.map((value, i) => ({ time: bars[i].time, value }));
  const TC = (arr: number[], colors: Array<string | null>) =>
    arr.map((value, i) => ({ time: bars[i].time, value, ...(colors[i] !== null ? { color: colors[i] as string } : { color: 'transparent' }) }));
  const clear = C('#000000', 100);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: T(longGlow),
      plot1: T(longGlow),
      plot2: T(longGlow),
      plot3: T(shortGlow),
      plot4: T(shortGlow),
      plot5: T(shortGlow),
      plot6: TC(slPlot, slColor),
      plot7: TC(tpPlot, tpColor),
      plot8: T(tsPlot),
      plot9: T(pricePlot),
    },
    fills: [
      { plot1: 'plot8', plot2: 'plot9', gradient: { topValue: tsTopVal, bottomValue: tsBotVal, topColor: tsTopCol, bottomColor: tsBotCol } },
    ],
    markers,
    // an object created with an na price (no ATR yet) counts in the limit but is not drawn
    lines: lineList.filter((l) => !Number.isNaN(l.y2)).map((l) => ({ time1: bars[l.x].time, price1: l.y1, time2: bars[l.x].time, price2: l.y2, color: l.color, width: l.width })),
    labels: labelList.filter((l) => !Number.isNaN(l.y)).map((l) => ({
      time: bars[l.x].time, price: l.y, text: l.text, color: clear, textColor: fgColor, style: l.style, size: 'tiny' as const,
    })),
    tables: [tAble, tPerf],
  };
}

export const SignalForge = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
