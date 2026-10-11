/**
 * SMC Target Liquidity V.35 (Manual Distance Control)
 *
 * Liquidity levels at unbroken pivots, and what the price does when it comes back to them.
 * - A pivot low (buy side) or a pivot high (sell side) of `Pivot Period` bars on each side starts a level: a line
 *   from the pivot bar to 15 bars after the current bar, with a price label at its end. At most `Max Active Lines`
 *   levels are kept per side (the oldest is deleted).
 * - The line colour is the session of the bar (New York PM, New York AM, London, Asian, in that order, else the
 *   outside colour), with the session hours read in the `Timezone` input. As in the original, the session is the
 *   one of the bar where the previous level of the same side was created (the first level of a side has the
 *   outside colour): the script reads the session test `Pivot Period` bars back inside a block that only runs on
 *   pivot bars, and that history only holds the values of the bars where the block ran.
 * - Each bar, every active level is tested, from the newest to the oldest (buy side; the sell side is the mirror):
 *   SFP: the close is above the level and the previous close was below it; MSS: the close and the previous close
 *   are below the level and the close is falling; X: the low reaches the level and the close is above it.
 *   The line then ends on that bar with the colour and style of the event, the price label is deleted and the
 *   event name is written at the middle of the line, `Text Distance (Ticks)` ticks below a low level and above a
 *   high level (the other way round with `Flip Text Position`). Otherwise the line and its label move one bar on.
 *
 * Drawings are kept up to 500 lines and 500 labels (the oldest are removed).
 *
 * Chart values (third argument): the port reads the symbol tick (text distance and price label format; without
 * it: 0.01).
 *
 * Reference: "SMC Target Liquidity V.35 (Manual Distance Control)" by wut_trader
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import {
  ta, str, Series, time as pineTime, type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { LabelData, LineDrawingData, PineSize } from '../types';
import { barInterval, barTime } from '../bar-time';
import { mintickOf, type ChartContext } from '../chart-context';

export interface IctLiquiditySweepSwingFailPatternV1Inputs {
  /** Pivot Period */
  prd: number;
  /** Max Active Lines */
  maxActiveLines: number;
  /** Timezone */
  tzManual: string;
  /** Active Line Width */
  activeWidth: number;
  /** Asian Session */
  asiaSess: string;
  /** Asian Color */
  colAsia: string;
  /** London Session */
  londonSess: string;
  /** London Color */
  colLondon: string;
  /** NY AM Session */
  nyAmSess: string;
  /** NY AM Color */
  colNyAm: string;
  /** NY PM Session */
  nyPmSess: string;
  /** NY PM Color */
  colNyPm: string;
  /** Outside Session Color */
  colOther: string;
  /** Text Size */
  labelSize: string;
  /** Text Distance (Ticks) */
  lblOffset: number;
  /** Flip Text Position */
  flipText: boolean;
  /** Show Price Labels (Active) */
  showPrice: boolean;
  /** Show X */
  showX: boolean;
  /** Line Color (X) */
  colLineX: string;
  /** Text Color (X) */
  colTxtX: string;
  /** Line Style (X) */
  styleX: string;
  /** Show SFP */
  showSfp: boolean;
  /** Line Color (SFP) */
  colLineSfp: string;
  /** Text Color (SFP) */
  colTxtSfp: string;
  /** Line Style (SFP) */
  styleSfp: string;
  /** Show MSS */
  showMss: boolean;
  /** Line Color (MSS) */
  colLineMss: string;
  /** Text Color (MSS) */
  colTxtMss: string;
  /** Line Style (MSS) */
  styleMss: string;
}

export const defaultInputs: IctLiquiditySweepSwingFailPatternV1Inputs = {
  prd: 10,
  maxActiveLines: 5,
  tzManual: 'UTC-4',
  activeWidth: 2,
  asiaSess: '2000-0000',
  colAsia: '#FFEB3B',
  londonSess: '0200-0500',
  colLondon: '#00897B',
  nyAmSess: '0830-1100',
  colNyAm: '#FF9800',
  nyPmSess: '1330-1600',
  colNyPm: '#E040FB',
  colOther: '#787B86',
  labelSize: 'Large',
  lblOffset: 30,
  flipText: false,
  showPrice: true,
  showX: true,
  colLineX: '#787B86',
  colTxtX: '#363A45',
  styleX: 'Dotted',
  showSfp: true,
  colLineSfp: '#FF5252',
  colTxtSfp: '#363A45',
  styleSfp: 'Dashed',
  showMss: true,
  colLineMss: '#363A45',
  colTxtMss: '#363A45',
  styleMss: 'Solid',
};

