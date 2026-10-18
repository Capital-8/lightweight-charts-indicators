/**
 * Multi Timeframe Break of Structure (BOS) & Market Structure Shift (MSS)
 *
 * Market structure on up to three timeframes (each the chart timeframe or a timeframe of the symbol given as a
 * multiplier and a period). On each timeframe, swing highs and lows are pivots with "Swing Length" bars on each side
 * (taken on the bars of that timeframe, shown on the chart bar that completes the pivot's confirming bar). A swing high
 * is a higher high (HH) when it is at or above the swing high before, else a lower high (LH); swing lows are higher
 * lows (HL) or lower lows (LL). When the close (or the high / low with "Use High/Low") of the timeframe goes beyond the
 * latest swing, the swing is broken: a line from the swing bar to the breaking bar and a label "BOS" (break in the
 * direction of the previous break) or "MSS" (break against it) with the timeframe name. The first break of a
 * timeframe only sets the direction. With "Hide all Market Structure" off, labels "HH" / "LH" / "HL" / "LL" mark the
 * swings.
 *
 * "Show Structure only on a lower Timeframe" hides the breaks of a timeframe below the chart timeframe. A timeframe
 * below the chart timeframe reads the bars of that timeframe inside each chart bar, which the chart bars do not have:
 * the port leaves out such a timeframe when it draws nothing, and throws an Error when it would draw something.
 * At most 500 lines and 500 labels are kept.
 *
 * Alerts (alert() calls, `alertCalls` of the result, once per bar close): on each drawn break of a timeframe, "New
 * bullish MSS formed on <timeframe>" / "New bullish BOS formed on <timeframe>" (and bearish) when "Use TF k MSS Alert" /
 * "Use TF k BOS Alert" is on, as the original (the first break of a timeframe only sets the direction).
 *
 * Reference: "Multi Timeframe Break of Structure(BOS) & Market Structure Shift(MSS)" by Lenny_Kiruthu
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Lenny_Kiruthu
 */

