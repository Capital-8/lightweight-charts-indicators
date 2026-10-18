/**
 * VWAP Periodic Close [LuxAlgo]
 *
 * Anchored VWAPs that restart at each new day, week, month, quarter ("3M") or year ("12M"), and the level where each
 * of them closed. When a period ends, a horizontal line (width 2) is drawn at the VWAP of the bar before, from that
 * bar to `Line/Label Offset` bars to the right, with a label "<start date> · <PERIOD>(k) · <price>" (k = 1 for the
 * latest closed period). Lines and labels follow the current bar. "VWAP Origin" draws the VWAP path of each closed
 * period as a polyline. "Historical Closes" levels (and paths) are kept per period.
 *
 * Periods by chart timeframe, as the original: daily on intraday charts; weekly on daily and intraday charts;
 * monthly up to weekly charts; quarterly and yearly (off by default) up to monthly charts. Periods start with
 * `timeframe.change`, which follows the exchange calendar of the chart context. A symbol without volume shows a
 * table "No volume is provided by the data vendor." instead. The "Day" / "Night" themes change the colours and fill
 * the background (white / black).
 *
 * Chart context: exchange time zone and session (periods, dates of the labels), `syminfo.mintick` (prices),
 * `chart.fg_color` (table text).
 *
 * Reference: "VWAP Periodic Close [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import {
  taCore, str, time, timeframe, color, chartPoint, line, label, polyline, table, resetDrawings, setDrawingBar,
  drawingOutputs, getSource,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type BgColorData, type SourceType,
  type Line, type Label, type Polyline, type Table, type ChartPoint,
} from 'oakscriptjs';
import { mintickOf, timezoneOf, foregroundColorOf, type ChartContext } from '../chart-context';
import { chartTimeframe, periodChanges } from '../anchor-period';

type Theme = 'Day' | 'Night' | 'Custom';

export interface VwapPeriodicCloseInputs {
  isdVWAPc: boolean;
  isdVWAP: boolean;
  dVWAPSource: SourceType;
  dHistorical: number;
  dOffset: number;
  iswVWAPc: boolean;
  iswVWAP: boolean;
  wVWAPSource: SourceType;
  wHistorical: number;
  wOffset: number;
  ismVWAPc: boolean;
  ismVWAP: boolean;
  mVWAPSource: SourceType;
  mHistorical: number;
  mOffset: number;
  isqVWAPc: boolean;
  isqVWAP: boolean;
  qVWAPSource: SourceType;
  qHistorical: number;
  qOffset: number;
  isyVWAPc: boolean;
  isyVWAP: boolean;
  yVWAPSource: SourceType;
  yHistorical: number;
  yOffset: number;
  theme: Theme;
  dVWAPColor: string;
  wVWAPColor: string;
  mVWAPColor: string;
  qVWAPColor: string;
  yVWAPColor: string;
}

export const defaultInputs: VwapPeriodicCloseInputs = {
  isdVWAPc: true,
  isdVWAP: true,
  dVWAPSource: 'hlc3',
  dHistorical: 1,
  dOffset: 17,
  iswVWAPc: true,
  iswVWAP: true,
  wVWAPSource: 'hlc3',
  wHistorical: 3,
  wOffset: 17,
  ismVWAPc: true,
  ismVWAP: true,
  mVWAPSource: 'hlc3',
  mHistorical: 2,
  mOffset: 17,
  isqVWAPc: false,
  isqVWAP: false,
  qVWAPSource: 'hlc3',
  qHistorical: 1,
  qOffset: 17,
  isyVWAPc: false,
  isyVWAP: false,
  yVWAPSource: 'hlc3',
  yHistorical: 1,
  yOffset: 17,
  theme: 'Custom',
  dVWAPColor: '#E91E63',
  wVWAPColor: '#2962FF',
  mVWAPColor: '#00BCD4',
  qVWAPColor: '#089981',
  yVWAPColor: '#FF9800',
};

const OPTION_TT = 'VWAP Close Level toggles the display of the level where the VWAP closes at the end of the specified period\n\n'
  + 'VWAP Origin toggles the display of the VWAP line for that period\n\n'
  + 'Historical Closes option defines how many levels will be plotted for that period';

/** The inputs of one period group */
function periodInputs(p: string, group: string, on: boolean, historical: number): InputConfig[] {
  return [
    { id: `is${p}VWAPc`, type: 'bool', title: 'VWAP Close Level', defval: on, inline: 'dVWAP', group, tooltip: OPTION_TT },
    { id: `is${p}VWAP`, type: 'bool', title: 'VWAP Origin', defval: on, inline: 'dVWAP', group },
    { id: `${p}VWAPSource`, type: 'source', title: 'VWAP Source', defval: 'hlc3', inline: 'dVWAP2', group, display: 'data_window' },
    { id: `${p}Historical`, type: 'int', title: 'Historical Closes', defval: historical, min: 0, group, display: 'data_window' },
    { id: `${p}Offset`, type: 'int', title: 'Line/Label Offset', defval: 17, min: 0, max: 500, group, display: 'data_window' },
  ];
}

