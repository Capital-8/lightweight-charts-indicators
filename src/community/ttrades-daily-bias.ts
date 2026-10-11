/**
 * TTrades Daily Bias [TFO]
 *
 * On each new day (and, with 'Weekly Bias', each new week) the period that just ended is compared with the period
 * before it (previous high PH, previous low PL) and a bias is set for the new period:
 * - close above PH: bias PH (1); close below PL: bias PL (-1)
 * - high above PH but close back inside: bias PL; low below PL but close back inside: bias PH
 * - inside period: the bias follows the direction of the period before (up: PH, down: PL)
 * - outside period that closed inside: no bias (0)
 * The high and low of the ended period are drawn as lines over the new period. When the price reaches one of them
 * the line takes the 'After Hit' colour and a triangle is plotted. A label tells the reason of the bias, a square at
 * the top / bottom of the pane shows the bias of each bar, and vertical lines separate the days and weeks.
 * The table shows, for each side, how often the level of the bias was reached (success rate), how often the period
 * then closed through it (close through rate) and the number of periods with that bias.
 * Lines, labels and triangles are only drawn on a chart timeframe below the period (daily: intraday charts).
 *
 * Drawings are kept up to 500 lines and 500 labels (the oldest are removed).
 *
 * Chart values (optional third argument of calculate): the chart timeframe (`timeframe`; without it, it is read from
 * the bar spacing), the exchange time zone and session for the days and weeks (without them: the UTC calendar and
 * the bars, see src/anchor-period.ts), and the chart foreground / background colours (labels and table; without
 * them: the dark theme colours #DBDBDB / #0F0F0F). The 10 alert conditions and the alerts of the script have no
 * output.
 *
 * Reference: "TTrades Daily Bias [TFO]" by tradeforopp
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © tradeforopp
 */

