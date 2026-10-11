/**
 * Ranges with Targets [ChartPrime]
 *
 * A daily range with a breakout trade model.
 * - Range: on the first bar of each day, when no trade is open, a new range is set around hl2: the bottom is
 *   hl2 - 15 x A and the top is 25 x A above the bottom. A is half of min(0.3 x ATR(30), 0.3 % of the close) as it
 *   was 20 bars before. This value is only computed on the bars that set a range: its ATR is the average of the
 *   true range of those bars only, and "20 bars before" reads the latest value computed up to that bar. The range
 *   is drawn with two lines that grow to the current bar, and the area between them is filled with a colour from
 *   the position of the close between the lowest low of 5 bars and the highest high of 10 bars.
 * - Trade: when the close of the previous bar crosses over the top (buy) or under the bottom (sell) after bar 100,
 *   and no trade is open, a trade opens at the close. Target = close +/- "Target" x the distance from the close to
 *   the other side of the range; stop = that other side. A dashed line from the bar to the target, a dashed target
 *   line and a "Target" label are drawn (and the stop line, option). The trade ends when the high / low reaches the
 *   target (the label becomes green) or when the close (or the low / high) reaches the stop (the label becomes
 *   pale red with the stop in its tooltip).
 * - Candles, bar colour and background are red in a sell trade, green in a buy trade, dark grey otherwise.
 * - A table on the last bar counts the winning and losing trades and the profit for the given risk per trade.
 * At most 500 lines and 500 labels are kept.
 *
 * The inputs "Line Style" and the two colours after it are not used by the original script.
 *
 * Chart context (optional third argument):
 * - `chart.timezone` and `chart.session`: the exchange calendar of the day starts. Without them the UTC calendar
 *   and the bars.
 * - `chart.mintick`: the symbol tick of the stop price in the label tooltip. Without it 0.01.
 *
 * Reference: "Ranges with Targets [ChartPrime]" by ChartPrime
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © ChartPrime
 */

