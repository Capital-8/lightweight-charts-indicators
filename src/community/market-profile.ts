/**
 * Market Profile (TPO)
 *
 * On the first bar of each period of the higher timeframe, the profile of the period that just ended is drawn to
 * the right of that bar. The range of the ended period is cut into 20 channels; the size of a channel is the number
 * of bars of the period that touch it (the first bar of the period is not counted, as in the original). The channel
 * with the most bars is the point of control (POC); the value area grows from it, towards the larger neighbour
 * channel, until it holds "Percent for Value Area %" of the counts. The profile is drawn as a stepped outline of
 * lines (value area and other channels in two colours), with a POC line that runs until the next profile (the last
 * one is extended to the right).
 *
 * "Auto" takes the higher timeframe from the chart timeframe.
 * The periods come from the UTC calendar and the bars (see anchor-period.ts): exact on symbols that trade every day
 * in UTC and on symbols whose trading day is inside the UTC day.
 * The 3 alerts of the original (price in / above / below the POC) are not part of the port.
 *
 * Periods and the chart context (optional third argument of calculate): with the exchange time zone and the session
 * of the symbol (`timezone`, `session`) the periods are those of the exchange calendar (its trading days, holidays
 * and session hours), see src/anchor-period.ts.
 * Without them the port uses the UTC calendar and the bars, as described in this header. `timeframe`, when given,
 * is the chart timeframe; without it the chart timeframe is read from the bar spacing.
 *
 * Reference: "Market Profile" by LonesomeTheBlue
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LonesomeTheBlue
 */