import {
  ta, Series, color, str, line, label, resetDrawings, setDrawingBar, timeframe, mapToChart,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { AlertCall, LabelData, LineDrawingData, PineSize } from '../types';
import type { ChartContext } from '../chart-context';
import { chartTimeframe, higherTimeframeBars } from '../anchor-period';

type Period = 'Minute' | 'Hour' | 'Day' | 'Week' | 'Month';
type LineType = 'Solid' | 'Dashed' | 'Dotted';
type TextSize = 'Normal' | 'Tiny' | 'Small' | 'Large' | 'Huge' | 'Auto';

export interface MtfBreakOfStructureMarketStructureShiftInputs {
  hideAllMs: boolean;
  hideAllBreaks: boolean;
  showOnlyOnLowerTimeframes: boolean;
  tf1UseBosPlot: boolean;
  tf1UseMssPlot: boolean;
  tf1ChartFeature: boolean;
  tf1UseHighLow: boolean;
  tf1DisplayPivots: boolean;
  tf1DisplayTimeframe: boolean;
  tf1BosAlert: boolean;
  tf1MssAlert: boolean;
  tf1Multip: number;
  tf1Period: Period;
  tf1SwingLength: number;
  tf1LineType: LineType;
  tf1LineWidth: number;
  tf1TextSize: TextSize;
  tf1BulBosCol: string;
  tf1BearBosCol: string;
  tf1BulMsCol: string;
  tf1BearMsCol: string;
  tf2UseBosPlot: boolean;
  tf2UseMssPlot: boolean;
  tf2ChartFeature: boolean;
  tf2UseHighLow: boolean;
  tf2DisplayPivots: boolean;
  tf2DisplayTimeframe: boolean;
  tf2BosAlert: boolean;
  tf2MssAlert: boolean;
  tf2Multip: number;
  tf2Period: Period;
  tf2SwingLength: number;
  tf2LineType: LineType;
  tf2LineWidth: number;
  tf2TextSize: TextSize;
  tf2BulBosCol: string;
  tf2BearBosCol: string;
  tf2BulMsCol: string;
  tf2BearMsCol: string;
  tf3UseBosPlot: boolean;
  tf3UseMssPlot: boolean;
  tf3ChartFeature: boolean;
  tf3UseHighLow: boolean;
  tf3DisplayPivots: boolean;
  tf3DisplayTimeframe: boolean;
  tf3BosAlert: boolean;
  tf3MssAlert: boolean;
  tf3Multip: number;
  tf3Period: Period;
  tf3SwingLength: number;
  tf3LineType: LineType;
  tf3LineWidth: number;
  tf3TextSize: TextSize;
  tf3BulBosCol: string;
  tf3BearBosCol: string;
  tf3BulMsCol: string;
  tf3BearMsCol: string;
}

/** The original makes alert() calls */
export const hasAlertFunction = true;

const GREEN = '#4CAF50';
const RED = '#FF5252';
const WHITE = '#FFFFFF';

export const defaultInputs: MtfBreakOfStructureMarketStructureShiftInputs = {
  hideAllMs: true,
  hideAllBreaks: false,
  showOnlyOnLowerTimeframes: true,
  tf1UseBosPlot: true,
  tf1UseMssPlot: true,
  tf1ChartFeature: false,
  tf1UseHighLow: false,
  tf1DisplayPivots: true,
  tf1DisplayTimeframe: true,
  tf1BosAlert: true,
  tf1MssAlert: true,
  tf1Multip: 2,
  tf1Period: 'Hour',
  tf1SwingLength: 7,
  tf1LineType: 'Solid',
  tf1LineWidth: 2,
  tf1TextSize: 'Small',
  tf1BulBosCol: GREEN,
  tf1BearBosCol: RED,
  tf1BulMsCol: WHITE,
  tf1BearMsCol: WHITE,
  tf2UseBosPlot: true,
  tf2UseMssPlot: true,
  tf2ChartFeature: true,
  tf2UseHighLow: false,
  tf2DisplayPivots: true,
  tf2DisplayTimeframe: true,
  tf2BosAlert: true,
  tf2MssAlert: true,
  tf2Multip: 2,
  tf2Period: 'Hour',
  tf2SwingLength: 7,
  tf2LineType: 'Dashed',
  tf2LineWidth: 1,
  tf2TextSize: 'Small',
  tf2BulBosCol: GREEN,
  tf2BearBosCol: RED,
  tf2BulMsCol: WHITE,
  tf2BearMsCol: WHITE,
  tf3UseBosPlot: true,
  tf3UseMssPlot: true,
  tf3ChartFeature: false,
  tf3UseHighLow: false,
  tf3DisplayPivots: false,
  tf3DisplayTimeframe: false,
  tf3BosAlert: true,
  tf3MssAlert: true,
  tf3Multip: 1,
  tf3Period: 'Hour',
  tf3SwingLength: 7,
  tf3LineType: 'Dotted',
  tf3LineWidth: 1,
  tf3TextSize: 'Small',
  tf3BulBosCol: GREEN,
  tf3BearBosCol: RED,
  tf3BulMsCol: WHITE,
  tf3BearMsCol: WHITE,
};

const GENERAL = '-------General Settings-------';
const PERIODS: Period[] = ['Minute', 'Hour', 'Day', 'Week', 'Month'];
const LINE_TYPES: LineType[] = ['Solid', 'Dashed', 'Dotted'];
const TEXT_SIZES: TextSize[] = ['Normal', 'Tiny', 'Small', 'Large', 'Huge', 'Auto'];

/** The inputs of one timeframe group (k = 1, 2, 3), in the order of the original */
function timeframeInputs(k: 1 | 2 | 3): InputConfig[] {
  const d = defaultInputs as unknown as Record<string, unknown>;
  const group = `-------Timeframe ${k} Settings--------`;
  const id = (name: string) => `tf${k}${name}`;
  const def = <T>(name: string) => d[id(name)] as T;
  const msBul = k === 1 ? 'Bullish Text MS Color' : 'Bullish MS Color';
  const msBear = k === 1 ? 'Bearish Text MS Color' : 'Bearish MS Color';
  return [
    { id: id('UseBosPlot'), type: 'bool', title: `Show TF ${k} BOS Plots`, defval: def<boolean>('UseBosPlot'), group },
    { id: id('UseMssPlot'), type: 'bool', title: `Show TF ${k} MSS Plots`, defval: def<boolean>('UseMssPlot'), group },
    { id: id('ChartFeature'), type: 'bool', title: 'Set Timeframe to Chart', defval: def<boolean>('ChartFeature'), group },
    { id: id('UseHighLow'), type: 'bool', title: 'Use High/Low for Bos & Mss', defval: def<boolean>('UseHighLow'), group },
    { id: id('DisplayPivots'), type: 'bool', title: 'Display Market Structure', defval: def<boolean>('DisplayPivots'), group },
    { id: id('DisplayTimeframe'), type: 'bool', title: 'Display Timeframe', defval: def<boolean>('DisplayTimeframe'), group },
    { id: id('BosAlert'), type: 'bool', title: `Use TF ${k} BOS Alert`, defval: def<boolean>('BosAlert'), group },
    { id: id('MssAlert'), type: 'bool', title: `Use TF ${k} MSS Alert`, defval: def<boolean>('MssAlert'), group },
    { id: id('Multip'), type: 'int', title: `Timeframe ${k}`, defval: def<number>('Multip'), min: 1, max: 1440, group, inline: `T${k}` },
    { id: id('Period'), type: 'string', title: '', defval: def<string>('Period'), options: PERIODS, group, inline: `T${k}` },
    { id: id('SwingLength'), type: 'int', title: 'Swing Length', defval: def<number>('SwingLength'), min: 1, group },
    { id: id('LineType'), type: 'string', title: 'Border Type', defval: def<string>('LineType'), options: LINE_TYPES, group },
    { id: id('LineWidth'), type: 'int', title: 'Line Width', defval: def<number>('LineWidth'), group },
    { id: id('TextSize'), type: 'string', title: 'Text Size', defval: def<string>('TextSize'), options: TEXT_SIZES, group },
    { id: id('BulBosCol'), type: 'color', title: 'Bullish Bos/Mss Color', defval: def<string>('BulBosCol'), group, inline: `TF ${k} Color` },
    { id: id('BearBosCol'), type: 'color', title: 'Bearish Bos/Mss Color', defval: def<string>('BearBosCol'), group, inline: `TF ${k} Color` },
    { id: id('BulMsCol'), type: 'color', title: msBul, defval: def<string>('BulMsCol'), group, inline: `TF ${k} Ms Color` },
    { id: id('BearMsCol'), type: 'color', title: msBear, defval: def<string>('BearMsCol'), group, inline: `TF ${k} Ms Color` },
  ];
}

export const inputConfig: InputConfig[] = [
  { id: 'hideAllMs', type: 'bool', title: 'Hide all Market Structure', defval: true, group: GENERAL },
  { id: 'hideAllBreaks', type: 'bool', title: 'Hide all Structure Breaks', defval: false, group: GENERAL },
  { id: 'showOnlyOnLowerTimeframes', type: 'bool', title: 'Show Structure only on a lower Timeframe', defval: true, group: GENERAL },
  ...timeframeInputs(1),
  ...timeframeInputs(2),
  ...timeframeInputs(3),
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Multi Timeframe Break of Structure(BOS) & Market Structure Shift(MSS)',
  shortTitle: 'MTF BOS & MSS',
  overlay: true,
};

/** indicator(max_labels_count = 500, max_lines_count = 500) */
const MAX_OBJECTS = 500;

/** Pine float comparisons within 1e-10; na compares false */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => a - b >= -EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
const ne = (a: number, b: number) => Math.abs(a - b) > EPS;

interface TimeframeSettings {
  useBosPlot: boolean;
  useMssPlot: boolean;
  chartFeature: boolean;
  useHighLow: boolean;
  displayPivots: boolean;
  displayTimeframe: boolean;
  bosAlert: boolean;
  mssAlert: boolean;
  multip: number;
  period: Period;
  swingLength: number;
  lineType: LineType;
  lineWidth: number;
  textSize: TextSize;
  bulBosCol: string;
  bearBosCol: string;
  bulMsCol: string;
  bearMsCol: string;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<MtfBreakOfStructureMarketStructureShiftInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { labels: LabelData[]; lines: LineDrawingData[]; alertCalls: AlertCall[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const chartTf = chartTimeframe(bars, chart);
  const tfi = timeframe.info(chartTf === '' ? '1D' : chartTf);
  const m = tfi.multiplier;
  const transparent = String(color.new(WHITE, 100));

  const settings = ([1, 2, 3] as const).map((k): TimeframeSettings => {
    const c = cfg as unknown as Record<string, unknown>;
    const get = <T>(name: string) => c[`tf${k}${name}`] as T;
    return {
      useBosPlot: get('UseBosPlot'), useMssPlot: get('UseMssPlot'), chartFeature: get('ChartFeature'),
      useHighLow: get('UseHighLow'), displayPivots: get('DisplayPivots'), displayTimeframe: get('DisplayTimeframe'),
      bosAlert: get('BosAlert'), mssAlert: get('MssAlert'),
      multip: get('Multip'), period: get('Period'), swingLength: get('SwingLength'), lineType: get('LineType'),
      lineWidth: get('LineWidth'), textSize: get('TextSize'), bulBosCol: get('BulBosCol'), bearBosCol: get('BearBosCol'),
      bulMsCol: get('BulMsCol'), bearMsCol: get('BearMsCol'),
    };
  });

  /** TF(): the timeframe of request.security */
  const tfString = (p: Period, tm: number) =>
    (p === 'Minute' ? `${tm}` : p === 'Hour' ? `${tm * 60}` : p === 'Day' ? `${tm}D` : p === 'Week' ? `${tm}W` : `${tm}M`);

  /** TF_Display() */
  const tfDisplay = (s: TimeframeSettings): string => {
    if (!s.chartFeature) {
      const suffix = { Minute: 'Min', Hour: 'H', Day: 'D', Week: 'W', Month: 'M' }[s.period];
      return `${s.multip}${suffix}`;
    }
    if (tfi.isminutes && m % 60 !== 0) return `${m}Min`;
    if (tfi.isminutes && m % 60 === 0) return `${str.tostring(m / 60)}H`;
    if (tfi.isdaily) return `${m}D`;
    if (tfi.isweekly) return `${m}W`;
    if (tfi.ismonthly) return `${m}M`;
    return '';
  };

  /** MTF_MS_Display(): the number of chart bars from the pivot bar to the bar where it is known (na: no case) */
  const msDisplay = (s: TimeframeSettings): number => {
    const { period: p, multip: tm, swingLength: sl } = s;
    if (s.chartFeature) return sl;
    const mins = tfi.isminutes;
    if (p === 'Month' && mins && m % 60 === 0 && eq((24 * 5 * 5 / ((tm * 1440 * 5 * 5) / m)) * 60, m)) return ((tm * 1440) * 5 * 5 / m) * sl;
    if (p === 'Month' && tfi.isweekly && eq((5 / ((tm * 1440 * 5) / m)) * 1440, m)) return ((tm * 1440) * 5 / 1440) * sl;
    if (p === 'Month' && tfi.isdaily && eq((5 * 5 / ((tm * 1440 * 5 * 5) / m)) * 1440, m)) return ((tm * 1440) * 5 * 5 / 1440) * sl;
    if (tfi.ismonthly && m === tm && p === 'Month') return sl;
    if (p === 'Week' && mins && m % 60 === 0 && eq((24 * 5 / ((tm * 1440 * 5) / m)) * 60, m)) return ((tm * 1440) * 5 / m) * sl;
    if (p === 'Week' && tfi.isdaily && eq((5 / ((tm * 1440 * 5) / m)) * 1440, m)) return ((tm * 1440) * 5 / 1440) * sl;
    if (tfi.isweekly && m === tm && p === 'Week') return sl;
    if (p === 'Day' && mins && m % 60 === 0 && eq((24 / ((tm * 1440) / m)) * 60, m)) return (tm * 1440 / m) * sl;
    if (tfi.isdaily && m === tm && p === 'Day') return sl;
    if (mins && m % 60 !== 0 && p === 'Minute' && tm === m) return sl;
    if (mins && m % 60 !== 0 && p === 'Minute' && tm !== m) return ((tm / 60) * 60 / m) * sl;
    if (mins && m % 60 !== 0 && p === 'Hour' && tm !== m) return ((tm * 60 / 60) * 60 / m) * sl;
    if (mins && m % 60 !== 0 && p === 'Hour' && tm === m && m * 60 === 60) return ((tm * 60 / 60) * 60 / m) * sl;
    if (mins && m % 60 !== 0 && p === 'Day' && tm !== m) return ((tm * 1440 / 60) * 60 / m) * sl;
    if (mins && m % 60 === 0 && p === 'Hour' && tm * 60 === m) return sl;
    if (mins && m % 60 === 0 && p === 'Hour' && tm * 60 !== m) return (tm * 60 / m) * sl;
    return NaN;
  };

  /** HTF_Structure_Control() */
  const structureControl = (s: TimeframeSettings): boolean => {
    if (s.chartFeature || !cfg.showOnlyOnLowerTimeframes) return true;
    const { period: p, multip: tm } = s;
    const { isminutes: mins, isdaily: d, isweekly: w, ismonthly: mo } = tfi;
    if (p === 'Minute' && tm < m && mins) return false;
    if (p === 'Minute' && tm >= m && mins) return true;
    if (p === 'Minute' && (d || w || mo)) return false;
    if (p === 'Hour' && tm * 60 < m && mins) return false;
    if (p === 'Hour' && tm * 60 >= m && mins) return true;
    if (p === 'Hour' && (d || w || mo)) return false;
    if ((p === 'Day' && d) || mins) return true;
    if ((p === 'Week' && w) || d || mins) return true;
    if ((p === 'Month' && mo) || w || d || mins) return true;
    return false;
  };

  const lineStyle = (t: LineType) => (t === 'Dashed' ? 'dashed' : t === 'Dotted' ? 'dotted' : 'solid') as 'solid' | 'dashed' | 'dotted';
  const textSize = (t: TextSize) => t.toLowerCase() as PineSize;
  const times = bars.map((b) => b.time);
  /** time[k] on bar i (k truncated; na reads the current bar; before the first bar: na) */
  const timeAt = (i: number, k: number) => {
    if (isNaN(k)) return times[i];
    const j = i - Math.trunc(k);
    return j >= 0 ? times[j] : NaN;
  };

  resetDrawings({ line: MAX_OBJECTS, label: MAX_OBJECTS });
  const alertCalls: AlertCall[] = [];

  /** One Market_Structure() call: returns the step of bar i, or null when the timeframe draws nothing */
  const marketStructure = (s: TimeframeSettings, k: number) => {
    const tf = s.chartFeature || chartTf === '' ? chartTf : tfString(s.period, s.multip);
    const control = structureControl(s);
    const display = tfDisplay(s);
    const offset = msDisplay(s);
    const size = textSize(s.textSize);
    const style = lineStyle(s.lineType);
    const showsLabels = s.displayTimeframe && s.displayPivots && !cfg.hideAllMs;
    const showsBreaks = s.displayTimeframe && !cfg.hideAllBreaks && control;

    // request.security(syminfo.tickerid, tf, [ta.pivothigh(high, len, len), ta.pivotlow(low, len, len)], gaps_on)
    // and request.security(syminfo.tickerid, tf, close (or high / low)), without lookahead
    let sh: number[];
    let sl: number[];
    let highClose: number[];
    let lowClose: number[];
    const len = s.swingLength;
    const pivots = (src: Bar[]) => ({
      ph: ta.pivothigh(Series.fromBars(src, 'high'), len, len).toArray().map((v) => v ?? NaN),
      pl: ta.pivotlow(Series.fromBars(src, 'low'), len, len).toArray().map((v) => v ?? NaN),
    });
    const sameTf = tf === '' || chartTf === '' || timeframe.in_seconds(tf) === timeframe.in_seconds(chartTf);
    if (sameTf) {
      const p = pivots(bars);
      sh = p.ph;
      sl = p.pl;
      highClose = bars.map((b) => (s.useHighLow ? b.high : b.close));
      lowClose = bars.map((b) => (s.useHighLow ? b.low : b.close));
    } else if (timeframe.in_seconds(tf) < timeframe.in_seconds(chartTf)) {
      if (showsLabels || showsBreaks) {
        throw new Error(`MTF BOS & MSS: timeframe ${k} ("${tf}") is lower than the chart timeframe "${chartTf}": its bars inside each chart bar are not in the chart bars (choose a timeframe at or above the chart timeframe, or hide its structure)`);
      }
      return null;
    } else {
      const sec = higherTimeframeBars(bars, tf, chart);
      const p = pivots(sec.htf);
      sh = mapToChart(p.ph, sec.group, sec.latest, false, true);
      sl = mapToChart(p.pl, sec.group, sec.latest, false, true);
      highClose = mapToChart(sec.htf.map((b) => (s.useHighLow ? b.high : b.close)), sec.group, sec.latest, false, false);
      lowClose = mapToChart(sec.htf.map((b) => (s.useHighLow ? b.low : b.close)), sec.group, sec.latest, false, false);
    }

    let prevHigh = NaN;
    let prevLow = NaN;
    let prevHighHist = NaN; // TF_Prev_High[1]
    let prevLowHist = NaN;
    let prevHighTimeHist = 0; // TF_Prev_High_Time[1] (0 on the bars where it is not set)
    let prevLowTimeHist = 0;
    let highPresent = false;
    let lowPresent = false;
    let prevBreakoutType = 0;
    let sinceHigh = NaN; // ta.barssince(HH or LH)
    let sinceLow = NaN;
    let highCountVar = 0; // var High_Count of Count_Candles_For_Structure("Bullish", ...)
    let lowCountVar = 0;

    return (i: number) => {
      let hh = false;
      let lh = false;
      let hl = false;
      let ll = false;
      let prevHighTime = 0;
      let prevLowTime = 0;
      let highBroken = false;
      let lowBroken = false;
      let endHighTime = 0;
      let endLowTime = 0;

      if (!isNaN(sh[i])) {
        if (ge(sh[i], prevHigh)) hh = true;
        else lh = true;
        prevHigh = sh[i];
        prevHighTime = ne(prevHigh, prevHighHist) ? timeAt(i, offset) : prevHighTimeHist;
        highPresent = true;
      }
      if (!isNaN(sl[i])) {
        if (ge(sl[i], prevLow)) hl = true;
        else ll = true;
        prevLow = sl[i];
        prevLowTime = ne(prevLow, prevLowHist) ? timeAt(i, offset) : prevLowTimeHist;
        lowPresent = true;
      }
      if (gt(highClose[i], prevHigh) && highPresent) {
        highBroken = true;
        highPresent = false;
        endHighTime = times[i];
      }
      if (lt(lowClose[i], prevLow) && lowPresent) {
        lowBroken = true;
        lowPresent = false;
        endLowTime = times[i];
      }

      if (showsLabels) {
        const swing = (time: number, price: number, text: string, up: boolean, css: string) => {
          label.new(time, price, `${text} \n${display}`, 'bar_time', 'price', transparent, up ? 'label_up' : 'label_down', css, size);
        };
        if (hh) swing(prevHighTime, prevHigh, 'HH', false, s.bulMsCol);
        if (hl) swing(prevLowTime, prevLow, 'HL', true, s.bulMsCol);
        if (lh) swing(prevHighTime, prevHigh, 'LH', false, s.bearMsCol);
        if (ll) swing(prevLowTime, prevLow, 'LL', true, s.bearMsCol);
      }

      sinceHigh = hh || lh ? 0 : sinceHigh + 1;
      sinceLow = hl || ll ? 0 : sinceLow + 1;
      // Count_Candles_For_Structure(): `for i = 0 to count` leaves the last index (the var keeps its value when na)
      const highCount = sinceHigh + offset;
      const lowCount = sinceLow + offset;
      if (!isNaN(highCount) && highCount >= 0) highCountVar = Math.floor(highCount);
      if (!isNaN(lowCount) && lowCount >= 0) lowCountVar = Math.floor(lowCount);

      const brk = (price: number, endTime: number, bullish: boolean) => {
        const count = bullish ? highCountVar : lowCountVar;
        const kind = (bullish ? prevBreakoutType === 1 : prevBreakoutType === -1) ? 'BOS'
          : (bullish ? prevBreakoutType === -1 : prevBreakoutType === 1) ? 'MSS' : '';
        if ((kind === 'BOS' && s.useBosPlot) || (kind === 'MSS' && s.useMssPlot)) {
          const css = bullish ? s.bulBosCol : s.bearBosCol;
          line.new(timeAt(i, count), price, endTime, price, 'bar_time', 'none', css, style, s.lineWidth);
          label.new(timeAt(i, count / 2), price, `${kind} \n${display}`, 'bar_time', 'price', transparent,
            bullish ? 'label_down' : 'label_up', css, size);
        }
        // bullish: if Prev_Breakout_Type == -1 and Use_MSS_Alert -> MSS alert, else if == 1 and Use_BOS_Alert -> BOS
        // bearish: if Prev_Breakout_Type == 1 and Use_MSS_Alert -> MSS alert, else if == -1 and Use_BOS_Alert -> BOS
        const against = bullish ? prevBreakoutType === -1 : prevBreakoutType === 1;
        const along = bullish ? prevBreakoutType === 1 : prevBreakoutType === -1;
        const dir = bullish ? 'bullish' : 'bearish';
        const alertKind = against && s.mssAlert ? 'MSS' : along && s.bosAlert ? 'BOS' : '';
        if (alertKind) {
          alertCalls.push({ time: times[i] as number, message: `New ${dir} ${alertKind} formed on ${display}`, freq: 'once_per_bar_close' });
        }
        prevBreakoutType = bullish ? 1 : -1;
      };
      if (highBroken && showsBreaks) brk(prevHigh, endHighTime, true);
      if (lowBroken && showsBreaks) brk(prevLow, endLowTime, false);

      prevHighHist = prevHigh;
      prevLowHist = prevLow;
      prevHighTimeHist = prevHighTime;
      prevLowTimeHist = prevLowTime;
    };
  };

  const steps = settings.map((s, j) => marketStructure(s, j + 1));
  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    for (const step of steps) step?.(i);
  }
  setDrawingBar(null);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    // a drawing with an na coordinate is not drawn
    lines: line.all().filter((l) => !isNaN(l.x1) && !isNaN(l.x2) && !isNaN(l.y1)).map((l) => ({
      time1: l.x1, price1: l.y1, time2: l.x2, price2: l.y2, color: String(l.color), width: l.width ?? 1,
      style: l.style as 'solid' | 'dashed' | 'dotted',
    })),
    labels: label.all().filter((l) => !isNaN(l.x) && !isNaN(l.y)).map((l) => ({
      time: l.x, price: l.y, text: l.text ?? '', color: 'transparent', textColor: String(l.textcolor),
      style: l.style as 'label_up' | 'label_down', size: l.size as PineSize,
    })),
    alertCalls,
  };
}

export const MtfBreakOfStructureMarketStructureShift = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hasAlertFunction,
};
