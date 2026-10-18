/**
 * Trend Line Auto
 *
 * Auto-draws trend lines based on fractal highs/lows detected via highest/lowest
 * over a period. Uses angle calculation to find the best-fit trend line connecting
 * the most recent fractal to a prior fractal within a segment range.
 * Lines are colored green (top/upper) and red/yellow (bottom/lower).
 *
 * Alert (alertcondition, `alerts` of the result): 'HarryBot Alert', the close crossing the top or the bottom "defense
 * line". The original reads the line levels on the last bar only (care() returns na on the other bars), so the
 * condition can only be true on the last bar: the level is the price on the last bar of the oldest top (bottom) line
 * the port draws in the last `limit` bars, read before the far / short lines are removed, as the original does.
 *
 * Reference: "Trend Line - HarryBot" by HarryBot
 */

import { ta, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { LineDrawingData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface TrendLineAutoInputs {
  limit: number;
  segment: number;
  term: number;
}

export const defaultInputs: TrendLineAutoInputs = {
  limit: 100,
  segment: 55,
  term: 15,
};

export const inputConfig: InputConfig[] = [
  { id: 'limit', type: 'int', title: 'Bars Limit', defval: 100, min: 10, step: 2 },
  { id: 'segment', type: 'int', title: 'Segment Range', defval: 55, min: 1 },
  { id: 'term', type: 'int', title: 'Fractals Period', defval: 15, min: 3, step: 2 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Anchor', color: 'transparent', lineWidth: 0, display: 'none' },
];

export const metadata = {
  title: 'Trend Line Auto',
  shortTitle: 'TrendLine',
  overlay: true,
};

export function calculate(bars: Bar[], inputs: Partial<TrendLineAutoInputs> = {}): Omit<IndicatorResult, 'markers'> & { lines: LineDrawingData[] } & { alerts: AlertConditionState[] } {
  const { limit, segment, term } = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const mid = Math.floor(term / 2) + 1;

  const highSeries = new Series(bars, (b) => b.high);
  const lowSeries = new Series(bars, (b) => b.low);
  const highestArr = ta.highest(highSeries, term).toArray();
  const lowestArr = ta.lowest(lowSeries, term).toArray();

  const closePlot = bars.map((b) => ({ time: b.time, value: NaN }));
  const lines: LineDrawingData[] = [];
  /** Bar indexes of the first top / bottom line the port draws (the oldest one), for the alert level */
  let firstUp: { x1: number; y1: number; x2: number; y2: number } | null = null;
  let firstDn: { x1: number; y1: number; x2: number; y2: number } | null = null;

  // Angle calculation: atan((y2-y1)/(x2-x1)) * 180/PI
  function calcAngle(x1: number, y1: number, x2: number, y2: number): number {
    return Math.atan((y2 - y1) / (x2 - x1)) / Math.PI * 180;
  }

  // Detect fractals: up fractal when highest(term) == high[mid], down when lowest(term) == low[mid]
  // Store fractal data: { barIndex, value }
  const fracUps: { idx: number; value: number }[] = [];
  const fracDns: { idx: number; value: number }[] = [];

  for (let i = term - 1; i < n; i++) {
    const hh = highestArr[i];
    const ll = lowestArr[i];
    if (!isNaN(hh) && bars[i - mid + 1] && hh === bars[i - mid + 1].high) {
      fracUps.push({ idx: i - mid + 1, value: bars[i - mid + 1].high });
    }
    if (!isNaN(ll) && bars[i - mid + 1] && ll === bars[i - mid + 1].low) {
      fracDns.push({ idx: i - mid + 1, value: bars[i - mid + 1].low });
    }
  }

  // Only process lines within the last 'limit' bars
  const limitStart = Math.max(0, n - limit);

  // For upper trend lines: find best angle from recent fractal up to segment prior fractal ups
  // Pine draw() function: for the most recent fractal, look back through segment previous fractals
  // and find the one that gives the minimum angle (flattest line connecting two fractals)

  // Process upper fractals (green lines)
  const recentFracUps = fracUps.filter(f => f.idx >= limitStart);
  for (const current of recentFracUps) {
    let minAngle = 90.0;
    let bestIdx = -1;

    // Look through prior fractals within segment range
    for (const prior of fracUps) {
      if (prior.idx >= current.idx) continue;
      if (current.idx - prior.idx > segment * 2) continue; // too far
      const ang = calcAngle(prior.idx, prior.value, current.idx, current.value);
      // For up (top) lines: use positive angle, find minimum
      if (ang < minAngle) {
        minAngle = ang;
        bestIdx = fracUps.indexOf(prior);
      }
    }

    if (bestIdx >= 0) {
      const prior = fracUps[bestIdx];
      firstUp ??= { x1: prior.idx, y1: prior.value, x2: current.idx, y2: current.value };
      lines.push({
        time1: bars[prior.idx].time,
        price1: prior.value,
        time2: bars[current.idx].time,
        price2: current.value,
        color: '#00FF00', // lime/green for top line
        width: 1,
        style: 'solid',
        extend: 'right',
      });
    }
  }

  // Process lower fractals (yellow/red lines)
  const recentFracDns = fracDns.filter(f => f.idx >= limitStart);
  for (const current of recentFracDns) {
    let minAngle = 90.0;
    let bestIdx = -1;

    for (const prior of fracDns) {
      if (prior.idx >= current.idx) continue;
      if (current.idx - prior.idx > segment * 2) continue;
      const ang = calcAngle(prior.idx, prior.value, current.idx, current.value);
      // For down (bottom) lines: negate angle, find minimum
      const negAng = -ang;
      if (negAng < minAngle) {
        minAngle = negAng;
        bestIdx = fracDns.indexOf(prior);
      }
    }

    if (bestIdx >= 0) {
      const prior = fracDns[bestIdx];
      firstDn ??= { x1: prior.idx, y1: prior.value, x2: current.idx, y2: current.value };
      lines.push({
        time1: bars[prior.idx].time,
        price1: prior.value,
        time2: bars[current.idx].time,
        price2: current.value,
        color: '#FFFF00', // yellow for bottom line
        width: 1,
        style: 'solid',
        extend: 'right',
      });
    }
  }

  // Prune lines that are too far from current price or too short
  // Pine care() function: delete lines where gap > 2*chg or line length < term
  const chg = n > term ? (highestArr[n - 1] ?? 0) - (lowestArr[n - 1] ?? 0) : 1;
  const lastClose = bars[n - 1].close;
  const filteredLines: LineDrawingData[] = [];

  for (const line of lines) {
    // Estimate price at last bar by linear extrapolation
    const dx = line.time2 - line.time1;
    if (dx === 0) continue;
    const slope = (line.price2 - line.price1) / dx;
    const projected = line.price2 + slope * (bars[n - 1].time - line.time2);
    const gap = Math.abs(lastClose - projected) / (chg || 1);

    // Find bar indices for length check
    let idx1 = 0, idx2 = 0;
    for (let j = 0; j < n; j++) {
      if (bars[j].time === line.time1) idx1 = j;
      if (bars[j].time === line.time2) idx2 = j;
    }

    if (gap > 2 || Math.abs(idx1 - idx2) < term) continue;

    // If gap > 1, make dotted
    if (gap > 1) {
      filteredLines.push({ ...line, style: 'dotted' });
    } else {
      filteredLines.push(line);
    }
  }

  // up_lim = care(up_lin), dn_lim = care(dn_lin): on the last bar only, line.get_price(lin, last_bar_index) (by bar
  // index) of the oldest line; na elsewhere
  const priceAt = (l: { x1: number; y1: number; x2: number; y2: number } | null, x: number) =>
    !l || l.x2 === l.x1 ? NaN : l.y1 + ((l.y2 - l.y1) * (x - l.x1)) / (l.x2 - l.x1);
  const alertFlags = new Array<boolean>(n).fill(false);
  if (n > 1) {
    const upLim = priceAt(firstUp, n - 1);
    const dnLim = priceAt(firstDn, n - 1);
    const c = bars[n - 1].close;
    const c1 = bars[n - 2].close;
    // (close[1] < up_lim and close > up_lim) or (close[1] > dn_lim and close < dn_lim)
    //   or (close[1] > up_lim and close < up_lim) or (close[1] < dn_lim and close > dn_lim)
    alertFlags[n - 1] = (c1 < upLim && c > upLim) || (c1 > dnLim && c < dnLim)
      || (c1 > upLim && c < upLim) || (c1 < dnLim && c > dnLim);
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { 'plot0': closePlot },
    lines: filteredLines,
    alerts: alertStates(alertConditions, bars, [alertFlags]),
  };
}

/** The original's alertcondition */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'HarryBot Alert', message: 'Defense line is being crossed' },
];

export const TrendLineAuto = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