const G_MAIN = 'Main Logic';
const G_SESS = 'Active Session Lines';
const G_VIS = 'Display & Size Settings';
const G_X = 'Style: X (Sweep)';
const G_SFP = 'Style: SFP (Fakeout)';
const G_MSS = 'Style: MSS (Breakout)';
const STYLES = ['Solid', 'Dashed', 'Dotted'];

export const inputConfig: InputConfig[] = [
  { id: 'prd', type: 'int', title: 'Pivot Period', defval: 10, min: 2, group: G_MAIN },
  { id: 'maxActiveLines', type: 'int', title: 'Max Active Lines', defval: 5, min: 1, group: G_MAIN },
  {
    id: 'tzManual', type: 'string', title: 'Timezone', defval: 'UTC-4',
    options: ['UTC-5', 'UTC-4', 'America/New_York', 'Asia/Bangkok'], group: G_MAIN,
  },
  { id: 'activeWidth', type: 'int', title: 'Active Line Width', defval: 2, min: 1, group: G_SESS },
  { id: 'asiaSess', type: 'session', title: 'Asian Session', defval: '2000-0000', group: G_SESS },
  { id: 'colAsia', type: 'color', title: 'Asian Color', defval: '#FFEB3B', group: G_SESS },
  { id: 'londonSess', type: 'session', title: 'London Session', defval: '0200-0500', group: G_SESS },
  { id: 'colLondon', type: 'color', title: 'London Color', defval: '#00897B', group: G_SESS },
  { id: 'nyAmSess', type: 'session', title: 'NY AM Session', defval: '0830-1100', group: G_SESS },
  { id: 'colNyAm', type: 'color', title: 'NY AM Color', defval: '#FF9800', group: G_SESS },
  { id: 'nyPmSess', type: 'session', title: 'NY PM Session', defval: '1330-1600', group: G_SESS },
  { id: 'colNyPm', type: 'color', title: 'NY PM Color', defval: '#E040FB', group: G_SESS },
  { id: 'colOther', type: 'color', title: 'Outside Session Color', defval: '#787B86', group: G_SESS },
  {
    id: 'labelSize', type: 'string', title: 'Text Size', defval: 'Large',
    options: ['Tiny', 'Small', 'Normal', 'Large', 'Huge'], group: G_VIS,
  },
  {
    id: 'lblOffset', type: 'float', title: 'Text Distance (Ticks)', defval: 30, min: 0, group: G_VIS,
    tooltip: 'ปรับเลขนี้: น้อย = ใกล้, มาก = ไกล',
  },
  {
    id: 'flipText', type: 'bool', title: 'Flip Text Position (สลับบน/ล่าง)', defval: false, group: G_VIS,
    tooltip: 'เผื่ออยากสลับตำแหน่งข้อความ',
  },
  { id: 'showPrice', type: 'bool', title: 'Show Price Labels (Active)', defval: true, group: G_VIS },
  { id: 'showX', type: 'bool', title: 'Show X', defval: true, group: G_X },
  { id: 'colLineX', type: 'color', title: 'Line Color', defval: '#787B86', group: G_X },
  { id: 'colTxtX', type: 'color', title: 'Text Color', defval: '#363A45', group: G_X },
  { id: 'styleX', type: 'string', title: 'Line Style', defval: 'Dotted', options: STYLES, group: G_X },
  { id: 'showSfp', type: 'bool', title: 'Show SFP', defval: true, group: G_SFP },
  { id: 'colLineSfp', type: 'color', title: 'Line Color', defval: '#FF5252', group: G_SFP },
  { id: 'colTxtSfp', type: 'color', title: 'Text Color', defval: '#363A45', group: G_SFP },
  { id: 'styleSfp', type: 'string', title: 'Line Style', defval: 'Dashed', options: STYLES, group: G_SFP },
  { id: 'showMss', type: 'bool', title: 'Show MSS', defval: true, group: G_MSS },
  { id: 'colLineMss', type: 'color', title: 'Line Color', defval: '#363A45', group: G_MSS },
  { id: 'colTxtMss', type: 'color', title: 'Text Color', defval: '#363A45', group: G_MSS },
  { id: 'styleMss', type: 'string', title: 'Line Style', defval: 'Solid', options: STYLES, group: G_MSS },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'SMC Target Liquidity V.35 (Manual Distance Control)',
  shortTitle: 'SMC Target Liquidity V.35 (Manual Distance Control)',
  overlay: true,
};

