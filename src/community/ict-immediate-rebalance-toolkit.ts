/**
 * ICT Immediate Rebalance Toolkit [LuxAlgo]
 *
 * Five tools drawn on the price chart.
 * - Immediate rebalances. Bullish: the low is below the high of two bars back and above its close, and the close
 *   and the previous close are above that high (the close also above the previous close); bearish: the mirror. A
 *   line is drawn at the high (low) of the bar two bars back, three thinner lines at 75 %, 50 % and 25 % of its wick,
 *   and an icon at the current bar. 'Confirmation (Bars)' bars later the icon becomes a cross when the low (high)
 *   of that bar went back through the line (a failed rebalance).
 * - Buyside / sellside liquidity. Swing highs (lows) with 'Detection Length' bars on the left and one bar on the
 *   right are kept as a zigzag. When three or more swing highs (lows) are within ATR(10) / (10 / 'Margin') of the new
 *   one, a level is drawn at the oldest of them: a line up to the previous bar, a dotted line that follows the
 *   price until the high (low) goes through the zone, and a text. 'Visible Liquidity Levels' levels are kept per
 *   side. 'Timeframe' only multiplies the detection length by the ratio of that timeframe to the chart timeframe
 *   (intraday charts).
 * - Order blocks. When the previous close goes above the last swing high (below the last swing low; swings of
 *   'Swing Detection Length' bars), the bar with the lowest low (highest high) since that swing is the order block:
 *   a box with a line at its top, middle and bottom, extended to the current bar until the price closes through it
 *   ('Mitigation Price': close or wick). With 'Breaker Blocks' a mitigated order block goes on as a breaker block
 *   until the price comes back through it. 'Visible Order & Breaker Blocks' are kept per side.
 * - Liquidity voids (last 501 bars only): a gap between the low and the high of two bars back that is larger than
 *   ATR(144) times 'Liquidity Voids Width Filter', drawn as 13 boxes that are extended one bar after the current bar
 *   until the price goes through their middle (then they take the 'Mitigated' colour or are removed).
 * - Macros (charts of 15 minutes or less): the background of the chosen time windows (New York time as UTC-5), the
 *   high and low lines of each window (extended until the price goes through them), the mean line and a label.
 *
 * Drawings are kept up to 500 lines, 500 boxes and 500 labels (the oldest are removed). As the original, the
 * indicator stops with an error when a liquidity level starts more than 10,000 bars before the current bar (seen
 * with a 'Timeframe' far above the chart timeframe).
 *
 * Chart values read (optional third argument of calculate): the chart timeframe (macros and the 'Timeframe' of the
 * liquidity levels; without it the timeframe is read from the bar spacing), the state of the last bar (a rebalance is
 * only marked as failed on a closed bar; without it the last bar is taken as closed) and the chart foreground
 * colour (text of old liquidity voids; without it the dark theme colour #DBDBDB).
 *
 * Reference: "ICT Immediate Rebalance Toolkit [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import { ta, Series, color, time, timeframe, barTime, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BgColorData, BoxData, LabelData, LineDrawingData, PineSize } from '../types';
import { chartTimeframe } from '../anchor-period';
import { foregroundColorOf, lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface IctImmediateRebalanceToolkitInputs {
  /** Immediate Rebalances */
  irSH: boolean;
  irBC: string;
  irSC: string;
  /** Wicks 75% / 50% / 25% line colours */
  irL75: string;
  irL50: string;
  irL25: string;
  /** Confirmation (Bars) */
  irCFR: number;
  /** Immediate Rebalance Icon */
  irSZ: 'Small' | 'Normal' | 'Large';
  /** Buyside/Sellside Liquidity */
  liqSH: boolean;
  /** Timeframe: multiplies the detection length by the ratio of this timeframe to the chart timeframe */
  liqTF: 'Chart' | '5 Minutes' | '15 Minutes' | '1 Hour' | '4 Hours' | '1 Day';
  liqLN: number;
  /** Margin (the zone is ATR(10) / (10 / margin) around the level) */
  liqMargin: number;
  liqBC: string;
  liqSC: string;
  /** Visible Liquidity Levels */
  liqVL: number;
  /** Order Blocks */
  obSH: boolean;
  /** Breaker Blocks */
  bbSH: boolean;
  /** Swing Detection Length */
  obbLN: number;
  /** Mitigation Price */
  obbMT: 'Closing Price' | 'Wick';
  /** Use Candle Body in Detection */
  obbUB: boolean;
  /** Remove Mitigated Order & Breaker Blocks */
  obbR: boolean;
  obCb: string;
  obCa: string;
  bbCb: string;
  bbCa: string;
  /** Visible Order & Breaker Blocks */
  obbVL: number;
  /** Order & Breaker Blocks Labels */
  obbTX: boolean;
  obbLSZ: 'Tiny' | 'Small' | 'Normal';
  /** Liquidity Voids */
  lqvSH: boolean;
  /** Liquidity Voids Width Filter (times ATR(144)) */
  lqvTH: number;
  /** Ignore Price Gaps */
  lqvGP: boolean;
  /** Remove Mitigated Liquidity Voids */
  lqvRM: boolean;
  lqvBC: string;
  lqvSC: string;
  lqvMC: string;
  /** Liquidity Void Labels */
  lqvTX: boolean;
  m02330300: boolean;
  mcLDNC2: string;
  m04030430: boolean;
  mcLDNC4: string;
  m08500910: boolean;
  mcNYAMC8: string;
  m09501010: boolean;
  mcNYAMC9: string;
  m10501110: boolean;
  mcNYAMC10: string;
  m11501210: boolean;
  mcNYLC: string;
  m13101340: boolean;
  mcNYPMC13: string;
  m15151545: boolean;
  mcNYPMC15: string;
  /** Macro Top/Bottom Lines */
  mcTB: boolean;
  /** Extend */
  mcLE: boolean;
  /** Macro Mean Line */
  mcML: boolean;
  /** Macro Labels */
  mcLB: boolean;
  mcLSZ: 'Tiny' | 'Small' | 'Normal';
}

