/**
 * Swing Levels and Liquidity - By Leviathan
 *
 * Swing highs and swing lows are pivots with "Bars Right-Left" bars after and before them. Each swing gets a dot on
 * its bar, a level line from the swing bar and a thin box next to the level ("Box Width" is a per-mille of the
 * price; TYPE 2 puts the box on the other side of the level). Line and box grow one bar past the current bar until
 * a bar touches the level ("Extend Until Fill"); "Hide Filled" removes them then. With "Show Volume" the box shows
 * the volume of the swing bar. "Volume >" keeps only the swings whose bar volume is above the value, and the
 * lookback option keeps only the swings of the last days before the current time (`timenow` in the original).
 *
 * At most 500 lines and 500 boxes are kept (the oldest are removed first).
 *
 * Chart values (third argument): the port reads the chart foreground colour for the box text (without it: #DBDBDB,
 * a dark chart) and the current time for the lookback option (without it: the clock of the computer).
 *
 * Open interest: the original reads the open interest of futures of other exchanges (six other symbols) for the
 * options "Show OI Δ", "OI Δ (abs.) >" and "Only Swings With". The chart bars do not have this data. These options
 * are off by default: the port throws an Error when one of them is switched on. The six exchange switches are kept
 * as inputs and have no effect.
 *
 * Reference: "Swing Points and Liquidity - By Leviathan" by LeviathanCapital
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LeviathanCapital
 */

