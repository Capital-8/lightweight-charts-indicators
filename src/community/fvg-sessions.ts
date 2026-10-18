/**
 * FVG Sessions [LuxAlgo]
 *
 * The first fair value gap of each day, and the range of the day.
 * - On the first bar of a new day: a dashed vertical line, and two lines (high and low of the day so far) that follow
 *   the day range. The range lines take the colour of the gap of the day (bullish or bearish).
 * - The first gap of the day (bullish: low above the high of two bars back and previous close above that high;
 *   bearish: the mirror) is drawn as a box with a dashed line at its middle, both extended to the current bar.
 *   On the next day they end two bars before the first bar of that day.
 * - When the close goes through the far side of the gap (below the bottom of a bullish gap, above the top of a
 *   bearish gap) the gap is mitigated: a new box in the 'Mitigated' colour and a new middle line start on the
 *   previous bar and take over the extension; the first box and line stay as they were.
 *
 * Drawings are kept up to 500 lines and 500 boxes (the oldest are removed).
 *
 * Alerts (alertcondition, `alerts` of the result): new bullish / bearish gap of the day, its mitigation, the close
 * inside the gap of the day, and the close crossing the middle of the gap of the day.
 *
 * Limits of the port:
 * - New days come from the UTC calendar and the bars (see anchor-period): equal on UTC symbols and on symbols whose
 *   trading day is inside one UTC day.
 *
 * Chart values (third argument): the port reads the symbol tick (the day delimiter goes from high + tick to
 * low - tick; without it: 0.01; the line is vertical and extended both ways, so it looks the same) and the chart
 * foreground colour (delimiter and first range lines; without it: #DBDBDB, a dark chart).
 *
 * Periods and the chart context (optional third argument of calculate): with the exchange time zone and the session
 * of the symbol (`timezone`, `session`) the periods are those of the exchange calendar (its trading days, holidays
 * and session hours), see src/anchor-period.ts.
 * Without them the port uses the UTC calendar and the bars, as described in this header. `timeframe`, when given,
 * is the chart timeframe; without it the chart timeframe is read from the bar spacing.
 *
 * Reference: "FVG Sessions [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import { color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import { periodStarts } from '../anchor-period';
import type { BoxData, LineDrawingData } from '../types';
import { foregroundColorOf, mintickOf, type ChartContext } from '../chart-context';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface FvgSessionsInputs {
  /** FVG Level (bullish) */
  bullCss: string;
  /** Area (bullish) */
  bullAreaCss: string;
  /** Mitigated (bullish) */
  bullMitigatedCss: string;
  /** FVG Level (bearish) */
  bearCss: string;
  /** Area (bearish) */
  bearAreaCss: string;
  /** Mitigated (bearish) */
  bearMitigatedCss: string;
}

export const defaultInputs: FvgSessionsInputs = {
  bullCss: '#00897B',
  bullAreaCss: 'rgba(0, 137, 123, 0.5)',
  bullMitigatedCss: 'rgba(0, 137, 123, 0.2)',
  bearCss: '#FF5252',
  bearAreaCss: 'rgba(255, 82, 82, 0.5)',
  bearMitigatedCss: 'rgba(255, 82, 82, 0.2)',
};