export const defaultInputs: IctImmediateRebalanceToolkitInputs = {
  irSH: true,
  irBC: 'rgba(91, 156, 246, 0.99)',
  irSC: 'rgba(255, 183, 77, 0.99)',
  irL75: 'rgba(178, 181, 190, 0.99)',
  irL50: 'rgba(209, 212, 220, 0.99)',
  irL25: 'rgba(178, 181, 190, 0.99)',
  irCFR: 2,
  irSZ: 'Normal',
  liqSH: true,
  liqTF: 'Chart',
  liqLN: 7,
  liqMargin: 6.9,
  liqBC: '#089981',
  liqSC: '#f23645',
  liqVL: 3,
  obSH: true,
  bbSH: false,
  obbLN: 7,
  obbMT: 'Closing Price',
  obbUB: false,
  obbR: false,
  obCb: 'rgba(33, 87, 243, 0.1)',
  obCa: 'rgba(255, 93, 0, 0.1)',
  bbCb: 'rgba(255, 17, 0, 0.1)',
  bbCa: 'rgba(12, 181, 26, 0.1)',
  obbVL: 1,
  obbTX: true,
  obbLSZ: 'Small',
  lqvSH: false,
  lqvTH: 0.9,
  lqvGP: false,
  lqvRM: false,
  lqvBC: 'rgba(76, 175, 80, 0.13)',
  lqvSC: 'rgba(242, 54, 69, 0.13)',
  lqvMC: 'rgba(93, 96, 107, 0.13)',
  lqvTX: false,
  m02330300: false,
  mcLDNC2: 'rgba(156, 39, 176, 0.11)',
  m04030430: false,
  mcLDNC4: 'rgba(156, 39, 176, 0.11)',
  m08500910: false,
  mcNYAMC8: 'rgba(0, 188, 212, 0.11)',
  m09501010: false,
  mcNYAMC9: 'rgba(0, 188, 212, 0.11)',
  m10501110: false,
  mcNYAMC10: 'rgba(0, 188, 212, 0.11)',
  m11501210: false,
  mcNYLC: 'rgba(255, 93, 0, 0.11)',
  m13101340: false,
  mcNYPMC13: 'rgba(33, 87, 243, 0.11)',
  m15151545: false,
  mcNYPMC15: 'rgba(33, 87, 243, 0.11)',
  mcTB: true,
  mcLE: true,
  mcML: false,
  mcLB: true,
  mcLSZ: 'Small',
};

const IR_GROUP = 'Immediate Rebalances';
const LIQ_GROUP = 'Buyside/Sellside Liquidity';
const OBB_GROUP = 'Order Blocks & Breaker Blocks';
const LQV_GROUP = 'Liquidity Voids';
const MC_GROUP = 'Macros';

