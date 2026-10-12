/**
 * Gaps + Imbalances + Wicks (MTF) - By Leviathan
 *
 * Zones of one kind, on the chart timeframe or a higher one:
 * - Imbalance: the low of a bar above the high of two bars back (UP), or its high below the low two bars back (DOWN)
 * - Gap: the low above the previous high, or the high below the previous low
 * - Wick: the upper wick of the previous bar longer than a sixth of its body (UP), or its lower wick (DOWN)
 * Filter: the size above ATR(30) of the timeframe times a factor (default), above a percentage of the price, or none.
 * Only zones of the last 150 days (from the current time) are drawn. Each zone is a box with a label text
 * ("IMB • 60m") and three dotted lines (top, middle, bottom). A zone extends to the current bar until a bar touches
 * one of its edges (other fill conditions: the bottom edge only, or the middle). At most 499 zones are kept.
 *
 * Timeframe input: the values of the timeframe are those of its latest completed bar (`request.security` without
 * lookahead), built from the chart bars; a zone is checked on the first chart bar of each period. A timeframe below
 * the chart timeframe throws (the chart bars do not have that data).
 *
 * Chart context: the chart timeframe (`timeframe.period` in the label text), the time zone and the session (periods
 * of the timeframe input) and the current time (`timenow`, the 150-day lookback).
 *
 * Reference: "Gaps + Imbalances + Wicks (MTF) - By Leviathan" by LeviathanCapital
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LeviathanCapital
 */