import { ta, math, str, color, callsite, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type {
  BarColorData, BgColorData, LabelData, LineDrawingData, LinefillData, PlotCandleData, TableCellData, TableData,
} from '../types';
import { barInterval, barTime } from '../bar-time';
import { periodStarts } from '../anchor-period';
import { mintickOf, type ChartContext } from '../chart-context';

export interface RangesWithTargetsInputs {
  filter: boolean;
  target: number;
  slType: 'Close' | 'High/Low';
  risk: number;
  showSL: boolean;
  lineStyle: 'Solid' | 'Dashed' | 'Dotted';
  bull: string;
  bear: string;
}

export const defaultInputs: RangesWithTargetsInputs = {
  filter: false,
  target: 1.3,
  slType: 'Close',
  risk: 100,
  showSL: false,
  lineStyle: 'Dashed',
  bull: '#04BF65',
  bear: '#F60707',
};

const CORE = '➞ Core Settings 🔸';

export const inputConfig: InputConfig[] = [
  { id: 'filter', type: 'bool', title: 'ATR Body Filter', defval: false, group: CORE },
  { id: 'target', type: 'float', title: 'Target', defval: 1.3, step: 0.1, group: CORE, tooltip: 'Target And stop Multiplyer' },
  { id: 'slType', type: 'string', title: 'SL Type', defval: 'Close', options: ['Close', 'High/Low'], group: CORE, tooltip: 'Activate SL on candle close or high/low' },
  { id: 'risk', type: 'float', title: 'Risk Per Trade (USD)', defval: 100, group: CORE },
  { id: 'showSL', type: 'bool', title: 'Show SL', defval: false, group: CORE },
  { id: 'lineStyle', type: 'string', title: 'Line Style', defval: 'Dashed', options: ['Solid', 'Dashed', 'Dotted'], group: CORE, inline: 'Line' },
  { id: 'bull', type: 'color', title: '', defval: '#04BF65', group: CORE, inline: 'Line' },
  { id: 'bear', type: 'color', title: '', defval: '#F60707', group: CORE, inline: 'Line' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Ranges with Targets [ChartPrime]',
  shortTitle: 'Ranges with Targets [ChartPrime]',
  overlay: true,
};

/** indicator(max_lines_count = 500, max_labels_count = 500) */
const MAX_OBJECTS = 500;

const GREEN = String(color.rgb(4, 191, 101));
const TAIL = String(color.rgb(20, 141, 154));
const RED = String(color.rgb(246, 7, 7));
const DARK_GREEN = String(color.rgb(2, 106, 89));
const NEUTRAL = String(color.rgb(52, 52, 54));
const WICK = String(color.rgb(103, 99, 99));
const RED_70 = String(color.new(RED, 70));
const BG_BEAR = String(color.rgb(136, 4, 15, 90));
const BG_BULL = String(color.rgb(8, 191, 158, 90));
const RANGE_COLOR = '#5c439a';
const TABLE_BG = String(color.new('#787B86', 80));
const TITLE_TEXT = '#a3a3b1';
const LOSS_TEXT = '#cd0202';

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !Number.isNaN(a) && !Number.isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !Number.isNaN(a) && !Number.isNaN(b) && !(a - b > EPS);

interface Ln {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  width: number;
  dashed: boolean;
  /** colour of the linefill from this line to the other line of its range */
  fill?: string;
  other?: Ln;
  deleted: boolean;
}
interface Lb {
  x: number;
  y: number;
  color: string;
  tooltip: string;
  deleted: boolean;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<RangesWithTargetsInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'lines' | 'labels' | 'linefills' | 'tables' | 'barColors' | 'bgColors' | 'plotCandles'> & {
  lines: LineDrawingData[];
  labels: LabelData[];
  linefills: LinefillData[];
  tables: TableData[];
  barColors: BarColorData[];
  bgColors: BgColorData[];
  plotCandles: Record<string, PlotCandleData[]>;
} {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const MINTICK = mintickOf(chart);
  const slOnClose = cfg.slType === 'Close';
  const meta = { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay };
  if (n === 0) {
    return { metadata: meta, plots: {}, lines: [], labels: [], linefills: [], tables: [], barColors: [], bgColors: [], plotCandles: { candles: [] } };
  }
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);

  // timeframe.change("1D"): false on the first bar
  const starts = periodStarts(bars, 'D', chart);
  const atr5 = cfg.filter ? A(ta.atr(bars, 5)) : [];
  const lowest5 = A(ta.lowest(new Series(bars, (b) => b.low), 5));
  const highest10 = A(ta.highest(new Series(bars, (b) => b.high), 10));

  // Live drawings in creation order: a creation that brings the count above max + 5 deletes the oldest until max
  // remain. An object that a `var` variable of the script refers to (the two range lines, the target line, the stop
  // line, the label) is never deleted by this rule, but it counts. A deleted object ignores later changes.
  const lines: Ln[] = [];
  const labels: Lb[] = [];
  let res: Ln | null = null;
  let sup: Ln | null = null;
  let tpLine: Ln | null = null;
  let slLine: Ln | null = null;
  let lab: Lb | null = null;
  const newLine = (x1: number, y1: number, x2: number, y2: number, css: string, width: number, dashed: boolean): Ln => {
    const o: Ln = { x1, y1, x2, y2, color: css, width, dashed, deleted: false };
    lines.push(o);
    if (lines.length > MAX_OBJECTS + 5) {
      for (let k = 0; k < lines.length && lines.length > MAX_OBJECTS; ) {
        const l = lines[k];
        if (l === res || l === sup || l === tpLine || l === slLine) k++;
        else lines.splice(k, 1)[0].deleted = true;
      }
    }
    return o;
  };
  const newLabel = (x: number, y: number): Lb => {
    const o: Lb = { x, y, color: TAIL, tooltip: '', deleted: false };
    labels.push(o);
    if (labels.length > MAX_OBJECTS + 5) {
      for (let k = 0; k < labels.length && labels.length > MAX_OBJECTS; ) {
        if (labels[k] === lab) k++;
        else labels.splice(k, 1)[0].deleted = true;
      }
    }
    return o;
  };

  // volAdj(30) called when a range is set: math.min(ta.atr(30) * 0.3, close * (0.3 / 100))[20] / 2.
  // The ATR only sees the bars of these calls; the history keeps one value per bar, the value of the latest call.
  const ATR_LEN = 30;
  let atrPrev = NaN;
  let atrSum = 0;
  let atrCount = 0;
  const volHistory: number[] = new Array(n).fill(NaN);
  let volLast = NaN;
  const volAdj = (i: number): number => {
    const b = bars[i];
    const prevClose = i > 0 ? bars[i - 1].close : NaN;
    const tr = Number.isNaN(prevClose)
      ? b.high - b.low
      : Math.max(b.high - b.low, Math.abs(b.high - prevClose), Math.abs(b.low - prevClose));
    let atr = NaN;
    if (Number.isNaN(atrPrev)) {
      atrSum += tr;
      atrCount += 1;
      if (atrCount === ATR_LEN) atr = atrSum / ATR_LEN;
    } else {
      atr = (tr + (ATR_LEN - 1) * atrPrev) / ATR_LEN;
    }
    atrPrev = atr;
    volLast = Number.isNaN(atr) ? NaN : Math.min(atr * 0.3, b.close * (0.3 / 100));
    return (i >= 20 ? volHistory[i - 20] : NaN) / 2;
  };

  let scr = 0.0;
  let resPrice = 0.0;
  let tradeOn = false;
  let shortTrade = false;
  let tradeIsOn = false;
  let longTrade = false;
  let tp = 0.0;
  let sl = 0.0;
  const score = [0, 0];
  const crossOver = callsite.crossover();
  const crossUnder = callsite.crossunder();
  const stopText = () => 'Stoploss Hit : ' + str.tostring(math.round_to_mintick(sl, MINTICK));

  const barColors: BarColorData[] = [];
  const bgColors: BgColorData[] = [];
  const candles: PlotCandleData[] = [];

  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const time = b.time as number;
    const prevClose = i > 0 ? bars[i - 1].close : NaN;
    const bodyCon = i > 100;
    const bodyCon1 = cfg.filter ? lt(Math.abs(b.close - b.open), atr5[i] * 1) : true;

    if (i > 0 && starts[i] !== starts[i - 1] && !tradeIsOn) {
      const atr = volAdj(i);
      scr = (b.high + b.low) / 2 - atr * 15;
      tradeOn = true;
      resPrice = scr + atr * 25;
      res = newLine(i, resPrice, i, resPrice, RANGE_COLOR, 1, false);
      sup = newLine(i, scr, i, scr, RANGE_COLOR, 1, false);
    }
    volHistory[i] = volLast;

    if (tradeOn && res && sup) {
      if (!res.deleted) res.x2 = i;
      if (!sup.deleted) sup.x2 = i;
    }

    const buy = crossOver(prevClose, resPrice) && bodyCon && bodyCon1;
    const sell = crossUnder(prevClose, scr) && bodyCon && bodyCon1;

    // linefill.new(res, sup, ...): one fill per pair of lines, the latest call replaces the one before
    if (res && sup) {
      res.other = sup;
      res.fill = String(color.new(color.from_gradient(b.close, lowest5[i], highest10[i], '#3a6186', '#89253e'), 80));
    }

    const longDiffSL2 = Math.abs(b.close - resPrice);
    const longDiffSL = Math.abs(b.close - scr);

    const long = buy && !tradeIsOn;
    const short = sell && !tradeIsOn;
    const tradeFire = long || short;
    if (long && !tradeIsOn) {
      longTrade = true;
      shortTrade = false;
    }
    if (short && !tradeIsOn) {
      longTrade = false;
      shortTrade = true;
    }

    if (tradeFire && !tradeIsOn) {
      tp = long ? b.close + cfg.target * longDiffSL : b.close - cfg.target * longDiffSL2;
      sl = long ? b.close - longDiffSL : b.close + longDiffSL2;
      tradeIsOn = true;
      newLine(i, long ? b.high : b.low, i, tp, TAIL, 2, true);
      tpLine = newLine(i, tp, i + 2, tp, TAIL, 1, true);
      if (cfg.showSL) slLine = newLine(i, sl, i + 2, sl, RED, 1, true);
      lab = newLabel(i, tp);
    }
    if (tradeIsOn) {
      if (tpLine && !tpLine.deleted) tpLine.x2 = i;
      if (lab && !lab.deleted) lab.x = i + 1;
      if (cfg.showSL && slLine && !slLine.deleted) slLine.x2 = i;
    }

    if (longTrade && tradeIsOn) {
      if (ge(b.high, tp)) {
        if (lab && !lab.deleted) lab.color = GREEN;
        score[0] += 1;
        tradeIsOn = false;
      }
      if (le(slOnClose ? b.close : b.low, sl)) {
        score[1] += 1;
        if (lab && !lab.deleted) {
          lab.color = RED_70;
          lab.tooltip = stopText();
        }
        tradeIsOn = false;
      }
    } else if (shortTrade && tradeIsOn) {
      if (le(b.low, tp)) {
        if (lab && !lab.deleted) lab.color = GREEN;
        score[0] += 1;
        tradeIsOn = false;
      }
      if (ge(slOnClose ? b.close : b.high, sl)) {
        score[1] += 1;
        if (lab && !lab.deleted) {
          lab.color = RED_70;
          lab.tooltip = stopText();
        }
        tradeIsOn = false;
      }
    }

    const bearCon = tradeIsOn && shortTrade;
    const bullCon = tradeIsOn && longTrade;
    const css = bearCon ? RED : bullCon ? DARK_GREEN : NEUTRAL;
    barColors.push({ time, color: css });
    candles.push({ time, open: b.open, high: b.high, low: b.low, close: b.close, color: css, wickColor: WICK, borderColor: css });
    if (bearCon || bullCon) bgColors.push({ time, color: bearCon ? BG_BEAR : BG_BULL });
  }

  // Table of the last bar
  const grossP = score[0] * (cfg.risk * cfg.target);
  const grossL = score[1] * cfg.risk;
  const pnl = grossP - grossL;
  const cell = (column: number, row: number, text: string, textColor: string): TableCellData => (
    { column, row, text, textColor, textSize: 'auto' }
  );
  const tables: TableData[] = [{
    position: 'top_right',
    columns: 6,
    rows: 6,
    bgColor: TABLE_BG,
    cells: [
      cell(0, 0, 'Winning Trades', TITLE_TEXT),
      cell(1, 0, str.tostring(score[0]), '#08c09b'),
      cell(0, 1, 'Losing Trades', TITLE_TEXT),
      cell(1, 1, str.tostring(score[1]), LOSS_TEXT),
      cell(0, 2, 'Gross Profit', TITLE_TEXT),
      cell(1, 2, str.tostring(grossP), gt(grossP, 0) ? '#1eddd4' : LOSS_TEXT),
      cell(0, 3, 'Gross Loss', TITLE_TEXT),
      cell(1, 3, str.tostring(-grossL), LOSS_TEXT),
      cell(0, 4, 'Final PNL', TITLE_TEXT),
      cell(1, 4, str.tostring(pnl), '#ba7726'),
    ],
  }];

  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  // a line with an na coordinate is not drawn
  const drawn = (l: Ln) => !Number.isNaN(l.y1) && !Number.isNaN(l.y2);
  const lineOf = (l: Ln): LineDrawingData => ({
    time1: T(l.x1), price1: l.y1, time2: T(l.x2), price2: l.y2, color: l.color,
    ...(l.width !== 1 ? { width: l.width } : {}),
    ...(l.dashed ? { style: 'dashed' as const } : {}),
  });
  return {
    metadata: meta,
    plots: {},
    lines: lines.filter(drawn).map(lineOf),
    labels: labels.map((l) => ({
      time: T(l.x), price: l.y, text: 'Target', color: l.color, textColor: '#FFFFFF', style: 'label_left' as const, size: 'small' as const,
      ...(l.tooltip ? { tooltip: l.tooltip } : {}),
    })),
    linefills: lines.filter((l) => l.fill !== undefined && l.other && !l.other.deleted && drawn(l) && drawn(l.other))
      .map((l) => ({ line1: lineOf(l), line2: lineOf(l.other!), color: l.fill })),
    tables,
    barColors,
    bgColors,
    plotCandles: { candles },
  };
}

export const RangesWithTargets = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