import { ta, str, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BoxData, LineDrawingData, MarkerData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { foregroundColorOf, nowOf, type ChartContext } from '../chart-context';

export interface SwingLevelsAndLiquidityByLeviathanInputs {
  /** Bars after the swing bar */
  swingSizeR: number;
  /** Bars before the swing bar */
  swingSizeL: number;
  showBoxes: boolean;
  showSwingLines: boolean;
  showBubbles: boolean;
  showVol: boolean;
  /** Open interest change in the box text (not available: throws when true) */
  showOId: boolean;
  extendtilfilled: boolean;
  hidefilled: boolean;
  voltresh: number;
  /** Open interest filter (not available: throws when above 0) */
  oitresh: number;
  /** Open interest filter (not available: throws when not '/') */
  pnoid: 'Positive OI Delta' | 'Negative OI Delta' | '/';
  showhighs: boolean;
  showlows: boolean;
  sellcol: string;
  buycol: string;
  sellcolB: string;
  buycolB: string;
  sellboxCol: string;
  buyboxCol: string;
  lineStyle: 'Solid' | 'Dashed' | 'Dotted';
  lineWid: number;
  boxWid: number;
  boxStyle: 'TYPE 1' | 'TYPE 2';
  labelsize: 'Size: Normal' | 'Size: Large' | 'Size: Small' | 'Size: Tiny' | 'Size: Auto';
  texthalign: 'Middle' | 'Right' | 'Left';
  lookback: boolean;
  daysBack: number;
  binance: boolean;
  binance2: boolean;
  binance3: boolean;
  bitmex: boolean;
  bitmex2: boolean;
  kraken: boolean;
}

export const defaultInputs: SwingLevelsAndLiquidityByLeviathanInputs = {
  swingSizeR: 10,
  swingSizeL: 15,
  showBoxes: true,
  showSwingLines: true,
  showBubbles: true,
  showVol: false,
  showOId: false,
  extendtilfilled: true,
  hidefilled: false,
  voltresh: 0,
  oitresh: 0,
  pnoid: '/',
  showhighs: true,
  showlows: true,
  sellcol: '#AA2430',
  buycol: '#66BB6A',
  sellcolB: '#AA2430',
  buycolB: '#66BB6A',
  sellboxCol: 'rgba(128, 25, 34, 0.19)',
  buyboxCol: 'rgba(102, 187, 106, 0.19)',
  lineStyle: 'Dotted',
  lineWid: 1,
  boxWid: 0.7,
  boxStyle: 'TYPE 1',
  labelsize: 'Size: Tiny',
  texthalign: 'Right',
  lookback: false,
  daysBack: 150,
  binance: true,
  binance2: true,
  binance3: true,
  bitmex: true,
  bitmex2: true,
  kraken: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'swingSizeR', type: 'int', title: 'Bars Right-Left', defval: 10, inline: 'brl' },
  { id: 'swingSizeL', type: 'int', title: '-', defval: 15, inline: 'brl' },
  { id: 'showBoxes', type: 'bool', title: 'Show Boxes ', defval: true, inline: 'aa' },
  { id: 'showSwingLines', type: 'bool', title: 'Show Lines', defval: true, inline: 'aa' },
  { id: 'showBubbles', type: 'bool', title: 'Show Labels ', defval: true, inline: 'bb' },
  { id: 'showVol', type: 'bool', title: 'Show Volume', defval: false, inline: 'bb' },
  { id: 'showOId', type: 'bool', title: 'Show OI Δ   ', defval: false, inline: 'cc' },
  { id: 'extendtilfilled', type: 'bool', title: 'Extend Until Fill', defval: true, inline: 'cc' },
  { id: 'hidefilled', type: 'bool', title: 'Hide Filled', defval: false, group: 'Conditions' },
  { id: 'voltresh', type: 'int', title: 'Volume >', defval: 0, group: 'Conditions' },
  { id: 'oitresh', type: 'int', title: 'OI Δ (abs.) >', defval: 0, group: 'Conditions' },
  {
    id: 'pnoid', type: 'string', title: 'Only Swings With', defval: '/',
    options: ['Positive OI Delta', 'Negative OI Delta', '/'], group: 'Conditions',
  },
  { id: 'showhighs', type: 'bool', title: '', defval: true, inline: 'sh', group: 'Appearance' },
  { id: 'showlows', type: 'bool', title: '', defval: true, inline: 'sl', group: 'Appearance' },
  { id: 'sellcol', type: 'color', title: 'Lows (Line - Label - Box)', defval: '#AA2430', inline: 'sh', group: 'Appearance' },
  { id: 'buycol', type: 'color', title: 'Highs (Line - Label - Box)', defval: '#66BB6A', inline: 'sl', group: 'Appearance' },
  { id: 'sellcolB', type: 'color', title: '', defval: '#AA2430', inline: 'sh', group: 'Appearance' },
  { id: 'buycolB', type: 'color', title: '', defval: '#66BB6A', inline: 'sl', group: 'Appearance' },
  { id: 'sellboxCol', type: 'color', title: '', defval: 'rgba(128, 25, 34, 0.19)', inline: 'sh', group: 'Appearance' },
  { id: 'buyboxCol', type: 'color', title: '', defval: 'rgba(102, 187, 106, 0.19)', inline: 'sl', group: 'Appearance' },
  {
    id: 'lineStyle', type: 'string', title: 'Line Style + Width', defval: 'Dotted', options: ['Solid', 'Dashed', 'Dotted'],
    inline: 'l', group: 'Appearance',
  },
  { id: 'lineWid', type: 'int', title: '', defval: 1, inline: 'l', group: 'Appearance' },
  { id: 'boxWid', type: 'float', title: 'Box Width + Type ', defval: 0.7, step: 0.1, inline: 'xx', group: 'Appearance' },
  { id: 'boxStyle', type: 'string', title: '', defval: 'TYPE 1', options: ['TYPE 1', 'TYPE 2'], inline: 'xx', group: 'Appearance' },
  {
    id: 'labelsize', type: 'string', title: 'Text Style        ', defval: 'Size: Tiny',
    options: ['Size: Normal', 'Size: Large', 'Size: Small', 'Size: Tiny', 'Size: Auto'], inline: 'txt', group: 'Appearance',
  },
  { id: 'texthalign', type: 'string', title: '', defval: 'Right', options: ['Middle', 'Right', 'Left'], inline: 'txt', group: 'Appearance' },
  { id: 'lookback', type: 'bool', title: '', defval: false, inline: 'lb' },
  { id: 'daysBack', type: 'float', title: 'Lookback (D)               ', defval: 150, inline: 'lb' },
  { id: 'binance', type: 'bool', title: 'Binance USDT.P', defval: true, inline: 'src', group: 'Open Interest' },
  { id: 'binance2', type: 'bool', title: 'Binance USD.P', defval: true, inline: 'src', group: 'Open Interest' },
  { id: 'binance3', type: 'bool', title: 'Binance BUSD.P', defval: true, inline: 'src2', group: 'Open Interest' },
  { id: 'bitmex', type: 'bool', title: 'BitMEX USD.P', defval: true, inline: 'src2', group: 'Open Interest' },
  { id: 'bitmex2', type: 'bool', title: 'BitMEX USDT.P ', defval: true, inline: 'src3', group: 'Open Interest' },
  { id: 'kraken', type: 'bool', title: 'Kraken USD.P', defval: true, inline: 'src3', group: 'Open Interest' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Swing Points and Liquidity - By Leviathan',
  shortTitle: 'Swing Points and Liquidity - By Leviathan',
  overlay: true,
};

/** indicator(max_boxes_count = 500, max_lines_count = 500) */
const MAX_OBJECTS = 500;
/** color.rgb(0, 0, 0, 100) */
const CLEAR = '#00000000';
/** Milliseconds per day */
const MSPD = 24 * 60 * 60 * 1000;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const ge = (a: number, b: number) => a - b >= -EPS;
const le = (a: number, b: number) => b - a >= -EPS;

interface Level {
  x1: number;
  x2: number;
  /** Level price (line) */
  y: number;
  /** Box prices */
  top: number;
  bottom: number;
  boxColor: string;
  lineColor: string;
  text: string;
  boxDeleted: boolean;
  lineDeleted: boolean;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<SwingLevelsAndLiquidityByLeviathanInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'boxes' | 'lines' | 'markers'> & { boxes: BoxData[]; lines: LineDrawingData[]; markers: MarkerData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  if (cfg.showOId || cfg.oitresh > 0 || cfg.pnoid !== '/') {
    throw new Error(
      'Swing Levels and Liquidity: "Show OI Δ", "OI Δ (abs.) >" and "Only Swings With" need the open interest of other symbols, which the chart bars do not have',
    );
  }
  const n = bars.length;
  const swingSizeR = Math.trunc(cfg.swingSizeR);
  const swingSizeL = Math.trunc(cfg.swingSizeL);
  const boxWid1 = 0.001 * cfg.boxWid;
  const type2 = cfg.boxStyle === 'TYPE 2';

  const pivHiArr = ta.pivothigh(new Series(bars, (b) => b.high), swingSizeL, swingSizeR).toArray();
  const pivLoArr = ta.pivotlow(new Series(bars, (b) => b.low), swingSizeL, swingSizeR).toArray();

  // timenow, as a time with whole seconds
  const now = Math.floor(nowOf(chart) / 1000) * 1000;
  const timeMs = (i: number) => (bars[i].time < 1e11 ? bars[i].time * 1000 : bars[i].time);

  // Every box / line in creation order (drawing limit), and the levels the script still updates
  const allBoxes: Level[] = [];
  const allLines: Level[] = [];
  const levels: Level[] = [];
  const markers: MarkerData[] = [];

  /** Pine drawing limit: when a creation brings the count above max + 5, the oldest are deleted until max remain */
  const create = (lv: Level) => {
    allBoxes.push(lv);
    if (allBoxes.length > MAX_OBJECTS + 5) {
      for (const old of allBoxes.splice(0, allBoxes.length - MAX_OBJECTS)) old.boxDeleted = true;
    }
    allLines.push(lv);
    if (allLines.length > MAX_OBJECTS + 5) {
      for (const old of allLines.splice(0, allLines.length - MAX_OBJECTS)) old.lineDeleted = true;
    }
    levels.push(lv);
  };
  const deleteLevel = (lv: Level) => {
    if (!lv.boxDeleted) {
      lv.boxDeleted = true;
      allBoxes.splice(allBoxes.indexOf(lv), 1);
    }
    if (!lv.lineDeleted) {
      lv.lineDeleted = true;
      allLines.splice(allLines.indexOf(lv), 1);
    }
  };

  for (let i = 0; i < n; i++) {
    const bar = bars[i];
    const daysLeft = Math.abs(Math.floor((now - timeMs(i)) / MSPD));
    const inRange = cfg.lookback ? daysLeft < cfg.daysBack : true;

    const pivHi = pivHiArr[i] ?? NaN;
    const pivLo = pivLoArr[i] ?? NaN;
    const h = !isNaN(pivHi);
    const l = !isNaN(pivLo);
    const swingIndex = i - swingSizeR;

    const vol = i >= swingSizeR ? (bars[i - swingSizeR].volume ?? NaN) : NaN;
    const voltreshcond = cfg.voltresh > 0 ? gt(vol, cfg.voltresh) : true;

    // boxStyle(): the second price of the box (the high pivot comes first when a bar has both pivots)
    const boxEdge = type2 ? (h ? pivHi * (1 - boxWid1) : pivLo * (1 + boxWid1)) : h ? pivHi : pivLo;
    // (showVol ? str.tostring(vol, format.volume) : na) + ' ' + ''
    const text = (cfg.showVol ? str.tostring(vol, 'volume') : '') + ' ';

    if (h && inRange && cfg.showhighs && voltreshcond) {
      create({
        x1: swingIndex, x2: i, y: pivHi, top: pivHi * (1 + boxWid1), bottom: boxEdge,
        boxColor: cfg.showBoxes ? cfg.sellboxCol : CLEAR, lineColor: cfg.showSwingLines ? cfg.sellcol : CLEAR,
        text, boxDeleted: false, lineDeleted: false,
      });
    }
    // the original tests the switch of the highs here too
    if (l && inRange && cfg.showhighs && voltreshcond) {
      create({
        x1: swingIndex, x2: i, y: pivLo, top: pivLo * (1 - boxWid1), bottom: boxEdge,
        boxColor: cfg.showBoxes ? cfg.buyboxCol : CLEAR, lineColor: cfg.showSwingLines ? cfg.buycol : CLEAR,
        text, boxDeleted: false, lineDeleted: false,
      });
    }

    // Update the levels, newest first; a touched level leaves the list
    for (let j = levels.length - 1; j >= 0; j--) {
      const lv = levels[j];
      const level = lv.lineDeleted ? NaN : lv.y; // line.get_y2() of a deleted line is na
      const filled = ge(bar.high, level) && le(bar.low, level);

      if (filled && cfg.extendtilfilled && !cfg.hidefilled) {
        levels.splice(j, 1);
        continue;
      }
      lv.x2 = i + 1;
      if (filled && cfg.hidefilled) {
        levels.splice(j, 1);
        deleteLevel(lv);
      }
      if (!filled && !cfg.extendtilfilled) {
        levels.splice(j, 1);
        continue;
      }
    }

    // The list is cut when it has 500 levels (the original index grows while the list shrinks)
    if (levels.length >= MAX_OBJECTS) {
      let k = 0;
      while (levels.length >= MAX_OBJECTS) {
        deleteLevel(levels[k]);
        levels.splice(k, 1);
        k += 1;
      }
    }

    // Dots on the swing bars (plotshape with offset = -swingSizeR)
    if (cfg.showhighs && cfg.showBubbles && h && voltreshcond) {
      markers.push({
        time: bars[swingIndex].time, position: 'atPriceMiddle', price: bars[swingIndex].high, shape: 'circle',
        color: cfg.sellcolB, size: 'tiny', id: 'shape0',
      });
    }
    if (cfg.showlows && cfg.showBubbles && l && voltreshcond) {
      markers.push({
        time: bars[swingIndex].time, position: 'atPriceMiddle', price: bars[swingIndex].low, shape: 'circle',
        color: cfg.buycolB, size: 'tiny', id: 'shape1',
      });
    }
  }

  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  const lineStyle = cfg.lineStyle === 'Dashed' ? 'dashed' : cfg.lineStyle === 'Dotted' ? 'dotted' : 'solid';
  const textSize = ({
    'Size: Normal': 'normal', 'Size: Small': 'small', 'Size: Tiny': 'tiny', 'Size: Auto': 'auto', 'Size: Large': 'large',
  } as const)[cfg.labelsize];
  // chart.fg_color
  const chartFg = foregroundColorOf(chart);
  const textHAlign = cfg.texthalign === 'Middle' ? 'center' : cfg.texthalign === 'Left' ? 'left' : 'right';

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    boxes: allBoxes.map((b) => ({
      time1: T(b.x1), price1: b.top, time2: T(b.x2), price2: b.bottom, bgColor: b.boxColor, borderColor: 'transparent',
      text: b.text, textSize, textColor: chartFg, textHAlign, textVAlign: 'center' as const,
    })),
    lines: allLines.map((l) => ({
      time1: T(l.x1), price1: l.y, time2: T(l.x2), price2: l.y, color: l.lineColor, style: lineStyle, width: Math.trunc(cfg.lineWid),
    })),
  };
}

export const SwingLevelsAndLiquidityByLeviathan = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
