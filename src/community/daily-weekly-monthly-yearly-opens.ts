/**
 * Daily Weekly Monthly Yearly Opens
 *
 * Opening price of up to five higher-timeframe periods (by default the day, the week, the month and the year; the
 * quarter is off). Each open is a horizontal line from the first bar of its period to a few bars after the last
 * bar ("Offset"), with a small text at its end ("D", "W", "M", "Y", "4H" ...). An open is shown only when its
 * timeframe is above the chart timeframe.
 * - The number after each colour is how many periods are kept: the current one and the ones before it, each line
 *   ending one bar before the next period.
 * - "Show Tails": a dotted line extends the current open to the left.
 * - "Show Projections": the lines of the periods before the current one continue to the right, in a lighter colour.
 * - On the last bar, an open that is closer than half the average true range (10 bars) to an open listed before it
 *   ends four bars further for each of them, so that the texts do not overlap.
 * - The five plots carry the opens for the status line, the price scale and the data window (not drawn in the pane).
 *
 * Lines are kept up to 500 (the oldest are removed; the line of the current period and the tail of each open are
 * never removed by this limit).
 *
 * Limits of the port:
 * - The periods are built from the chart bars, and the open of a period is the open of its first chart bar. The
 *   original reads the higher-timeframe bars of the symbol: the open of the period that contains the first bar is
 *   the true open of that period there, also when the period began before the first bar (here: the open of the
 *   first bar), and on intraday stock charts the daily, weekly, monthly and yearly opens come from the end-of-day
 *   data feed, which can differ from the open of the first intraday bar ("Discover Prices" takes the chart bars in
 *   the original too).
 * - A period that starts inside a chart bar (e.g. a month on weekly bars) has an opening price that the bars do not
 *   carry: the port throws an Error.
 * - The plot display follows the default inputs (open #4 hidden).
 *
 * Chart values (third argument): the time zone and the session of the symbol give the periods of the exchange
 * calendar (without them: the UTC calendar and the bars, see src/anchor-period.ts); the chart timeframe (without
 * it: taken from the bar spacing); the session type of the bars (without it: regular) with the regular session on
 * extended-hours bars (the opens then follow the regular hours unless "Extended Hours" is set; without the session
 * the port throws an Error); the symbol tick of the tooltips (without it: 0.01).
 *
 * Reference: "Daily Weekly Monthly Yearly Opens" by sbtnc
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © sbtnc
 */

