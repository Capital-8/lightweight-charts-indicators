/**
 * Trend Line Auto
 *
 * Auto-draws trend lines between fractal highs / lows, as the original: a top (bottom) fractal is the high (low)
 * `mid` = int(term / 2) + 1 bars back when it is the highest high (lowest low) of the last `term` bars. On each bar
 * with a fractal, among the earlier fractals of the last `segment` bars, the one giving the smallest angle
 * atan(slope per bar) / (355 / 113) * 180 (bottom lines: the smallest negated angle) is joined to it by a line from
 * fractal bar to fractal bar ('Ray Style' extension, 'Color Top Line' / 'Color Bottom Line'); lines are only drawn on
 * the bars whose time is within `limit` chart intervals of the current time (timenow - limit * interval), and the
 * 50 newest lines are kept (the default line limit). On the last bar each line of the last `limit` bars is deleted
 * when its price on the last bar is more than 2 x (highest - lowest of `term` bars) away from the close or when it
 * spans fewer than `term` bars, and made dotted when more than 1 x away.
 *
 * Alert (alertcondition, `alerts` of the result): 'HarryBot Alert', the close crossing the top or the bottom "defense
 * line". The original reads the line levels on the last bar only (care() returns na on the other bars), so the
 * condition can only be true on the last bar: the level is the price on the last bar of the oldest top (bottom) line
 * of the last `limit` bars (0 without one), read before the far / short lines are removed, as the original does.
 *
 * Chart values read: the chart timeframe (`timeframe` of the chart context, else from the bar spacing) and the
 * current time (`now` of the chart context, else the clock).
 *
 * Reference: "Trend Line - HarryBot" by HarryBot
 */