import { compare, math, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { LineDrawingData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { chartTimeframe, periodStarts } from '../anchor-period';
import type { ChartContext } from '../chart-context';

type ShowWhat = "Don't Show Value Area" | 'Show Value Area High' | 'Show All Channels';

export interface MarketProfileInputs {
  /** Higher Time Frame */
  timeframe: string;
  /** Percent for Value Area % */
  percent: number;
  showPocLine: boolean;
  keepOldMp: boolean;
  showWhat: ShowWhat;
  lineWidth: number;
  /** Sizing Rate % */
  sizingRate: number;
  pocColor: string;
  vahColor: string;
  nonVaColor: string;
}

export const defaultInputs: MarketProfileInputs = {
  timeframe: 'Auto',
  percent: 70,
  showPocLine: true,
  keepOldMp: true,
  showWhat: 'Show All Channels',
  lineWidth: 2,
  sizingRate: 100,
  pocColor: '#FFEB3B',
  vahColor: '#2196F3',
  nonVaColor: '#787B86',
};

export const inputConfig: InputConfig[] = [
  {
    id: 'timeframe', type: 'string', title: 'Higher Time Frame', defval: 'Auto',
    options: ['Auto', '1', '5', '10', '15', '30', '60', '120', '180', '240', '360', '480', '720', 'D', 'W', '2W', 'M', '3M', '6M', '12M'],
  },
  { id: 'percent', type: 'float', title: 'Percent for Value Area %', defval: 70, min: 1, max: 100 },
  { id: 'showPocLine', type: 'bool', title: 'Show POC Line', defval: true },
  { id: 'keepOldMp', type: 'bool', title: 'Keep Old MPs', defval: true },
  {
    id: 'showWhat', type: 'string', title: 'Show', defval: 'Show All Channels',
    options: ["Don't Show Value Area", 'Show Value Area High', 'Show All Channels'],
  },
  { id: 'lineWidth', type: 'int', title: 'Line Width', defval: 2, min: 1, max: 4 },
  { id: 'sizingRate', type: 'float', title: 'Sizing Rate %', defval: 100, min: 10, max: 500 },
  { id: 'pocColor', type: 'color', title: 'POC Line Color', defval: '#FFEB3B' },
  { id: 'vahColor', type: 'color', title: 'Value Area Color', defval: '#2196F3' },
  { id: 'nonVaColor', type: 'color', title: 'Non-Value Area Color', defval: '#787B86' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Market Profile',
  shortTitle: 'MP/TPO',
  overlay: true,
};

/** study(max_lines_count = 500) */
const MAX_LINES = 500;

/** A line with bar indexes */
interface LineObj {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  extend: 'none' | 'right';
  deleted: boolean;
}

/** Pine `for i = a to b`: counts down when a > b */
function pineRange(a: number, b: number): number[] {
  const out: number[] = [];
  if (a <= b) for (let i = a; i <= b; i++) out.push(i);
  else for (let i = a; i >= b; i--) out.push(i);
  return out;
}

/** The higher timeframe of "Auto", from the chart timeframe (timeframe.period) */
function autoTimeframe(period: string): string {
  switch (period) {
    case '1': return '120';
    case '2': return '180';
    case '3': return '240';
    case '5': return 'D';
    case '10': case '15': case '30': case '45': case '60': return 'W';
    case '120': case '180': case '240': return 'M';
    case 'D': case 'W': return '12M';
    default: return 'D';
  }
}

export function calculate(
  bars: Bar[],
  inputs: Partial<MarketProfileInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { lines: LineDrawingData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const percent = cfg.percent / 100;
  const srate = cfg.sizingRate / 100;
  const n = bars.length;

  // timeframe.period: "D" / "W" / "M" without the multiplier 1
  const period = chartTimeframe(bars, chart).replace(/^1([DWM])$/, '$1');
  const tf = cfg.timeframe === 'Auto' ? autoTimeframe(period) : cfg.timeframe;
  const starts = n > 0 ? periodStarts(bars, tf, chart) : [];

  // Live lines in creation order: above max + 5 lines the oldest are deleted until max remain
  let live: LineObj[] = [];
  const newLine = (x1: number, y1: number, x2: number, y2: number, color: string, extend: 'none' | 'right' = 'none') => {
    const l: LineObj = { x1, y1, x2, y2, color, extend, deleted: false };
    live.push(l);
    if (live.length > MAX_LINES + 5) {
      for (const old of live.splice(0, live.length - MAX_LINES)) old.deleted = true;
    }
    return l;
  };

  const H = (i: number) => (i >= 0 ? bars[i].high : NaN);
  const L = (i: number) => (i >= 0 ? bars[i].low : NaN);
  // math.max / math.min: na with an na argument
  const pmax = (a: number, b: number) => (Number.isNaN(a) || Number.isNaN(b) ? NaN : Math.max(a, b));
  const pmin = (a: number, b: number) => (Number.isNaN(a) || Number.isNaN(b) ? NaN : Math.min(a, b));
  const included = (t1: number, t2: number, t3: number, t4: number) =>
    (compare.ge(t3, t1) && compare.le(t3, t2)) || (compare.ge(t4, t1) && compare.le(t4, t2))
    || (compare.le(t3, t1) && compare.ge(t4, t2));

  let highestHtf = NaN;
  let lowestHtf = NaN;
  let highest = n > 0 ? bars[0].high : NaN;
  let lowest = n > 0 ? bars[0].low : NaN;
  let barnum = 0;
  let len = 0;
  let allLines: LineObj[] = [];

  for (let i = 0; i < n; i++) {
    const bar = bars[i];
    // newbar = change(time(Timeframe)) != 0 (na on the first bar: false)
    const newbar = i > 0 && starts[i] !== starts[i - 1];
    const prevHighestHtf = highestHtf;
    const prevLowestHtf = lowestHtf;
    const prevBarnum = barnum;
    if (newbar) {
      highestHtf = bar.high;
      lowestHtf = bar.low;
      barnum = 0;
    } else {
      highestHtf = pmax(highestHtf, bar.high);
      lowestHtf = pmin(lowestHtf, bar.low);
      barnum += 1;
    }
    if (!newbar) continue;

    highest = prevHighestHtf;
    lowest = prevLowestHtf;
    len = prevBarnum;
    const channel = (highest - lowest) / 20;
    const base = (x: number) => lowest + (x - 1) * channel;

    // Number of bars of the ended period in each channel
    const ch: number[] = new Array(22).fill(0);
    for (let x = 1; x <= 20; x++) {
      const lower = lowest + (x - 1) * channel;
      const upper = lowest + x * channel;
      let ret = 0;
      for (const k of pineRange(1, len)) if (included(lower, upper, L(i - k), H(i - k))) ret += 1;
      ch[x] = ret;
    }

    // Point of control: the highest channel with the largest count
    let total = 0;
    let pocLoc = 0;
    let pocVal = 0;
    for (let x = 1; x <= 20; x++) {
      total += ch[x];
      if (ch[x] >= pocVal) {
        pocVal = ch[x];
        pocLoc = x;
      }
    }

    // Value area
    let vaVal = pocVal;
    let vahind = pocLoc;
    let valind = pocLoc;
    for (let x = 1; x <= 20; x++) {
      if (compare.ge(vaVal, total * percent)) break;
      const upval = ch[vahind + 1];
      const downval = ch[valind - 1];
      const chval = Math.max(upval, downval);
      if (chval === 0) break;
      if (upval >= downval) vahind += 1;
      else valind -= 1;
      vaVal += chval;
    }

    if (cfg.keepOldMp && allLines.length > 0) {
      const lastLine = allLines[allLines.length - 1];
      if (!lastLine.deleted) {
        lastLine.x2 = i - 1;
        lastLine.extend = 'none';
      }
      allLines = [];
    }
    if (!cfg.keepOldMp) {
      for (const l of allLines) l.deleted = true;
      live = live.filter((l) => !l.deleted);
      allLines = [];
    }

    const lineColor = (isVa: boolean) => (isVa ? cfg.vahColor : cfg.nonVaColor);
    const inVa = (x: number) => x >= valind && x <= vahind;
    // draw_mp: a horizontal line; draw_mpd: a vertical line at the end of the channel
    const drawMp = (y: number, chval: number, isVa: boolean) =>
      newLine(i, y, i + math.round(srate * chval), y, lineColor(isVa));
    const drawMpd = (y1: number, y2: number, chval: number, isVa: boolean) => {
      const x = i + math.round(srate * chval);
      return newLine(x, y1, x, y2, lineColor(isVa));
    };

    if (cfg.showWhat === 'Show Value Area High' || cfg.showWhat === 'Show All Channels') {
      const str = cfg.showWhat === 'Show All Channels' ? 1 : valind;
      const end = cfg.showWhat === 'Show All Channels' ? 20 : vahind;
      for (const x of pineRange(str, end)) {
        let isVa = inVa(x);
        const lwdhm = Math.trunc(ch[x]);
        let lwdh = lwdhm;
        if (x > str) {
          const mytmp = Math.trunc(ch[x - 1]);
          if (mytmp > lwdh) {
            lwdh = mytmp;
            isVa = inVa(x - 1);
          }
        }
        allLines.push(drawMp(base(x), lwdh, isVa));
        allLines.push(drawMpd(base(x), base(x + 1), lwdhm, inVa(x)));
      }
      allLines.push(drawMp(base(end + 1), Math.trunc(ch[end]), inVa(end)));
    }

    if (cfg.showPocLine) {
      const midpoc = (lowest + (pocLoc - 1) * channel + lowest + pocLoc * channel) / 2;
      allLines.push(newLine(i, midpoc, i + 1, midpoc, cfg.pocColor, 'right'));
    }
  }

  // Outputs: bar indexes to bar times (a line with an na price is not drawn)
  const interval = barInterval(bars);
  const time = (x: number) => barTime(bars, x, interval);
  const lines: LineDrawingData[] = live
    .filter((l) => !Number.isNaN(l.y1) && !Number.isNaN(l.y2) && !Number.isNaN(l.x1) && !Number.isNaN(l.x2))
    .map((l) => ({
      time1: time(l.x1), price1: l.y1, time2: time(l.x2), price2: l.y2, color: l.color, width: cfg.lineWidth,
      ...(l.extend === 'right' ? { extend: 'right' as const } : {}),
    }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    lines,
  };
}

export const MarketProfile = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
