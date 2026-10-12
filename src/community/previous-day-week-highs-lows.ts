/**
 * Daily Weekly Monthly Highs & Lows
 *
 * The high and the low of each day, week and month, read from the higher-timeframe bars with lookahead (each chart
 * bar sees the high and the low of the whole period that contains it). When a period starts, the lines of the period
 * before end on its first bar, and two dashed lines (high and low) start there at the high and the low of the new
 * period. The lines of the "lookback" periods before the current one are kept (2 days, 1 week, 1 month by default);
 * with "Show Gradient" the older lines fade out (from transparent for the oldest to the full colour for the newest).
 * "Show Projections" extends the previous lines to a few bars after the last bar.
 * The daily lines are shown on intraday charts, the weekly lines on intraday and daily charts, the monthly lines
 * on every chart below one month.
 *
 * The six plots (transparent) carry the high and the low of the latest period that is not the current one of the
 * data, for the status line, the price scale and the data window: they take the high and the low of a new period on
 * its first bar.
 *
 * The periods are built from the chart bars (`request.security` with lookahead): the high and the low of a period
 * are the highest high and the lowest low of its chart bars. The original reads the higher-timeframe bars of the
 * symbol: the period that contains the first bar can have begun before it, on intraday stock charts the daily
 * bars come from the end-of-day data feed, which can differ from the intraday bars, and on weekly charts a month
 * starts inside a weekly bar: the port takes the weekly bars that start in the month, so its monthly high and low
 * can include days of the next month.
 *
 * Chart values (third argument): the chart timeframe (without it: taken from the bar spacing) and the time zone and
 * session of the symbol, which give the periods of the exchange calendar (without them: the UTC calendar and the
 * bars, see src/anchor-period.ts).
 *
 * Reference: "Daily Weekly Monthly Highs & Lows" by sbtnc
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © sbtnc
 */

import {
  color, timeframe, line, resetDrawings, setDrawingBar, varDrawing, drawingOutputs,
  type Line, type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import { chartTimeframe, higherTimeframeBars } from '../anchor-period';
import type { LineDrawingData } from '../types';
import type { ChartContext } from '../chart-context';

export interface PreviousDayWeekHighsLowsInputs {
  isDailyEnabled: boolean;
  dailyColor: string;
  /** Number of daily periods kept before the current one */
  dailyLookback: number;
  isWeeklyEnabled: boolean;
  weeklyColor: string;
  weeklyLookback: number;
  isMonthlyEnabled: boolean;
  monthlyColor: string;
  monthlyLookback: number;
  /** "Show Projections": extend the previous highs and lows after the last bar */
  areHeadsEnabled: boolean;
  /** Bars after the last bar for the projections */
  rightOffset: number;
  hasGradient: boolean;
}

export const defaultInputs: PreviousDayWeekHighsLowsInputs = {
  isDailyEnabled: true,
  dailyColor: '#4CAF50',
  dailyLookback: 2,
  isWeeklyEnabled: true,
  weeklyColor: '#FF9800',
  weeklyLookback: 1,
  isMonthlyEnabled: true,
  monthlyColor: '#FF5252',
  monthlyLookback: 1,
  areHeadsEnabled: false,
  rightOffset: 20,
  hasGradient: true,
};

const G_INDICATOR = 'Highs & Lows';
const G_STYLE = 'Style';

export const inputConfig: InputConfig[] = [
  { id: 'isDailyEnabled', type: 'bool', title: 'Daily', defval: true, inline: 'Daily', group: G_INDICATOR },
  { id: 'dailyColor', type: 'color', title: '', defval: '#4CAF50', inline: 'Daily', group: G_INDICATOR },
  { id: 'dailyLookback', type: 'int', title: '', defval: 2, min: 1, inline: 'Daily', group: G_INDICATOR },
  { id: 'isWeeklyEnabled', type: 'bool', title: 'Weekly', defval: true, inline: 'Weekly', group: G_INDICATOR },
  { id: 'weeklyColor', type: 'color', title: '', defval: '#FF9800', inline: 'Weekly', group: G_INDICATOR },
  { id: 'weeklyLookback', type: 'int', title: '', defval: 1, min: 1, inline: 'Weekly', group: G_INDICATOR },
  { id: 'isMonthlyEnabled', type: 'bool', title: 'Monthly', defval: true, inline: 'Monthly', group: G_INDICATOR },
  { id: 'monthlyColor', type: 'color', title: '', defval: '#FF5252', inline: 'Monthly', group: G_INDICATOR },
  { id: 'monthlyLookback', type: 'int', title: '', defval: 1, min: 1, inline: 'Monthly', group: G_INDICATOR },
  {
    id: 'areHeadsEnabled', type: 'bool', title: 'Show Projections', defval: false, inline: 'Head', group: G_STYLE,
    tooltip: 'Extends previous highs and lows in the future.',
  },
  { id: 'rightOffset', type: 'int', title: '', defval: 20, min: 1, inline: 'Head', group: G_STYLE },
  {
    id: 'hasGradient', type: 'bool', title: 'Show Gradient', defval: true, group: G_STYLE,
    tooltip: 'Show a color gradient that highlights the recency of highs and lows.',
  },
];

// Transparent plots (editable = false): for the status line, the price scale and the data window
export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'DH', color: 'rgba(76, 175, 80, 0)', lineWidth: 1 },
  { id: 'plot1', title: 'DL', color: 'rgba(76, 175, 80, 0)', lineWidth: 1 },
  { id: 'plot2', title: 'WH', color: 'rgba(255, 152, 0, 0)', lineWidth: 1 },
  { id: 'plot3', title: 'WL', color: 'rgba(255, 152, 0, 0)', lineWidth: 1 },
  { id: 'plot4', title: 'MH', color: 'rgba(255, 82, 82, 0)', lineWidth: 1 },
  { id: 'plot5', title: 'ML', color: 'rgba(255, 82, 82, 0)', lineWidth: 1 },
];