import { color, str, timeframe, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { LabelData, LineDrawingData, MarkerData, PineSize, TableCellData, TablePosition } from '../types';
import { chartTimeframe, periodStarts } from '../anchor-period';
import { backgroundColorOf, foregroundColorOf, type ChartContext } from '../chart-context';

type Location = 'Top' | 'Bottom';

export interface TtradesDailyBiasInputs {
  /** Daily Bias */
  dStats: boolean;
  /** Weekly Bias */
  wStats: boolean;
  /** Show Bias Reasoning */
  biasReason: boolean;
  /** Bull / Bear Bias Colors */
  bullColor: string;
  bearColor: string;
  /** Plot Daily Bias */
  dBiasPlot: boolean;
  /** Plot Weekly Bias */
  wBiasPlot: boolean;
  dBiasLoc: Location;
  wBiasLoc: Location;
  /** Before / After Hit Colors */
  beforeRaidColor: string;
  afterRaidColor: string;
  /** Stop Extending Lines After Hit */
  stopExt: boolean;
  /** Day Separator */
  useDSep: boolean;
  /** Week Separator */
  useWSep: boolean;
  dSep: string;
  wSep: string;
  /** Line Width */
  lineWidth: number;
  /** Show Statistics */
  tblShowStats: boolean;
  /** Position (table) */
  tblLoc: string;
  /** Size (table) */
  tblSize: string;
}

export const defaultInputs: TtradesDailyBiasInputs = {
  dStats: true,
  wStats: false,
  biasReason: true,
  bullColor: '#00897B',
  bearColor: '#FF5252',
  dBiasPlot: true,
  wBiasPlot: true,
  dBiasLoc: 'Top',
  wBiasLoc: 'Bottom',
  beforeRaidColor: '#2962FF',
  afterRaidColor: '#FF5252',
  stopExt: false,
  useDSep: true,
  useWSep: true,
  dSep: 'rgba(54, 58, 69, 0.2)',
  wSep: 'rgba(54, 58, 69, 0.7)',
  lineWidth: 1,
  tblShowStats: true,
  tblLoc: 'Top Right',
  tblSize: 'Normal',
};

const G_VIS = 'Bias';
const G_PLT = 'Plotting';
const G_STY = 'Style';
const G_TBL = 'Table';
const POSITIONS = ['Bottom Center', 'Bottom Left', 'Bottom Right', 'Middle Center', 'Middle Left', 'Middle Right', 'Top Center', 'Top Left', 'Top Right'];

export const inputConfig: InputConfig[] = [
  { id: 'dStats', type: 'bool', title: 'Daily Bias', defval: true, group: G_VIS, tooltip: 'Apply TTrades bias concepts to the 1 Day timeframe' },
  { id: 'wStats', type: 'bool', title: 'Weekly Bias', defval: false, group: G_VIS, tooltip: 'Apply TTrades bias concepts to the 1 Week timeframe' },
  { id: 'biasReason', type: 'bool', title: 'Show Bias Reasoning', defval: true, group: G_VIS, tooltip: 'Show the reason why a given bias is being established' },
  { id: 'bullColor', type: 'color', title: 'Bull / Bear Bias Colors', defval: '#00897B', inline: 'COLOR', group: G_PLT },
  { id: 'bearColor', type: 'color', title: '', defval: '#FF5252', inline: 'COLOR', group: G_PLT },
  { id: 'dBiasPlot', type: 'bool', title: 'Plot Daily Bias', defval: true, inline: 'DBIAS', group: G_PLT },
  { id: 'wBiasPlot', type: 'bool', title: 'Plot Weekly Bias', defval: true, inline: 'WBIAS', group: G_PLT },
  { id: 'dBiasLoc', type: 'string', title: '', defval: 'Top', options: ['Top', 'Bottom'], inline: 'DBIAS', group: G_PLT },
  { id: 'wBiasLoc', type: 'string', title: '', defval: 'Bottom', options: ['Top', 'Bottom'], inline: 'WBIAS', group: G_PLT },
  {
    id: 'beforeRaidColor', type: 'color', title: 'Before / After Hit Colors', defval: '#2962FF', inline: 'HIT', group: G_STY,
    tooltip: 'All previous high and low lines will start out as this color',
  },
  {
    id: 'afterRaidColor', type: 'color', title: '', defval: '#FF5252', inline: 'HIT', group: G_STY,
    tooltip: 'Once a previous high or low line is reached, it will become this color',
  },
  {
    id: 'stopExt', type: 'bool', title: 'Stop Extending Lines After Hit', defval: false, group: G_STY,
    tooltip: 'Once a previous high or low line is reached, its line will stop extending',
  },
  { id: 'useDSep', type: 'bool', title: 'Day Separator', defval: true, inline: 'DSEP', group: G_STY },
  { id: 'useWSep', type: 'bool', title: 'Week Separator', defval: true, inline: 'WSEP', group: G_STY },
  { id: 'dSep', type: 'color', title: '', defval: 'rgba(54, 58, 69, 0.2)', inline: 'DSEP', group: G_STY },
  { id: 'wSep', type: 'color', title: '', defval: 'rgba(54, 58, 69, 0.7)', inline: 'WSEP', group: G_STY },
  { id: 'lineWidth', type: 'int', title: 'Line Width', defval: 1, group: G_STY },
  {
    id: 'tblShowStats', type: 'bool', title: 'Show Statistics', defval: true, group: G_TBL,
    tooltip: 'Show statistics on bias accuracy\n\nSuccess Rate: how often has price successfully reached the assigned draw on liquidity?\n\nClose Thru Rate: from the number of times that price reached the assigned draw on liquidity, how often did it close through that level?\n\nSample Size: the total number of times that a given bias was assigned',
  },
  { id: 'tblLoc', type: 'string', title: 'Position', defval: 'Top Right', options: POSITIONS, group: G_TBL },
  { id: 'tblSize', type: 'string', title: 'Size', defval: 'Normal', options: ['Auto', 'Tiny', 'Small', 'Normal', 'Large', 'Huge'], group: G_TBL },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Daily Bias', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot1', title: 'Weekly Bias', color: 'transparent', lineWidth: 1, display: 'none' },
];

export const metadata = {
  title: 'TTrades Daily Bias [TFO]',
  shortTitle: 'TTrades Daily Bias [TFO]',
  overlay: true,
};

/** indicator(max_lines_count = 500, max_labels_count = 500) */
const MAX_OBJECTS = 500;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const ge = (a: number, b: number) => a - b >= -EPS;

/** The drawing count limit of Pine: above max + 5 objects of one kind the oldest are deleted until max remain */
function register<T>(list: T[], obj: T): T {
  list.push(obj);
  if (list.length > MAX_OBJECTS + 5) list.splice(0, list.length - MAX_OBJECTS);
  return obj;
}

