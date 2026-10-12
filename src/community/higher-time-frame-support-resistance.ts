/**
 * Higher Time Frame Support/Resistance
 *
 * Four levels, each with its own timeframe and pivot length (defaults 240 / 4, 720 / 5, D / 5, W / 5). On the bars
 * of the timeframe, a pivot high (low) is a bar whose high (low) is the highest (lowest) of `len` bars on each side.
 * The value comes without repainting: `request.security(tf, x)[1]`, the pivot of the last completed bar of the
 * timeframe as seen on the chart bar before. On each chart bar where that value exists, the level line is drawn
 * again from `len` chart bars back to the last bar (extended both ways, with a wider transparent shadow line), and
 * the line before is deleted: the lines of the latest pivot high and low remain. On the last bar, a small label
 * marks the latest chart bar (up to 4,000 bars back) whose high (low) comes within the tolerance of the level, and a
 * label to the right of the last bar shows "<timeframe> Pivot High (price)" / "Pivot Low".
 *
 * A level timeframe below the chart timeframe (e.g. the default 240 and 720 levels on a daily chart) needs the bars
 * of that lower timeframe, which the chart bars do not have: the port throws an Error for it (switch the level off
 * or give it a timeframe at least equal to the chart timeframe).
 *
 * The text labels use the chart background / foreground colours (`chart.bg_color` / `chart.fg_color`): they come
 * from the chart context (dark theme colours without it). Higher-timeframe periods follow the exchange calendar of
 * the context (the UTC rule without it).
 *
 * Reference: "Higher Time Frame Support/Resistance [BigBeluga]" by BigBeluga
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © BigBeluga
 */