import { ta, str, color, timeframe, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import { periodStarts, securityBars, sessionFlags, chartTimeframe } from '../anchor-period';
import { barInterval, barTime } from '../bar-time';
import type { LabelData, LineDrawingData } from '../types';
import { mintickOf, type ChartContext } from '../chart-context';

/** Timeframe options (input titles) and their timeframe strings */
const TIMEFRAMES: Record<string, string> = {
  '5 seconds': '5S', '10 seconds': '10S', '15 seconds': '15S', '30 seconds': '30S',
  '1 minute': '1', '2 minutes': '2', '3 minutes': '3', '5 minutes': '5', '10 minutes': '10', '15 minutes': '15',
  '30 minutes': '30', '45 minutes': '45',
  '1 hour': '60', '2 hours': '120', '3 hours': '180', '4 hours': '240', '6 hours': '360', '8 hours': '480',
  '12 hours': '720',
  '1 day': '1D', '1 week': '1W', '1 month': '1M', '3 months': '3M', '6 months': '6M', '12 months': '12M',
};
const TIMEFRAME_OPTIONS = Object.keys(TIMEFRAMES);

/** Short text of a timeframe string (displayString) */
const DISPLAY: Record<string, string> = {
  '1': 'm', '2': '2m', '3': '3m', '5': '5m', '10': '10m', '15': '15m', '30': '30m', '45': '45m',
  '60': 'H', '120': '2H', '180': '3H', '240': '4H', '360': '6H', '480': '8H', '720': '12H', '1440': '24H',
  '1D': 'D', '1W': 'W', '1M': 'M', '12M': 'Y',
};

export interface DailyWeeklyMonthlyYearlyOpensInputs {
  enableOpen1: boolean;
  /** Timeframe of open #1: one of the options "5 seconds" ... "12 months" */
  openTimeframe1: string;
  openColor1: string;
  /** Number of periods kept for open #1 */
  openLookback1: number;
  enableOpen2: boolean;
  openTimeframe2: string;
  openColor2: string;
  openLookback2: number;
  enableOpen3: boolean;
  openTimeframe3: string;
  openColor3: string;
  openLookback3: number;
  enableOpen4: boolean;
  openTimeframe4: string;
  openColor4: string;
  openLookback4: number;
  enableOpen5: boolean;
  openTimeframe5: string;
  openColor5: string;
  openLookback5: number;
  /** Bars between the last bar and the end of the current opens */
  rightOffset: number;
  enableTails: boolean;
  enableHeads: boolean;
  discoverPrices: boolean;
  enableExtendedSession: boolean;
}

export const defaultInputs: DailyWeeklyMonthlyYearlyOpensInputs = {
  enableOpen1: true,
  openTimeframe1: '1 day',
  openColor1: '#4CAF50',
  openLookback1: 1,
  enableOpen2: true,
  openTimeframe2: '1 week',
  openColor2: '#FF9800',
  openLookback2: 1,
  enableOpen3: true,
  openTimeframe3: '1 month',
  openColor3: '#F23645',
  openLookback3: 1,
  enableOpen4: false,
  openTimeframe4: '3 months',
  openColor4: '#9C27B0',
  openLookback4: 1,
  enableOpen5: true,
  openTimeframe5: '12 months',
  openColor5: '#2962FF',
  openLookback5: 1,
  rightOffset: 20,
  enableTails: false,
  enableHeads: false,
  discoverPrices: false,
  enableExtendedSession: false,
};

const G_OPENS = 'Opens';
const G_STYLE = 'Style';
const G_PREFS = 'Preferences';

const openInputs = (k: 1 | 2 | 3 | 4 | 5): InputConfig[] => [
  { id: `enableOpen${k}`, type: 'bool', title: '', defval: defaultInputs[`enableOpen${k}`], group: G_OPENS, inline: `#${k}` },
  { id: `openTimeframe${k}`, type: 'string', title: '', defval: defaultInputs[`openTimeframe${k}`], options: TIMEFRAME_OPTIONS, group: G_OPENS, inline: `#${k}` },
  { id: `openColor${k}`, type: 'color', title: '', defval: defaultInputs[`openColor${k}`], group: G_OPENS, inline: `#${k}` },
  { id: `openLookback${k}`, type: 'int', title: '', defval: 1, min: 1, max: 500, group: G_OPENS, inline: `#${k}` },
];

export const inputConfig: InputConfig[] = [
  ...openInputs(1),
  ...openInputs(2),
  ...openInputs(3),
  ...openInputs(4),
  ...openInputs(5),
  { id: 'rightOffset', type: 'int', title: 'Offset', defval: 20, min: 1, group: G_STYLE, inline: 'Offset', tooltip: 'Extend the current opens to the right of the last bar.' },
  { id: 'enableTails', type: 'bool', title: 'Show Tails', defval: false, group: G_STYLE, tooltip: 'Extend the current opens to the left of the chart.' },
  { id: 'enableHeads', type: 'bool', title: 'Show Projections', defval: false, group: G_STYLE, tooltip: 'Extend the previous opens to the right.' },
  {
    id: 'discoverPrices', type: 'bool', title: 'Discover Prices', defval: false, group: G_PREFS,
    tooltip: 'On the intraday chart, discover the opens on the chart instead of requesting higher-timeframe data.\n\nYou can use this setting when price discrepancies exist between the intraday and end-of-day data feeds.',
  },
  {
    id: 'enableExtendedSession', type: 'bool', title: 'Extended Hours', defval: false, group: G_PREFS,
    tooltip: 'If the extended trading hours are visible on the intraday chart, display the opens on the pre/post market session.',
  },
];

// The plots are for the status line, the price scale and the data window: not drawn in the pane
export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: '#1', color: defaultInputs.openColor1, lineWidth: 1, display: 'data_window' },
  { id: 'plot1', title: '#2', color: defaultInputs.openColor2, lineWidth: 1, display: 'data_window' },
  { id: 'plot2', title: '#3', color: defaultInputs.openColor3, lineWidth: 1, display: 'data_window' },
  { id: 'plot3', title: '#4', color: defaultInputs.openColor4, lineWidth: 1, display: 'none' },
  { id: 'plot4', title: '#5', color: defaultInputs.openColor5, lineWidth: 1, display: 'data_window' },
];

export const metadata = {
  title: 'Daily Weekly Monthly Yearly Opens',
  shortTitle: 'Opens',
  overlay: true,
};

const MAX_LINES = 500; // max_lines_count
const HEAD_PADDING = -2;
const HEAD_TRANSP = 60;
const OFFSET_PADDING = 4;