/** `info` of the script: the levels of the period before, the running period and the counters */
interface Info {
  ph: number;
  pl: number;
  ch: number;
  cl: number;
  co: number;
  pUp: boolean;
  bias: number;
  biasPh: number;
  biasPl: number;
  hitPh: number;
  hitPl: number;
  closePh: number;
  closePl: number;
}

const newInfo = (): Info => ({
  ph: NaN, pl: NaN, ch: NaN, cl: NaN, co: NaN, pUp: false, bias: 0, biasPh: 0, biasPl: 0, hitPh: 0, hitPl: 0, closePh: 0, closePl: 0,
});

/** `lines` of the script: the two lines of the period before and whether they were reached */
interface Levels {
  phLine?: LineDrawingData;
  plLine?: LineDrawingData;
  hitPh: boolean;
  hitPl: boolean;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<TtradesDailyBiasInputs> = {},
  chart?: ChartContext,
): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  // chart.fg_color, chart.bg_color
  const chartFg = foregroundColorOf(chart);
  const chartBg = backgroundColorOf(chart);
  // bar times in seconds or in ms
  const unit = n > 0 && bars[0].time >= 1e12 ? 1000 : 1;

  // timeframe.in_seconds() of the chart (unknown with fewer than 2 bars and no chart timeframe: nothing is computed)
  const chartTf = chartTimeframe(bars, chart);
  const tfSeconds = chartTf === '' ? NaN : timeframe.in_seconds(chartTf);
  const daySeconds = timeframe.in_seconds('D');
  const weekSeconds = timeframe.in_seconds('W');
  const canPlotD = tfSeconds < daySeconds;
  const canPlotW = tfSeconds < weekSeconds;

  // new_day = timeframe.change("D"), new_week = timeframe.change("W"): false on the first bar
  const dayStarts = periodStarts(bars, 'D', chart);
  const weekStarts = periodStarts(bars, 'W', chart);

  const lines: LineDrawingData[] = [];
  const labels: LabelData[] = [];
  const markers: MarkerData[] = [];
  const dInfo = newInfo();
  const wInfo = newInfo();
  let dLevels: Levels = { hitPh: false, hitPl: false };
  let wLevels: Levels = { hitPh: false, hitPl: false };
  const dBias: Array<{ time: number; value: number; color: string }> = [];
  const wBias: Array<{ time: number; value: number; color: string }> = [];

  /** handle_bias(): the bias of the new period, its label and its counters */
  const handleBias = (info: Info, tf: 'D' | 'W', i: number) => {
    const canPlot = tf === 'D' ? canPlotD : canPlotW;
    const prevClose = i > 0 ? bars[i - 1].close : NaN;
    let txt: string;
    if (gt(prevClose, info.ph)) {
      if (info.bias === 1) info.closePh += 1;
      info.bias = 1;
      txt = `Close Above P${tf}H\nBias P${tf}H`;
    } else if (gt(info.pl, prevClose)) {
      if (info.bias === -1) info.closePl += 1;
      info.bias = -1;
      txt = `Close Below P${tf}L\nBias P${tf}L`;
    } else if (gt(info.ph, prevClose) && gt(prevClose, info.pl) && gt(info.ch, info.ph) && gt(info.cl, info.pl)) {
      info.bias = -1;
      txt = `Failed to Close Above P${tf}H\nBias P${tf}L`;
    } else if (gt(prevClose, info.pl) && gt(info.ph, prevClose) && gt(info.ph, info.ch) && gt(info.pl, info.cl)) {
      info.bias = 1;
      txt = `Failed to Close Below P${tf}L\nBias P${tf}H`;
    } else if (ge(info.ph, info.ch) && ge(info.cl, info.pl)) {
      info.bias = info.pUp ? 1 : -1;
      txt = `Close Inside\nBias P${tf}${info.pUp ? 'H' : 'L'}`;
    } else {
      info.bias = 0;
      txt = 'Outside Bar but Closed Inside\nNo Bias';
    }
    if (cfg.biasReason && canPlot) {
      register(labels, {
        time: bars[i].time, price: tf === 'D' ? info.cl : info.ch, text: txt, textColor: chartFg, color: chartBg,
        style: tf === 'D' ? 'label_up' : 'label_down',
      });
    }
    if (info.bias === 1) info.biasPh += 1;
    else if (info.bias === -1) info.biasPl += 1;
  };

  /** update_info(): on a new period the running period becomes the period before */
  const updateInfo = (info: Info, tf: 'D' | 'W', isNew: boolean, i: number) => {
    const bar = bars[i];
    if (isNew && !Number.isNaN(info.ch)) {
      handleBias(info, tf, i);
      // close[1] >= n.co
      info.pUp = i > 0 && ge(bars[i - 1].close, info.co);
      info.ph = info.ch;
      info.pl = info.cl;
      info.ch = bar.high;
      info.cl = bar.low;
      info.co = bar.open;
    }
    if (Number.isNaN(info.ch)) {
      // n.ch := high, then n.ch := low (as in the script: the low of the first period stays na)
      info.ch = bar.low;
    } else {
      info.ch = Math.max(bar.high, info.ch);
      // math.min(low, na) is na
      info.cl = Number.isNaN(info.cl) ? NaN : Math.min(bar.low, info.cl);
    }
  };

  /** update_lines(): the lines of the period before and their hits; returns [hit_high, hit_low] */
  const updateLines = (levels: Levels, info: Info, tf: 'D' | 'W', isNew: boolean, i: number): [Levels, boolean, boolean] => {
    const bar = bars[i];
    const canPlot = tf === 'D' ? canPlotD : canPlotW;
    let hitHigh = false;
    let hitLow = false;
    let current = levels;
    if (isNew) {
      const right = bar.time + (tf === 'D' ? daySeconds : weekSeconds) * unit;
      const make = (y: number): LineDrawingData => register(lines, {
        time1: bar.time, price1: y, time2: right, price2: y, color: canPlot ? cfg.beforeRaidColor : 'transparent',
        style: tf === 'D' ? 'solid' : 'dashed', width: cfg.lineWidth,
      });
      current = { phLine: make(info.ph), plLine: make(info.pl), hitPh: false, hitPl: false };
    }
    if (current.phLine && current.plLine) {
      if (ge(bar.high, current.phLine.price1) && !current.hitPh) {
        if (cfg.stopExt) current.phLine.time2 = bar.time;
        if (info.bias === 1) info.hitPh += 1;
        current.hitPh = true;
        if (canPlot) current.phLine.color = cfg.afterRaidColor;
        hitHigh = true;
      }
      if (ge(current.plLine.price1, bar.low) && !current.hitPl) {
        if (cfg.stopExt) current.plLine.time2 = bar.time;
        if (info.bias === -1) info.hitPl += 1;
        current.hitPl = true;
        if (canPlot) current.plLine.color = cfg.afterRaidColor;
        hitLow = true;
      }
    }
    return [current, hitHigh, hitLow];
  };

  const biasColor = (bias: number) => (bias === 1 ? cfg.bullColor : bias === -1 ? cfg.bearColor : undefined);

  for (let i = 0; i < n; i++) {
    const bar = bars[i];
    const newDay = i > 0 && dayStarts[i] !== dayStarts[i - 1];
    const newWeek = i > 0 && weekStarts[i] !== weekStarts[i - 1];

    // Separators
    if (cfg.useDSep && newDay && canPlotD) {
      register(lines, { time1: bar.time, price1: bar.high * 1.000001, time2: bar.time, price2: bar.low, color: cfg.dSep, extend: 'both', width: cfg.lineWidth });
    }
    if (cfg.useWSep && newWeek && canPlotW) {
      register(lines, { time1: bar.time, price1: bar.high * 1.000001, time2: bar.time, price2: bar.low, color: cfg.wSep, extend: 'both', width: cfg.lineWidth });
    }

    let dHitHigh = false;
    let dHitLow = false;
    let wHitHigh = false;
    let wHitLow = false;
    if (cfg.dStats && tfSeconds <= daySeconds) {
      updateInfo(dInfo, 'D', newDay, i);
      [dLevels, dHitHigh, dHitLow] = updateLines(dLevels, dInfo, 'D', newDay, i);
    }
    if (cfg.wStats && tfSeconds <= weekSeconds) {
      updateInfo(wInfo, 'W', newWeek, i);
      [wLevels, wHitHigh, wHitLow] = updateLines(wLevels, wInfo, 'W', newWeek, i);
    }

    // PDH / PDL / PWH / PWL raids
    if (canPlotD && dHitHigh) markers.push({ time: bar.time, position: 'aboveBar', shape: 'triangleUp', color: cfg.afterRaidColor, size: 'tiny' });
    if (canPlotD && dHitLow) markers.push({ time: bar.time, position: 'belowBar', shape: 'triangleDown', color: cfg.afterRaidColor, size: 'tiny' });
    if (canPlotW && wHitHigh) markers.push({ time: bar.time, position: 'aboveBar', shape: 'triangleUp', color: cfg.afterRaidColor, size: 'tiny' });
    if (canPlotW && wHitLow) markers.push({ time: bar.time, position: 'belowBar', shape: 'triangleDown', color: cfg.afterRaidColor, size: 'tiny' });

    // Daily / weekly bias squares: no colour (nothing drawn) without a bias
    const dCol = biasColor(dInfo.bias);
    if (cfg.dBiasPlot && dCol) {
      markers.push({ time: bar.time, position: cfg.dBiasLoc === 'Top' ? 'top' : 'bottom', shape: 'square', color: dCol, size: 'tiny' });
    }
    const wCol = biasColor(wInfo.bias);
    if (cfg.wBiasPlot && wCol) {
      markers.push({ time: bar.time, position: cfg.wBiasLoc === 'Top' ? 'top' : 'bottom', shape: 'square', color: wCol, size: 'tiny' });
    }

    dBias.push({ time: bar.time, value: dInfo.bias, color: 'transparent' });
    wBias.push({ time: bar.time, value: wInfo.bias, color: 'transparent' });
  }

  // Table (cells are set on the last bar)
  const position = cfg.tblLoc.toLowerCase().replace(' ', '_') as TablePosition;
  const textSize = cfg.tblSize.toLowerCase() as PineSize;
  const cells: TableCellData[] = [];
  if (n > 0) {
    const cell = (column: number, row: number, text: string, bgColor?: string) => {
      cells.push({ column, row, text, textColor: chartFg, textSize, ...(bgColor ? { bgColor } : {}) });
    };
    // format_result(): math.floor(hit / bias * 1000) / 10
    const result = (hit: number, bias: number) => `${bias > 0 ? str.tostring(Math.floor((hit / bias) * 1000) / 10) : '0'}%`;
    // format_color(): the level of the current bias, in the colour of its line
    const cellColor = (bull: boolean, info: Info, levels: Levels) => {
      if (bull ? info.bias !== 1 : info.bias !== -1) return undefined;
      const hit = bull ? levels.hitPh : levels.hitPl;
      return String(color.new(hit ? cfg.afterRaidColor : cfg.beforeRaidColor, 50));
    };
    const rows = (row: number, tf: 'D' | 'W', info: Info, levels: Levels) => {
      cell(0, row, `P${tf}H`, cellColor(true, info, levels));
      cell(0, row + 1, `P${tf}L`, cellColor(false, info, levels));
      if (cfg.tblShowStats) {
        cell(1, row, result(info.hitPh, info.biasPh));
        cell(1, row + 1, result(info.hitPl, info.biasPl));
        cell(2, row, result(info.closePh, info.hitPh));
        cell(2, row + 1, result(info.closePl, info.hitPl));
        cell(3, row, str.tostring(info.biasPh));
        cell(3, row + 1, str.tostring(info.biasPl));
      }
    };
    cell(0, 0, 'Bias');
    if (cfg.tblShowStats) {
      cell(1, 0, 'Success\nRate');
      cell(2, 0, 'Close Thru\nRate');
      cell(3, 0, 'Sample\nSize');
    }
    if (cfg.dStats) rows(1, 'D', dInfo, dLevels);
    if (cfg.wStats) rows(3, 'W', wInfo, wLevels);
  }

  // A line or a label with an na price is not drawn
  const drawnLines = lines.filter((ln) => !Number.isNaN(ln.price1) && !Number.isNaN(ln.price2));
  const drawnLabels = labels.filter((lb) => !Number.isNaN(lb.price));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0: dBias, plot1: wBias },
    markers,
    lines: drawnLines,
    labels: drawnLabels,
    tables: [{
      position, columns: 20, rows: 20, bgColor: chartBg, frameColor: chartFg, frameWidth: 2, borderColor: chartFg, borderWidth: 1, cells,
    }],
  };
}

export const TtradesDailyBias = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