import {
  ta, str, color, timeframe, Series,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { LabelData, LineDrawingData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { backgroundColorOf, foregroundColorOf, type ChartContext } from '../chart-context';
import { chartTimeframe, higherTimeframeBars } from '../anchor-period';

type LevelStyle = 'Solid' | 'Dashed' | 'Dotted';

export interface HigherTimeFrameSupportResistanceInputs {
  on1: boolean;
  len1: number;
  timeframe1: string;
  style1: LevelStyle;
  color1: string;
  on2: boolean;
  len2: number;
  timeframe2: string;
  style2: LevelStyle;
  color2: string;
  on3: boolean;
  len3: number;
  timeframe3: string;
  style3: LevelStyle;
  color3: string;
  on4: boolean;
  len4: number;
  timeframe4: string;
  style4: LevelStyle;
  color4: string;
  /** Width of the shadow lines */
  shadowWidth: number;
  /** Transparency of the shadow lines */
  shadowTransparency: number;
  /** Bars between the last bar and the text labels */
  offset: number;
  textSize: 'Tiny' | 'Small' | 'Normal';
}

export const defaultInputs: HigherTimeFrameSupportResistanceInputs = {
  on1: true, len1: 4, timeframe1: '240', style1: 'Solid', color1: '#4CAF50',
  on2: true, len2: 5, timeframe2: '720', style2: 'Solid', color2: '#2962FF',
  on3: true, len3: 5, timeframe3: 'D', style3: 'Solid', color3: '#9C27B0',
  on4: true, len4: 5, timeframe4: 'W', style4: 'Solid', color4: '#FF9800',
  shadowWidth: 5,
  shadowTransparency: 85,
  offset: 15,
  textSize: 'Small',
};

const STYLES: LevelStyle[] = ['Solid', 'Dashed', 'Dotted'];
const levelInputs = (k: number): InputConfig[] => {
  const g = `Levels ${k}`;
  const d = defaultInputs as unknown as Record<string, unknown>;
  return [
    { id: `on${k}`, type: 'bool', title: '', defval: d[`on${k}`] as boolean, inline: g },
    { id: `len${k}`, type: 'int', title: g, defval: d[`len${k}`] as number, inline: g },
    { id: `timeframe${k}`, type: 'timeframe', title: '', defval: d[`timeframe${k}`] as string, inline: g },
    { id: `style${k}`, type: 'string', title: '', defval: 'Solid', options: STYLES, inline: g },
    { id: `color${k}`, type: 'color', title: '', defval: d[`color${k}`] as string, inline: g },
  ];
};

export const inputConfig: InputConfig[] = [
  ...levelInputs(1), ...levelInputs(2), ...levelInputs(3), ...levelInputs(4),
  { id: 'shadowWidth', type: 'int', title: 'Levels Width', defval: 5, group: 'Shadow', inline: 'Shadow' },
  { id: 'shadowTransparency', type: 'int', title: 'Transperent', defval: 85, group: 'Shadow', inline: 'Shadow' },
  { id: 'offset', type: 'int', title: 'Offset', defval: 15, group: 'Labels' },
  { id: 'textSize', type: 'string', title: 'Size', defval: 'Small', options: ['Tiny', 'Small', 'Normal'], group: 'Labels' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Higher Time Frame Support/Resistance [BigBeluga]',
  shortTitle: 'HTF Support/Resistance [BigBeluga]',
  overlay: true,
};

/** Pine comparisons: a >= b unless b - a > 1e-10 */
const EPS = 1e-10;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => ge(b, a);

/**
 * non_rep_request(tf, not na(ta.pivothigh(len, len)) ? high[len] : na) and the same for the low, on each chart bar:
 * the pivot of the latest completed bar of the timeframe, as on the chart bar before ([1]).
 */
function htfPivots(
  bars: Bar[], tf: string, len: number, chart?: ChartContext,
): { high: number[]; low: number[] } {
  const n = bars.length;
  const chartTf = chartTimeframe(bars, chart);
  const same = tf.trim() === '' || chartTf === '' || timeframe.in_seconds(tf) === timeframe.in_seconds(chartTf);
  if (!same && timeframe.in_seconds(tf) < timeframe.in_seconds(chartTf)) {
    throw new Error(`Higher Time Frame Support/Resistance: the timeframe ${tf} is lower than the chart timeframe `
      + `${chartTf}; its bars are not available (switch that level off or choose a timeframe of at least ${chartTf})`);
  }
  let htf: Bar[];
  let latest: number[];
  if (same) {
    htf = bars;
    latest = bars.map((_b, i) => i);
  } else {
    const s = higherTimeframeBars(bars, tf, chart);
    htf = s.htf;
    latest = s.latest;
  }
  const ph = ta.pivothigh(new Series(htf, (b) => b.high), len, len).toArray();
  const pl = ta.pivotlow(new Series(htf, (b) => b.low), len, len).toArray();
  const exprH = htf.map((_b, j) => (ph[j] !== null && ph[j] !== undefined && !isNaN(ph[j] as number) && j >= len
    ? htf[j - len].high : NaN));
  const exprL = htf.map((_b, j) => (pl[j] !== null && pl[j] !== undefined && !isNaN(pl[j] as number) && j >= len
    ? htf[j - len].low : NaN));
  const high = new Array<number>(n).fill(NaN);
  const low = new Array<number>(n).fill(NaN);
  for (let i = 1; i < n; i++) {
    const g = latest[i - 1];
    if (g >= 0) {
      high[i] = exprH[g];
      low[i] = exprL[g];
    }
  }
  return { high, low };
}

export function calculate(
  bars: Bar[],
  inputs: Partial<HigherTimeFrameSupportResistanceInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'lines' | 'labels'> & { lines: LineDrawingData[]; labels: LabelData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const last = n - 1;
  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  const bg = backgroundColorOf(chart);
  const fg = foregroundColorOf(chart);
  const textSize = cfg.textSize === 'Tiny' ? 'tiny' : cfg.textSize === 'Normal' ? 'normal' : 'small';
  const lines: LineDrawingData[] = [];
  const labels: LabelData[] = [];

  const level = (on: boolean, tf: string, lenIn: number, css: string, styleIn: LevelStyle) => {
    if (!on || n === 0) return;
    const len = Math.trunc(lenIn);
    const style = styleIn === 'Dotted' ? 'dotted' as const : styleIn === 'Dashed' ? 'dashed' as const : 'solid' as const;
    const shadow = String(color.new(css, cfg.shadowTransparency));
    const p = htfPivots(bars, tf, len, chart);

    // The line of each side is drawn again on every bar where the value exists and the line before is deleted:
    // the line of the latest such bar remains, from len bars before it to the last bar. `var float p_h` keeps the
    // latest value.
    const side = (values: number[]) => {
      let at = -1;
      for (let i = n - 1; i >= 0; i--) {
        if (!isNaN(values[i])) {
          at = i;
          break;
        }
      }
      if (at < 0) return NaN;
      const v = values[at];
      const x1 = at - len;
      // bar_index[len] before the first bar is na: a line with an na coordinate is not drawn
      if (x1 >= 0) {
        lines.push({ time1: T(x1), price1: v, time2: T(last), price2: v, color: css, extend: 'both',
          ...(style !== 'solid' ? { style } : {}) });
        lines.push({ time1: T(x1), price1: v, time2: T(last), price2: v, color: shadow, width: cfg.shadowWidth,
          extend: 'both' });
      }
      return v;
    };
    const pH = side(p.high);
    const pLv = side(p.low);

    // barstate.islast: the latest bar (1 to 4000 bars back) whose high / low is near the level
    let found1 = false;
    let found2 = false;
    for (let i = 1; i <= 4000 && last - i >= 0; i++) {
      const b = bars[last - i];
      if (!found1 && ge(b.high * 1.0009, pH) && le(b.high * 0.9999, pH)) {
        found1 = true;
        labels.push({ time: T(last - i), price: pH, text: '', color: css, textColor: '#363A45', style: 'label_down',
          size: 'tiny' });
      }
      if (!found2 && ge(b.low * 1.0009, pLv) && le(b.low * 0.999, pLv)) {
        found2 = true;
        labels.push({ time: T(last - i), price: pLv, text: '', color: css, textColor: '#363A45', style: 'label_up',
          size: 'tiny' });
      }
    }
    // a label with an na price is not drawn
    if (!isNaN(pH)) {
      labels.push({ time: T(last + cfg.offset), price: pH, text: `${tf} Pivot High ${str.tostring(pH, '(#.#)')}`, color: bg,
        textColor: fg, style: 'label_left', size: textSize });
    }
    if (!isNaN(pLv)) {
      labels.push({ time: T(last + cfg.offset), price: pLv, text: `${tf} Pivot Low ${str.tostring(pLv, '(#.#)')}`, color: bg,
        textColor: fg, style: 'label_left', size: textSize });
    }
  };

  level(cfg.on1, cfg.timeframe1, cfg.len1, cfg.color1, cfg.style1);
  level(cfg.on2, cfg.timeframe2, cfg.len2, cfg.color2, cfg.style2);
  level(cfg.on3, cfg.timeframe3, cfg.len3, cfg.color3, cfg.style3);
  level(cfg.on4, cfg.timeframe4, cfg.len4, cfg.color4, cfg.style4);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    lines,
    labels,
  };
}

export const HigherTimeFrameSupportResistance = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