/** Pine `<=` on floats: a <= b unless a - b > 1e-10 (na compares false) */
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > 1e-10);

interface Ln {
  x1: number; y1: number; x2: number; y2: number;
  color: string; style?: 'dotted'; extend?: 'left'; deleted: boolean;
}
interface Lb { x: number; y: number; text: string; textColor: string; tooltip: string }

/** State of one open: the Pine `Open` object and the `var` variables of draw() */
interface OpenState {
  tf: string;
  display: boolean;
  /** Start of the period of each chart bar (time of the higher-timeframe bar) */
  starts: number[];
  /** Open of the higher-timeframe bar of each chart bar */
  tfOpens: number[];
  discover: boolean;
  discoverExtended: boolean;
  color: string;
  lookback: number;
  barIndex: number;
  price: number;
  bodyLine: Ln | null;
  label: Lb | null;
  tailLine: Ln | null;
  bodyLines: Ln[];
  headLines: Ln[];
}

export function calculate(
  bars: Bar[],
  inputs: Partial<DailyWeeklyMonthlyYearlyOpensInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { lines: LineDrawingData[]; labels: LabelData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const mintick = mintickOf(chart);
  const chartTf = chartTimeframe(bars, chart);
  const chartSeconds = chartTf === '' ? 0 : timeframe.in_seconds(chartTf);
  const chartIntraday = chartTf !== '' && timeframe.info(chartTf).isintraday;
  const chartExtended = chart?.sessionType === 'extended';
  const ms = n > 0 && bars[0].time >= 1e12;
  const unit = ms ? 1000 : 1;

  const unitMs = ms ? 1 : 1000;
  const insideBar = (tf: string) => `Opens: a period of the timeframe "${tf}" starts inside a chart bar; the bars do not carry its opening price.`;

  // extendedSession = enableExtendedSessionInput and syminfo.session == session.extended
  const extendedSession = cfg.enableExtendedSession && chartExtended;

  const param = (title: string): string => {
    const tf = TIMEFRAMES[title];
    if (tf === undefined) throw new Error(`Unknown timeframe option "${title}"`);
    return tf;
  };
  // Bars with extended hours: the bars of the regular hours and the context of a chart of these bars
  let regularCache: { market: boolean[]; chart: ChartContext } | null = null;
  const regularHours = () => {
    if (regularCache === null) {
      const flags = sessionFlags(bars, chart);
      if (!flags || !chart || !chart.regularSession) {
        throw new Error('Opens: the regular session of the symbol (chart.regularSession) is needed on bars with extended hours.');
      }
      regularCache = { market: flags.ismarket, chart: { ...chart, sessionType: 'regular', session: chart.regularSession, regularSession: undefined } };
    }
    return regularCache;
  };
  const makeOpen = (enable: boolean, title: string, css: string, lookback: number): OpenState => {
    const tf = param(title);
    const seconds = timeframe.in_seconds(tf);
    // isVisible(): the timeframe is above the chart timeframe
    const display = enable && chartSeconds > 0 && seconds > chartSeconds;
    // higherTimeframeFeed(): daily and above
    const dailyFeed = seconds >= timeframe.in_seconds('D');
    const discoverExtended = extendedSession && dailyFeed;
    let starts: number[] = [];
    let tfOpens: number[] = [];
    if (display && discoverExtended) {
      // timeframe.change(timeframe) on the chart bars
      starts = periodStarts(bars, tf, chart);
    } else if (display) {
      // request.security(tickerId, timeframe, [time, open], lookahead = barmerge.lookahead_on)
      const security = extendedSession ? null : securityBars(bars, tf, chart);
      if (security && chartExtended && !dailyFeed) {
        // The regular-session bars of an intraday timeframe: built from the chart bars of the regular hours; a
        // bar outside these hours shows the latest of them
        const regular = regularHours();
        const kept = bars.filter((_b, i) => regular.market[i]);
        const sec = securityBars(kept, tf, regular.chart);
        if (!sec) throw new Error('Opens: the regular session of the symbol (chart.regularSession) is needed on bars with extended hours.');
        let k = -1;
        bars.forEach((_b, i) => {
          if (regular.market[i]) k++;
          starts.push(k < 0 ? NaN : sec.starts[k]);
          tfOpens.push(k < 0 ? NaN : sec.htf[sec.group[k]].open);
        });
      } else if (security) {
        starts = security.starts;
        tfOpens = security.group.map((g) => security.htf[g].open);
      } else {
        if (chartExtended && !extendedSession) {
          throw new Error('Opens: on bars with extended hours the opens of the regular session need the session of the symbol (chart.session, chart.regularSession, chart.timezone), or set "Extended Hours".');
        }
        starts = periodStarts(bars, tf, chart);
        if (chartSeconds > timeframe.in_seconds('D')) {
          // Bars above one day without the calendar of the symbol: a week or a month whose first day (UTC) falls
          // after the day of the bar before starts inside that bar
          const info = timeframe.info(tf);
          for (let i = 1; i < n; i++) {
            if (starts[i] === starts[i - 1]) continue;
            const d = new Date(Math.floor((bars[i].time * unitMs) / 86400000) * 86400000);
            const first = info.ismonthly
              ? Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / info.multiplier) * info.multiplier, 1)
              : d.getTime() - ((d.getUTCDay() + 6) % 7) * 86400000;
            if (first < d.getTime() && first > bars[i - 1].time * unitMs) throw new Error(insideBar(tf));
          }
        }
        let open = NaN;
        tfOpens = bars.map((b, i) => {
          if (i === 0 || starts[i] !== starts[i - 1]) open = b.open;
          return open;
        });
      }
    }
    return {
      tf, display, starts, tfOpens,
      discover: cfg.discoverPrices && dailyFeed && chartIntraday,
      discoverExtended,
      color: css, lookback: Math.trunc(lookback),
      barIndex: NaN, price: NaN,
      bodyLine: null, label: null, tailLine: null, bodyLines: [], headLines: [],
    };
  };
  const opens: OpenState[] = [
    makeOpen(cfg.enableOpen1, cfg.openTimeframe1, cfg.openColor1, cfg.openLookback1),
    makeOpen(cfg.enableOpen2, cfg.openTimeframe2, cfg.openColor2, cfg.openLookback2),
    makeOpen(cfg.enableOpen3, cfg.openTimeframe3, cfg.openColor3, cfg.openLookback3),
    makeOpen(cfg.enableOpen4, cfg.openTimeframe4, cfg.openColor4, cfg.openLookback4),
    makeOpen(cfg.enableOpen5, cfg.openTimeframe5, cfg.openColor5, cfg.openLookback5),
  ];

  // displayString(): the short text and its spacing
  const displayString = (tf: string): string => {
    const s = DISPLAY[tf] ?? tf;
    return s.length === 1 ? `${s}   ` : s.length === 2 ? `${s}     ` : s.length === 3 ? `${s}       ` : '';
  };

  // Lines in creation order. A creation that brings the count above max + 5 deletes the oldest until max remain;
  // a line held by a `var` variable of the script (the current line and the tail of each open) is not deleted by
  // this limit, but it counts. A deleted line ignores later changes.
  const lines: Ln[] = [];
  const held = new Set<Ln>();
  const newLine = (l: Omit<Ln, 'deleted'>): Ln => {
    const o: Ln = { ...l, deleted: false };
    lines.push(o);
    if (lines.length > MAX_LINES + 5) {
      for (let k = 0; k < lines.length && lines.length > MAX_LINES; ) {
        if (held.has(lines[k])) k++;
        else lines.splice(k, 1)[0].deleted = true;
      }
    }
    return o;
  };
  const deleteLine = (l: Ln | undefined) => {
    if (!l || l.deleted) return;
    l.deleted = true;
    lines.splice(lines.indexOf(l), 1);
  };

  // time_close of a bar: its time plus the chart timeframe, at most the time of the next bar
  const closeTime = (i: number) => Math.min(bars[i].time + chartSeconds * unit, i + 1 < n ? bars[i + 1].time : Infinity);

  const atr = ta.atr(bars, 10).toArray();
  const plots: Array<Array<{ time: number; value: number; color: string }>> = [[], [], [], [], []];

  for (let i = 0; i < n; i++) {
    const last = i === n - 1;
    const changes: boolean[] = [false, false, false, false, false];

    // update(): the open and the first bar of the period
    opens.forEach((o, k) => {
      if (!o.display) return;
      const tfTime = o.starts[i];
      const later = i > 0 && tfTime > o.starts[i - 1];
      const change = o.discoverExtended ? i > 0 && tfTime !== o.starts[i - 1]
        : o.discover ? later || (i === 0 && bars[i].time === tfTime)
        : later || i === 0;
      if (change) {
        if (o.discover || o.discoverExtended) {
          o.price = bars[i].open;
          o.barIndex = i;
        } else {
          // adjustStartBarIndex(): the period opened before the end of the bar before
          if (i > 0 && closeTime(i - 1) > tfTime) {
            throw new Error(insideBar(o.tf));
          }
          o.price = o.tfOpens[i];
          o.barIndex = i;
        }
      }
      changes[k] = change;
    });

    // padding(): opens listed before this one that are within the threshold
    const threshold = (atr[i] ?? NaN) / 2;
    const padding = (idx: number): number => {
      let count = 0;
      for (let j = 0; j < idx; j++) {
        if (opens[j].display && le(Math.abs(opens[j].price - opens[idx].price), threshold)) count++;
      }
      return count;
    };

    // draw(): from open #5 to open #1
    for (let k = 4; k >= 0; k--) {
      const o = opens[k];
      if (!o.display) continue;
      if (o.label === null) {
        o.label = { x: NaN, y: NaN, text: displayString(o.tf), textColor: o.color, tooltip: '' };
        o.tailLine = newLine({ x1: NaN, y1: NaN, x2: NaN, y2: NaN, color: o.color, style: 'dotted', extend: 'left' });
        held.add(o.tailLine);
      }
      const label = o.label;
      const tail = o.tailLine as Ln;

      if (changes[k]) {
        const x2 = i + cfg.rightOffset;
        // The line of the period before ends one bar before the new period
        const before = o.bodyLine;
        if (before && !before.deleted) before.x2 = o.barIndex - 1;

        if (cfg.enableHeads) {
          o.headLines.push(newLine({
            x1: o.barIndex - 1, x2: o.barIndex,
            y1: before && !before.deleted ? before.y1 : NaN,
            y2: before && !before.deleted ? before.y2 : NaN,
            color: String(color.new(o.color, HEAD_TRANSP)),
          }));
          if (o.headLines.length > o.lookback - 1) deleteLine(o.headLines.shift());
        }

        label.x = x2;
        label.y = o.price;
        label.tooltip = str.tostring(o.price, 'mintick', mintick);

        if (before) held.delete(before);
        o.bodyLine = newLine({ x1: o.barIndex, x2, y1: o.price, y2: o.price, color: o.color });
        held.add(o.bodyLine);
        o.bodyLines.push(o.bodyLine);
        if (o.bodyLines.length > o.lookback) deleteLine(o.bodyLines.shift());

        if (cfg.enableTails && !tail.deleted) {
          tail.x1 = o.barIndex - 1;
          tail.y1 = o.price;
          tail.x2 = o.barIndex;
          tail.y2 = o.price;
        }
      }

      if (last) {
        if (cfg.enableHeads) {
          const x2 = i + cfg.rightOffset + HEAD_PADDING * OFFSET_PADDING;
          for (const head of o.headLines) if (!head.deleted) head.x2 = x2;
        }
        const x2 = i + cfg.rightOffset + (k > 0 ? padding(k) : 0) * OFFSET_PADDING;
        if (o.bodyLine && !o.bodyLine.deleted) o.bodyLine.x2 = x2;
        label.x = x2;
      }
    }

    opens.forEach((o, k) => plots[k].push({ time: bars[i].time, value: o.price, color: o.color }));
  }

  // Objects with an na coordinate are not drawn. A tail set on the first bar starts one bar before it.
  const interval = barInterval(bars);
  const timeOf = (index: number) => (index < 0 ? bars[0].time + index * interval : index < n ? bars[index].time : barTime(bars, index, interval));
  const drawn = (v: number[]) => v.every((x) => !isNaN(x));
  const outLines: LineDrawingData[] = lines
    .filter((l) => drawn([l.x1, l.y1, l.x2, l.y2]))
    .map((l) => ({
      time1: timeOf(l.x1), price1: l.y1, time2: timeOf(l.x2), price2: l.y2, color: l.color, width: 1,
      ...(l.style ? { style: l.style } : {}),
      ...(l.extend ? { extend: l.extend } : {}),
    }));
  const outLabels: LabelData[] = [];
  for (let k = 4; k >= 0; k--) {
    const l = opens[k].label;
    if (l === null || !drawn([l.x, l.y])) continue;
    outLabels.push({ time: timeOf(l.x), price: l.y, text: l.text, style: 'none', textColor: l.textColor, size: 'small', tooltip: l.tooltip });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0: plots[0], plot1: plots[1], plot2: plots[2], plot3: plots[3], plot4: plots[4] },
    lines: outLines,
    labels: outLabels,
  };
}

export const DailyWeeklyMonthlyYearlyOpens = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