export const metadata = {
  title: 'Daily Weekly Monthly Highs & Lows',
  shortTitle: 'DWM HL',
  overlay: true,
};

/** indicator(max_lines_count = 500) */
const MAX_LINES = 500;

/** One higher timeframe as `request.security(syminfo.tickerid, tf, [time, high, low, barstate.islast], lookahead_on)` */
interface Feed {
  time: number[];
  high: number[];
  low: number[];
  isLast: boolean[];
}

function feedOf(bars: Bar[], tf: string, chartTf: string, chart?: ChartContext): Feed {
  const n = bars.length;
  // the chart timeframe itself: the chart bars
  if (chartTf !== '' && timeframe.in_seconds(tf) <= timeframe.in_seconds(chartTf)) {
    return {
      time: bars.map((b) => b.time),
      high: bars.map((b) => b.high),
      low: bars.map((b) => b.low),
      isLast: bars.map((_b, i) => i === n - 1),
    };
  }
  // lookahead: every chart bar of a period sees the bar of that period
  const sec = higherTimeframeBars(bars, tf, chart);
  const lastGroup = sec.htf.length - 1;
  return {
    time: sec.starts,
    high: sec.group.map((g) => sec.htf[g].high),
    low: sec.group.map((g) => sec.htf[g].low),
    isLast: sec.group.map((g) => g === lastGroup),
  };
}