const GROUP_THEME = 'Themes';

export const inputConfig: InputConfig[] = [
  ...periodInputs('d', 'Daily - Volume Weighted Average Price (VWAP)', true, 1),
  ...periodInputs('w', 'Weekly - Volume Weighted Average Price (VWAP)', true, 3),
  ...periodInputs('m', 'Monthly - Volume Weighted Average Price (VWAP)', true, 2),
  ...periodInputs('q', 'Quarterly - Volume Weighted Average Price (VWAP)', false, 1),
  ...periodInputs('y', 'Yearly - Volume Weighted Average Price (VWAP)', false, 1),
  { id: 'theme', type: 'string', title: 'Themes', defval: 'Custom', options: ['Day', 'Night', 'Custom'], group: GROUP_THEME,
    display: 'data_window' },
  { id: 'dVWAPColor', type: 'color', title: 'D', defval: '#E91E63', inline: 'dVWAP2', group: GROUP_THEME },
  { id: 'wVWAPColor', type: 'color', title: 'W', defval: '#2962FF', inline: 'dVWAP2', group: GROUP_THEME },
  { id: 'mVWAPColor', type: 'color', title: 'M', defval: '#00BCD4', inline: 'dVWAP2', group: GROUP_THEME },
  { id: 'qVWAPColor', type: 'color', title: 'Q', defval: '#089981', inline: 'dVWAP2', group: GROUP_THEME },
  { id: 'yVWAPColor', type: 'color', title: 'Y', defval: '#FF9800', inline: 'dVWAP2', group: GROUP_THEME },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'VWAP Periodic Close [LuxAlgo]',
  shortTitle: 'LuxAlgo - VWAP Periodic Close',
  overlay: true,
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function calculate(bars: Bar[], inputs: Partial<VwapPeriodicCloseInputs> = {}, chart?: ChartContext): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const tz = timezoneOf(chart);
  const tick = mintickOf(chart);
  const fg = foregroundColorOf(chart);
  const tf = n > 0 ? timeframe.info(chartTimeframe(bars, chart) || '1D') : null;
  const ms = n > 0 && bars[0].time >= 1e12 ? 1 : 1000;

  // Themes
  let { dVWAPColor, wVWAPColor, mVWAPColor, qVWAPColor, yVWAPColor } = cfg;
  if (cfg.theme === 'Day') {
    [dVWAPColor, wVWAPColor, mVWAPColor, qVWAPColor, yVWAPColor] = ['#CF476F', '#FFD166', '#06D6A0', '#118AB2', '#073B4C'];
  } else if (cfg.theme === 'Night') {
    [dVWAPColor, wVWAPColor, mVWAPColor, qVWAPColor, yVWAPColor] = ['#F48FB1', '#90BFF9', '#80DEEA', '#70CCBD', '#FFCC80'];
  }

  // date(t): "Mmm-dd-yyyy · " in the exchange time zone
  const date = (t: number) => {
    const D = time.dayofmonth(t, tz);
    return `${MONTHS[time.month(t, tz) - 1]}-${D < 10 ? '0' + D : String(D)}-${time.year(t, tz)} · `;
  };
  const price = (v: number) => str.tostring(v, 'mintick', tick);

  resetDrawings();

  // ta.cum(volume) > 0
  const isVoly: boolean[] = [];
  let cum = 0;
  for (let i = 0; i < n; i++) {
    const v = bars[i].volume;
    cum += v === undefined || isNaN(v) ? 0 : v;
    isVoly.push(cum > 0);
  }

  /** renderVWAPCloses(source, period, historical, txt, color, offset, origin): one call site, its own `var` state */
  const renderer = (source: SourceType, period: string, historical: number, txt: string, col: string, offset: number,
    origin: boolean) => {
    const anchor = periodChanges(bars, period, chart);
    const vwap = taCore.vwap(getSource(bars, source as 'hlc3'), bars.map((b) => b.volume ?? NaN), anchor) as number[];
    const lines: Line[] = [];
    const labels: Label[] = [];
    const dates: string[] = [];
    const points: ChartPoint[] = [];
    const polylines: Polyline[] = [];
    let firstTime = NaN;
    let started = false;
    let note: Table | null = null;
    const labelColor = String(color.new(col, 73));

    return (i: number) => {
      const t = bars[i].time * ms;
      if (isVoly[i]) {
        if (!started) {
          firstTime = t; // var int firstTime = time
          started = true;
        }
        if (anchor[i]) {
          const prev = i > 0 ? vwap[i - 1] : NaN;
          lines.push(line.new(i - 1, prev, i - 1 + offset, prev, 'bar_index', 'none', col, 'solid', 2));
          labels.push(label.new(i - 1 + offset, prev, date(t) + txt + '(1) · ' + price(prev), 'bar_index', 'price',
            labelColor, 'label_left', col, undefined, undefined, price(prev)));
          dates.push(date(firstTime));
          firstTime = t;

          if (origin) {
            polylines.push(polyline.new(points, false, false, 'bar_index', col));
            points.length = 0;
            points.push(chartPoint.from_index(i, vwap[i]));
          }
          if (polylines.length > historical) polyline.delete(polylines.shift()!);
          if (lines.length > historical) line.delete(lines.shift()!);
          if (labels.length > historical) label.delete(labels.shift()!);
          if (dates.length > historical) dates.shift();

          labels.forEach((lb, index) => {
            label.set_text(lb, dates[index] + txt + '(' + (labels.length - index) + ')' + ' · ' + price(label.get_y(lb)));
          });
        } else if (lines.length > 0 && labels.length > 0) {
          if (origin) points.push(chartPoint.from_index(i, vwap[i]));
          for (const ln of lines) line.set_x2(ln, i + offset);
          for (const lb of labels) label.set_x(lb, i + offset);
        }
      } else {
        // var table note = table.new(position.bottom_right, 1, 1)
        if (note === null) note = table.new('bottom_right', 1, 1);
        if (i === n - 1) {
          table.cell(note, 0, 0, 'No volume is provided by the data vendor.      \n\n', 0, 0, fg, 'center', 'center', 'normal');
        }
      }
    };
  };

  const steps: Array<(i: number) => void> = [];
  if (tf) {
    const { isintraday, isdaily, isweekly, ismonthly } = tf;
    if (cfg.isdVWAPc && isintraday) {
      steps.push(renderer(cfg.dVWAPSource, 'D', cfg.dHistorical, 'DAILY', dVWAPColor, cfg.dOffset, cfg.isdVWAP));
    }
    if (cfg.iswVWAPc && (isdaily || isintraday)) {
      steps.push(renderer(cfg.wVWAPSource, 'W', cfg.wHistorical, 'WEEKLY', wVWAPColor, cfg.wOffset, cfg.iswVWAP));
    }
    if (cfg.ismVWAPc && (isweekly || isdaily || isintraday)) {
      steps.push(renderer(cfg.mVWAPSource, 'M', cfg.mHistorical, 'MONTHLY', mVWAPColor, cfg.mOffset, cfg.ismVWAP));
    }
    if (cfg.isqVWAPc && (ismonthly || isweekly || isdaily || isintraday)) {
      steps.push(renderer(cfg.qVWAPSource, '3M', cfg.qHistorical, 'QUARTERLY', qVWAPColor, cfg.qOffset, cfg.isqVWAP));
    }
    if (cfg.isyVWAPc && (ismonthly || isweekly || isdaily || isintraday)) {
      steps.push(renderer(cfg.yVWAPSource, '12M', cfg.yHistorical, 'YEARLY', yVWAPColor, cfg.yOffset, cfg.isyVWAP));
    }
  }

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    for (const step of steps) step(i);
  }
  setDrawingBar(null);

  // bgcolor(theme == 'Day' ? #ffffff : theme == 'Night' ? #000000 : na), twice: the same opaque colour on every bar
  // (bgcolor0), then on every bar shifted 1001 bars to the right (bgcolor1, offset 1001: from bar 1001 on)
  const bg = cfg.theme === 'Day' ? '#FFFFFF' : cfg.theme === 'Night' ? '#000000' : null;
  const bgColors: BgColorData[] = [];
  if (bg !== null) {
    for (const b of bars) bgColors.push({ time: b.time, color: bg, id: 'bgcolor0' });
    for (let i = 1001; i < n; i++) bgColors.push({ time: bars[i].time, color: bg, id: 'bgcolor1' });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    bgColors,
    ...drawingOutputs(bars),
  };
}

export const VwapPeriodicClose = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