/** max_lines_count, max_labels_count */
const MAX_COUNT = 500;
/** line_extension: bars after the current bar */
const LINE_EXTENSION = 15;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const le = (a: number, b: number) => a - b <= EPS;
const ge = (a: number, b: number) => b - a <= EPS;

type Style = 'solid' | 'dashed' | 'dotted';
interface Ln { x1: number; y: number; x2: number; color: string; style: Style; dead: boolean }
interface Lb {
  x: number; y: number; text: string; style: 'label_left' | 'none'; color: string; textColor: string; size: PineSize;
  dead: boolean;
}

/** Live drawings of one kind: above max + 5 objects the oldest are deleted until max remain */
class Live<T extends { dead: boolean }> {
  list: T[] = [];
  add(o: T): T {
    this.list.push(o);
    if (this.list.length > MAX_COUNT + 5) for (const old of this.list.splice(0, this.list.length - MAX_COUNT)) old.dead = true;
    return o;
  }
  /** line.delete / label.delete */
  remove(o: T | null): void {
    if (o === null || o.dead) return;
    o.dead = true;
    this.list.splice(this.list.indexOf(o), 1);
  }
}

/** get_style() */
function styleOf(s: string): Style {
  return s === 'Dotted' ? 'dotted' : s === 'Dashed' ? 'dashed' : 'solid';
}

/** get_size() */
function sizeOf(s: string): PineSize {
  switch (s) {
    case 'Tiny': return 'tiny';
    case 'Small': return 'small';
    case 'Large': return 'large';
    case 'Huge': return 'huge';
    default: return 'normal';
  }
}

interface Level { line: Ln; label: Lb | null; price: number }
/** The four session tests of a bar, in the order NY PM, NY AM, London, Asian */
type Sessions = [boolean, boolean, boolean, boolean];

