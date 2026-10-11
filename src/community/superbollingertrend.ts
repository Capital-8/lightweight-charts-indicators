/**
 * SuperBollingerTrend (Expo)
 *
 * A trailing line built from two Bollinger bands: the upper band of the highs (average + deviation x "Mult") and the
 * lower band of the lows (average - deviation x "Mult"), both over "Period" bars.
 * - While the close is above the line, the line is the higher of itself and the lower band; while the close is below,
 *   the lower of itself and the upper band. The rule runs twice on each bar (once per side).
 * - When the close crosses above the line, the line jumps to the lower band and turns lime; when it crosses below, the
 *   line jumps to the upper band and turns red.
 * - "ZigZag": each signal after the first draws a dashed line from the previous signal point and a label on the
 *   line: a triangle ("Signal") or the distance from the previous signal point ("Peak Distance"). The signal point is
 *   the line, the low / high of the bar or the close.
 * - "Take Profit": a line at the latest signal point plus / minus the median or average of the distances, with a
 *   "TP" label 10 bars after the last bar.
 * - "Average/Median Distance": a table with that distance on the last bar.
 * At most 50 lines and 500 labels are kept.
 *
 * Chart context (optional third argument):
 * - `chart.mintick`: the symbol tick of the distance texts. Without it 0.01.
 * - `chart.backgroundColor`: the text colour of the signal labels and the background of the table. Without it #0F0F0F.
 * - `chart.foregroundColor`: the text colour of the "TP" label and of the table. Without it #DBDBDB.
 *
 * Limit of the port: the 4 alert conditions give no output.
 *
 * Reference: "SuperBollingerTrend (Expo)" by Zeiierman
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Zeiierman
 */