import {
  ta, str, timeframe, line, box, resetDrawings, setDrawingBar, drawingOutputs,
  type Box, type Line, type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import { chartTimeframe, higherTimeframeBars } from '../anchor-period';
import { nowOf, type ChartContext } from '../chart-context';

export interface GapsImbalancesWicksByLeviathanInputs {
  boxtype: 'Imbalance' | 'Gap' | 'Wick';
  /** Timeframe ('' = chart) */
  tfinput: string;
  showmiddleline: boolean;
  showbottomline: boolean;
  showtopline: boolean;
  showup: boolean;
  showdown: boolean;
  upcol1: string;
  upbordercol: string;
  uptextcol: string;
  downcol1: string;
  downbordercol: string;
  downtextcol: string;
  /** Extend the zone until it is filled */
  extendtilfilled: boolean;
  filledtype: 'Touch' | 'Full Fill' | 'Half Fill';
  /** Only zones of the last `daysBack` days */
  lookback: boolean;
  daysBack: number;
  hidefilled: boolean;
  showboxes: boolean;
  conditiontype: 'Percentage' | 'ATR' | 'None';
  atrlength: number;
  atrmult: number;
  pctcond: number;
  pctmult: number;
  showboxtext: boolean;
  textType: 'Labels' | 'Volume' | 'Labels + Timeframe' | 'Labels + Timeframe + Volume';
  textsize: 'Size: Normal' | 'Size: Large' | 'Size: Small' | 'Size: Tiny' | 'Size: Auto';
  textvalign: 'Center' | 'Top' | 'Bottom';
  texthalign: 'Middle' | 'Right' | 'Left';
  imbtext: string;
  gaptext: string;
  wicktext: string;
  actionbool: boolean;
  actiondel: 'Stop Zone' | 'Delete Zone';
  nmbars: number;
  linestyle: 'Solid' | 'Dashed' | 'Dotted';
  lineCol: string;
  nbars: number;
  maxBoxes: number;
}

export const defaultInputs: GapsImbalancesWicksByLeviathanInputs = {
  boxtype: 'Imbalance',
  tfinput: '',
  showmiddleline: true,
  showbottomline: true,
  showtopline: true,
  showup: true,
  showdown: true,
  // input colours: #90bff965 is stored with the alpha 0.4 (byte 102)
  upcol1: '#90BFF966',
  upbordercol: '#4CAF4F00',
  uptextcol: '#787B86',
  downcol1: '#9575CD66',
  downbordercol: '#FF525200',
  downtextcol: '#787B86',
  extendtilfilled: true,
  filledtype: 'Touch',
  lookback: true,
  daysBack: 150,
  hidefilled: false,
  showboxes: true,
  conditiontype: 'ATR',
  atrlength: 30,
  atrmult: 1,
  pctcond: 0.30,
  pctmult: 1,
  showboxtext: true,
  textType: 'Labels + Timeframe',
  textsize: 'Size: Tiny',
  textvalign: 'Center',
  texthalign: 'Middle',
  imbtext: 'IMB',
  gaptext: 'GAP',
  wicktext: 'WICK',
  actionbool: false,
  actiondel: 'Stop Zone',
  nmbars: 3500,
  linestyle: 'Dotted',
  // color.rgb(178, 181, 190, 31): alpha 0.69, byte 176
  lineCol: '#B2B5BEB0',
  nbars: 4,
  maxBoxes: 499,
};

const GEN = 'General Settings';
const FIL = 'Filter Settings';
const LAB = 'Zone Labels';
const OTH = 'Other Settings';

export const inputConfig: InputConfig[] = [
  { id: 'boxtype', type: 'string', title: 'Zone Type   ', defval: 'Imbalance', options: ['Imbalance', 'Gap', 'Wick'], group: GEN, inline: '1' },
  { id: 'tfinput', type: 'timeframe', title: ' - ', defval: '', group: GEN, inline: '1' },
  { id: 'showmiddleline', type: 'bool', title: 'Middle Line  ', defval: true, inline: 'ln', group: GEN },
  { id: 'showbottomline', type: 'bool', title: 'Bottom Line  ', defval: true, inline: 'ln', group: GEN },
  { id: 'showtopline', type: 'bool', title: 'Top Line  ', defval: true, inline: 'ln', group: GEN },
  { id: 'showup', type: 'bool', title: 'UP Zones            ', defval: true, inline: 'appup', group: GEN },
  { id: 'showdown', type: 'bool', title: 'DOWN Zones        ', defval: true, inline: 'appdown', group: GEN },
  { id: 'upcol1', type: 'color', title: '  ', defval: '#90BFF966', inline: 'appup', group: GEN },
  { id: 'upbordercol', type: 'color', title: '', defval: '#4CAF4F00', inline: 'appup', group: GEN },
  { id: 'uptextcol', type: 'color', title: '', defval: '#787B86', inline: 'appup', group: GEN },
  { id: 'downcol1', type: 'color', title: '  ', defval: '#9575CD66', inline: 'appdown', group: GEN },
  { id: 'downbordercol', type: 'color', title: '', defval: '#FF525200', inline: 'appdown', group: GEN },
  { id: 'downtextcol', type: 'color', title: '', defval: '#787B86', inline: 'appdown', group: GEN },
  { id: 'extendtilfilled', type: 'bool', title: '', defval: true, group: GEN, inline: 'fill' },
  { id: 'filledtype', type: 'string', title: 'Fill Condition                ', defval: 'Touch', options: ['Touch', 'Full Fill', 'Half Fill'], group: GEN, inline: 'fill' },
  { id: 'lookback', type: 'bool', title: '', defval: true, inline: 'lb', group: GEN },
  { id: 'daysBack', type: 'float', title: 'Lookback (D)               ', defval: 150, group: GEN, inline: 'lb' },
  { id: 'hidefilled', type: 'bool', title: 'Hide Filled Levels', defval: false, inline: 'hd', group: GEN },
  { id: 'showboxes', type: 'bool', title: 'Show Boxes', defval: true, inline: 'hd', group: GEN },
  { id: 'conditiontype', type: 'string', title: 'Filter Type  ', defval: 'ATR', options: ['Percentage', 'ATR', 'None'], group: FIL },
  { id: 'atrlength', type: 'int', title: 'ATR Length + Mult.', defval: 30, step: 1, group: FIL, inline: 'atr' },
  { id: 'atrmult', type: 'float', title: '', defval: 1, step: 0.1, group: FIL, inline: 'atr' },
  { id: 'pctcond', type: 'float', title: 'Percentage + Mult.', defval: 0.30, step: 0.1, group: FIL, inline: 'pct' },
  { id: 'pctmult', type: 'float', title: '', defval: 1, step: 0.1, group: FIL, inline: 'pct' },
  { id: 'showboxtext', type: 'bool', title: '   ', defval: true, group: LAB, inline: 'txt' },
  { id: 'textType', type: 'string', title: '', defval: 'Labels + Timeframe', group: LAB, options: ['Labels', 'Volume', 'Labels + Timeframe', 'Labels + Timeframe + Volume'], inline: 'txt' },
  { id: 'textsize', type: 'string', title: '', defval: 'Size: Tiny', options: ['Size: Normal', 'Size: Large', 'Size: Small', 'Size: Tiny', 'Size: Auto'], inline: 'txt', group: LAB },
  { id: 'textvalign', type: 'string', title: 'Position ', defval: 'Center', options: ['Center', 'Top', 'Bottom'], inline: 'pos', group: LAB },
  { id: 'texthalign', type: 'string', title: '', defval: 'Middle', options: ['Middle', 'Right', 'Left'], inline: 'pos', group: LAB },
  { id: 'imbtext', type: 'string', title: 'Imbalance Label', defval: 'IMB', group: LAB },
  { id: 'gaptext', type: 'string', title: 'Gap Label', defval: 'GAP', group: LAB },
  { id: 'wicktext', type: 'string', title: 'Wick Label', defval: 'WICK', group: LAB },
  { id: 'actionbool', type: 'bool', title: '', defval: false, inline: 'act', group: OTH },
  { id: 'actiondel', type: 'string', title: '', defval: 'Stop Zone', options: ['Stop Zone', 'Delete Zone'], inline: 'act', group: OTH },
  { id: 'nmbars', type: 'int', title: 'after', defval: 3500, inline: 'act', group: OTH, tooltip: 'Delete/Stop Zone after X number of candles' },
  { id: 'linestyle', type: 'string', title: 'Line Style', defval: 'Dotted', options: ['Solid', 'Dashed', 'Dotted'], inline: 'l', group: OTH },
  { id: 'lineCol', type: 'color', title: '', defval: '#B2B5BEB0', inline: 'l', group: OTH },
  { id: 'nbars', type: 'int', title: 'Zone Length', defval: 4, group: OTH, tooltip: 'Length of the zone (in bars) if Fill Condition is turned off' },
  { id: 'maxBoxes', type: 'int', title: 'Max Zones', defval: 499, min: 1, max: 500, group: OTH },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Gaps + Imbalances + Wicks (MTF) - By Leviathan',
  shortTitle: 'Gaps + Imbalances + Wicks (MTF) - By Leviathan',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

const MSPD = 24 * 60 * 60 * 1000;
const SEP = ' • ';

const TEXT_SIZE = {
  'Size: Normal': 'normal', 'Size: Small': 'small', 'Size: Tiny': 'tiny', 'Size: Auto': 'auto', 'Size: Large': 'large',
} as const;
const HALIGN = { Middle: 'center', Right: 'right', Left: 'left' } as const;
const VALIGN = { Center: 'center', Top: 'top', Bottom: 'bottom' } as const;
const LINE_STYLE = { Solid: 'solid', Dashed: 'dashed', Dotted: 'dotted' } as const;

/** timeframelabel(tfinput) */
const timeframeLabel = (tf: string, period: string, isMinutes: boolean): string => {
  switch (tf) {
    // timeframe.period + (timeframe.isminutes ? 'm' : na): an na string adds nothing
    case '': return period + (isMinutes ? 'm' : '');
    case '1': return '1m';
    case '2': return '2m';
    case '3': return '3m';
    case '4': return '4m';
    case '5': return '5m';
    case '10': return '10m';
    case '15': return '15m';
    case '30': return '30m';
    case '60': return '1H';
    case '120': return '2H';
    case '240': return '4H';
    case '480': return '8H';
    case '720': return '12H';
    default: return tf;
  }
};

export function calculate(
  bars: Bar[],
  inputs: Partial<GapsImbalancesWicksByLeviathanInputs> = {},
  chart?: ChartContext,
): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const msOf = (t: number) => (t < 1e12 ? t * 1000 : t);
  const tfIn = cfg.tfinput.trim();

  // timeframe.period of a v5 script ("D", "W", "M" for one day / week / month), timeframe.isminutes
  const chartTf = chartTimeframe(bars, chart);
  const chartInfo = chartTf !== '' ? timeframe.info(chartTf) : null;
  const period = chartInfo ? chartInfo.period.replace(/^1([DWM])$/, '$1') : '';
  const isMinutes = chartInfo ? chartInfo.isminutes : false;

  // request.security(syminfo.tickerid, tfinput, ...): the chart series, or the latest completed bar of the timeframe
  let src: Bar[] = bars;
  let latest: number[] = bars.map((_b, i) => i);
  let starts: number[] = bars.map((b) => b.time);
  if (tfIn !== '' && chartTf !== '' && timeframe.in_seconds(tfIn) !== timeframe.in_seconds(chartTf)) {
    if (timeframe.in_seconds(tfIn) < timeframe.in_seconds(chartTf)) {
      throw new Error(`Gaps + Imbalances + Wicks (MTF): the timeframe "${tfIn}" is lower than the chart timeframe "${chartTf}": the chart bars do not have that data`);
    }
    const sec = higherTimeframeBars(bars, tfIn, chart);
    src = sec.htf;
    latest = sec.latest;
    starts = sec.starts;
  }
  const srcAtr = ta.atr(src, cfg.atrlength).toArray();
  const at = (i: number, back: number): Bar | null => {
    const k = latest[i] - back;
    return latest[i] >= 0 && k >= 0 ? src[k] : null;
  };
  const tOf = (i: number) => (i >= 0 && at(i, 0) ? msOf(at(i, 0)!.time) : NaN);
  const volOf = (i: number) => (i >= 0 && at(i, 0) ? at(i, 0)!.volume ?? NaN : NaN);

  // the lookback in days: timestamp(...) of timenow and of the bar, to the second
  const lastBarDate = Math.floor(nowOf(chart) / 1000) * 1000;

  const upcol = cfg.showboxes ? cfg.upcol1 : '#00000000';
  const downcol = cfg.showboxes ? cfg.downcol1 : '#00000000';
  const textSize = TEXT_SIZE[cfg.textsize];
  const halign = HALIGN[cfg.texthalign];
  const valign = VALIGN[cfg.textvalign];
  const style = LINE_STYLE[cfg.linestyle];
  const tfLabel = timeframeLabel(cfg.tfinput, period, isMinutes);
  const sameTf = cfg.tfinput === period;

  // indicator(max_boxes_count = 500, max_lines_count = 500)
  resetDrawings({ box: 500, line: 500 });

  let imbboxtext = '';
  let gapboxtext = '';
  let wickboxtext = '';
  let textSet = false;
  let condition = false;
  let condition2 = false;
  let condition3 = false;
  let condition4 = false;
  let condition5 = false;
  let condition6 = false;
  const boxes: Box[] = [];
  const topLines: (Line | null)[] = [];
  const middleLines: (Line | null)[] = [];
  const bottomLines: (Line | null)[] = [];

  const removeAt = (j: number) => {
    boxes.splice(j, 1);
    topLines.splice(j, 1);
    middleLines.splice(j, 1);
    bottomLines.splice(j, 1);
  };
  const deleteAt = (j: number) => {
    for (const l of [topLines[j], middleLines[j], bottomLines[j]]) if (l) line.delete(l);
    box.delete(boxes[j]);
  };

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    const bar = bars[i];
    const time = msOf(bar.time);
    const c0 = at(i, 0);
    const c1 = at(i, 1);
    const c2 = at(i, 2);
    const h = c0?.high ?? NaN;
    const l = c0?.low ?? NaN;
    const o1 = c1?.open ?? NaN;
    const h1 = c1?.high ?? NaN;
    const l1 = c1?.low ?? NaN;
    const cl1 = c1?.close ?? NaN;
    const h2 = c2?.high ?? NaN;
    const l2 = c2?.low ?? NaN;
    const atr = latest[i] >= 0 ? srcAtr[latest[i]] ?? NaN : NaN;
    // ta.change(time(tfinput)): the first bar of each period
    const isNew = i > 0 && starts[i] - starts[i - 1] !== 0;
    const t1 = tOf(i - 1);
    const t2 = tOf(i - 2);

    const upimbdist = (l - h2) / h2 * 100;
    const downimbdist = (l2 - h) / h * 100;
    const upgapdist = (l - h1) / h1 * 100;
    const downgapdist = (l1 - h) / h * 100;
    const upwickdist = (h1 - Math.max(o1, cl1)) / Math.max(o1, cl1) * 100;
    const downwickdist = (Math.min(o1, cl1) - l1) / l1 * 100;
    const bodysize = Math.abs(o1 - cl1);
    const upperWickSize = h1 - Math.max(o1, cl1);
    const lowerWickSize = Math.min(o1, cl1) - l1;

    // labeltype (volume of the zone bar)
    let labeltype = 0;
    if (cfg.boxtype === 'Imbalance' || cfg.boxtype === 'Wick') labeltype = sameTf ? volOf(i - 1) : volOf(i - 2);
    if (cfg.boxtype === 'Gap') labeltype = sameTf ? volOf(i) : volOf(i - 1);

    const daysLeft = Math.abs(Math.floor((lastBarDate - Math.floor(time / 1000) * 1000) / MSPD));
    const inRange = cfg.lookback ? lt(daysLeft, cfg.daysBack) : true;

    if (cfg.showboxtext) {
      const vol = str.tostring(labeltype, 'volume');
      if (cfg.textType === 'Labels') {
        imbboxtext = cfg.imbtext; gapboxtext = cfg.gaptext; wickboxtext = cfg.wicktext; textSet = true;
      } else if (cfg.textType === 'Volume') {
        imbboxtext = vol; gapboxtext = vol; wickboxtext = vol; textSet = true;
      } else if (cfg.textType === 'Labels + Timeframe') {
        imbboxtext = cfg.imbtext + SEP + tfLabel;
        gapboxtext = cfg.gaptext + SEP + tfLabel;
        wickboxtext = cfg.wicktext + SEP + tfLabel;
        textSet = true;
      } else {
        imbboxtext = cfg.imbtext + SEP + tfLabel + SEP + vol;
        gapboxtext = cfg.gaptext + SEP + tfLabel + SEP + vol;
        wickboxtext = cfg.wicktext + SEP + tfLabel + SEP + vol;
        textSet = true;
      }
    }

    const pct = cfg.pctcond * cfg.pctmult;
    if (cfg.conditiontype === 'Percentage') {
      condition = gt(upimbdist, pct);
      condition2 = gt(downimbdist, pct);
      condition3 = gt(upgapdist, pct);
      condition4 = gt(downgapdist, pct);
      condition5 = gt(upwickdist, pct);
      condition6 = gt(downwickdist, pct);
    }
    if (cfg.conditiontype === 'ATR') {
      const lim = cfg.atrmult * atr;
      condition = gt(l - h2, lim);
      condition2 = gt(l2 - h, lim);
      condition3 = gt(l - h1, lim);
      condition4 = gt(l1 - h, lim);
      condition5 = gt(h1 - Math.max(o1, cl1), lim);
      condition6 = gt(Math.min(o1, cl1) - l1, lim);
    }
    if (cfg.conditiontype === 'None') {
      condition = condition2 = condition3 = condition4 = condition5 = condition6 = true;
    }

    /** One zone: the box, then the top, bottom and middle lines */
    const zone = (x1: number, top: number, bottom: number, bg: string, border: string, text: string, textColor: string,
      topPrice: number, bottomPrice: number, midPrice: number) => {
      const bx = box.new(x1, top, time, bottom, border, 1, undefined, undefined, 'bar_time', bg,
        textSet ? text : '', textSize, textColor, halign, valign);
      const mk = (show: boolean, price: number) =>
        (show ? line.new(x1, price, time, price, 'bar_time', undefined, cfg.lineCol, style) : null);
      const topLine = mk(cfg.showtopline, topPrice);
      const bottomLine = mk(cfg.showbottomline, bottomPrice);
      const middleLine = mk(cfg.showmiddleline, midPrice);
      topLines.push(topLine);
      middleLines.push(middleLine);
      bottomLines.push(bottomLine);
      boxes.push(bx);
    };

    if (cfg.boxtype === 'Imbalance' && gt(l, h2) && cfg.showup && condition && inRange && isNew) {
      zone(t2, l, h2, upcol, cfg.upbordercol, imbboxtext, cfg.uptextcol, l, h2, (l + h2) / 2);
    }
    if (cfg.boxtype === 'Imbalance' && lt(h, l2) && cfg.showdown && condition2 && inRange && isNew) {
      zone(t2, h, l2, downcol, cfg.downbordercol, imbboxtext, cfg.downtextcol, l2, h, (h + l2) / 2);
    }
    if (cfg.boxtype === 'Gap' && gt(l, h1) && cfg.showup && condition3 && inRange && isNew) {
      zone(t1, l, h1, upcol, cfg.upbordercol, gapboxtext, cfg.uptextcol, l, h1, (l + h1) / 2);
    }
    if (cfg.boxtype === 'Gap' && lt(h, l1) && cfg.showdown && condition4 && inRange && isNew) {
      zone(t1, l1, h, downcol, cfg.downbordercol, gapboxtext, cfg.downtextcol, l1, h, (h + l1) / 2);
    }
    if (cfg.boxtype === 'Wick' && gt(upperWickSize, bodysize / 6) && cfg.showup && condition5 && inRange && isNew) {
      const bodyTop = Math.max(o1, cl1);
      zone(t1, h1, bodyTop, upcol, cfg.upbordercol, wickboxtext, cfg.uptextcol,
        Math.max(h1, bodyTop), Math.min(h1, bodyTop), (h1 + bodyTop) / 2);
    }
    if (cfg.boxtype === 'Wick' && gt(lowerWickSize, bodysize / 6) && cfg.showdown && condition6 && inRange && isNew) {
      const bodyBottom = Math.min(o1, cl1);
      zone(t1, bodyBottom, l1, downcol, cfg.downbordercol, wickboxtext, cfg.downtextcol,
        Math.max(l1, bodyBottom), Math.min(l1, bodyBottom), (l1 + bodyBottom) / 2);
    }

    // Looping over the arrays and updating objects (newest first)
    const size = boxes.length;
    for (let k = 0; k < size; k++) {
      const j = size - 1 - k;
      const bx = boxes[j];
      const level = box.get_bottom(bx);
      const level2 = box.get_top(bx);
      const level3 = (level2 + level) / 2;
      const touches = (lv: number) => gt(bar.high, lv) && lt(bar.low, lv);
      let filled = false;
      if (cfg.filledtype === 'Touch') filled = touches(level) || touches(level2);
      if (cfg.filledtype === 'Half Fill') filled = touches(level3);
      // 'Full Fill': six loops over the boxes, the last one sets the value
      if (cfg.filledtype === 'Full Fill') filled = touches(level);
      if (cfg.hidefilled && filled) {
        deleteAt(j);
        removeAt(j);
        continue;
      }
      if (filled && cfg.extendtilfilled) {
        removeAt(j);
        continue;
      }
      box.set_right(bx, time + 1);
      for (const ln of [topLines[j], middleLines[j], bottomLines[j]]) if (ln) line.set_x2(ln, time + 1);
      if (!filled && !cfg.extendtilfilled) {
        removeAt(j);
        continue;
      }
      // the box x are times in ms: the width is compared with the bar count as written
      const wide = gt(box.get_right(bx) - box.get_left(bx), cfg.nmbars);
      if (!filled && cfg.actionbool && cfg.actiondel === 'Delete Zone' && wide) deleteAt(j);
      if (!filled && cfg.actionbool && cfg.actiondel === 'Stop Zone' && wide) {
        removeAt(j);
        continue;
      }
    }

    // Deleting if the array is too big (the index moves on after each removal, as written)
    if (boxes.length >= cfg.maxBoxes) {
      let k = 0;
      while (boxes.length >= cfg.maxBoxes) {
        if (k >= boxes.length) throw new Error(`Index ${k} is out of bounds. Array size is ${boxes.length}`);
        deleteAt(k);
        removeAt(k);
        k += 1;
      }
    }
  }
  setDrawingBar(null);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    ...drawingOutputs(bars),
  };
}

export const GapsImbalancesWicksByLeviathan = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