export function calculate(
  bars: Bar[],
  inputs: Partial<PreviousDayWeekHighsLowsInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'lines'> & { lines: LineDrawingData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const chartTf = chartTimeframe(bars, chart);
  const info = chartTf === '' ? null : timeframe.info(chartTf);
  const rightOffset = Math.trunc(cfg.rightOffset);

  const canShowDaily = cfg.isDailyEnabled && !!info?.isintraday;
  const canShowWeekly = cfg.isWeeklyEnabled && !!info && (info.isintraday || info.isdaily);
  const canShowMonthly = cfg.isMonthlyEnabled && !!info && !info.ismonthly;

  const daily = canShowDaily ? feedOf(bars, '1D', chartTf, chart) : null;
  const weekly = canShowWeekly ? feedOf(bars, '1W', chartTf, chart) : null;
  const monthly = canShowMonthly ? feedOf(bars, '1M', chartTf, chart) : null;

  resetDrawings({ line: MAX_LINES });

  /** f_draw(): the `var` lines and arrays of one call site */
  const drawer = (lookback: number, css: string) => {
    const high = varDrawing<Line>();
    const low = varDrawing<Line>();
    const highs: Line[] = [];
    const lows: Line[] = [];
    return (i: number, isNew: boolean, h: number, l: number, last: boolean) => {
      const end = cfg.areHeadsEnabled ? i + rightOffset : i;
      if (isNew) {
        if (high.value) line.set_x2(high.value, end);
        if (low.value) line.set_x2(low.value, end);
        if (cfg.hasGradient) {
          const size = highs.length;
          if (size > 1) {
            for (let k = 0; k < size; k++) {
              const c = color.from_gradient(k, 0, size - 1, color.new(css, 100), color.new(css, 0));
              line.set_color(highs[k], c);
              line.set_color(lows[k], c);
            }
          }
        }
        high.value = line.new(i, h, i, h, 'bar_index', 'none', css, 'dashed', 1);
        low.value = line.new(i, l, i, l, 'bar_index', 'none', css, 'dashed', 1);
        highs.push(high.value);
        lows.push(low.value);
        if (highs.length > lookback + 1) {
          line.delete(highs.shift()!);
          line.delete(lows.shift()!);
        }
      }
      if (cfg.areHeadsEnabled && last && highs.length > 1) {
        // the current high and low are not extended
        for (let k = 0; k <= highs.length - 2; k++) {
          line.set_x2(highs[k], i + rightOffset);
          line.set_x2(lows[k], i + rightOffset);
        }
      }
    };
  };
  const drawMonthly = drawer(Math.trunc(cfg.monthlyLookback), cfg.monthlyColor);
  const drawWeekly = drawer(Math.trunc(cfg.weeklyLookback), cfg.weeklyColor);
  const drawDaily = drawer(Math.trunc(cfg.dailyLookback), cfg.dailyColor);

  // a_lastHighs / a_lastLows: daily, weekly, monthly
  const lastHighs = [NaN, NaN, NaN];
  const lastLows = [NaN, NaN, NaN];
  const plotValues: number[][] = [[], [], [], [], [], []];
  // dailyTime != dailyTime[1]: false on the first bar (na compares false)
  const changed = (f: Feed | null, i: number) => !!f && i > 0 && f.time[i] !== f.time[i - 1];

  for (let i = 0; i < n; i++) {
    const last = i === n - 1;
    setDrawingBar(i, last);
    const dNew = changed(daily, i);
    const wNew = changed(weekly, i);
    const mNew = changed(monthly, i);

    if (daily && dNew && !daily.isLast[i]) {
      lastHighs[0] = daily.high[i];
      lastLows[0] = daily.low[i];
    }
    if (weekly && wNew && !weekly.isLast[i]) {
      lastHighs[1] = weekly.high[i];
      lastLows[1] = weekly.low[i];
    }
    if (monthly && mNew && !monthly.isLast[i]) {
      lastHighs[2] = monthly.high[i];
      lastLows[2] = monthly.low[i];
    }

    if (monthly) drawMonthly(i, mNew, monthly.high[i], monthly.low[i], last);
    if (weekly) drawWeekly(i, wNew, weekly.high[i], weekly.low[i], last);
    if (daily) drawDaily(i, dNew, daily.high[i], daily.low[i], last);

    for (let k = 0; k < 3; k++) {
      plotValues[2 * k].push(lastHighs[k]);
      plotValues[2 * k + 1].push(lastLows[k]);
    }
  }
  setDrawingBar(null);

  const plotColors = [cfg.dailyColor, cfg.dailyColor, cfg.weeklyColor, cfg.weeklyColor, cfg.monthlyColor, cfg.monthlyColor]
    .map((c) => String(color.new(c, 100)));
  const plots: IndicatorResult['plots'] = {};
  plotValues.forEach((values, k) => {
    plots[`plot${k}`] = values.map((v, i) => ({ time: bars[i].time, value: v, color: plotColors[k] }));
  });

  const out = drawingOutputs(bars);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    lines: (out.lines ?? []) as LineDrawingData[],
  };
}

export const PreviousDayWeekHighsLows = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
