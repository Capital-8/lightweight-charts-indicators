/**
 * VP-Period (Volume Profile per day with support / resistance lines)
 *
 * A volume profile for each of the last days, with a support or resistance level derived from it.
 * - Only the days that start less than `Number of days` days before the current time are used. On the first bar of
 *   each of these days, and on the last bar, the script builds the profile of the bars since the first bar of the
 *   previous such day (on the last bar: since the first bar of the current day).
 * - As in the original, the high / low range is read from the bars after the first bar of the period up to the
 *   previous bar, while the volume is read from the same bars and the current bar. On daily bars the range is the
 *   one of the previous and the current bar and the volume is the one of the current bar.
 * - The range is cut in `calculation resolution` price levels. The volume of a bar is shared equally between the
 *   levels strictly inside its high / low range. The level with the largest volume is the VPOC.
 * - Drawn from the start of the period: one volume bar every `resolution / 40` levels (its length is the level
 *   volume divided by the largest one, times a third of the period, or a ninth when the period is longer than
 *   1.5 days), a line at the low, at the VPOC and at the high, up to the current bar.
 * - Support / resistance: the VPOC mirrored on the far end of the range (VPOC minus its distance to the high when
 *   the high is the farther end, else VPOC plus its distance to the low). A mirrored price above the high is a
 *   resistance, else a support. The last `show support/resistance since` values are drawn on the last bar as
 *   dashed lines from the start of their day to one day after the last bar, with a label "From days: k".
 * - As in the original, the first day in range has no period before it: its profile is empty, its lines are at
 *   price 0 and its support value is 0.
 *
 * Drawings are kept up to 500 lines (the oldest are removed).
 *
 * Chart values (third argument): the port reads the current time (the days in range; without it: the clock of the
 * computer), and the exchange time zone and session for the start of each day (see src/anchor-period.ts; without
 * them: the UTC calendar and the bars). With the session, the day starts with the regular trading hours and a bar
 * outside them has no day: on bars with extended hours the period start is then missing on the first regular bar
 * of a day and on a last bar after the close, so, as in the original, the profile lines are not drawn there (the
 * support / resistance lines and labels are).
 *
 * Reference: "VP-Period" by juliangonzaconde
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © juliangonzaconde
 */