export const inputConfig: InputConfig[] = [
  { id: 'bullCss', type: 'color', title: 'FVG Level', defval: '#00897B', inline: 'bull' },
  { id: 'bullAreaCss', type: 'color', title: 'Area', defval: 'rgba(0, 137, 123, 0.5)', inline: 'bull' },
  { id: 'bullMitigatedCss', type: 'color', title: 'Mitigated', defval: 'rgba(0, 137, 123, 0.2)', inline: 'bull' },
  { id: 'bearCss', type: 'color', title: 'FVG Level', defval: '#FF5252', inline: 'bear' },
  { id: 'bearAreaCss', type: 'color', title: 'Area', defval: 'rgba(255, 82, 82, 0.5)', inline: 'bear' },
  { id: 'bearMitigatedCss', type: 'color', title: 'Mitigated', defval: 'rgba(255, 82, 82, 0.2)', inline: 'bear' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'FVG Sessions [LuxAlgo]',
  shortTitle: 'FVG Sessions [LuxAlgo]',
  overlay: true,
};

/** max_lines_count, max_boxes_count */
const MAX_COUNT = 500;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

interface Ln {
  x1: number; y1: number; x2: number; y2: number;
  color: string; style?: 'dashed'; extend?: 'both'; dead: boolean;
}
interface Bx { left: number; top: number; right: number; bottom: number; bg: string; dead: boolean }

/** Live drawings of one kind: above max + 5 objects the oldest are deleted until max remain */
class Live<T extends { dead: boolean }> {
  readonly list: T[] = [];
  add(o: T): T {
    this.list.push(o);
    if (this.list.length > MAX_COUNT + 5) for (const old of this.list.splice(0, this.list.length - MAX_COUNT)) old.dead = true;
    return o;
  }
}

/** Pine type fvg (mitigated / isbull are na before the first gap) */
interface Fvg { top: number; btm: number; mitigated: boolean; isnew: boolean; isbull: boolean; lvl: Ln | null; area: Bx | null }

export function calculate(
  bars: Bar[],
  inputs: Partial<FvgSessionsInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { lines: LineDrawingData[]; boxes: BoxData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  // syminfo.mintick
  const mintick = mintickOf(chart);
  const chartCss = String(color.new(foregroundColorOf(chart), 50));
  const dayStarts = periodStarts(bars, 'D', chart);

  const lines = new Live<Ln>();
  const boxes = new Live<Bx>();
  const H = (i: number) => (i >= 0 ? bars[i].high : NaN);
  const L = (i: number) => (i >= 0 ? bars[i].low : NaN);
  const C = (i: number) => (i >= 0 ? bars[i].close : NaN);

  let sfvg: Fvg = { top: NaN, btm: NaN, mitigated: false, isnew: true, isbull: false, lvl: null, area: null };
  let sesr: { max: Ln; min: Ln } | null = null;
  // Alert flags (bull_isnew, bear_isnew, bull_mitigated, bear_mitigated, within bull / bear) and the state of the
  // gap of the day at the end of each bar (math.avg(sfvg.top, sfvg.btm), isbull, isnew)
  const flags: boolean[][] = Array.from({ length: 6 }, () => []);
  const gapAvg: number[] = [];
  const gapBull: boolean[] = [];
  const gapNew: boolean[] = [];

  for (let i = 0; i < n; i++) {
    const { high, low, close } = bars[i];

    // set_fvg(): a new box and a new middle line from `offset` bars back to the current bar
    const setFvg = (id: Fvg, offset: number, bgCss: string, lCss: string) => {
      const avg = (id.top + id.btm) / 2;
      id.area = boxes.add({ left: i - offset, top: id.top, right: i, bottom: id.btm, bg: bgCss, dead: false });
      id.lvl = lines.add({ x1: i - offset, y1: avg, x2: i, y2: avg, color: lCss, style: 'dashed', dead: false });
    };

    const bullFvg = gt(low, H(i - 2)) && gt(C(i - 1), H(i - 2));
    const bearFvg = lt(high, L(i - 2)) && lt(C(i - 1), L(i - 2));
    const dtf = i > 0 && dayStarts[i] !== dayStarts[i - 1];

    if (dtf) {
      // Delimiter, new range, end of the gap of the prior day
      lines.add({ x1: i, y1: high + mintick, x2: i, y2: low - mintick, color: chartCss, style: 'dashed', extend: 'both', dead: false });
      sesr = {
        max: lines.add({ x1: i, y1: high, x2: i, y2: high, color: chartCss, dead: false }),
        min: lines.add({ x1: i, y1: low, x2: i, y2: low, color: chartCss, dead: false }),
      };
      sfvg.isnew = true;
      if (sfvg.lvl !== null) {
        if (!sfvg.lvl.dead) sfvg.lvl.x2 = i - 2;
        if (sfvg.area !== null && !sfvg.area.dead) sfvg.area.right = i - 2;
      }
    } else if (sesr !== null) {
      // set_range(): math.max / math.min give na with an na argument (a deleted line)
      const max = sesr.max.dead ? NaN : Math.max(high, sesr.max.y2);
      const min = sesr.min.dead ? NaN : Math.min(low, sesr.min.y2);
      const css = sfvg.isbull ? cfg.bullCss : cfg.bearCss;
      if (!sesr.max.dead) {
        sesr.max.x2 = i;
        sesr.max.y2 = max;
        sesr.max.y1 = max;
        sesr.max.color = css;
      }
      if (!sesr.min.dead) {
        sesr.min.x2 = i;
        sesr.min.y2 = min;
        sesr.min.y1 = min;
        sesr.min.color = css;
      }
    }

    // First gap of the day
    let bullIsNew = false;
    let bearIsNew = false;
    let bullMitigated = false;
    let bearMitigated = false;
    if (bullFvg && sfvg.isnew) {
      sfvg = { top: low, btm: H(i - 2), mitigated: false, isnew: false, isbull: true, lvl: null, area: null };
      setFvg(sfvg, 2, cfg.bullAreaCss, cfg.bullCss);
      bullIsNew = true;
    } else if (bearFvg && sfvg.isnew) {
      sfvg = { top: L(i - 2), btm: high, mitigated: false, isnew: false, isbull: false, lvl: null, area: null };
      setFvg(sfvg, 2, cfg.bearAreaCss, cfg.bearCss);
      bearIsNew = true;
    }

    // Mitigation
    if (!sfvg.mitigated) {
      if (sfvg.isbull && lt(close, sfvg.btm)) {
        setFvg(sfvg, 1, cfg.bullMitigatedCss, cfg.bullCss);
        sfvg.mitigated = true;
        bullMitigated = true;
      } else if (!sfvg.isbull && gt(close, sfvg.top)) {
        setFvg(sfvg, 1, cfg.bearMitigatedCss, cfg.bearCss);
        sfvg.mitigated = true;
        bearMitigated = true;
      }
    }
    // close >= sfvg.btm and close <= sfvg.top and (not) sfvg.isbull and not sfvg.isnew
    const within = ge(close, sfvg.btm) && le(close, sfvg.top) && !sfvg.isnew;
    flags[0].push(bullIsNew);
    flags[1].push(bearIsNew);
    flags[2].push(bullMitigated);
    flags[3].push(bearMitigated);
    flags[4].push(within && sfvg.isbull);
    flags[5].push(within && !sfvg.isbull);
    gapAvg.push((sfvg.top + sfvg.btm) / 2);
    gapBull.push(sfvg.isbull);
    gapNew.push(sfvg.isnew);

    // The gap of the day follows the current bar
    if (!sfvg.isnew) {
      if (sfvg.lvl !== null && !sfvg.lvl.dead) sfvg.lvl.x2 = i;
      if (sfvg.area !== null && !sfvg.area.dead) sfvg.area.right = i;
    }
  }

  const outLines: LineDrawingData[] = lines.list.map((l) => ({
    time1: bars[l.x1].time, price1: l.y1, time2: bars[l.x2].time, price2: l.y2, color: l.color,
    ...(l.style ? { style: l.style } : {}),
    ...(l.extend ? { extend: l.extend } : {}),
  }));
  const outBoxes: BoxData[] = boxes.list.map((b) => ({
    time1: bars[b.left].time, price1: b.top, time2: bars[b.right].time, price2: b.bottom,
    borderColor: 'transparent', bgColor: b.bg,
  }));

  // ta.cross(close, math.avg(sfvg.top, sfvg.btm)) and (not) sfvg.isbull and not sfvg.isnew
  const closes = bars.map((b) => b.close);
  const over = crossedOver(closes, gapAvg);
  const under = crossedUnder(closes, gapAvg);
  const avgCross = bars.map((_b, i) => (over[i] || under[i]) && !gapNew[i]);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    lines: outLines,
    boxes: outBoxes,
    alerts: alertStates(alertConditions, bars, [
      ...flags,
      avgCross.map((c, i) => c && gapBull[i]),
      avgCross.map((c, i) => c && !gapBull[i]),
    ]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish FVG', message: 'New session bullish fvg' },
  { id: 'alert1', title: 'Bearish FVG', message: 'New session bearish fvg' },
  { id: 'alert2', title: 'Mitigated Bullish FVG', message: 'Session bullish fvg has been mitigated' },
  { id: 'alert3', title: 'Mitigated Bearish FVG', message: 'Session bearish fvg has been mitigated' },
  { id: 'alert4', title: 'Price Within Bullish FVG', message: 'Price is within bullish fvg' },
  { id: 'alert5', title: 'Price Within Bearish FVG', message: 'Price is within bearish fvg' },
  { id: 'alert6', title: 'Bullish FVG AVG Cross', message: 'Price crossed bullish fvg average' },
  { id: 'alert7', title: 'Bearish FVG AVG Cross', message: 'Price crossed bearish fvg average' },
];

export const FvgSessions = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