import { ta, str, color, array, callsite, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { LabelData, LabelStyle, LineDrawingData, TableData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { backgroundColorOf, foregroundColorOf, mintickOf, type ChartContext } from '../chart-context';

export interface SuperBollingerTrendInputs {
  /** Bollinger band period */
  prd: number;
  /** Deviation multiplier */
  mult: number;
  showZigZag: boolean;
  signal: 'Signal' | 'Peak Distance';
  dev: 'ZigZag' | 'High/Low' | 'Close';
  showTable: boolean;
  showTP: boolean;
  Tp: 'Median' | 'Average';
}

export const defaultInputs: SuperBollingerTrendInputs = {
  prd: 12,
  mult: 2.0,
  showZigZag: true,
  signal: 'Signal',
  dev: 'ZigZag',
  showTable: false,
  showTP: false,
  Tp: 'Median',
};

export const inputConfig: InputConfig[] = [
  { id: 'prd', type: 'int', title: 'Period', defval: 12, min: 1, inline: 'setting' },
  { id: 'mult', type: 'float', title: 'Mult', defval: 2.0, min: 0.1, step: 0.1, inline: 'setting', tooltip: 'Set the Bollinger Band period. \n\nSet the multiplier.' },
  { id: 'showZigZag', type: 'bool', title: 'ZigZag', defval: true, inline: 'zigzag' },
  { id: 'signal', type: 'string', title: '', defval: 'Signal', options: ['Signal', 'Peak Distance'], inline: 'zigzag' },
  { id: 'dev', type: 'string', title: '', defval: 'ZigZag', options: ['ZigZag', 'High/Low', 'Close'], inline: 'zigzag', tooltip: 'Enable the ZigZag Bollinger Signals. \n\nSelect if you only want to display the signals or the Peak Signal Distance between each signal. \n\nThe Signal Distance can be calculated using the ZigZag, High/Low, or Close.' },
  { id: 'showTable', type: 'bool', title: 'Average/Median Distance', defval: false, inline: '', tooltip: 'Enable the Table that displays the Average or Median ZigZag move.' },
  { id: 'showTP', type: 'bool', title: 'Take Profit', defval: false, inline: 'tp' },
  { id: 'Tp', type: 'string', title: '', defval: 'Median', options: ['Median', 'Average'], inline: 'tp', tooltip: 'Enable the Take-Profit line. \n\nSelect if the TP should be based on the Average or Median move.' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'SuperBollingerTrend', color: '#2962FF', lineWidth: 1 },
];

export const metadata = {
  title: 'SuperBollingerTrend (Expo)',
  shortTitle: 'SuperBollingerTrend (Expo)',
  overlay: true,
};

/** indicator(max_labels_count = 500); the line limit is the default */
const MAX_LABELS = 500;
const MAX_LINES = 50;
const LIME = '#00E676';
const RED = '#FF5252';

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

interface Ln { x1: number; y1: number; x2: number; y2: number; color: string; dashed: boolean }
interface Lb { x: number; y: number; text: string; color: string; textColor: string; style: LabelStyle; size: 'small' | 'normal' }

export function calculate(
  bars: Bar[],
  inputs: Partial<SuperBollingerTrendInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { lines: LineDrawingData[]; labels: LabelData[]; tables: TableData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  // syminfo.mintick, chart.bg_color, chart.fg_color
  const MINTICK = mintickOf(chart);
  const BG = backgroundColorOf(chart);
  const FG = foregroundColorOf(chart);
  const prd = Math.trunc(cfg.prd);
  const GRAY = String(color.new(color.gray, 0));

  const highS = new Series(bars, (b) => b.high);
  const lowS = new Series(bars, (b) => b.low);
  const smaHigh = ta.sma(highS, prd).toArray();
  const devHigh = ta.stdev(highS, prd).toArray();
  const smaLow = ta.sma(lowS, prd).toArray();
  const devLow = ta.stdev(lowS, prd).toArray();

  // Live drawings in creation order. When a creation brings the count above max + 5, the oldest are deleted until
  // max remain. The take-profit line and its label are held by a `var` variable: never deleted, but they count.
  const lines: Ln[] = [];
  const labels: Lb[] = [];
  let tp: Ln | null = null;
  let ltp: Lb | null = null;
  const limit = <T,>(list: T[], max: number, held: T | null) => {
    if (list.length <= max + 5) return;
    for (let k = 0; k < list.length && list.length > max; ) {
      if (list[k] === held) k++;
      else list.splice(k, 1);
    }
  };

  // var zz = ZigZag.new(...): newest first
  const zzX: number[] = [];
  const zzY: number[] = [];
  const zzDiff: number[] = [];
  // var sbt = SuperBollingerTrend.new(0.0, na)
  let s = 0.0;
  let c: string | null = null;
  const crossUp = callsite.crossover();
  const crossDown = callsite.crossunder();

  const plot0: Array<{ time: number; value: number; color?: string }> = [];
  let dist = NaN;

  for (let i = 0; i < n; i++) {
    const bar = bars[i];
    const close = bar.close;
    const bbup = (smaHigh[i] ?? NaN) + (devHigh[i] ?? NaN) * cfg.mult;
    const bbdn = (smaLow[i] ?? NaN) - (devLow[i] ?? NaN) * cfg.mult;

    // method SBT(): the trailing rule, then the jump on a cross (the cross is read before the rule)
    const step = (cond: boolean, val: number, col: string, p: number, isLong: boolean) => {
      s = Number.isNaN(bbdn) || Number.isNaN(bbup) ? 0.0
        : gt(close, s) ? Math.max(s, bbdn)
          : lt(close, s) ? Math.min(s, bbup) : 0.0;
      if (!cond) return;
      s = val;
      c = col;
      if (!cfg.showZigZag) return;
      // method zigzag()
      const y2 = cfg.dev === 'ZigZag' ? s : cfg.dev === 'High/Low' ? p : close;
      if (zzX.length > 0) {
        const x1 = zzX[0];
        const y1 = zzY[0];
        zzDiff.unshift(Math.abs(y2 - y1));
        lines.push({ x1, y1, x2: i, y2, color: GRAY, dashed: true });
        limit(lines, MAX_LINES, tp);
        const isSignal = cfg.signal === 'Signal';
        const style: LabelStyle = isSignal ? (isLong ? 'triangleup' : 'triangledown') : (isLong ? 'label_up' : 'label_down');
        const text = isSignal ? '' : str.tostring(y2 - y1, 'mintick', MINTICK) + 'p';
        labels.push({ x: i, y: s, text, color: col, textColor: BG, style, size: 'small' });
        limit(labels, MAX_LABELS, ltp);
      }
      zzX.unshift(i);
      zzY.unshift(y2);
    };
    step(crossUp(close, s), bbdn, LIME, bar.low, true);
    step(crossDown(close, s), bbup, RED, bar.high, false);

    plot0.push({ time: bar.time, value: s, color: c ?? 'transparent' });

    // var tp = line.new(na, na, na, na, color = color.lime); var ltp = label.new(na, na, "TP", ...)
    if (i === 0) {
      tp = { x1: NaN, y1: NaN, x2: NaN, y2: NaN, color: LIME, dashed: false };
      lines.push(tp);
      ltp = { x: NaN, y: NaN, text: 'TP', color: 'transparent', textColor: FG, style: 'label_left', size: 'normal' };
      labels.push(ltp);
    }
    dist = cfg.Tp === 'Median' ? array.median(zzDiff) : array.avg(zzDiff);
    if (cfg.showTP && zzY.length > 0 && tp && ltp) {
      const pos = gt(close, s);
      const y = pos ? zzY[0] + dist : zzY[0] - dist;
      tp.x1 = zzX[0];
      tp.y1 = y;
      tp.x2 = i + 10;
      tp.y2 = y;
      ltp.x = i + 10;
      ltp.y = y;
    }
  }

  // Table of the last bar
  const tables: TableData[] = [];
  if (n > 0 && cfg.showZigZag && cfg.showTable) {
    const text = (cfg.Tp === 'Median' ? 'Median ZigZag Distance: ' : 'Avg ZigZag Distance: ') + str.tostring(dist, 'mintick', MINTICK) + 'p';
    tables.push({
      position: 'top_right', columns: 1, rows: 1, bgColor: BG,
      frameColor: String(color.new(color.gray, 50)), frameWidth: 3, borderWidth: 1,
      cells: [{ column: 0, row: 0, text, textColor: FG, textSize: 'auto' }],
    });
  }

  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0 },
    // a line or a label with an na coordinate is not drawn
    lines: lines.filter((l) => !Number.isNaN(l.x1) && !Number.isNaN(l.y1) && !Number.isNaN(l.y2)).map((l) => ({
      time1: T(l.x1), price1: l.y1, time2: T(l.x2), price2: l.y2, color: l.color,
      ...(l.dashed ? { style: 'dashed' as const } : {}),
    })),
    labels: labels.filter((l) => !Number.isNaN(l.x) && !Number.isNaN(l.y)).map((l) => ({
      time: T(l.x), price: l.y, text: l.text, color: l.color, textColor: l.textColor, style: l.style, size: l.size,
    })),
    tables,
  };
}

export const SuperBollingerTrend = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