import { array, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { LabelData, LineDrawingData } from '../types';
import { periodStarts, securityStarts, sessionFlags } from '../anchor-period';
import { nowOf, type ChartContext } from '../chart-context';

export interface VolumeProfilePerDayWithSupportInputs {
  /** Number of days (Min: 3, Max: 500) */
  periodTime: number;
  /** calculation resolution (Min: 400, Max: 700) */
  resolution: number;
  /** show support/resistance since (Min: 2, Max: 45) */
  showFrom: number;
  /** Show volume bars (If selected, maximum days are 17) */
  showVolumeBars: boolean;
  /** Show VPOC line */
  showVpocLine: boolean;
  /** Show support line */
  showSupportLine: boolean;
  /** Show resistance line */
  showResLine: boolean;
  /** Show high line */
  showHLine: boolean;
  /** Show low line */
  showLLine: boolean;
  /** Show from days label */
  showLabels: boolean;
  /** VPOC color */
  vpocColor: string;
  /** High-low lines color */
  highLowColor: string;
  /** Volume bars color */
  volumeBarsColor: string;
  /** Support line color */
  supColor: string;
  /** Resistance line color */
  resColor: string;
}

export const defaultInputs: VolumeProfilePerDayWithSupportInputs = {
  periodTime: 10,
  resolution: 500,
  showFrom: 3,
  showVolumeBars: true,
  showVpocLine: true,
  showSupportLine: true,
  showResLine: true,
  showHLine: true,
  showLLine: true,
  showLabels: true,
  vpocColor: 'rgba(255, 235, 59, 0.9)',
  highLowColor: 'rgba(33, 150, 243, 0.5)',
  volumeBarsColor: 'rgba(76, 175, 80, 0.3)',
  supColor: 'rgba(255, 82, 82, 0.9)',
  resColor: 'rgba(76, 175, 80, 0.9)',
};

export const inputConfig: InputConfig[] = [
  { id: 'periodTime', type: 'int', title: 'Number of days (Min: 3, Max: 500)', defval: 10, min: 3, max: 500 },
  { id: 'resolution', type: 'int', title: 'calculation resolution (Min: 400, Max: 700)', defval: 500, min: 400, max: 700 },
  { id: 'showFrom', type: 'int', title: 'show support/resistance since (Min: 2, Max: 45)', defval: 3, min: 2, max: 45 },
  { id: 'showVolumeBars', type: 'bool', title: 'Show volume bars (If selected, maximum days are 17)', defval: true },
  { id: 'showVpocLine', type: 'bool', title: 'Show VPOC line', defval: true },
  { id: 'showSupportLine', type: 'bool', title: 'Show support line', defval: true },
  { id: 'showResLine', type: 'bool', title: 'Show resistance line', defval: true },
  { id: 'showHLine', type: 'bool', title: 'Show high line', defval: true },
  { id: 'showLLine', type: 'bool', title: 'Show low line', defval: true },
  { id: 'showLabels', type: 'bool', title: 'Show from days label', defval: true },
  { id: 'vpocColor', type: 'color', title: 'VPOC color', defval: 'rgba(255, 235, 59, 0.9)' },
  { id: 'highLowColor', type: 'color', title: 'High-low lines color', defval: 'rgba(33, 150, 243, 0.5)' },
  { id: 'volumeBarsColor', type: 'color', title: 'Volume bars color', defval: 'rgba(76, 175, 80, 0.3)' },
  { id: 'supColor', type: 'color', title: 'Support line color', defval: 'rgba(255, 82, 82, 0.9)' },
  { id: 'resColor', type: 'color', title: 'Resistance line color', defval: 'rgba(76, 175, 80, 0.9)' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'VP-Period',
  shortTitle: 'VP-Period',
  overlay: true,
};

/** max_lines_count */
const MAX_LINES = 500;
const DAY_MS = 86400000;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;

/** Times are in ms, as in the script */
interface Ln { x1: number; y1: number; x2: number; y2: number; color: string; width: number; dashed: boolean }

/** Pine `for i = from to to`: counts down when from > to; no pass when a bound is na */
function forRange(from: number, to: number, body: (i: number) => void): void {
  if (Number.isNaN(from) || Number.isNaN(to)) return;
  if (from <= to) for (let i = from; i <= to; i++) body(i);
  else for (let i = from; i >= to; i--) body(i);
}

export function calculate(
  bars: Bar[],
  inputs: Partial<VolumeProfilePerDayWithSupportInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { lines: LineDrawingData[]; labels: LabelData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const { resolution, showFrom } = cfg;
  const n = bars.length;
  const unit = n > 0 && bars[0].time >= 1e12 ? 1 : 1000;
  const timeMs = (i: number) => bars[i].time * unit;

  // t = time("1440", session.regular): the start of the day of the bar, na outside the regular trading hours
  // (with the session of the symbol: the start of the regular hours of the day, also on bars with extended hours)
  const flags = sessionFlags(bars, chart);
  const dayStarts = flags ? securityStarts(bars, '1D', chart) : periodStarts(bars, '1440', chart);
  const T = (i: number) => (i < 0 || (flags && !flags.ismarket[i]) ? NaN : dayStarts[i] * unit);
  const H = (i: number) => (i >= 0 ? bars[i].high : NaN);
  const L = (i: number) => (i >= 0 ? bars[i].low : NaN);
  const V = (i: number) => (i >= 0 ? bars[i].volume ?? NaN : NaN);

  // startTime := timenow - period_time * 86400000 (on the first bar)
  const startTime = nowOf(chart) - cfg.periodTime * DAY_MS;

  // Lines in creation order: above max + 5 the oldest are deleted until max remain (a line with an na
  // coordinate counts and is not drawn)
  let lines: Ln[] = [];
  const addLine = (l: Ln) => {
    lines.push(l);
    if (lines.length > MAX_LINES + 5) lines = lines.slice(lines.length - MAX_LINES);
  };
  const labels: LabelData[] = [];

  const allYs: number[] = new Array(showFrom).fill(0);
  const ysTime: number[] = new Array(showFrom).fill(0);
  const isSupport: boolean[] = new Array(showFrom).fill(true);
  // barssince(is_first_inRange), read before the variable is set on the bar: the value of the previous bar
  let barOffset = NaN;
  let wasFirstInRange = false;
  const proportion = Math.trunc(resolution / 40);

  for (let i = 0; i < n; i++) {
    const t = T(i);
    const tPrev = T(i - 1);
    const time = timeMs(i);
    const isLast = i === n - 1;
    barOffset = wasFirstInRange ? 0 : barOffset + 1;
    const isFirst = (Number.isNaN(tPrev) && !Number.isNaN(t)) || tPrev < t;
    const isFirstInRange = isFirst && t > startTime;
    wasFirstInRange = isFirstInRange;
    if (!isFirstInRange && !isLast) continue;

    const ncandles = barOffset;
    let lowPrice = 0;
    let highPrice = 0;
    forRange(1, ncandles, (k) => {
      const cur = L(i - k);
      if (lt(cur, lowPrice) || eq(lowPrice, 0)) lowPrice = cur;
    });
    forRange(1, ncandles, (k) => {
      const cur = H(i - k);
      if (gt(cur, highPrice) || eq(highPrice, 0)) highPrice = cur;
    });
    const diff = (highPrice - lowPrice) / resolution;
    const rangePrices: number[] = [];
    for (let j = 0; j <= resolution; j++) rangePrices.push(lowPrice + diff * (j + 1));

    const totalVol: number[] = new Array(resolution).fill(0);
    forRange(0, ncandles, (k) => {
      const hi = H(i - k);
      const lo = L(i - k);
      const vol = V(i - k);
      const v = Number.isNaN(vol) ? 0 : vol;
      const inside: number[] = [];
      for (let j = 0; j <= resolution - 1; j++) {
        if (gt(hi, rangePrices[j]) && lt(lo, rangePrices[j])) inside.push(j);
      }
      for (const j of inside) totalVol[j] += v / inside.length;
    });
    const maxV = array.max(totalVol);
    const maxVIndex = array.indexof(totalVol, maxV);
    const vpoc = diff * maxVIndex + lowPrice;

    if (isFirstInRange) {
      let ys: number;
      if (gt(highPrice - vpoc, vpoc - lowPrice)) ys = vpoc - (highPrice - vpoc);
      else ys = vpoc + (vpoc - lowPrice);
      isSupport.shift();
      isSupport.push(!gt(ys, highPrice));
      allYs.shift();
      allYs.push(ys);
      ysTime.shift();
      ysTime.push(t);
    }

    if (isLast) {
      for (let k = 0; k <= showFrom - 1; k++) {
        const ys = allYs[k];
        const timeBack = Math.trunc(ysTime[k]);
        const dashed = (color: string) => addLine({ x1: timeBack, y1: ys, x2: time + DAY_MS, y2: ys, color, width: 2, dashed: true });
        if (isSupport[k]) {
          if (cfg.showSupportLine) dashed(cfg.supColor);
        } else if (cfg.showResLine) {
          dashed(cfg.resColor);
        }
        if (cfg.showLabels) {
          labels.push({
            time: (time + DAY_MS) / unit, price: ys, text: `From days: ${showFrom - k}`, color: '#2196F3',
            textColor: '#363A45', style: 'label_down',
          });
        }
      }
    }

    // Volume bars and the low / VPOC / high lines of the period
    const lastTime = Math.trunc(tPrev);
    let difTime = time - lastTime;
    difTime = gt(difTime / DAY_MS, 1.5) ? difTime / 9 : difTime / 3;
    for (let j = 0; j <= resolution - 1; j++) {
      const normVol = totalVol[j] / maxV;
      const diffT = lastTime + Math.trunc(difTime * normVol);
      if (j % proportion === 0 && cfg.showVolumeBars) {
        addLine({ x1: tPrev, y1: rangePrices[j], x2: diffT, y2: rangePrices[j], color: cfg.volumeBarsColor, width: 2, dashed: false });
      }
    }
    if (cfg.showLLine) addLine({ x1: tPrev, y1: lowPrice, x2: time, y2: lowPrice, color: cfg.highLowColor, width: 1, dashed: false });
    if (cfg.showVpocLine) addLine({ x1: tPrev, y1: vpoc, x2: time, y2: vpoc, color: cfg.vpocColor, width: 2, dashed: false });
    if (cfg.showHLine) addLine({ x1: tPrev, y1: highPrice, x2: time, y2: highPrice, color: cfg.highLowColor, width: 1, dashed: false });
  }

  const drawn = (l: Ln) => [l.x1, l.y1, l.x2, l.y2].every((v) => Number.isFinite(v));
  const outLines: LineDrawingData[] = lines.filter(drawn).map((l) => ({
    time1: l.x1 / unit, price1: l.y1, time2: l.x2 / unit, price2: l.y2, color: l.color, width: l.width,
    ...(l.dashed ? { style: 'dashed' as const } : {}),
  }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    lines: outLines,
    labels: labels.filter((l) => Number.isFinite(l.price)),
  };
}

export const VolumeProfilePerDayWithSupport = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
