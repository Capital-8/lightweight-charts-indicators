/**
 * Support Resistance MTF
 *
 * Two pairs of levels:
 * - chart levels: the latest bar that made the highest high (lowest low) of the last "Period" bars gives the
 *   resistance (support) of the chart timeframe;
 * - higher timeframe levels: the running high (low) of the current period of the higher timeframe, when it is above
 *   (below) the running value at the end of each of the "Period" - 1 periods before, gives the resistance (support)
 *   of the higher timeframe.
 * Each level is drawn only while it does not change, and the area between the two resistances (and between the two
 * supports) is filled. "Extend Lines" adds four lines at the levels of the last bar, extended to the left.
 *
 * The "Auto" higher timeframe depends on the chart timeframe: 1 and 3 minutes use 15 minutes; 5 and 15 minutes use
 * 60; 30 and 45 use 120; 60 uses 240; 120, 180 and 240 use the day; the day uses the week; the week uses the month;
 * any other chart timeframe uses 12 months.
 *
 * Chart values (third argument): the chart timeframe (`chart.timeframe`; without it, it is taken from the bars) and
 * the exchange calendar for the periods of the higher timeframe (without it: the UTC calendar and the bars, see
 * src/anchor-period.ts).
 *
 * Reference: "Support Resistance MTF" by LonesomeTheBlue
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LonesomeTheBlue
 */

import { ta, Series, color, timeframe, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import { periodStarts, chartTimeframe } from '../anchor-period';
import type { ChartContext } from '../chart-context';
import type { LineDrawingData } from '../types';

export interface SupportResistanceMtfInputs {
  src: 'High/Low' | 'Close/Open';
  /** Higher timeframe: 'Auto' or a timeframe */
  timeframeU: 'Auto' | '15' | '30' | '60' | '120' | '180' | '240' | '720' | 'D' | 'W' | '2W' | 'M' | '3M' | '6M' | '12M';
  /** Period for the highest / lowest bars */
  prd: number;
  resistanceCol: string;
  supportCol: string;
  /** Transparency of the zones (0 to 100) */
  transp: number;
  extendLines: boolean;
}

export const defaultInputs: SupportResistanceMtfInputs = {
  src: 'High/Low',
  timeframeU: 'Auto',
  prd: 10,
  resistanceCol: '#FF5252',
  supportCol: '#00E676',
  transp: 80,
  extendLines: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'src', type: 'string', title: 'Source', defval: 'High/Low', options: ['High/Low', 'Close/Open'] },
  {
    id: 'timeframeU', type: 'string', title: 'Higher Time Frame', defval: 'Auto',
    options: ['Auto', '15', '30', '60', '120', '180', '240', '720', 'D', 'W', '2W', 'M', '3M', '6M', '12M'],
  },
  { id: 'prd', type: 'int', title: 'Period for Highest/Lowest Bars', defval: 10, min: 1 },
  { id: 'resistanceCol', type: 'color', title: 'Resistance Color', defval: '#FF5252' },
  { id: 'supportCol', type: 'color', title: 'Support Color', defval: '#00E676' },
  { id: 'transp', type: 'int', title: 'Transparency for Zones', defval: 80, min: 0, max: 100 },
  { id: 'extendLines', type: 'bool', title: 'Extend Lines', defval: false },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Resistance', color: '#2196F3', lineWidth: 1 },
  { id: 'plot1', title: 'Support', color: '#2196F3', lineWidth: 1 },
  { id: 'plot2', title: 'Higher Timeframe Resistance', color: '#2196F3', lineWidth: 1 },
  { id: 'plot3', title: 'Higher Timeframe Support', color: '#2196F3', lineWidth: 1 },
];

export const metadata = {
  title: 'Support Resistance MTF',
  shortTitle: 'Support Resistance MTF',
  overlay: true,
};

/** Pine float comparisons: a == b within 1e-10, a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);

/** The "Auto" timeframe of a chart timeframe (timeframe.period: "15", "60", "D", "W" ...) */
function autoTimeframe(period: string): string {
  switch (period) {
    case '1': case '3': return '15';
    case '5': case '15': return '60';
    case '30': case '45': return '120';
    case '60': return '240';
    case '120': case '180': case '240': return 'D';
    case 'D': return 'W';
    case 'W': return 'M';
    default: return '12M';
  }
}