import { ta, Series, timeframe, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { LineDrawingData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';
import { chartTimeframe } from '../anchor-period';
import { nowOf, type ChartContext } from '../chart-context';

export interface TrendLineAutoInputs {
  limit: number;
  segment: number;
  term: number;
  /** Ray Style */
  ray: 'none' | 'both' | 'left' | 'right';
  /** Color Top Line */
  colora: string;
  /** Color Bottom Line */
  colorb: string;
}

export const defaultInputs: TrendLineAutoInputs = {
  limit: 100,
  segment: 55,
  term: 15,
  ray: 'right',
  colora: '#00FF00',
  colorb: '#FFFF00',
};

export const inputConfig: InputConfig[] = [
  { id: 'limit', type: 'int', title: 'Bars Limit', defval: 100, min: 10, max: 500, step: 2 },
  { id: 'segment', type: 'int', title: 'Segment Range', defval: 55, min: 1, max: 200, step: 1 },
  { id: 'term', type: 'int', title: 'Fractals Period', defval: 15, min: 3, max: 999, step: 2 },
  { id: 'ray', type: 'string', title: 'Ray Style', defval: 'right', options: ['none', 'both', 'left', 'right'] },
  { id: 'colora', type: 'color', title: 'Color Top Line', defval: '#00FF00' },
  { id: 'colorb', type: 'color', title: 'Color Bottom Line', defval: '#FFFF00' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Anchor', color: 'transparent', lineWidth: 0, display: 'none' },
];

export const metadata = {
  title: 'Trend Line Auto',
  shortTitle: 'TrendLine',
  overlay: true,
};

/** Lines kept by default (max_lines_count): the oldest are removed past it */
const MAX_LINES = 50;

interface TrendLine { x1: number; y1: number; x2: number; y2: number; up: boolean; dotted: boolean; deleted: boolean }

/** var ratio: seconds of the chart interval (weekly 7 days, monthly 30.5 days, whatever the multiplier) */
function ratioOf(tf: string): number {
  if (!tf) return NaN;
  const info = timeframe.info(tf);
  if (info.isseconds) return info.multiplier;
  if (info.isminutes) return info.multiplier * 60;
  if (info.isdaily) return info.multiplier * 86400;
  if (info.isweekly) return 86400 * 7;
  return 86400 * 30.5;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<TrendLineAutoInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { lines: LineDrawingData[] } & { alerts: AlertConditionState[] } {
  const { limit, segment, term, ray, colora, colorb } = { ...defaultInputs, ...inputs };
  const n = bars.length;
  // var mid = int(term / 2) + 1
  const mid = Math.trunc(term / 2) + 1;

  const highestArr = ta.highest(new Series(bars, (b) => b.high), term).toArray().map((v) => v ?? NaN);
  const lowestArr = ta.lowest(new Series(bars, (b) => b.low), term).toArray().map((v) => v ?? NaN);

  const closePlot = bars.map((b) => ({ time: b.time, value: NaN }));

  // [idx_up, frac_up] = if ta.highest(term) == high[mid] [bar_index[mid], high[mid]] (na otherwise); same for lows
  const fracUp: number[] = new Array(n).fill(NaN);
  const fracDn: number[] = new Array(n).fill(NaN);
  for (let i = mid; i < n; i++) {
    if (highestArr[i] === bars[i - mid].high) fracUp[i] = bars[i - mid].high;
    if (lowestArr[i] === bars[i - mid].low) fracDn[i] = bars[i - mid].low;
  }

  // if time > timenow - (limit * ratio * 1000)
  const ms = n > 0 && bars[0].time >= 1e12;
  const ratio = ratioOf(chartTimeframe(bars, chart));
  const since = nowOf(chart) - limit * ratio * 1000;

  // cal(x1, y1, x2, y2) = math.atan((y2 - y1) / (x2 - x1)) / (355 / 113) * 180 (x2 == x1: 0 / 0 is na)
  const cal = (x1: number, y1: number, x2: number, y2: number) => (Math.atan((y2 - y1) / (x2 - x1)) / (355 / 113)) * 180;

  const created: TrendLine[] = [];
  /** up_lin / dn_lin: the line created on each bar (null: na) */
  const upLin: (TrendLine | null)[] = new Array(n).fill(null);
  const dnLin: (TrendLine | null)[] = new Array(n).fill(null);
  const draw = (dat: number[], i: number, up: boolean): TrendLine | null => {
    const t = ms ? bars[i].time : bars[i].time * 1000;
    if (!(t > since)) return null;
    let maxv = 90.0;
    let maxk = 0;
    for (let k = 0; k <= segment - 1; k++) {
      if (i - k < 0 || Number.isNaN(dat[i - k])) continue;
      let ang = cal(i - k, dat[i - k], i, dat[i]);
      ang = up ? ang : -ang;
      if (ang < maxv) {
        maxk = k;
        maxv = ang;
      }
    }
    if (!(maxk > 0)) return null;
    // line.new(bar_index[maxk] - mid, dat[maxk], bar_index - mid, dat, ...)
    const line: TrendLine = { x1: i - maxk - mid, y1: dat[i - maxk], x2: i - mid, y2: dat[i], up, dotted: false, deleted: false };
    created.push(line);
    // past the line limit the oldest line is removed
    if (created.filter((l) => !l.deleted).length > MAX_LINES) {
      const oldest = created.find((l) => !l.deleted);
      if (oldest) oldest.deleted = true;
    }
    return line;
  };
  for (let i = 0; i < n; i++) {
    upLin[i] = draw(fracUp, i, true);
    dnLin[i] = draw(fracDn, i, false);
  }

  // care(lin) on the last bar: for the lines of the last `limit` bars (newest first), ref = price on last_bar_index,
  // gap = |close - ref| / chg; delete when gap > 2 or |x1 - x2| < term, dotted when gap > 1; returns the last ref
  // (the oldest line's, 0.0 without a line)
  const priceAt = (l: TrendLine, x: number) => (l.deleted ? NaN : l.y1 + ((l.y2 - l.y1) * (x - l.x1)) / (l.x2 - l.x1));
  const care = (lin: (TrendLine | null)[]): number => {
    const last = n - 1;
    const cls = bars[last].close;
    const chg = highestArr[last] - lowestArr[last];
    let ref = 0.0;
    for (let k = 0; k <= limit - 1 && last - k >= 0; k++) {
      const l = lin[last - k];
      if (!l) continue;
      ref = priceAt(l, last);
      const gap = Math.abs(cls - ref) / chg;
      if (gap > 2 || Math.abs(l.x1 - l.x2) < term) l.deleted = true;
      if (gap > 1) l.dotted = true;
    }
    return ref;
  };

  const alertFlags = new Array<boolean>(n).fill(false);
  if (n > 0) {
    const upLim = care(upLin);
    const dnLim = care(dnLin);
    if (n > 1) {
      const c = bars[n - 1].close;
      const c1 = bars[n - 2].close;
      // (close[1] < up_lim and close > up_lim) or (close[1] > dn_lim and close < dn_lim)
      //   or (close[1] > up_lim and close < up_lim) or (close[1] < dn_lim and close > dn_lim)
      alertFlags[n - 1] = (c1 < upLim && c > upLim) || (c1 > dnLim && c < dnLim)
        || (c1 > upLim && c < upLim) || (c1 < dnLim && c > dnLim);
    }
  }

  // bar index -> time (a point before the first bar is drawn at the first bar)
  const timeAt = (x: number) => bars[Math.max(0, Math.min(n - 1, x))].time;
  const lines: LineDrawingData[] = created.filter((l) => !l.deleted).map((l) => ({
    time1: timeAt(l.x1),
    price1: l.y1,
    time2: timeAt(l.x2),
    price2: l.y2,
    color: l.up ? colora : colorb,
    width: 1,
    style: l.dotted ? 'dotted' : 'solid',
    extend: ray,
  }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { 'plot0': closePlot },
    lines,
    alerts: alertStates(alertConditions, bars, [alertFlags]),
  };
}

/** The original's alertcondition */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'HarryBot Alert', message: 'Defense line is being crossed' },
];

export const TrendLineAuto = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