export const inputConfig: InputConfig[] = [
  { id: 'irSH', type: 'bool', title: 'Immediate Rebalances', defval: true, group: IR_GROUP },
  { id: 'irBC', type: 'color', title: '  Bullish Immediate Rebalance', defval: defaultInputs.irBC, group: IR_GROUP },
  { id: 'irSC', type: 'color', title: '  Bearish Immediate Rebalance', defval: defaultInputs.irSC, group: IR_GROUP },
  { id: 'irL75', type: 'color', title: '  Wicks 75%', defval: defaultInputs.irL75, group: IR_GROUP, inline: 'IR' },
  { id: 'irL50', type: 'color', title: '50%', defval: defaultInputs.irL50, group: IR_GROUP, inline: 'IR' },
  { id: 'irL25', type: 'color', title: '25%', defval: defaultInputs.irL25, group: IR_GROUP, inline: 'IR' },
  {
    id: 'irCFR', type: 'int', title: '  Confirmation (Bars)', defval: 2, min: 1, max: 5, group: IR_GROUP,
    tooltip: 'Specifies the number of bars required to confirm the validation of the detected immediate rebalance.\n\n'
      + 'It\'s important to highlight that both failed and successful immediate rebalances, when considered within a context, are significant signatures in trading.',
  },
  { id: 'irSZ', type: 'string', title: '  Immediate Rebalance Icon', defval: 'Normal', options: ['Small', 'Normal', 'Large'], group: IR_GROUP },

  { id: 'liqSH', type: 'bool', title: 'Buyside/Sellside Liquidity', defval: true, group: LIQ_GROUP },
  {
    id: 'liqTF', type: 'string', title: '  Timeframe', defval: 'Chart',
    options: ['Chart', '5 Minutes', '15 Minutes', '1 Hour', '4 Hours', '1 Day'], group: LIQ_GROUP,
    tooltip: 'This option is to identify liquidity levels from higher timeframes. If a timeframe lower than the chart\'s timeframe is selected, calculations will be based on the chart\'s timeframe.',
  },
  { id: 'liqLN', type: 'int', title: '  Detection Length', defval: 7, min: 3, max: 13, group: LIQ_GROUP },
  { id: 'liqMargin', type: 'float', title: '  Margin', defval: 6.9, min: 4, max: 9, step: 0.1, group: LIQ_GROUP },
  { id: 'liqBC', type: 'color', title: '  Buyside Liquidity', defval: '#089981', group: LIQ_GROUP },
  { id: 'liqSC', type: 'color', title: '  Sellside Liquidity', defval: '#f23645', group: LIQ_GROUP },
  { id: 'liqVL', type: 'int', title: '  Visible Liquidity Levels', defval: 3, min: 1, max: 50, group: LIQ_GROUP },

  { id: 'obSH', type: 'bool', title: 'Order Blocks', defval: true, group: OBB_GROUP },
  { id: 'bbSH', type: 'bool', title: 'Breaker Blocks', defval: false, group: OBB_GROUP },
  { id: 'obbLN', type: 'int', title: '  Swing Detection Length', defval: 7, min: 3, group: OBB_GROUP },
  { id: 'obbMT', type: 'string', title: '  Mitigation Price', defval: 'Closing Price', options: ['Closing Price', 'Wick'], group: OBB_GROUP },
  { id: 'obbUB', type: 'bool', title: 'Use Candle Body in Detection', defval: false, group: OBB_GROUP },
  { id: 'obbR', type: 'bool', title: 'Remove Mitigated Order & Breaker Blocks', defval: false, group: OBB_GROUP },
  { id: 'obCb', type: 'color', title: '  Order Blocks  : Bullish', defval: defaultInputs.obCb, group: OBB_GROUP, inline: 'OBC' },
  { id: 'obCa', type: 'color', title: 'Bearish', defval: defaultInputs.obCa, group: OBB_GROUP, inline: 'OBC' },
  { id: 'bbCb', type: 'color', title: '  Breaker Blocks : Bullish', defval: defaultInputs.bbCb, group: OBB_GROUP, inline: 'BBC' },
  { id: 'bbCa', type: 'color', title: 'Bearish', defval: defaultInputs.bbCa, group: OBB_GROUP, inline: 'BBC' },
  { id: 'obbVL', type: 'int', title: '  Visible Order & Breaker Blocks', defval: 1, min: 1, max: 50, group: OBB_GROUP },
  { id: 'obbTX', type: 'bool', title: 'Order & Breaker Blocks Labels', defval: true, group: OBB_GROUP, inline: 'SZ' },
  { id: 'obbLSZ', type: 'string', title: '', defval: 'Small', options: ['Tiny', 'Small', 'Normal'], group: OBB_GROUP, inline: 'SZ' },

  { id: 'lqvSH', type: 'bool', title: 'Liquidity Voids', defval: false, group: LQV_GROUP },
  {
    id: 'lqvTH', type: 'float', title: '  Liquidity Voids Width Filter', defval: 0.9, min: 0, step: 0.1, group: LQV_GROUP,
    tooltip: 'The script showcases liquidity voids that exceed a predetermined length calculated by multiplying the fixed-average true range (ATR) value by the option\'s value.\n\n'
      + 'The option value set to 0 means no filtering is applied.\n\n'
      + 'Remark: No filtering will be implemented for the initial 144 candles based on the fixed-length ATR, as the ATR value won\'t be available during this period.',
  },
  { id: 'lqvGP', type: 'bool', title: 'Ignore Price Gaps', defval: false, group: LQV_GROUP },
  { id: 'lqvRM', type: 'bool', title: 'Remove Mitigated Liquidity Voids', defval: false, group: LQV_GROUP },
  { id: 'lqvBC', type: 'color', title: '  Bullish Liquidity Voids', defval: defaultInputs.lqvBC, group: LQV_GROUP },
  { id: 'lqvSC', type: 'color', title: '  Bearish Liquidity Voids', defval: defaultInputs.lqvSC, group: LQV_GROUP },
  { id: 'lqvMC', type: 'color', title: '  Mitigated Liquidity Voids', defval: defaultInputs.lqvMC, group: LQV_GROUP },
  { id: 'lqvTX', type: 'bool', title: 'Liquidity Void Labels', defval: false, group: LQV_GROUP },

  { id: 'm02330300', type: 'bool', title: '02:33 AM 03:00 - LONDON ', defval: false, group: MC_GROUP, inline: 'LND2' },
  { id: 'mcLDNC2', type: 'color', title: '', defval: defaultInputs.mcLDNC2, group: MC_GROUP, inline: 'LND2' },
  { id: 'm04030430', type: 'bool', title: '04:03 AM 04:30 - LONDON ', defval: false, group: MC_GROUP, inline: 'LND4' },
  { id: 'mcLDNC4', type: 'color', title: '', defval: defaultInputs.mcLDNC4, group: MC_GROUP, inline: 'LND4' },
  { id: 'm08500910', type: 'bool', title: '08:50 AM 09:10 - NY AM  ', defval: false, group: MC_GROUP, inline: 'NYA8' },
  { id: 'mcNYAMC8', type: 'color', title: '', defval: defaultInputs.mcNYAMC8, group: MC_GROUP, inline: 'NYA8' },
  { id: 'm09501010', type: 'bool', title: '09:50 AM 10:10 - NY AM  ', defval: false, group: MC_GROUP, inline: 'NYA9' },
  { id: 'mcNYAMC9', type: 'color', title: '', defval: defaultInputs.mcNYAMC9, group: MC_GROUP, inline: 'NYA9' },
  { id: 'm10501110', type: 'bool', title: '10:50 AM 11:10 - NY AM  ', defval: false, group: MC_GROUP, inline: 'NYA10' },
  { id: 'mcNYAMC10', type: 'color', title: '', defval: defaultInputs.mcNYAMC10, group: MC_GROUP, inline: 'NYA10' },
  { id: 'm11501210', type: 'bool', title: '11:50 AM 12:10 - NY LAUNCH', defval: false, group: MC_GROUP, inline: 'NYL' },
  { id: 'mcNYLC', type: 'color', title: '', defval: defaultInputs.mcNYLC, group: MC_GROUP, inline: 'NYL' },
  { id: 'm13101340', type: 'bool', title: '13:10 PM 13:40 - NY PM  ', defval: false, group: MC_GROUP, inline: 'NYP13' },
  { id: 'mcNYPMC13', type: 'color', title: '', defval: defaultInputs.mcNYPMC13, group: MC_GROUP, inline: 'NYP13' },
  { id: 'm15151545', type: 'bool', title: '15:15 PM 15:45 - NY PM  ', defval: false, group: MC_GROUP, inline: 'NYP15' },
  { id: 'mcNYPMC15', type: 'color', title: '', defval: defaultInputs.mcNYPMC15, group: MC_GROUP, inline: 'NYP15' },
  { id: 'mcTB', type: 'bool', title: 'Macro Top/Bottom Lines', defval: true, group: MC_GROUP, inline: 'LN' },
  {
    id: 'mcLE', type: 'bool', title: 'Extend', defval: true, group: MC_GROUP, inline: 'LN',
    tooltip: 'In this context, "extend" refers to the action of projecting or elongating the visual objects beyond the boundaries of the macros.',
  },
  { id: 'mcML', type: 'bool', title: 'Macro Mean Line', defval: false, group: MC_GROUP },
  { id: 'mcLB', type: 'bool', title: 'Macro Labels', defval: true, group: MC_GROUP, inline: 'ST' },
  { id: 'mcLSZ', type: 'string', title: '', defval: 'Small', options: ['Tiny', 'Small', 'Normal'], group: MC_GROUP, inline: 'ST' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'ICT Immediate Rebalance Toolkit [LuxAlgo]',
  shortTitle: 'LuxAlgo - ICT Immediate Rebalance Toolkit',
  overlay: true,
};

/** indicator(max_lines_count = 500, max_boxes_count = 500, max_labels_count = 500) */
const MAX_COUNT = 500;
/** Time zone of the macro windows (nyTZ / ldnTZ of the script) */
const MACRO_TZ = 'UTC-5';
/** Size of the zigzag arrays of the liquidity levels */
const ZZ_SIZE = 50;
/** Largest distance in bars between the current bar and the bar index of a new drawing */
const MAX_BARS_BACK_X = 10000;
/** Number of boxes of one liquidity void */
const LQV_BOXES = 13;

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
const avg = (a: number, b: number) => (a + b) / 2;

type Style = 'solid' | 'dashed' | 'dotted';
/** A drawing: `dead` = deleted (by the script or by the count limit); `byTime` = x values are bar times */
interface Obj { dead: boolean; byTime: boolean }
interface Ln extends Obj { x1: number; y1: number; x2: number; y2: number; color: string; style: Style; width: number }
interface Bx extends Obj {
  left: number; top: number; right: number; bottom: number;
  /** undefined: the default background of a box */
  bg?: string;
  border: string;
  text?: string; textSize?: PineSize; hAlign?: 'left' | 'center' | 'right'; vAlign?: 'top' | 'center' | 'bottom'; textColor?: string;
}
interface Lb extends Obj {
  x: number; y: number; text: string; color: string; textColor: string;
  style: 'label_center' | 'label_down'; size: PineSize; tooltip?: string;
}

/**
 * Live drawings of one kind in creation order. The count limit of Pine: when a creation brings the count above
 * max + 5, the oldest objects are deleted until max remain.
 */
class Pool<T extends Obj> {
  readonly list: T[] = [];
  add(o: T): T {
    this.list.push(o);
    if (this.list.length > MAX_COUNT + 5) for (const old of this.list.splice(0, this.list.length - MAX_COUNT)) old.dead = true;
    return o;
  }
  /** x.delete() */
  del(o: T | null): void {
    if (o === null || o.dead) return;
    o.dead = true;
    const k = this.list.indexOf(o);
    if (k >= 0) this.list.splice(k, 1);
  }
}
/** A drawing that still exists: setters do nothing and getters give na on the others */
const live = <T extends Obj>(o: T | null): o is T => o !== null && !o.dead;

interface Ir { ln: Ln; lbE: Lb; idx: number }
interface Liq { bx: Bx | null; bxt: Bx | null; brL: boolean; ln: Ln | null; lne: Ln | null }
interface Macro { lnT: Ln | null; lnM: Ln | null; lnB: Ln | null; lb: Lb | null }
interface Ob { top: number; btm: number; obI: number; lnCE: Ln; lnTOP: Ln; lnBTM: Ln; bxOB: Bx; extend: boolean }
interface Bb { lnCE: Ln; lnTOP: Ln; lnBTM: Ln; bxOB: Bx; bxBB: Bx; extend: boolean; breaker: boolean }
interface Swing { y: number; i: number; x: boolean }
/** The `var` values of one call of mcRender() */
interface MacroSite {
  on: boolean; session: string; css: string; text: string;
  max: number; mid: number; min: number; sbT: number; xt: boolean; xb: boolean; prev: boolean;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<IctImmediateRebalanceToolkitInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { bgColors: BgColorData[]; lines: LineDrawingData[]; boxes: BoxData[]; labels: LabelData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const msTimes = n > 0 && bars[0].time >= 1e12;

  // timeframe.* of the chart
  const tfName = chartTimeframe(bars, chart);
  const tf = timeframe.info(tfName || '1D');
  // bar duration for the session test of the macro windows (clock-change rule of the library)
  const barMs = tfName === '' ? undefined : timeframe.in_seconds(tfName) * 1000;
  // chart.fg_color; barstate.isconfirmed of the last bar
  const chartFg = foregroundColorOf(chart);
  const lastConfirmed = lastBarConfirmedOf(chart);

  const O = (i: number) => (i >= 0 ? bars[i].open : NaN);
  const H = (i: number) => (i >= 0 ? bars[i].high : NaN);
  const L = (i: number) => (i >= 0 ? bars[i].low : NaN);
  const C = (i: number) => (i >= 0 ? bars[i].close : NaN);
  const T = (i: number) => (i >= 0 ? bars[i].time : NaN);
  const highS = new Series(bars, (b) => b.high);
  const lowS = new Series(bars, (b) => b.low);

  const lines = new Pool<Ln>();
  const boxes = new Pool<Bx>();
  const labels = new Pool<Lb>();
  const bgColors: BgColorData[] = [];
  const newLine = (x1: number, y1: number, x2: number, y2: number, css: string, style: Style = 'solid', width = 1, byTime = false) =>
    lines.add({ dead: false, byTime, x1, y1, x2, y2, color: css, style, width });
  /** line.new(na, na, na, na, xloc.bar_time, color = na, ...) */
  const naLine = (style: Style) => newLine(NaN, NaN, NaN, NaN, 'transparent', style, 1, true);
  const y1Of = (l: Ln | null) => (live(l) ? l.y1 : NaN);
  const setX2 = (l: Ln | null, x: number) => {
    if (live(l)) l.x2 = x;
  };

  // ---- Immediate rebalances
  const irSize: PineSize = cfg.irSZ === 'Small' ? 'small' : cfg.irSZ === 'Normal' ? 'normal' : 'large';
  const irWidth = cfg.irSZ === 'Small' || cfg.irSZ === 'Normal' ? 2 : 3;
  const bIR: Ir[] = [];
  const aIR: Ir[] = [];

  // ---- Macros
  const macroSize: PineSize = cfg.mcLSZ === 'Tiny' ? 'tiny' : cfg.mcLSZ === 'Small' ? 'small' : 'normal';
  const tfM = tf.multiplier <= 15 && tf.isminutes;
  const site = (on: boolean, session: string, css: string, text: string): MacroSite =>
    ({ on, session, css, text, max: NaN, mid: NaN, min: NaN, sbT: NaN, xt: false, xb: false, prev: false });
  const macroSites: MacroSite[] = [
    site(cfg.m02330300, '0233-0300', cfg.mcLDNC2, 'LONDON\n02:33 AM 03:00'),
    site(cfg.m04030430, '0403-0430', cfg.mcLDNC4, 'LONDON\n04:03 AM 04:30'),
    site(cfg.m08500910, '0850-0910', cfg.mcNYAMC8, 'NEW YORK AM\n08:50 AM 09:10'),
    site(cfg.m09501010, '0950-1010', cfg.mcNYAMC9, 'NEW YORK AM\n09:50 AM 10:10'),
    site(cfg.m10501110, '1050-1110', cfg.mcNYAMC10, 'NEW YORK AM\n10:50 AM 11:10'),
    site(cfg.m11501210, '1150-1210', cfg.mcNYLC, 'NEW YORK LAUNCH\n11:50 AM 12:10'),
    site(cfg.m13101340, '1310-1340', cfg.mcNYPMC13, 'NEW YORK PM\n13:10 PM 13:40'),
    site(cfg.m15151545, '1515-1545', cfg.mcNYPMC15, 'NEW YORK PM\n15:15 PM 15:45'),
  ];
  const anyMacro = macroSites.some((s) => s.on);
  const mc: Macro = { lnT: null, lnM: null, lnB: null, lb: null };

  // ---- Buyside / sellside liquidity
  const tfm = cfg.liqTF === '5 Minutes' && tf.multiplier <= 5 ? 5
    : cfg.liqTF === '15 Minutes' && tf.multiplier <= 15 ? 15
      : cfg.liqTF === '1 Hour' && tf.multiplier <= 60 ? 60
        : cfg.liqTF === '4 Hours' && tf.multiplier <= 240 ? 240
          : cfg.liqTF === '1 Day' && tf.multiplier <= 1440 ? 1440
            : tf.isdaily ? 1440 : tf.multiplier;
  const chm = tf.isintraday ? tf.multiplier : tf.isdaily ? 1440 : NaN;
  const liqLN = tf.isdwm ? cfg.liqLN : cfg.liqLN * Math.trunc(tfm / chm);
  const liqMR = 10 / cfg.liqMargin;
  const liqATR = A(ta.atr(bars, 10));
  const ph = A(ta.pivothigh(highS, liqLN, 1));
  const pl = A(ta.pivotlow(lowS, liqLN, 1));
  const zzD: number[] = new Array(ZZ_SIZE).fill(0);
  const zzX: number[] = new Array(ZZ_SIZE).fill(0);
  const zzY: number[] = new Array(ZZ_SIZE).fill(NaN);
  const bsLIQ: Liq[] = [{ bx: null, bxt: null, brL: false, ln: null, lne: null }];
  const ssLIQ: Liq[] = [{ bx: null, bxt: null, brL: false, ln: null, lne: null }];
  const liqDelete = (q: Liq) => {
    boxes.del(q.bx);
    boxes.del(q.bxt);
    lines.del(q.ln);
    lines.del(q.lne);
  };

  // ---- Order blocks and breaker blocks
  const obbLN = cfg.obbLN;
  const upper = A(ta.highest(highS, obbLN));
  const lower = A(ta.lowest(lowS, obbLN));
  const obbMP = cfg.obbMT === 'Closing Price';
  const obbSize: PineSize = cfg.obbLSZ === 'Tiny' ? 'tiny' : cfg.obbLSZ === 'Small' ? 'small' : 'normal';
  const maxOf = (i: number) => (cfg.obbUB ? Math.max(C(i), O(i)) : H(i));
  const minOf = (i: number) => (cfg.obbUB ? Math.min(C(i), O(i)) : L(i));
  let os = 0;
  let swingTop: Swing = { y: NaN, i: NaN, x: false };
  let swingBtm: Swing = { y: NaN, i: NaN, x: false };
  const aOB: Ob[] = [];
  const bOB: Ob[] = [];
  const aBB: Bb[] = [];
  const bBB: Bb[] = [];
  const naBox = (extra: Partial<Bx>) =>
    boxes.add({ dead: false, byTime: true, left: NaN, top: NaN, right: NaN, bottom: NaN, border: 'transparent', ...extra });
  const textBox = (text: string, vAlign: 'top' | 'bottom', css: string) =>
    naBox({ text: cfg.obbTX ? text : '', textSize: obbSize, hAlign: 'center', vAlign, textColor: String(color.new(css, 0)) });
  const newBlocks = (obs: Ob[], bbs: Bb[], top: number, btm: number, obI: number, bull: boolean) => {
    obs.unshift({
      top, btm, obI, lnCE: naLine('solid'), lnTOP: naLine('dashed'), lnBTM: naLine('dashed'),
      bxOB: textBox(bull ? '+OB' : '-OB', bull ? 'bottom' : 'top', bull ? cfg.obCb : cfg.obCa), extend: true,
    });
    bbs.unshift({
      lnCE: naLine('solid'), lnTOP: naLine('dashed'), lnBTM: naLine('dashed'),
      bxOB: naBox({ bg: 'transparent' }),
      bxBB: textBox(bull ? '+BB' : '-BB', bull ? 'top' : 'bottom', bull ? cfg.bbCb : cfg.bbCa),
      extend: true, breaker: false,
    });
  };
  /** obbRender(): the box and its three lines */
  const render = (bx: Bx, o: { lnCE: Ln; lnTOP: Ln; lnBTM: Ln }, left: number, top: number, right: number, bottom: number, css: string) => {
    if (live(bx)) {
      bx.left = left;
      bx.top = top;
      bx.right = right;
      bx.bottom = bottom;
      bx.bg = css;
      bx.textColor = String(color.new(css, 0));
    }
    const lineCss = String(color.new(css, 3));
    const place = (l: Ln, y: number) => {
      if (!live(l)) return;
      l.x1 = left;
      l.y1 = y;
      l.x2 = right;
      l.y2 = y;
      l.color = lineCss;
    };
    place(o.lnTOP, top);
    place(o.lnCE, avg(top, bottom));
    place(o.lnBTM, bottom);
  };
  /** obbSetRight() */
  const setRight = (bx: Bx, o: { lnCE: Ln; lnTOP: Ln; lnBTM: Ln }, right: number) => {
    if (live(bx)) bx.right = right;
    setX2(o.lnTOP, right);
    setX2(o.lnCE, right);
    setX2(o.lnBTM, right);
  };
  const deleteOb = (ob: Ob) => {
    boxes.del(ob.bxOB);
    lines.del(ob.lnCE);
    lines.del(ob.lnTOP);
    lines.del(ob.lnBTM);
  };
  const deleteBb = (bb: Bb) => {
    boxes.del(bb.bxOB);
    boxes.del(bb.bxBB);
    lines.del(bb.lnCE);
    lines.del(bb.lnTOP);
    lines.del(bb.lnBTM);
  };

  // ---- Liquidity voids
  const lqvATR = A(ta.atr(bars, 144)).map((v) => v * cfg.lqvTH);
  const LQV: Bx[] = [];
  let prevBLQV = false;
  let prevALQV = false;
  /** Pine `!=` of two math.sign() values: false when one is na */
  const signDiffers = (a: number, b: number) => !Number.isNaN(a) && !Number.isNaN(b) && Math.sign(a) !== Math.sign(b);

  for (let i = 0; i < n; i++) {
    const { high, low, close } = bars[i];
    const t = bars[i].time;
    const confirmed = i < n - 1 || lastConfirmed;
    const o1 = O(i - 1);
    const h1 = H(i - 1);
    const l1 = L(i - 1);
    const c1 = C(i - 1);
    const t1 = T(i - 1);
    const o2 = O(i - 2);
    const h2 = H(i - 2);
    const l2 = L(i - 2);
    const c2 = C(i - 2);

    // ---- Immediate rebalances
    if (cfg.irSH) {
      const rebalance = (list: Ir[], bull: boolean) => {
        const found = bull
          ? lt(low, h2) && gt(low, c2) && gt(close, h2) && gt(c1, h2) && gt(close, c1)
          : gt(high, l2) && lt(high, c2) && lt(close, l2) && lt(c1, l2) && lt(close, c1);
        if (found) {
          const level = bull ? h2 : l2;
          const body = bull ? Math.max(o2, c2) : Math.min(o2, c2);
          const half = avg(level, body);
          const css = bull ? cfg.irBC : cfg.irSC;
          const ln = newLine(i - 2, level, i, level, css, 'solid', irWidth);
          newLine(i - 2, avg(level, half), i, avg(level, half), cfg.irL75, 'dotted');
          newLine(i - 2, half, i, half, cfg.irL50, 'solid');
          newLine(i - 2, avg(body, half), i, avg(body, half), cfg.irL25, 'dotted');
          const lbE = labels.add({
            dead: false, byTime: false, x: i, y: level, text: bull ? '◥' : '◢', textColor: css, color: 'transparent',
            style: 'label_center', size: irSize, tooltip: bull ? 'Bullish Immediate Rebalance' : 'Bearish Immediate Rebalance',
          });
          list.unshift({ ln, lbE, idx: i });
        }
        for (let k = list.length - 1; k >= 0; k--) {
          const lF = list[k];
          const failed = bull ? lt(low, y1Of(lF.ln)) : gt(high, y1Of(lF.ln));
          if (lF.idx + cfg.irCFR === i && confirmed && failed && live(lF.lbE)) {
            lF.lbE.text = '❌';
            lF.lbE.tooltip = bull ? 'Failed Bullish Immediate Rebalance' : 'Failed Bearish Immediate Rebalance';
            lF.lbE.size = 'normal';
          }
          if (lF.idx + cfg.irCFR < i) list.splice(k, 1);
        }
      };
      rebalance(bIR, true);
      rebalance(aIR, false);
    }

    // ---- Macros: time(timeframe.period, session, "UTC-5") is not na when the bar opens inside the session
    if (anyMacro) {
      const inSession = macroSites.map((s) => s.on && time.inSession(msTimes ? t : t * 1000, s.session, MACRO_TZ, barMs));
      const inMC = inSession.some((x) => x);
      // bgcolor(): one call per macro, the later call is drawn on top
      for (let k = 0; k < macroSites.length; k++) if (inSession[k] && tfM) bgColors.push({ time: t, color: macroSites[k].css });

      // mcRender(): all the calls share the object `mc`; max, min, mid, sbT, xt and xb are kept per call
      for (let k = 0; k < macroSites.length; k++) {
        const st = macroSites[k];
        const s = inSession[k] && tfM;
        const tC = String(color.rgb(color.r(st.css), color.g(st.css), color.b(st.css)));
        if (s && !st.prev) {
          st.max = high;
          st.sbT = t;
          st.min = low;
          st.mid = avg(st.max, st.min);
          if (cfg.mcTB) {
            mc.lnT = newLine(st.sbT, st.max, st.sbT, st.max, tC, 'solid', 1, true);
            mc.lnB = newLine(st.sbT, st.min, st.sbT, st.min, tC, 'solid', 1, true);
          }
          if (cfg.mcML) mc.lnM = newLine(st.sbT, st.mid, st.sbT, st.mid, tC, 'dotted', 1, true);
          if (cfg.mcLB) {
            mc.lb = labels.add({
              dead: false, byTime: true, x: st.sbT, y: st.max, text: st.text, color: '#ffffff00', style: 'label_down',
              textColor: tC, size: macroSize,
            });
          }
        }
        if (s) {
          st.max = Math.max(high, st.max);
          st.min = Math.min(low, st.min);
          st.mid = avg(st.max, st.min);
          st.xt = true;
          st.xb = true;
          if (cfg.mcLB && live(mc.lb)) {
            mc.lb.x = Math.trunc(avg(t, st.sbT));
            mc.lb.y = st.max;
          }
          if (cfg.mcTB) {
            if (live(mc.lnT)) {
              mc.lnT.y1 = st.max;
              mc.lnT.x2 = t;
              mc.lnT.y2 = st.max;
            }
            if (live(mc.lnB)) {
              mc.lnB.y1 = st.min;
              mc.lnB.x2 = t;
              mc.lnB.y2 = st.min;
            }
          }
          if (cfg.mcML && live(mc.lnM)) {
            mc.lnM.y1 = st.mid;
            mc.lnM.x2 = t;
            mc.lnM.y2 = st.mid;
          }
        }
        if (!s && cfg.mcLE && !inMC) {
          if (cfg.mcTB) {
            if (st.xt) {
              if (!lt(high, y1Of(mc.lnT))) st.xt = false;
              setX2(mc.lnT, t);
            }
            if (st.xb) {
              if (!gt(low, y1Of(mc.lnB))) st.xb = false;
              setX2(mc.lnB, t);
            }
          }
          if (cfg.mcML) setX2(mc.lnM, t);
        }
        st.prev = s;
      }
    }

    // ---- Buyside / sellside liquidity
    if (cfg.liqSH) {
      const margin = liqATR[i] / liqMR;
      const level = (pivot: number, dir: 1 | -1, list: Liq[]) => {
        const y1 = zzY[0];
        const x2 = i - 1;
        const y2 = Number.isNaN(dir === 1 ? h1 : l1) ? 0 : dir === 1 ? h1 : l1;
        if (dir === 1 ? zzD[0] < 1 : zzD[0] > -1) {
          // liqInOut(): a new swing at the front, the oldest one dropped
          zzD.unshift(dir);
          zzX.unshift(x2);
          zzY.unshift(y2);
          zzD.pop();
          zzX.pop();
          zzY.pop();
        } else if (zzD[0] === dir && (dir === 1 ? gt(pivot, y1) : lt(pivot, y1))) {
          zzX[0] = x2;
          zzY[0] = y2;
        }

        let count = 0;
        let stP = 0.0;
        let stB = 0;
        let minP = 0.0;
        let maxP = 10e6;
        for (let k = 0; k <= ZZ_SIZE - 1; k++) {
          if (zzD[k] !== dir) continue;
          const y = zzY[k];
          if (dir === 1 ? gt(y, pivot + margin) : lt(y, pivot - margin)) break;
          if (gt(y, pivot - margin) && lt(y, pivot + margin)) {
            count += 1;
            stB = zzX[k];
            stP = y;
            if (gt(y, minP)) minP = y;
            if (lt(y, maxP)) maxP = y;
          }
        }

        if (count > 2) {
          const getB = list[0];
          const mid = avg(minP, maxP);
          if (live(getB.bx) && stB === getB.bx.left) {
            getB.bx.top = mid + margin;
            getB.bx.right = i + 10;
            getB.bx.bottom = mid - margin;
          } else {
            // A bar index more than 10,000 bars back is a runtime error of box.new()
            if (i - stB > MAX_BARS_BACK_X) {
              throw new Error(`Bar index value of the \`left\` argument (${stB}) in \`box.new()\` is too far from the current bar index. Try using \`time\` instead.`);
            }
            const css = dir === 1 ? cfg.liqBC : cfg.liqSC;
            const solid = String(color.new(css, 0));
            const bx = boxes.add({
              dead: false, byTime: false, left: stB, top: mid + margin, right: i + 10, bottom: mid - margin,
              bg: 'transparent', border: 'transparent',
            });
            const bxt = boxes.add({
              dead: false, byTime: false, left: stB, top: stP, right: i + 10, bottom: stP, bg: 'transparent', border: 'transparent',
              text: dir === 1 ? 'Buyside liquidity' : 'Sellside liquidity', textSize: 'tiny', hAlign: 'left',
              vAlign: dir === 1 ? 'bottom' : 'top', textColor: String(color.new(css, 17)),
            });
            const ln = newLine(stB, stP, i - 1, stP, solid);
            const lne = newLine(i - 1, stP, NaN, stP, solid, 'dotted');
            list.unshift({ bx, bxt, brL: false, ln, lne });
          }
          if (list.length > cfg.liqVL) liqDelete(list.pop() as Liq);
        }
      };
      if (!Number.isNaN(ph[i])) level(ph[i], 1, bsLIQ);
      if (!Number.isNaN(pl[i])) level(pl[i], -1, ssLIQ);

      for (const x of bsLIQ) {
        if (x.brL) continue;
        setX2(x.lne, i);
        if (live(x.bx) && gt(high, x.bx.top)) x.brL = true;
      }
      for (const x of ssLIQ) {
        if (x.brL) continue;
        setX2(x.lne, i);
        if (live(x.bx) && lt(low, x.bx.bottom)) x.brL = true;
      }
    }

    // ---- Order blocks and breaker blocks
    // obbSwings()
    const osPrev = i > 0 ? os : NaN;
    os = gt(H(i - obbLN), upper[i]) ? 0 : lt(L(i - obbLN), lower[i]) ? 1 : os;
    if (os === 0 && !Number.isNaN(osPrev) && osPrev !== 0) swingTop = { y: H(i - obbLN), i: i - obbLN, x: false };
    if (os === 1 && !Number.isNaN(osPrev) && osPrev !== 1) swingBtm = { y: L(i - obbLN), i: i - obbLN, x: false };

    if (cfg.obSH || cfg.bbSH) {
      /** `for k = 1 to last`: counts down when last is below 1 */
      const each = (last: number, body: (k: number) => void) => {
        if (last >= 1) for (let k = 1; k <= last; k++) body(k);
        else for (let k = 1; k >= last; k--) body(k);
      };
      if (gt(c1, swingTop.y) && !swingTop.x) {
        swingTop.x = true;
        let minima = maxOf(i - 1);
        let maxima = minOf(i - 1);
        let sBT = t1;
        each(i - swingTop.i - 1, (k) => {
          minima = Math.min(minOf(i - k), minima);
          maxima = eq(minima, minOf(i - k)) ? maxOf(i - k) : maxima;
          sBT = eq(minima, minOf(i - k)) ? T(i - k) : sBT;
        });
        newBlocks(bOB, bBB, maxima, minima, sBT, true);
      }
      if (lt(c1, swingBtm.y) && !swingBtm.x) {
        swingBtm.x = true;
        let minima = minOf(i - 1);
        let maxima = maxOf(i - 1);
        let sBT = t1;
        each(i - swingBtm.i - 1, (k) => {
          maxima = Math.max(maxOf(i - k), maxima);
          minima = eq(maxima, maxOf(i - k)) ? minOf(i - k) : minima;
          sBT = eq(maxima, maxOf(i - k)) ? T(i - k) : sBT;
        });
        newBlocks(aOB, aBB, maxima, minima, sBT, false);
      }

      const blocks = (obs: Ob[], bbs: Bb[], bull: boolean) => {
        if (obs.length === 0) return;
        const obCss = bull ? cfg.obCb : cfg.obCa;
        const bbCss = bull ? cfg.bbCb : cfg.bbCa;
        for (let k = obs.length - 1; k >= 0; k--) {
          const ob = obs[k];
          const bb = bbs[k];
          if (cfg.obbR) {
            if (!ob.extend) deleteOb(ob);
            if (!bb.extend) deleteBb(bb);
          }
          if (!bb.breaker) {
            if (cfg.obSH) render(ob.bxOB, ob, ob.obI, ob.top, t, ob.btm, obCss);
            const mitigated = bull
              ? lt(Math.min(obbMP ? c1 : l1, o1), ob.btm)
              : gt(Math.max(obbMP ? c1 : h1, o1), ob.top);
            if (mitigated) {
              bb.breaker = true;
              if (cfg.obSH) {
                setRight(ob.bxOB, ob, t1);
                ob.extend = false;
              }
              if (cfg.bbSH) {
                render(bb.bxBB, bb, t1, ob.top, t, ob.btm, bbCss);
                if ((!cfg.obSH || cfg.obbR) && live(bb.bxOB)) {
                  bb.bxOB.left = ob.obI;
                  bb.bxOB.top = ob.top;
                  bb.bxOB.right = t1;
                  bb.bxOB.bottom = ob.btm;
                  bb.bxOB.border = String(color.new(bbCss, 53));
                }
              }
            }
          } else {
            if (bull ? gt(obbMP ? c1 : h1, ob.top) : lt(obbMP ? c1 : l1, ob.btm)) bb.extend = false;
            if (cfg.obSH && live(ob.bxOB)) {
              ob.bxOB.bg = obCss;
              ob.bxOB.textColor = String(color.new(obCss, 0));
            }
            if (cfg.bbSH && bb.extend) setRight(bb.bxBB, bb, t);
          }
        }
        if (obs.length > cfg.obbVL) deleteOb(obs.pop() as Ob);
        if (bbs.length > cfg.obbVL) deleteBb(bbs.pop() as Bb);
      };
      blocks(bOB, bBB, true);
      blocks(aOB, aBB, false);
    }

    // ---- Liquidity voids
    if (cfg.lqvSH && n - 1 - i <= 500) {
      const bullGap = (k: number) => gt(L(k), H(k - 1));
      const bearGap = (k: number) => lt(H(k), L(k - 1));
      const bLQV = gt(low - h2, lqvATR[i]) && gt(low, h2) && gt(c1, h2) && (cfg.lqvGP ? !(bullGap(i) || bullGap(i - 1)) : true);
      const aLQV = gt(l2 - high, lqvATR[i]) && lt(high, l2) && lt(c1, l2) && (cfg.lqvGP ? !(bearGap(i) || bearGap(i - 1)) : true);
      const voidBox = (base: number, stp: number, k: number, css: string, label?: 'top' | 'bottom') => {
        LQV.push(boxes.add({
          dead: false, byTime: false, left: i - 2, top: base + k * stp, right: i, bottom: base + (k + 1) * stp,
          bg: css, border: 'transparent',
          ...(label ? { text: 'Liquidity Void   ', textSize: 'tiny' as PineSize, hAlign: 'right' as const, vAlign: label, textColor: 'transparent' } : {}),
        }));
      };
      if (bLQV) {
        if (prevBLQV) {
          const stp = Math.abs(low - l1) / LQV_BOXES;
          for (let k = 0; k <= LQV_BOXES - 1; k++) voidBox(l1, stp, k, cfg.lqvBC);
        } else {
          const stp = Math.abs(low - h2) / LQV_BOXES;
          for (let k = 0; k <= LQV_BOXES - 1; k++) voidBox(h2, stp, k, cfg.lqvBC, cfg.lqvTX && k === 0 ? 'bottom' : undefined);
        }
      }
      if (aLQV) {
        if (prevALQV) {
          const stp = Math.abs(h1 - high) / LQV_BOXES;
          for (let k = 0; k <= LQV_BOXES - 1; k++) voidBox(high, stp, k, cfg.lqvSC);
        } else {
          const stp = Math.abs(l2 - high) / LQV_BOXES;
          for (let k = 0; k <= LQV_BOXES - 1; k++) voidBox(high, stp, k, cfg.lqvSC, cfg.lqvTX && k === LQV_BOXES - 1 ? 'top' : undefined);
        }
      }
      prevBLQV = bLQV;
      prevALQV = aLQV;
    }

    if (LQV.length > 0) {
      const qt = LQV.length;
      for (let k = qt - 1; k >= 0; k--) {
        if (k >= LQV.length) continue;
        const cBX = LQV[k];
        const bxAVG = live(cBX) ? avg(cBX.bottom, cBX.top) : NaN;
        const side = c1 - bxAVG;
        if (signDiffers(side, close - bxAVG) || signDiffers(side, low - bxAVG) || signDiffers(side, high - bxAVG)) {
          LQV.splice(k, 1);
          if (live(cBX)) cBX.bg = cfg.lqvMC;
          if (cfg.lqvRM) boxes.del(cBX);
        } else if (live(cBX)) {
          cBX.right = i + 1;
          if (i - cBX.left > 21) cBX.textColor = String(color.new(chartFg, 7));
        }
      }
    }
  }

  // The drawings alive after the last bar; an object with an na coordinate is not drawn
  const x = (o: Obj, v: number) => (o.byTime ? v : barTime(bars, v));
  const drawn = (...v: number[]) => v.every((c) => !Number.isNaN(c));
  const outLines: LineDrawingData[] = lines.list.filter((l) => drawn(l.x1, l.y1, l.x2, l.y2)).map((l) => ({
    time1: x(l, l.x1), price1: l.y1, time2: x(l, l.x2), price2: l.y2, color: l.color, width: l.width, style: l.style,
  }));
  const outBoxes: BoxData[] = boxes.list.filter((b) => drawn(b.left, b.top, b.right, b.bottom)).map((b) => ({
    time1: x(b, b.left), price1: b.top, time2: x(b, b.right), price2: b.bottom, borderColor: b.border,
    ...(b.bg !== undefined ? { bgColor: b.bg } : {}),
    ...(b.text !== undefined ? { text: b.text, textSize: b.textSize, textHAlign: b.hAlign, textVAlign: b.vAlign } : {}),
    ...(b.textColor !== undefined ? { textColor: b.textColor } : {}),
  }));
  // A label placed at a time between two bars is drawn on the next bar
  const nextBarTime = (v: number) => {
    let lo = 0;
    let hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (bars[mid].time < v) lo = mid + 1;
      else hi = mid;
    }
    return lo < n ? bars[lo].time : v;
  };
  const outLabels: LabelData[] = labels.list.map((l) => ({
    time: l.byTime ? nextBarTime(l.x) : x(l, l.x), price: l.y, text: l.text, color: l.color, textColor: l.textColor, style: l.style, size: l.size,
    ...(l.tooltip !== undefined ? { tooltip: l.tooltip } : {}),
  }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    bgColors,
    lines: outLines,
    boxes: outBoxes,
    labels: outLabels,
  };
}

export const IctImmediateRebalanceToolkit = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