export function calculate(
  bars: Bar[],
  inputs: Partial<IctLiquiditySweepSwingFailPatternV1Inputs> = {},
  chart?: ChartContext,
): IndicatorResult & { lines: LineDrawingData[]; labels: LabelData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const prd = cfg.prd;
  // syminfo.mintick
  const mintick = mintickOf(chart);
  const inMs = n > 0 && bars[0].time >= 1e12;
  const styleX = styleOf(cfg.styleX);
  const styleSfp = styleOf(cfg.styleSfp);
  const styleMss = styleOf(cfg.styleMss);
  const finalSize = sizeOf(cfg.labelSize);
  const sessionColors = [cfg.colNyPm, cfg.colNyAm, cfg.colLondon, cfg.colAsia];
  const sessionInputs = [cfg.nyPmSess, cfg.nyAmSess, cfg.londonSess, cfg.asiaSess];

  const phArr = ta.pivothigh(new Series(bars, (b) => b.high), prd, prd).toArray();
  const plArr = ta.pivotlow(new Series(bars, (b) => b.low), prd, prd).toArray();

  const lines = new Live<Ln>();
  const labels = new Live<Lb>();
  const C = (i: number) => (i >= 0 ? bars[i].close : NaN);

  // is_in_session(): not na(time(timeframe.period, sess + ":1234567", tz_manual))
  const sessionsOf = (i: number): Sessions => {
    const t = inMs ? bars[i].time : bars[i].time * 1000;
    return sessionInputs.map((s) => pineTime.inSession(t, `${s}:1234567`, cfg.tzManual)) as Sessions;
  };

  const sides = [
    // Buy lines (pivot lows)
    { buy: true, pivots: plArr, active: [] as Level[], newLabel: null as Lb | null, kept: null as Sessions | null },
    // Sell lines (pivot highs)
    { buy: false, pivots: phArr, active: [] as Level[], newLabel: null as Lb | null, kept: null as Sessions | null },
  ];
  const offsetVal = cfg.lblOffset * mintick;
  const multHigh = cfg.flipText ? -1 : 1;
  const multLow = cfg.flipText ? 1 : -1;

  for (let i = 0; i < n; i++) {
    const { high, low, close } = bars[i];

    // Create the lines
    for (const side of sides) {
      const pv = side.pivots[i];
      if (pv === null || pv === undefined || Number.isNaN(pv)) continue;
      let isBroken = false;
      for (let k = 0; k <= prd - 1; k++) {
        if (side.buy ? lt(bars[i - k].low, pv) : gt(bars[i - k].high, pv)) {
          isBroken = true;
          break;
        }
      }
      if (isBroken) continue;
      // is_in_session(...)[prd] inside this block: the history of these calls only has the bars where the block
      // ran, and the value read prd bars back is the one of its last run before (na, so false, on the first run)
      const was = side.kept;
      side.kept = sessionsOf(i);
      let lineCol = cfg.colOther;
      if (was) {
        const k = was.indexOf(true);
        if (k >= 0) lineCol = sessionColors[k];
      }
      const newLine = lines.add({ x1: i - prd, y: pv, x2: i + LINE_EXTENSION, color: lineCol, style: 'solid', dead: false });
      if (cfg.showPrice) {
        side.newLabel = labels.add({
          x: i + LINE_EXTENSION, y: pv, text: str.tostring(pv, 'mintick', mintick), style: 'label_left',
          color: lineCol, textColor: '#FFFFFF', size: 'small', dead: false,
        });
      }
      side.active.push({ line: newLine, label: side.newLabel, price: pv });
      if (side.active.length > cfg.maxActiveLines) {
        const old = side.active.shift() as Level;
        lines.remove(old.line);
        labels.remove(old.label);
      }
    }

    // Update the lines
    for (const side of sides) {
      const mult = side.buy ? multLow : multHigh;
      for (let k = side.active.length - 1; k >= 0; k--) {
        const { line: l, label: lb, price: lvl } = side.active[k];
        const prev = C(i - 1);
        let event: { text: string; show: boolean; lineCol: string; txtCol: string; style: Style } | null = null;
        const sfp = side.buy ? gt(close, lvl) && lt(prev, lvl) : lt(close, lvl) && gt(prev, lvl);
        const mss = side.buy
          ? lt(close, lvl) && lt(prev, lvl) && lt(close, prev)
          : gt(close, lvl) && gt(prev, lvl) && gt(close, prev);
        const x = side.buy ? le(low, lvl) && gt(close, lvl) : ge(high, lvl) && lt(close, lvl);
        if (sfp) {
          event = { text: 'SFP', show: cfg.showSfp, lineCol: cfg.colLineSfp, txtCol: cfg.colTxtSfp, style: styleSfp };
        } else if (mss) {
          event = { text: 'MSS', show: cfg.showMss, lineCol: cfg.colLineMss, txtCol: cfg.colTxtMss, style: styleMss };
        } else if (x) {
          event = { text: 'X', show: cfg.showX, lineCol: cfg.colLineX, txtCol: cfg.colTxtX, style: styleX };
        }
        if (event) {
          if (!l.dead) {
            l.x2 = i;
            l.color = event.lineCol;
            l.style = event.style;
          }
          labels.remove(lb);
          if (event.show) {
            // line.get_x1 of a deleted line is na: the label has no bar and is not drawn (it still counts)
            const midX = l.dead ? NaN : Math.round((l.x1 + i) / 2);
            labels.add({
              x: midX, y: lvl + offsetVal * mult, text: event.text, style: 'none', color: 'rgba(255, 255, 255, 0)',
              textColor: event.txtCol, size: finalSize, dead: false,
            });
          }
          side.active.splice(k, 1);
        } else {
          // Waiting
          if (!l.dead) l.x2 = i + LINE_EXTENSION;
          if (lb !== null && !lb.dead) lb.x = i + LINE_EXTENSION;
        }
      }
    }
  }

  const interval = barInterval(bars);
  const timeOf = (x: number) => barTime(bars, x, interval);
  const outLines: LineDrawingData[] = lines.list.map((l) => ({
    time1: timeOf(l.x1), price1: l.y, time2: timeOf(l.x2), price2: l.y, color: l.color, width: cfg.activeWidth,
    ...(l.style !== 'solid' ? { style: l.style } : {}),
  }));
  const outLabels: LabelData[] = labels.list.filter((l) => !Number.isNaN(l.x)).map((l) => ({
    time: timeOf(l.x), price: l.y, text: l.text, color: l.color, textColor: l.textColor, style: l.style, size: l.size,
  }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    lines: outLines,
    labels: outLabels,
  };
}

export const IctLiquiditySweepSwingFailPatternV1 = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