export function calculate(
  bars: Bar[],
  inputs: Partial<SupportResistanceMtfInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'lines'> & { lines: LineDrawingData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const prd = Math.trunc(cfg.prd);
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);

  // timeframe.period: "D" / "W" / "M" without the multiplier 1
  const period = chartTimeframe(bars, chart).replace(/^1(?=[DWM]$)/, '');
  const tf = cfg.timeframeU === 'Auto' ? autoTimeframe(period) : cfg.timeframeU;
  if (!timeframe.info(tf).period) throw new RangeError(`Unsupported timeframe "${tf}"`);

  const highLow = cfg.src === 'High/Low';
  const srch = bars.map((b) => (highLow ? b.high : Math.max(b.close, b.open)));
  const srcl = bars.map((b) => (highLow ? b.low : Math.min(b.close, b.open)));
  const hbars = A(ta.highestbars(Series.fromArray(bars, srch), prd));
  const lbars = A(ta.lowestbars(Series.fromArray(bars, srcl), prd));

  // newbar = change(time(Timeframe)) != 0: na on the first bar
  const starts = periodStarts(bars, tf, chart);

  const hc: number[] = new Array(n);
  const lc: number[] = new Array(n);
  const htfh: number[] = new Array(n);
  const htfl: number[] = new Array(n);
  const hh: number[] = new Array(n);
  const ll: number[] = new Array(n);
  const newbar: boolean[] = new Array(n);

  /**
   * highestbar() / lowestbar() of the original: counts the period starts back from bar i for which the running
   * value of the bar before the start is below (above) the current value; true when `len` values are reached.
   */
  const extreme = (i: number, values: number[], len: number, breaks: (now: number, before: number) => boolean) => {
    let count = 1;
    if (len > 1) {
      for (let x = 0; x <= 4000; x++) {
        // na(newbar[x]) or na(close[x + 1])
        if (i - x - 1 < 0) break;
        if (newbar[i - x]) {
          if (breaks(values[i], values[i - x - 1])) break;
          count++;
          if (count >= len) break;
        }
      }
    }
    return count >= len;
  };

  for (let i = 0; i < n; i++) {
    hc[i] = hbars[i] === 0 ? srch[i] : i > 0 ? hc[i - 1] : NaN;
    lc[i] = lbars[i] === 0 ? srcl[i] : i > 0 ? lc[i - 1] : NaN;

    newbar[i] = i > 0 && starts[i] !== starts[i - 1];
    if (newbar[i]) {
      htfh[i] = srch[i];
      htfl[i] = srcl[i];
    } else {
      // max() / min() with an na value give na: the levels start on the first new period
      const ph = i > 0 ? htfh[i - 1] : NaN;
      const pl = i > 0 ? htfl[i - 1] : NaN;
      htfh[i] = isNaN(ph) ? NaN : Math.max(ph, srch[i]);
      htfl[i] = isNaN(pl) ? NaN : Math.min(pl, srcl[i]);
    }

    const hbar = extreme(i, htfh, prd, le);
    const lbar = extreme(i, htfl, prd, ge);
    hh[i] = hbar ? htfh[i] : i > 0 ? hh[i - 1] : 0;
    ll[i] = lbar ? htfl[i] : i > 0 ? ll[i - 1] : 0;
  }

  const same = (v: number[], i: number) => i > 0 && eq(v[i], v[i - 1]);
  const plotOf = (v: number[], css: string) => bars.map((b, i) => ({
    time: b.time, value: v[i], color: same(v, i) ? css : 'transparent',
  }));
  const resFill = String(color.new(cfg.resistanceCol, cfg.transp));
  const supFill = String(color.new(cfg.supportCol, cfg.transp));

  const lines: LineDrawingData[] = [];
  if (cfg.extendLines && n > 1) {
    // The four lines are deleted and drawn again on every bar: those of the last bar remain
    const last = n - 1;
    const level = (price: number, css: string) => {
      if (!isNaN(price)) {
        lines.push({ time1: bars[last].time, price1: price, time2: bars[last - 1].time, price2: price, color: css, extend: 'left' });
      }
    };
    level(lc[last], cfg.supportCol);
    level(ll[last], cfg.supportCol);
    level(hc[last], cfg.resistanceCol);
    level(hh[last], cfg.resistanceCol);
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: plotOf(hc, cfg.resistanceCol),
      plot1: plotOf(lc, cfg.supportCol),
      plot2: plotOf(hh, cfg.resistanceCol),
      plot3: plotOf(ll, cfg.supportCol),
    },
    fills: [
      { plot1: 'plot2', plot2: 'plot0', colors: bars.map((_b, i) => (same(hc, i) && same(hh, i) ? resFill : 'transparent')) },
      { plot1: 'plot3', plot2: 'plot1', colors: bars.map((_b, i) => (same(lc, i) && same(ll, i) ? supFill : 'transparent')) },
    ],
    lines,
  };
}

export const SupportResistanceMtf = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
